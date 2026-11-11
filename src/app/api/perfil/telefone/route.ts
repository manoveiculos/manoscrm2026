import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { normalizarTelefoneBR } from '@/lib/telefone';
import {
    CODIGO_VALE_MIN, conferirCodigo, gerarCodigo, podePedirCodigo, resumoDoCodigo, textoDoCodigo,
} from '@/lib/telefoneCodigo';
import { providerLoja } from '@/lib/whatsapp/evolutionProvider';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * Confirmação do WhatsApp do consultor (obrigatória ao entrar no CRM).
 *
 *   GET  → { precisa, telefone, verificadoEm }
 *   POST { acao: 'enviar', telefone }   → manda o código de 6 dígitos pelo número da loja
 *   POST { acao: 'confirmar', codigo }  → confere e salva o número (55+DDD+número) em consultants_manos_crm
 *
 * Só mexe no cadastro de quem está logado. Login sem linha de consultor (admin avulso) não é cobrado.
 * TELEFONE_OBRIGATORIO=off desliga a cobrança na tela (saída de emergência), sem apagar nada.
 */
export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const json = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status, headers: SEM_CACHE });

const obrigatorio = () => (process.env.TELEFONE_OBRIGATORIO || '').trim().toLowerCase() !== 'off';

export async function GET() {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    if (!c.eu.consultorId) return json({ success: true, precisa: false, telefone: null, verificadoEm: null });
    const { data, error } = await c.admin.from('consultants_manos_crm').select('phone, phone_verified_at').eq('id', c.eu.consultorId).maybeSingle();
    // coluna ainda não existe (migration não aplicada) ou erro de leitura: não trava ninguém
    if (error) return json({ success: true, precisa: false, telefone: null, verificadoEm: null });
    const verificadoEm = (data?.phone_verified_at as string | null) ?? null;
    return json({
        success: true,
        precisa: obrigatorio() && !verificadoEm,
        telefone: normalizarTelefoneBR(data?.phone as string | null) ?? null,
        verificadoEm,
    });
}

export async function POST(req: Request) {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    const consultorId = c.eu.consultorId;
    if (!consultorId) return json({ success: false, error: 'Este login não tem cadastro de consultor.' }, 400);
    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
    const agora = new Date();

    if (corpo?.acao === 'enviar') {
        const telefone = normalizarTelefoneBR(typeof corpo.telefone === 'string' ? corpo.telefone : '');
        if (!telefone) return json({ success: false, error: 'Número inválido. Digite com DDD, por exemplo (47) 98846-7855.' }, 400);

        const { data: antigos, error: eLista } = await c.admin.from('consultor_telefone_codigos')
            .select('criado_em').eq('consultant_id', consultorId).gte('criado_em', new Date(agora.getTime() - 24 * 3_600_000).toISOString());
        if (eLista) return json({ success: false, error: 'Confirmação indisponível no momento.', podeAdiar: true }, 503);
        const pode = podePedirCodigo((antigos || []).map(a => a.criado_em as string), agora);
        if (!pode.ok) {
            return json({ success: false, error: pode.motivo === 'muitos_envios_agora' ? 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' : 'Limite de códigos por hoje atingido. Fale com o Alexandre.' }, 429);
        }

        const codigo = gerarCodigo();
        let envio;
        try { envio = await providerLoja().enviarTexto(telefone, textoDoCodigo(codigo)); }
        catch (e) { envio = { ok: false, providerMessageId: null, erro: msgErro(e) }; }
        if (!envio.ok) {
            console.warn('[perfil/telefone] envio do código falhou:', envio.erro);
            // WhatsApp da loja fora do ar não pode trancar o CRM: a tela deixa adiar
            return json({ success: false, error: 'Não consegui enviar o código pelo WhatsApp agora.', podeAdiar: true }, 502);
        }
        const { error: eGrava } = await c.admin.from('consultor_telefone_codigos').insert({
            consultant_id: consultorId, telefone, codigo_hash: resumoDoCodigo(consultorId, telefone, codigo),
            expira_em: new Date(agora.getTime() + CODIGO_VALE_MIN * 60_000).toISOString(),
        });
        if (eGrava) return json({ success: false, error: 'Não consegui registrar o código.', podeAdiar: true }, 500);
        return json({ success: true, telefone, valeMin: CODIGO_VALE_MIN });
    }

    if (corpo?.acao === 'confirmar') {
        const { data: g } = await c.admin.from('consultor_telefone_codigos')
            .select('id, telefone, codigo_hash, expira_em, tentativas, usado_em')
            .eq('consultant_id', consultorId).is('usado_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle();
        const r = conferirCodigo(
            g ? { codigoHash: g.codigo_hash, telefone: g.telefone, expiraEm: g.expira_em, tentativas: g.tentativas, usadoEm: g.usado_em } : null,
            consultorId, typeof corpo.codigo === 'string' ? corpo.codigo : '', agora,
        );
        if (r === 'ok' && g) {
            const quando = agora.toISOString();
            const { error: eSalva } = await c.admin.from('consultants_manos_crm').update({ phone: g.telefone, phone_verified_at: quando }).eq('id', consultorId);
            if (eSalva) return json({ success: false, error: 'Código certo, mas não consegui salvar o número. Tente de novo.' }, 500);
            await c.admin.from('consultor_telefone_codigos').update({ usado_em: quando }).eq('id', g.id);
            return json({ success: true, telefone: g.telefone, verificadoEm: quando });
        }
        if (r === 'errado' && g) await c.admin.from('consultor_telefone_codigos').update({ tentativas: g.tentativas + 1 }).eq('id', g.id);
        const msg: Record<string, string> = {
            sem_codigo: 'Peça um código primeiro.',
            expirado: 'O código venceu. Peça outro.',
            muitas_tentativas: 'Muitas tentativas. Peça um código novo.',
            errado: 'Código incorreto. Confira a mensagem no WhatsApp.',
        };
        return json({ success: false, error: msg[r] || 'Código inválido.' }, 400);
    }

    return json({ success: false, error: 'ação inválida' }, 400);
}
