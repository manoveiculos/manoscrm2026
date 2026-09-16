import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';
import { normalizarCelular } from '@/lib/compras/alertas/telefone';

const supabaseAdmin = createSupabaseAdmin();

export const dynamic = 'force-dynamic';

const ADMINS_FIXOS = ['alexandre_gorges@hotmail.com', 'alexandre.gorges@gmail.com'];

async function getAuthContext() {
    const supabaseServer = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
        return { errorResponse: NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 }) };
    }

    const { data: consultant } = await supabaseServer
        .from('consultants_manos_crm')
        .select('role, name, phone, personal_whatsapp')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();

    const isAdmin = consultant?.role === 'admin' || ADMINS_FIXOS.includes(user.email || '');

    return { user, isAdmin, consultant };
}

// GET: lista alertas + histórico resumido de avisos de cada um
export async function GET() {
    try {
        const authContext = await getAuthContext();
        if ('errorResponse' in authContext) return authContext.errorResponse;
        const { consultant, user } = authContext;

        const { data: alerts, error } = await supabaseAdmin
            .from('alertas_clientes')
            .select('*')
            .not('nome_cliente', 'ilike', '[EXCLUIDO]%')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('[API Alertas] Erro ao buscar alertas:', error);
            throw error;
        }

        // Resumo de disparos por alerta — é isso que responde "chegou ou não chegou?"
        const ids = (alerts || []).map(a => a.id);
        const resumo: Record<string, { enviados: number; falhas: number; ultimo: string | null }> = {};

        if (ids.length > 0) {
            const { data: disparos } = await supabaseAdmin
                .from('alertas_disparos')
                .select('alerta_id, status, criado_em')
                .in('alerta_id', ids)
                .order('criado_em', { ascending: false })
                .limit(1000);

            for (const d of disparos || []) {
                const r = resumo[d.alerta_id] || { enviados: 0, falhas: 0, ultimo: null };
                if (d.status === 'enviado') {
                    r.enviados += 1;
                    if (!r.ultimo) r.ultimo = d.criado_em;
                } else if (['falhou', 'telefone_invalido', 'bloqueado_limite'].includes(d.status)) {
                    r.falhas += 1;
                }
                resumo[d.alerta_id] = r;
            }
        }

        return NextResponse.json({
            success: true,
            alerts: (alerts || []).map(a => ({
                ...a,
                disparos: resumo[a.id] || { enviados: 0, falhas: 0, ultimo: null },
            })),
            usuario: {
                email: user.email,
                nome: consultant?.name || null,
                whatsapp: consultant?.personal_whatsapp || consultant?.phone || null,
            },
        });
    } catch (err: any) {
        console.error('[API Alertas] Erro no GET:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao carregar a lista de alertas.' }, { status: 500 });
    }
}

