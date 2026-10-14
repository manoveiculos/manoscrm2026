import type { SupabaseClient } from '@supabase/supabase-js';
import { faixaMaximaDoInteresse, interesseGenerico } from '@/lib/qualificacao';
import { normalizarCelular } from '@/lib/compras/alertas/telefone';
import { buscarQualificacao, pisoEstoque } from './qualificacaoService';

/**
 * Quem pede carro abaixo da faixa do estoque não é descartado: vira um alerta
 * na Central de Compras (alertas_clientes). Quando um carro desses aparecer no
 * radar de repasse, o vendedor dono do lead recebe o aviso e pode comprar pra
 * revender a esse cliente.
 *
 * LGPD: o aviso vai pro WhatsApp do VENDEDOR, então cliente_final leva só a
 * referência do CRM ("Lead #123"), nunca nome ou telefone do cliente.
 */

export type ResultadoAlertaCarro =
    | { status: 'criado'; alertaId: string }
    | { status: 'ja_existe' | 'nao_se_aplica' | 'sem_modelo' | 'sem_destinatario' | 'erro'; detalhe?: string };

/** "Gol 2014 até 30 mil" → "Gol". Tira preço, ano e palavras de faixa. */
export function modeloDoInteresse(texto: string | null | undefined): string {
    if (!texto || interesseGenerico(texto)) return '';
    const limpo = texto
        // "Palio ou Uno" → "Palio, Uno": o matcher trata vírgula como OU.
        .replace(/\s+ou\s+|\s*\/\s*/gi, ', ')
        .replace(/r\$\s*[\d.,]+(\s*(mil|k)\b)?/gi, ' ')
        .replace(/\b\d+([.,]\d+)?\s*(mil|k)\b/gi, ' ')
        .replace(/\b(19|20)\d{2}\b/g, ' ')
        .replace(/\b\d{4,}\b/g, ' ')
        // Lookaround Unicode: o \b do JS não enxerga "até" (o "é" não é \w).
        .replace(/(?<!\p{L})(at[eé]|de|por|uns|umas|no m[aá]ximo|max|m[aá]ximo|carro|qualquer|um|uma|algo|tipo|valor|faixa|reais|ou)(?!\p{L})/giu, ' ')
        .replace(/[^\p{L}\d\s.,-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .split(',').map(t => t.trim()).filter(t => t.length >= 2).join(', ');
    return limpo.length >= 2 ? limpo.slice(0, 60) : '';
}

export async function cadastrarAlertaAbaixoDaFaixa(
    admin: SupabaseClient,
    table: string,
    id: string,
): Promise<ResultadoAlertaCarro> {
    try {
        const uid = `${table}:${id}`;
        const [piso, mapa] = await Promise.all([pisoEstoque(admin), buscarQualificacao(admin, [uid])]);
        const campos = mapa.get(uid);
        const faixa = faixaMaximaDoInteresse(campos?.vehicle_interest);
        if (!campos || faixa == null || piso == null || faixa >= piso) return { status: 'nao_se_aplica' };

        // Sem modelo o alerta casaria com todo carro barato do radar (~600/dia)
        // e estouraria o teto diário de avisos do vendedor.
        const modelo = modeloDoInteresse(campos.vehicle_interest);
        if (!modelo) return { status: 'sem_modelo', detalhe: 'interesse sem modelo de carro' };

        const referencia = `Lead #${id}`;
        const { data: existentes } = await admin
            .from('alertas_clientes')
            .select('id')
            .eq('ativo', true)
            .eq('cliente_final', referencia)
            .limit(1);
        if (existentes && existentes.length > 0) return { status: 'ja_existe' };

        // Destinatário: o vendedor dono; sem dono, o gestor.
        const { data: lead } = await admin
            .from(table)
            .select('assigned_consultant_id')
            .eq('id', table === 'leads_distribuicao_crm_26' ? parseInt(id, 10) : id)
            .maybeSingle();
        let destino: { name: string | null; phone: string | null } | null = null;
        if (lead?.assigned_consultant_id) {
            const { data: c } = await admin.from('consultants_manos_crm')
                .select('name, personal_whatsapp, phone').eq('id', lead.assigned_consultant_id).maybeSingle();
            if (c) destino = { name: c.name, phone: c.personal_whatsapp || c.phone };
        }
        if (!destino?.phone) {
            const { data: g } = await admin.from('consultants_manos_crm')
                .select('name, personal_whatsapp, phone').eq('role', 'admin').eq('is_active', true)
                .not('personal_whatsapp', 'is', null).limit(1);
            const gestor = (g || [])[0] as any;
            if (gestor) destino = { name: gestor.name, phone: gestor.personal_whatsapp || gestor.phone };
        }
        if (!destino?.phone) return { status: 'sem_destinatario' };

        let telefone: string;
        try {
            telefone = normalizarCelular(destino.phone).nacional;
        } catch (e: any) {
            return { status: 'sem_destinatario', detalhe: e?.message };
        }

        const { data: novo, error } = await admin
            .from('alertas_clientes')
            .insert({
                nome_cliente: destino.name || 'Vendedor',
                telefone_cliente: telefone,
                cliente_final: referencia,
                marca: 'TODAS',
                modelo,
                valor_maximo: faixa,
                ativo: true,
                criado_por: 'auto:qualificacao',
            })
            .select('id')
            .single();
        if (error) return { status: 'erro', detalhe: error.message };
        return { status: 'criado', alertaId: novo.id };
    } catch (e: any) {
        return { status: 'erro', detalhe: e?.message };
    }
}
