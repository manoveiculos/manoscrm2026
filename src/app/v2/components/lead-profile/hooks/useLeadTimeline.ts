import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface TimelineEvent {
  id: string;
  type: 'status_change' | 'note' | 'call' | 'whatsapp_in' | 'whatsapp_out' | 
        'whatsapp_system' | 'ai_analysis' | 'followup_created' | 'followup_completed' |
        'followup_missed' | 'visit' | 'proposal' | 'vehicle_linked' | 'sale' | 'system';
  title: string;
  description: string;
  author: string;
  created_at: string;
  source: 'interactions' | 'whatsapp' | 'followup' | 'ai' | 'system';
  metadata?: Record<string, any>;
}

export function useLeadTimeline(leadId: string | null, leadPhone?: string) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchTimeline = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    const all: TimelineEvent[] = [];

    const cleanId = leadId.replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');
    const phoneClean = (leadPhone || '').replace(/\D/g, '');
    const phoneSuffix = phoneClean.slice(-8);

    // ══════════════════════════════════════
    // FONTE 1: interactions_manos_crm (V2)
    // ══════════════════════════════════════
    try {
      const { data, error } = await supabase
        .from('interactions_manos_crm')
        .select('*')
        .or(`lead_id.eq.${cleanId},lead_id_v1.eq.${cleanId},lead_id.eq.${leadId}`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        // Fallback robusto se o OR falhar por tipo UUID/TEXT
        const { data: textData } = await supabase
          .from('interactions_manos_crm')
          .select('*')
          .or(`lead_id_v1.eq.${cleanId},notes.ilike.%${cleanId}%`)
          .order('created_at', { ascending: false })
          .limit(100);
        if (textData) {
          textData.forEach(item => all.push(mapInteraction(item)));
        }
      } else if (data) {
        data.forEach(item => all.push(mapInteraction(item)));
      }
    } catch (e) { console.error('[Timeline] interactions error:', e); }

    // ══════════════════════════════════════
    // FONTE 2: whatsapp_messages (V2)
    // ══════════════════════════════════════
    try {
      let messages: any[] = [];
      
      // 2.1. Busca por ID numérico (BigInt na whatsapp_messages)
      let numericIds: number[] = [];
      if (!/^\d+$/.test(cleanId)) {
        const { data: distLeads } = await supabase
          .from('leads_distribuicao_crm_26')
          .select('id')
          .or(`telefone.ilike.%${phoneSuffix}%,id_meta.eq.${cleanId},lead_id.eq.${cleanId}`)
          .limit(5);
        if (distLeads) numericIds = distLeads.map(dl => dl.id);
      } else {
        numericIds = [parseInt(cleanId)];
      }

      if (numericIds.length > 0) {
        const { data } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .in('lead_id', numericIds)
          .order('created_at', { ascending: false })
          .limit(300);
        if (data) messages = data;
      }

      messages.forEach(msg => all.push(mapWhatsAppMessage(msg)));
    } catch (e) { console.error('[Timeline] whatsapp error:', e); }

    // ══════════════════════════════════════
    // FONTE 3: concessionaria_mensagens (V1 — IA Lab)
    // ══════════════════════════════════════
    try {
      let msgs: any[] = [];
      
      // 3.1. Busca por SID (Session ID) através do rastreio
      if (phoneSuffix.length >= 8) {
        const { data: trackers } = await supabase
          .from('tracking_leads')
          .select('details')
          .ilike('whatsapp', `%${phoneSuffix}%`)
          .order('created_at', { ascending: false })
          .limit(1);

        let sessionId = trackers?.[0]?.details ? (trackers[0].details as any).session_id : null;

        if (!sessionId) {
          const { data: cli } = await supabase
            .from('dados_cliente')
            .select('sessionid')
            .ilike('telefone', `%${phoneSuffix}%`)
            .order('created_at', { ascending: false })
            .limit(1);
          if (cli?.[0]?.sessionid) sessionId = cli[0].sessionid;
        }

        if (sessionId) {
          const { data } = await supabase
            .from('concessionaria_mensagens')
            .select('*')
            .eq('session_id', sessionId)
            .order('data', { ascending: false });
          if (data) msgs = [...data];
        }
      }

      msgs.forEach(msg => {
        const dir = detectDirection(msg);
        const text = msg.message?.content || msg.message?.text || msg.message?.body || msg.message?.payload?.body || msg.message || '';
        if (typeof text === 'string' && text.trim()) {
          all.push({
            id: `cm_${msg.id || Math.random().toString(36).slice(2,8)}`,
            type: dir === 'in' ? 'whatsapp_in' : 'whatsapp_out',
            title: dir === 'in' ? 'Mensagem (V1)' : 'Resposta (V1)',
            description: text,
            author: dir === 'in' ? 'Cliente' : (msg.remetente || 'Vendedor'),
            created_at: msg.data || msg.created_at || new Date().toISOString(),
            source: 'whatsapp',
          });
        }
      });
    } catch (_e) { /* concessionaria_mensagens inacessível — tabela V1 opcional */ }

    // ══════════════════════════════════════
    // FONTE 4: tracking_leads (V1 — Análises da IA)
    // ══════════════════════════════════════
    try {
      const { data } = await supabase
        .from('tracking_leads')
        .select('*')
        .or(`whatsapp.ilike.%${phoneSuffix}%,client_code.eq.${cleanId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        data.forEach(track => {
          const content = track.analysis || track.summary || track.notes || track.details || track.message || track.content || '';
          if (content && content.trim()) {
            all.push({
              id: `track_${track.id || Math.random().toString(36).slice(2,8)}`,
              type: 'ai_analysis',
              title: 'Análise da IA',
              description: content,
              author: 'IA',
              created_at: track.created_at || track.timestamp || track.updated_at || '',
              source: 'ai',
            });
          }
        });
      }
    } catch (_e) { /* tracking_leads inacessível — tabela V1 opcional */ }

    // ══════════════════════════════════════
    // FONTE 5: follow_ups
    // ══════════════════════════════════════
    try {
      const { data } = await supabase
        .from('follow_ups')
        .select('*')
        .or(`lead_id.eq.${cleanId},lead_id.eq.${leadId}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        data.forEach(fu => all.push(mapFollowUp(fu)));
      }
    } catch (e) { console.error('[Timeline] follow_ups error:', e); }

    // ══════════════════════════════════════
    // FONTE 6: ai_summary do lead (Resumo Estratégico)
    // ══════════════════════════════════════
    try {
      let aiSummary = '';
      let dateToUse = '';

      const { data: lm } = await supabase
        .from('leads_master')
        .select('ai_summary, updated_at, created_at')
        .or(`id.eq.${cleanId},id.eq.${leadId}`)
        .limit(1)
        .single();

      if (lm?.ai_summary) {
        aiSummary = lm.ai_summary;
        dateToUse = lm.updated_at || lm.created_at;
      } else {
        const { data: lmc } = await supabase
          .from('leads_manos_crm')
          .select('ai_summary, updated_at, created_at')
          .or(`id.eq.${cleanId},id.eq.${leadId}`)
          .limit(1)
          .single();
        if (lmc?.ai_summary) {
          aiSummary = lmc.ai_summary;
          dateToUse = lmc.updated_at || lmc.created_at;
        }
      }

      if (aiSummary && aiSummary.trim().length > 10 &&
          !aiSummary.toLowerCase().includes('aguardando')) {
        all.push({
          id: 'ai_summary_virtual',
          type: 'ai_analysis',
          title: 'Orientação Tática Atual',
          description: aiSummary,
          author: 'Especialista IA',
          created_at: dateToUse || new Date().toISOString(),
          source: 'ai',
        });
      }
    } catch (_e) { /* ai_summary inacessível — campo opcional */ }

    // Ordenar e Deduplicar
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const deduped = deduplicateEvents(all);

    setEvents(deduped);
    setLoading(false);
  }, [leadId, leadPhone]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'whatsapp') return events.filter(e => e.type.startsWith('whatsapp'));
    if (filter === 'followup') return events.filter(e => e.type.startsWith('followup'));
    return events.filter(e => e.type === filter);
  }, [events, filter]);

  const addNote = async (text: string, userName: string): Promise<boolean> => {
    if (!leadId || !text.trim()) return false;
    const cleanId = leadId.replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);

    const insertData: any = {
      type: 'note',
      notes: text.trim(),
      user_name: userName,
      user_id: userName,
      created_at: new Date().toISOString(),
    };

    if (isUUID) {
      insertData.lead_id = cleanId;
    } else {
      insertData.lead_id_v1 = cleanId;
    }

    const { data, error } = await supabase
      .from('interactions_manos_crm')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[Timeline] Erro ao salvar nota:', error);
      alert(`Erro ao salvar nota: ${error.message}`);
      return false;
    }

    setEvents(prev => [{
      id: data?.id || `note_${Date.now()}`,
      type: 'note' as const,
      title: 'Nota interna',
      description: text.trim(),
      author: userName,
      created_at: new Date().toISOString(),
      source: 'interactions' as const,
    }, ...prev]);

    return true;
  };

  return { events: filteredEvents, allEvents: events, loading, filter, setFilter, addNote, refresh: fetchTimeline, totalCount: events.length };
}