// POST: cria um novo monitoramento
export async function POST(request: Request) {
    try {
        const authContext = await getAuthContext();
        if ('errorResponse' in authContext) return authContext.errorResponse;
        const { user } = authContext;

        const body = await request.json();
        const {
            nome_cliente, telefone_cliente, cliente_final, marca, modelo,
            valor_minimo, valor_maximo, ano_minimo, ano_maximo,
            cor, cambio, combustivel, km_minimo, km_maximo,
        } = body;

        if (!nome_cliente || !telefone_cliente || !modelo) {
            return NextResponse.json(
                { success: false, error: 'Preencha quem recebe o aviso, o WhatsApp e o modelo desejado.' },
                { status: 400 },
            );
        }

        // O aviso é a razão de existir do cadastro: número ruim = alerta natimorto.
        let telefone: string;
        try {
            telefone = normalizarCelular(telefone_cliente).nacional;
        } catch (e: any) {
            return NextResponse.json(
                { success: false, error: `WhatsApp inválido: ${e.message}` },
                { status: 400 },
            );
        }

        // Marca em branco = qualquer marca. Antes virava "MULTIMARCAS", que o
        // motor não reconhecia como curinga e derrubava o alerta inteiro.
        const finalMarca = marca && marca.trim() !== '' ? marca.toUpperCase().trim() : 'TODAS';

        const { data: newAlert, error } = await supabaseAdmin
            .from('alertas_clientes')
            .insert([{
                nome_cliente: nome_cliente.trim(),
                telefone_cliente: telefone,
                cliente_final: cliente_final && cliente_final.trim() !== '' ? cliente_final.trim() : null,
                marca: finalMarca,
                modelo: modelo.trim(),
                valor_minimo: valor_minimo ? Number(valor_minimo) : null,
                valor_maximo: valor_maximo ? Number(valor_maximo) : null,
                ano_minimo: ano_minimo ? Number(ano_minimo) : null,
                ano_maximo: ano_maximo ? Number(ano_maximo) : null,
                cor: cor && cor.trim() !== '' ? cor.trim() : null,
                cambio: cambio && cambio.trim() !== '' && cambio !== 'TODOS' ? cambio.trim() : null,
                combustivel: combustivel && combustivel.trim() !== '' && combustivel !== 'TODOS' ? combustivel.trim() : null,
                km_minimo: km_minimo ? Number(km_minimo) : null,
                km_maximo: km_maximo ? Number(km_maximo) : null,
                ativo: true,
                criado_por: user.email,
            }])
            .select()
            .single();

        if (error) {
            console.error('[API Alertas] Erro ao inserir alerta:', error);
            throw error;
        }

        return NextResponse.json({
            success: true,
            alert: { ...newAlert, disparos: { enviados: 0, falhas: 0, ultimo: null } },
        });
    } catch (err: any) {
        console.error('[API Alertas] Erro no POST:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao salvar o alerta no banco de dados.' }, { status: 500 });
    }
}

// PUT: atualiza todos os campos de um monitoramento existente
export async function PUT(request: Request) {
    try {
        const authContext = await getAuthContext();
        if ('errorResponse' in authContext) return authContext.errorResponse;
        const { user, isAdmin } = authContext;

        const body = await request.json();
        const {
            id, nome_cliente, telefone_cliente, cliente_final, marca, modelo,
            valor_minimo, valor_maximo, ano_minimo, ano_maximo,
            cor, cambio, combustivel, km_minimo, km_maximo,
        } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID do alerta não informado.' }, { status: 400 });
        }

        if (!nome_cliente || !telefone_cliente || !modelo) {
            return NextResponse.json(
                { success: false, error: 'Preencha quem recebe o aviso, o WhatsApp e o modelo desejado.' },
                { status: 400 },
            );
        }

        const { data: alertData, error: fetchError } = await supabaseAdmin
            .from('alertas_clientes')
            .select('criado_por')
            .eq('id', id)
            .single();

        if (fetchError || !alertData) {
            return NextResponse.json({ success: false, error: 'Alerta não localizado no banco.' }, { status: 404 });
        }

        if (!isAdmin && alertData.criado_por !== user.email) {
            return NextResponse.json({ success: false, error: 'Você não tem permissão para editar este alerta.' }, { status: 403 });
        }

        let telefone: string;
        try {
            telefone = normalizarCelular(telefone_cliente).nacional;
        } catch (e: any) {
            return NextResponse.json(
                { success: false, error: `WhatsApp inválido: ${e.message}` },
                { status: 400 },
            );
        }

        const finalMarca = marca && marca.trim() !== '' ? marca.toUpperCase().trim() : 'TODAS';

        const { data: updatedAlert, error } = await supabaseAdmin
            .from('alertas_clientes')
            .update({
                nome_cliente: nome_cliente.trim(),
                telefone_cliente: telefone,
                cliente_final: cliente_final && cliente_final.trim() !== '' ? cliente_final.trim() : null,
                marca: finalMarca,
                modelo: modelo.trim(),
                valor_minimo: valor_minimo ? Number(valor_minimo) : null,
                valor_maximo: valor_maximo ? Number(valor_maximo) : null,
                ano_minimo: ano_minimo ? Number(ano_minimo) : null,
                ano_maximo: ano_maximo ? Number(ano_maximo) : null,
                cor: cor && cor.trim() !== '' ? cor.trim() : null,
                cambio: cambio && cambio.trim() !== '' && cambio !== 'TODOS' ? cambio.trim() : null,
                combustivel: combustivel && combustivel.trim() !== '' && combustivel !== 'TODOS' ? combustivel.trim() : null,
                km_minimo: km_minimo ? Number(km_minimo) : null,
                km_maximo: km_maximo ? Number(km_maximo) : null,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[API Alertas] Erro no PUT:', error);
            throw error;
        }

        return NextResponse.json({
            success: true,
            alert: updatedAlert,
        });
    } catch (err: any) {
        console.error('[API Alertas] Erro no PUT:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao atualizar o alerta no banco de dados.' }, { status: 500 });
    }
}

