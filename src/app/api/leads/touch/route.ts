import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/admin';
import { getLeadTableByPrefix } from '@/lib/services/leadRouter';

/**
 * Registra o primeiro contato (touch) de um consultor com o lead.
 * Protegido por autenticação para evitar disparos externos.
 */
export async function POST(req: Request) {
  try {
    // 1. Validar Sessão
    const supabaseServer = createServerClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado. Faça login para registrar o contato.' }, { status: 401 });
    }

    // 2. Extrair dados
    const { leadId } = await req.json();
    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID é obrigatório' }, { status: 400 });
    }

    const table = getLeadTableByPrefix(leadId);
    const admin = createClient();
    
    // 3. Atualizar o campo first_contact_at apenas se ele for nulo
    const { data, error } = await admin
      .from(table)
      .update({ 
        first_contact_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .is('first_contact_at', null)
      .select('id, first_contact_at')
      .single();

    if (error) {
      // Se não atualizou porque já tinha valor, retornamos sucesso mas com aviso
      return NextResponse.json({ 
        success: true, 
        message: 'Primeiro contato já registrado ou lead não encontrado', 
        details: error.message 
      });
    }

    console.log(`[lead/touch] Sucesso: Lead ${leadId} contatado por ${user.email}`);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in lead/touch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
