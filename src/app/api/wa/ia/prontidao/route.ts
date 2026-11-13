import { NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { avaliarEnv, resumirProntidao, type ItemProntidao } from '@/lib/whatsapp/ia/prontidao';
import { configEvolutionLoja } from '@/lib/whatsapp/evolutionProvider';
import { lerConfigIa } from '@/lib/whatsapp/ia/config';

/**
 * GET /api/wa/ia/prontidao — o que falta para a Laura atender de verdade (só admin).
 * Mostra se cada variável existe (nunca o valor), se as tabelas estão no banco e se a
 * Evolution está conectada ao número da loja.
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

export async function GET() {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    if (ctx.eu.perfil !== 'admin') return NextResponse.json({ success: false, error: 'só o admin' }, { status: 403, headers: SEM_CACHE });

    const itens: ItemProntidao[] = avaliarEnv(process.env);

    // Banco: tabelas das duas migrations
    const tabela = async (t: string) => !(await ctx.admin.from(t).select('*', { head: true, count: 'exact' }).limit(1)).error;
    const [iaOk, idOk] = await Promise.all([tabela('wa_ia_config'), tabela('lead_nome_historico')]);
    itens.push({ id: 'banco_ia', grupo: 'base', ok: iaOk, titulo: 'Tabelas da Laura no banco (migration 20261106)', como: 'Aplicar a migration 20261106_wa_ia_ensaio.' });
    itens.push({ id: 'banco_nome', grupo: 'opcional', ok: idOk, titulo: 'Tabelas de nome e carro no banco (migration 20261107)', como: 'Aplicar a migration 20261107_nome_interesse_auto.' });

    // Evolution: o número da loja está conectado?
    let evolution: { ok: boolean; estado: string } = { ok: false, estado: 'não configurada' };
    try {
        const cfg = configEvolutionLoja();
        const r = await fetch(`${cfg.baseUrl}/instance/connectionState/${encodeURIComponent(cfg.instancia)}`, {
            headers: { apikey: cfg.token }, signal: AbortSignal.timeout(8000),
        });
        const j = await r.json().catch(() => ({}));
        const estado = String(j?.instance?.state ?? j?.state ?? (r.ok ? 'desconhecido' : `HTTP ${r.status}`));
        evolution = { ok: estado === 'open', estado };
    } catch (e) {
        evolution = { ok: false, estado: e instanceof Error && /Provider|configura/i.test(e.message) ? 'não configurada' : 'sem resposta' };
    }
    itens.push({ id: 'evolution_conectada', grupo: 'base', ok: evolution.ok, titulo: `Número da loja conectado na Evolution (${evolution.estado})`, como: 'Abrir a instância no Evolution Manager e reconectar o WhatsApp (QR code).' });

    const config = await lerConfigIa(ctx.admin);
    return NextResponse.json(
        { success: true, resumo: resumirProntidao(itens), modo: { efetivo: config.modo, gravado: config.modoGravado }, itens },
        { headers: SEM_CACHE },
    );
}
