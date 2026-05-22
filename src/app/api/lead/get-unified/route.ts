import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { parseUid } from '@/lib/services/unifiedLead';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const rawId = searchParams.get('uid') || '';

        if (!rawId) {
            return NextResponse.json({ success: false, error: 'Parâmetro uid é obrigatório' }, { status: 400 });
        }

        const parsed = parseUid(rawId);
        const leadId = parsed?.nativeId || rawId;
        const leadTable = parsed?.table || 'leads_manos_crm';

        // Inicializa clients do Supabase
        const cookieStore = await cookies();
        const supabaseSSR = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: () => {},
                },
            }
        );

        // Obter usuário logado
        const { data: { user } } = await supabaseSSR.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
        }

        const admin = createClient();

        // Obter dados do consultor logado
        const { data: consultant } = await admin
            .from('consultants_manos_crm')
            .select('id, name, role')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

        if (!consultant) {
            return NextResponse.json({ success: false, error: 'Consultor não cadastrado' }, { status: 403 });
        }

        // 1. Busca na view unificada leads_unified
        const COLS_FULL = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id, ai_summary, created_at, atendimento_iniciado_em';
        const COLS_FALLBACK = 'uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, proxima_acao, assigned_consultant_id, created_at';

        let lQuery = await admin
            .from('leads_unified')
            .select(COLS_FULL)
            .eq('table_name', leadTable)
            .eq('native_id', leadId)
            .maybeSingle();

        if (lQuery.error) {
            lQuery = await admin
                .from('leads_unified')
                .select(COLS_FALLBACK)
                .eq('table_name', leadTable)
                .eq('native_id', leadId)
                .maybeSingle();
        }

        if (!lQuery.data) {
            return NextResponse.json({ success: false, error: 'Lead não encontrado' }, { status: 404 });
        }

        const rawLead = lQuery.data;
        const lead: any = {
            id: rawLead.native_id,
            table_name: rawLead.table_name,
            name: rawLead.name,
            phone: rawLead.phone,
            vehicle_interest: rawLead.vehicle_interest,
            source: rawLead.source,
            ai_score: rawLead.ai_score || 0,
            ai_classification: rawLead.ai_classification || 'cold',
            status: rawLead.status,
            proxima_acao: rawLead.proxima_acao,
            assigned_consultant_id: rawLead.assigned_consultant_id,
            ai_summary: rawLead.ai_summary || null,
            created_at: rawLead.created_at || null,
            atendimento_iniciado_em: rawLead.atendimento_iniciado_em || null,
            carro_troca: null,
        };

        // 2. Segurança/Guard: vendedor não-admin acessando lead de outro
        const isAdminUser = consultant.role === 'admin' || user.email === 'alexandre_gorges@hotmail.com';
        if (!isAdminUser && lead.assigned_consultant_id && lead.assigned_consultant_id !== consultant.id) {
            return NextResponse.json({
                success: false,
                forbidden: true,
                error: 'Você não tem permissão para acessar este lead. Ele está atribuído a outro vendedor.'
            }, { status: 403 });
        }

        // 3. Buscar dados específicos da tabela base (carro_troca e interesse real)
        let realInterest = lead.vehicle_interest;
        let realTroca = null;
        try {
            if (lead.table_name === 'leads_distribuicao_crm_26') {
                const { data: bData } = await admin
                    .from('leads_distribuicao_crm_26')
                    .select('interesse, carro_troca')
                    .eq('id', parseInt(lead.id, 10))
                    .maybeSingle();
                if (bData) {
                    if (bData.interesse) realInterest = bData.interesse;
                    if (bData.carro_troca) realTroca = bData.carro_troca;
                }
            } else if (lead.table_name === 'leads_manos_crm') {
                const { data: bData } = await admin
                    .from('leads_manos_crm')
                    .select('vehicle_interest, carro_troca')
                    .eq('id', lead.id)
                    .maybeSingle();
                if (bData) {
                    if (bData.vehicle_interest) realInterest = bData.vehicle_interest;
                    if (bData.carro_troca) realTroca = bData.carro_troca;
                }
            } else if (lead.table_name === 'leads_compra') {
                const { data: bData } = await admin
                    .from('leads_compra')
                    .select('veiculo_original, carro_troca')
                    .eq('id', lead.id)
                    .maybeSingle();
                if (bData) {
                    if (bData.veiculo_original) realInterest = bData.veiculo_original;
                    if (bData.carro_troca) realTroca = bData.carro_troca;
                }
            }
        } catch (err) {
            console.warn('[GetUnifiedBFF] Erro ao buscar dados base do lead:', err);
        }

        lead.vehicle_interest = realInterest;
        lead.carro_troca = realTroca;

        // 4. Buscar nome do consultor atribuído
        let assignedConsultantName = '';
        if (lead.assigned_consultant_id) {
            try {
                const { data: cData } = await admin
                    .from('consultants_manos_crm')
                    .select('name')
                    .eq('id', lead.assigned_consultant_id)
                    .maybeSingle();
                if (cData?.name) {
                    assignedConsultantName = cData.name;
                }
            } catch (cErr) {
                console.warn('[GetUnifiedBFF] Erro ao buscar nome do consultor:', cErr);
            }
        }

        // 5. Identificação de IDs gêmeos pelo telefone
        const cutoff90d = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const phoneClean = (lead.phone || '').replace(/\D/g, '');
        const phoneSuffix = phoneClean.slice(-8);
        const phoneIsMasked = !!lead.phone && String(lead.phone).includes('*');

        const uidSet = new Set<string>([String(leadId)]);
        if (!phoneIsMasked && phoneSuffix.length >= 8) {
            const [dist, manos, compra] = await Promise.all([
                admin.from('leads_distribuicao_crm_26').select('id').ilike('telefone', `%${phoneSuffix}%`).limit(10),
                admin.from('leads_manos_crm').select('id').ilike('phone', `%${phoneSuffix}%`).limit(10),
                admin.from('leads_compra').select('id').ilike('telefone', `%${phoneSuffix}%`).limit(10),
            ]);
            (dist.data || []).forEach((r: any) => uidSet.add(String(r.id)));
            (manos.data || []).forEach((r: any) => uidSet.add(String(r.id)));
            (compra.data || []).forEach((r: any) => uidSet.add(String(r.id)));
        }

        const twinIds = Array.from(uidSet);

        // 6. Buscar mensagens de unified_whatsapp_messages
        let allMsgs: any[] = [];
        try {
            const { data: msgs } = await admin
                .from('unified_whatsapp_messages')
                .select('id, direction, message_text, created_at, message_id')
                .in('lead_uid', twinIds)
                .gte('created_at', cutoff90d)
                .order('created_at', { ascending: false })
                .limit(200);

            if (msgs) {
                allMsgs = [...msgs];
            }
        } catch (msgErr: any) {
            console.warn('[GetUnifiedBFF] Erro ao buscar unified_whatsapp_messages:', msgErr?.message);
        }

        // 7. Busca concessionaria_mensagens (V1)
        try {
            if (!phoneIsMasked && phoneSuffix.length >= 8) {
                const { data: trackers } = await admin
                    .from('tracking_leads')
                    .select('details')
                    .ilike('whatsapp', `%${phoneSuffix}%`)
                    .order('created_at', { ascending: false })
                    .limit(1);

                let sessionId = trackers?.[0]?.details ? (trackers[0].details as any).session_id : null;

                if (!sessionId) {
                    const { data: cli } = await admin
                        .from('dados_cliente')
                        .select('sessionid')
                        .ilike('telefone', `%${phoneSuffix}%`)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (cli?.[0]?.sessionid) sessionId = cli[0].sessionid;
                }

                if (sessionId) {
                    const { data: cmMsgs } = await admin
                        .from('concessionaria_mensagens')
                        .select('*')
                        .eq('session_id', sessionId)
                        .order('data', { ascending: false });

                    if (cmMsgs) {
                        const detectDirection = (msg: any) => {
                            const dir = (msg.direction || msg.flow || msg.remetente || msg.message?.type || msg.type || '').toLowerCase();
                            if (dir.includes('inbound') || dir.includes('received') || dir.includes('incoming') || dir === 'in' || dir === 'cliente' || dir === 'human') return 'inbound';
                            if (dir.includes('outbound') || dir.includes('sent') || dir.includes('outgoing') || dir === 'out' || dir === 'vendedor' || dir === 'ai') return 'outbound';
                            if (msg.from_me === true || msg.fromMe === true) return 'outbound';
                            if (msg.from_me === false || msg.fromMe === false) return 'inbound';
                            return 'inbound';
                        };

                        cmMsgs.forEach((msg: any) => {
                            const dir = detectDirection(msg);
                            const text = msg.message?.content || msg.message?.text || msg.message?.body || msg.message?.payload?.body || msg.message || '';
                            if (typeof text === 'string' && text.trim()) {
                                let messageId = null;
                                if (msg.remetente === 'Arthur') messageId = 'ai_sdr_legacy';
                                else if (msg.remetente === 'Karol') messageId = 'ai_followup_legacy';
                                
                                allMsgs.push({
                                    id: `cm_${msg.id || Math.random().toString(36).slice(2,8)}`,
                                    direction: dir,
                                    message_text: text,
                                    created_at: msg.data || msg.created_at || new Date().toISOString(),
                                    message_id: messageId
                                });
                            }
                        });
                    }
                }
            }
        } catch (cmErr) {
            console.warn('[GetUnifiedBFF] Erro concessionaria_mensagens:', cmErr);
        }

        // Ordena mensagens (antigas primeiro)
        allMsgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // De-duplicação (janela 30s)
        const seen = new Map<string, number>();
        const dedupedMessages = allMsgs.filter((m: any) => {
            const text = (m.message_text || '').trim();
            if (!text) return false;
            const key = `${m.direction}|${text}`;
            const ts = new Date(m.created_at).getTime();
            const lastTs = seen.get(key);
            if (lastTs && Math.abs(ts - lastTs) < 30_000) return false;
            seen.set(key, ts);
            return true;
        });

        return NextResponse.json({
            success: true,
            lead,
            messages: dedupedMessages,
            twinIds,
            assignedConsultantName,
            consultant: {
                id: consultant.id,
                name: consultant.name,
                role: consultant.role,
                isAdmin: isAdminUser
            }
        });
    } catch (e: any) {
        console.error('[GetUnifiedBFF] Critical exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal Server Error' }, { status: 500 });
    }
}