// ═══ HELPERS ═══

function deduplicateEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    const minute = e.created_at?.slice(0, 16) || '';
    const key = `${e.type}_${e.description?.slice(0, 50)}_${minute}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectDirection(msg: any): 'in' | 'out' {
  // 1. Prioridade para flags explícitas e estrutura JSONB da V1/IA Lab
  const dir = (
    msg.direction || 
    msg.flow || 
    msg.remetente || 
    msg.message?.type || // Suporte para concessionaria_mensagens (V1)
    msg.type || 
    ''
  ).toLowerCase();
  
  if (
    dir.includes('inbound') || 
    dir.includes('received') || 
    dir.includes('incoming') || 
    dir === 'in' || 
    dir === 'cliente' || 
    dir === 'human'
  ) return 'in';
  
  if (
    dir.includes('outbound') || 
    dir.includes('sent') || 
    dir.includes('outgoing') || 
    dir === 'out' || 
    dir === 'vendedor' || 
    dir === 'ai'
  ) return 'out';

  if (msg.from_me === true || msg.fromMe === true) return 'out';
  if (msg.from_me === false || msg.fromMe === false) return 'in';
  
  return 'in'; 
}

function mapInteraction(item: any): TimelineEvent {
  return {
    id: item.id.toString(),
    type: mapInteractionType(item.type),
    title: formatInteractionTitle(item),
    description: item.notes || item.description || item.content || item.message || formatStatusChange(item.old_status, item.new_status),
    author: item.user_name || item.user_id || 'Sistema',
    created_at: item.created_at,
    source: 'interactions',
    metadata: { old_status: item.old_status, new_status: item.new_status, result: item.result },
  };
}

function mapWhatsAppMessage(msg: any): TimelineEvent {
  const dir = detectDirection(msg);
  const text = msg.message_text || msg.body || msg.content || msg.text || '';
  return {
    id: msg.id?.toString() || `wpp_${msg.created_at || msg.timestamp}_${Math.random().toString(36).slice(2,6)}`,
    type: dir === 'in' ? 'whatsapp_in' : 'whatsapp_out',
    title: dir === 'in' ? 'Mensagem do cliente' : 'Mensagem enviada',
    description: msg.media_type 
      ? `[${msg.media_type.toUpperCase()}] ${text}`.trim()
      : text.length > 300 ? text.slice(0, 300) + '...' : text,
    author: dir === 'in' ? 'Cliente' : (msg.sender_name || 'Consultor'),
    created_at: msg.created_at || msg.timestamp || msg.date || msg.message_timestamp || '',
    source: 'whatsapp',
    metadata: { media_type: msg.media_type },
  };
}

function mapFollowUp(fu: any): TimelineEvent {
  const typeMap: Record<string, string> = {
    'pending': 'followup_created',
    'completed': 'followup_completed',
    'missed': 'followup_missed',
    'skipped': 'followup_missed',
  };
  return {
    id: `fu_${fu.id}`,
    type: (typeMap[fu.status] || 'followup_created') as TimelineEvent['type'],
    title: formatFollowUpTitle(fu),
    description: fu.note || fu.result_note || '',
    author: fu.user_id || 'Sistema',
    created_at: fu.completed_at || fu.scheduled_at || fu.created_at,
    source: 'followup',
    metadata: { scheduled_at: fu.scheduled_at, type: fu.type, status: fu.status, result: fu.result },
  };
}

function mapInteractionType(raw: string): TimelineEvent['type'] {
  if (!raw) return 'system';
  const t = raw.toLowerCase();
  if (t.includes('status')) return 'status_change';
  if (t.includes('note') || t.includes('nota')) return 'note';
  if (t.includes('call') || t.includes('ligacao') || t.includes('ligação')) return 'call';
  if (t.includes('whatsapp')) return 'whatsapp_out';
  if (t.includes('visit') || t.includes('visita')) return 'visit';
  if (t.includes('proposal') || t.includes('proposta')) return 'proposal';
  if (t.includes('vehicle') || t.includes('veiculo') || t.includes('veículo')) return 'vehicle_linked';
  if (t.includes('sale') || t.includes('venda')) return 'sale';
  if (t.includes('ai') || t.includes('ia')) return 'ai_analysis';
  return 'system';
}

function formatInteractionTitle(item: any): string {
  const t = (item.type || '').toLowerCase();
  if (t.includes('status')) return `${item.old_status || '?'} → ${item.new_status || '?'}`;
  if (t.includes('note') || t.includes('nota')) return 'Nota interna';
  if (t.includes('call') || t.includes('ligacao')) return 'Ligação';
  if (t.includes('visit') || t.includes('visita')) return 'Visita';
  if (t.includes('proposal') || t.includes('proposta')) return 'Proposta enviada';
  if (t.includes('vehicle') || t.includes('veiculo')) return 'Veículo vinculado';
  if (t.includes('sale') || t.includes('venda')) return 'Venda registrada';
  return item.type || 'Evento';
}

function formatFollowUpTitle(fu: any): string {
  const typeNames: Record<string, string> = {
    'call': 'Ligação agendada',
    'whatsapp': 'WhatsApp agendado',
    'visit': 'Visita agendada',
    'test_drive': 'Test Drive agendado',
    'proposal': 'Proposta agendada',
    'photos': 'Envio de fotos agendado',
  };
  const name = typeNames[fu.type] || 'Follow-up';
  const statusNames: Record<string, string> = {
    'pending': `${name}`,
    'completed': `${name} — Concluído`,
    'missed': `${name} — Não realizado`,
    'skipped': `${name} — Pulado`,
  };
  return statusNames[fu.status] || name;
}

function formatStatusChange(o?: string, n?: string): string {
  if (!o && !n) return '';
  return `Status alterado: ${o || '?'} → ${n || '?'}`;
}
