// src/lib/push/enviarPush.ts — NOTIFICAÇÃO NO CELULAR (web push) — SÓ SERVIDOR
//
// 2ª etapa do app instalável. Fica DESLIGADO sozinho enquanto faltar:
//   - as chaves VAPID nas variáveis de ambiente (VAPID_PUBLIC_KEY,
//     VAPID_PRIVATE_KEY e, opcional, VAPID_SUBJECT), ou
//   - a tabela push_inscricoes (migration 20261106).
// Assim o código pode ir ao ar antes da migration e das chaves.
//
// LGPD: o aviso aparece na tela bloqueada. Nunca mandar nome nem telefone do
// cliente — só o que aconteceu e o link do CRM (mesma regra do alertaQuente).
//
// Para a Fase 2 (WhatsApp): chame enviarPushParaConsultor() quando um cliente
// escrever, com tag por conversa para não empilhar avisos.

import webpush from 'web-push';
import { createClient } from '@/lib/supabase/admin';

export interface AvisoPush {
    titulo: string;
    corpo: string;
    /** Caminho do CRM que abre ao tocar (padrão: /fila). */
    url?: string;
    /** Avisos com a mesma tag se substituem no celular em vez de empilhar. */
    tag?: string;
}

export interface ResultadoPush {
    enviados: number;
    falhas: number;
    /** Sem chaves ou sem tabela: nada foi tentado. */
    desligado?: true;
}

const MAX_FALHAS = 5;

let configurado: boolean | null = null;

/** Chave pública que o navegador usa para se inscrever (null = push desligado). */
export function chavePublicaPush(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
}

function configurar(): boolean {
    if (configurado !== null) return configurado;
    const publica = process.env.VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!publica || !privada) {
        configurado = false;
        return false;
    }
    try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://manoscrm.com.br', publica, privada);
        configurado = true;
    } catch (e: any) {
        console.error('[push] chaves VAPID inválidas:', e?.message);
        configurado = false;
    }
    return configurado;
}

export function pushConfigurado(): boolean {
    return configurar();
}

const tabelaAusente = (msg?: string) => !!msg && /push_inscricoes/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg);

/** Manda o aviso para todos os celulares ativos do consultor. Nunca lança erro. */
export async function enviarPushParaConsultor(consultantId: string | null | undefined, aviso: AvisoPush): Promise<ResultadoPush> {
    if (!consultantId || !configurar()) return { enviados: 0, falhas: 0, desligado: true };
    const admin = createClient();

    const { data, error } = await admin
        .from('push_inscricoes')
        .select('id, endpoint, p256dh, auth, falhas')
        .eq('consultant_id', consultantId)
        .eq('ativo', true)
        .limit(10);
    if (error) {
        if (!tabelaAusente(error.message)) console.warn('[push] leitura:', error.message);
        return { enviados: 0, falhas: 0, desligado: true };
    }

    const payload = JSON.stringify({
        title: aviso.titulo.slice(0, 80),
        body: aviso.corpo.slice(0, 200),
        url: aviso.url && aviso.url.startsWith('/') ? aviso.url : '/fila',
        tag: aviso.tag?.slice(0, 64),
    });

    let enviados = 0;
    let falhas = 0;
    for (const s of (data || []) as any[]) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60, urgency: 'high' },
            );
            enviados++;
            await admin.from('push_inscricoes')
                .update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 })
                .eq('id', s.id);
        } catch (e: any) {
            falhas++;
            const status = Number(e?.statusCode) || 0;
            // 404/410: o celular desinstalou o app ou cancelou os avisos.
            const morta = status === 404 || status === 410;
            const novasFalhas = (Number(s.falhas) || 0) + 1;
            await admin.from('push_inscricoes')
                .update({
                    falhas: novasFalhas,
                    ativo: !(morta || novasFalhas >= MAX_FALHAS),
                    atualizado_em: new Date().toISOString(),
                })
                .eq('id', s.id);
            if (!morta) console.warn('[push] envio falhou:', status, e?.body || e?.message);
        }
    }
    return { enviados, falhas };
}
