import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyExtensionToken } from '@/lib/extensionAuth';

// Cliente admin para garantir permissão de escrita em massa sem RLS restrictivo da extensão
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

  try {
    const body = await req.json();
    const { lead_id, messages, consultant_id } = body;

    if (!lead_id || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'lead_id e messages são obrigatórios' }, { status: 400 });
    }

    // Limpar ID do lead (BIGINT no banco)
    const cleanLeadId = lead_id.toString().replace(/\D/g, '');
    const numId = parseInt(cleanLeadId);

    if (isNaN(numId)) {
      return NextResponse.json({ error: 'lead_id deve ser numérico' }, { status: 400 });
    }

    // Preparar dados para upsert
    const payload = messages.map((m: any) => {
      // Normalização de campos baseada no payload da extensão
      const timestamp = m.timestamp || m.created_at || new Date().toISOString();
      const text = m.text || m.message_text || m.body || m.content || '';
      const fromMe = m.from_me === true || m.fromMe === true || m.direction === 'outbound';
      
      return {
        lead_id: numId,
        created_at: timestamp,
        timestamp: timestamp,
        message_text: text,
        direction: fromMe ? 'outbound' : 'inbound',
        from_me: fromMe,
        sender_phone: m.sender_phone || (fromMe ? 'CONSULTOR' : 'CLIENTE'),
        sender_name: m.sender_name || (fromMe ? (m.consultant_name || 'Consultor') : 'Cliente'),
        media_type: m.media_type || 'text',
        message_id: m.message_id || m.id || `${numId}_${new Date(timestamp).getTime()}`,
        consultant_id: consultant_id?.toString().replace(/\D/g, '') || null
      };
    });

    // Filtro para dados reais
    const validEntries = payload.filter(p => p.message_text.trim() || p.media_type !== 'text');

    if (validEntries.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Upsert baseado em message_id ou (lead_id + timestamp se não houver message_id único)
    // Usamos message_id como PK ou UK se disponível na tabela.
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .upsert(validEntries, { 
        onConflict: 'message_id', // Assume que temos message_id como unique index
        ignoreDuplicates: false 
      });

    if (error) {
      // Fallback: se message_id falhar (coluna não existe), tentamos sem onConflict explícito
      console.warn('[Extension API] Upsert onConflict failed, trying standard insert:', error);
      const { error: insertError } = await supabaseAdmin
        .from('whatsapp_messages')
        .insert(validEntries);
        
      if (insertError) throw insertError;
    }

    return NextResponse.json({ 
      success: true, 
      count: validEntries.length,
      message: 'Mensagens integradas ao Cockpit com sucesso' 
    });

  } catch (err: any) {
    console.error('[Extension API Error]:', err.message || err);
    return NextResponse.json({ error: 'Erro interno no servidor de integração' }, { status: 500 });
  }
}

// Opções de CORS para aceitar requisições da Chrome Extension
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info',
    },
  });
}