// PATCH: liga/desliga o alerta
export async function PATCH(request: Request) {
    try {
        const authContext = await getAuthContext();
        if ('errorResponse' in authContext) return authContext.errorResponse;
        const { user, isAdmin } = authContext;

        const { id, ativo } = await request.json();

        if (!id || ativo === undefined) {
            return NextResponse.json({ success: false, error: 'Dados insuficientes para atualizar o alerta.' }, { status: 400 });
        }

        const { data: alertData, error: fetchError } = await supabaseAdmin
            .from('alertas_clientes')
            .select('criado_por')
            .eq('id', id)
            .single();

        if (fetchError || !alertData) {
            return NextResponse.json({ success: false, error: 'Alerta não localizado no banco.' }, { status: 404 });
        }

        if (!isAdmin && alertData.criado_por !== user.email) {
            return NextResponse.json({ success: false, error: 'Você não tem permissão para alterar este alerta.' }, { status: 403 });
        }

        const { data: updatedAlert, error } = await supabaseAdmin
            .from('alertas_clientes')
            .update({ ativo: Boolean(ativo) })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, alert: updatedAlert });
    } catch (err: any) {
        console.error('[API Alertas] Erro no PATCH:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao atualizar o status do alerta.' }, { status: 500 });
    }
}

// DELETE: soft delete
export async function DELETE(request: Request) {
    try {
        const authContext = await getAuthContext();
        if ('errorResponse' in authContext) return authContext.errorResponse;
        const { user, isAdmin } = authContext;

        const id = new URL(request.url).searchParams.get('id');
        if (!id) {
            return NextResponse.json({ success: false, error: 'ID do alerta não informado.' }, { status: 400 });
        }

        const { data: alertData, error: fetchError } = await supabaseAdmin
            .from('alertas_clientes')
            .select('nome_cliente, criado_por')
            .eq('id', id)
            .single();

        if (fetchError || !alertData) {
            return NextResponse.json({ success: false, error: 'Alerta não localizado no banco.' }, { status: 404 });
        }

        if (!isAdmin && alertData.criado_por !== user.email) {
            return NextResponse.json({ success: false, error: 'Você não tem permissão para remover este alerta.' }, { status: 403 });
        }

        const originalName = alertData.nome_cliente || '';
        const newName = originalName.startsWith('[EXCLUIDO] ') ? originalName : `[EXCLUIDO] ${originalName}`;

        const { error: updateError } = await supabaseAdmin
            .from('alertas_clientes')
            .update({ nome_cliente: newName, ativo: false })
            .eq('id', id);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, message: 'Alerta removido com sucesso.' });
    } catch (err: any) {
        console.error('[API Alertas] Erro no DELETE:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao remover o alerta.' }, { status: 500 });
    }
}
