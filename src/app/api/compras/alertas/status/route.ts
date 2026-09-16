import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';

const supabaseAdmin = createSupabaseAdmin();

export const dynamic = 'force-dynamic';

/**
 * Painel de saúde do motor de alertas.
 *
 * Existe porque o motor ficou mudo por semanas sem ninguém notar: entravam
 * centenas de carros por dia, o webhook respondia 200 e não saía um único
 * WhatsApp. Agora a própria tela denuncia quando isso volta a acontecer.
 */
export async function GET() {
    try {
        const supabaseServer = await createSupabaseServer();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
        }

        const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [radar, ultimoCarro, alertasAtivos, disparos24h, historico] = await Promise.all([
            supabaseAdmin
                .from('repassecentral')
                .select('id', { count: 'exact', head: true })
                .gte('data_hora_recebimento', desde24h),
            supabaseAdmin
                .from('repassecentral')
                .select('marca, modelo, data_hora_recebimento')
                .order('data_hora_recebimento', { ascending: false })
                .limit(1),
            supabaseAdmin
                .from('alertas_clientes')
                .select('id', { count: 'exact', head: true })
                .eq('ativo', true)
                .not('nome_cliente', 'ilike', '[EXCLUIDO]%'),
            supabaseAdmin
                .from('alertas_disparos')
                .select('status')
                .gte('criado_em', desde24h),
            supabaseAdmin
                .from('alertas_disparos')
                .select('id, alerta_id, destinatario, telefone, veiculo_descricao, veiculo_ano, veiculo_preco, status, erro, criado_em, enviado_em')
                .order('criado_em', { ascending: false })
                .limit(25),
        ]);

        const contagem = { enviado: 0, pendente: 0, falhou: 0, telefone_invalido: 0, bloqueado_limite: 0, duplicado: 0, teste: 0 };
        for (const d of disparos24h.data || []) {
            if (d.status in contagem) contagem[d.status as keyof typeof contagem] += 1;
        }

        const carros24h = radar.count || 0;
        const ativos = alertasAtivos.count || 0;
        const ultimo = ultimoCarro.data?.[0] || null;
        const minutosDesdeUltimoCarro = ultimo
            ? Math.round((Date.now() - new Date(ultimo.data_hora_recebimento).getTime()) / 60000)
            : null;

        // Semáforo honesto: só fica verde quando o caminho inteiro está de pé.
        let saude: 'ok' | 'atencao' | 'critico' = 'ok';
        const diagnostico: string[] = [];

        if (minutosDesdeUltimoCarro === null || minutosDesdeUltimoCarro > 180) {
            saude = 'critico';
            diagnostico.push('Nenhum carro novo chegou do WhatsApp nas últimas 3h — o coletor dos grupos pode estar fora.');
        }
        if (ativos === 0) {
            saude = saude === 'critico' ? 'critico' : 'atencao';
            diagnostico.push('Nenhum alerta ativo cadastrado.');
        }
        if (ativos > 0 && carros24h > 50 && contagem.enviado === 0) {
            saude = 'critico';
            diagnostico.push('Entraram carros e existem alertas ativos, mas nenhum aviso saiu em 24h — o motor está mudo.');
        }
        if (contagem.telefone_invalido > 0) {
            saude = saude === 'critico' ? 'critico' : 'atencao';
            diagnostico.push(`${contagem.telefone_invalido} aviso(s) não saíram por WhatsApp inválido no cadastro.`);
        }
        if (contagem.falhou > 0) {
            saude = saude === 'critico' ? 'critico' : 'atencao';
            diagnostico.push(`${contagem.falhou} falha(s) de entrega no provider de WhatsApp.`);
        }

        return NextResponse.json({
            success: true,
            saude,
            diagnostico,
            metricas: {
                carros_24h: carros24h,
                alertas_ativos: ativos,
                avisos_enviados_24h: contagem.enviado,
                avisos_pendentes: contagem.pendente,
                falhas_24h: contagem.falhou + contagem.telefone_invalido,
                duplicados_barrados_24h: contagem.duplicado,
                ultimo_carro: ultimo ? `${ultimo.marca} ${ultimo.modelo}` : null,
                minutos_desde_ultimo_carro: minutosDesdeUltimoCarro,
            },
            historico: historico.data || [],
        });
    } catch (err: any) {
        console.error('[API Alertas Status] Erro:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao carregar o status do motor.' }, { status: 500 });
    }
}
