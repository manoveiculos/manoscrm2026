import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const admin = createClient();
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const [leadsVenda, leadsCompra] = await Promise.all([
      admin
        .from('leads_manos_crm')
        .select('id, name, ai_score, created_at, assigned_consultant_id, vehicle_interest, phone')
        .eq('status', 'received')
        .is('first_contact_at', null)
        .not('assigned_consultant_id', 'is', null)
        .gte('ai_score', 75)
        .lt('created_at', fifteenMinutesAgo),
      admin
        .from('leads_compra')
        .select('id, nome, ai_score, criado_em, assigned_consultant_id, modelo, telefone')
        .eq('status', 'novo')
        .is('first_contact_at', null)
        .not('assigned_consultant_id', 'is', null)
        .gte('ai_score', 75)
        .lt('criado_em', fifteenMinutesAgo)
    ]);

    // Combinar e buscar nomes dos consultores
    const { data: consultants } = await admin.from('consultants_manos_crm').select('id, name');
    const consultantMap = (consultants || []).reduce((acc: any, c: any) => {
      acc[c.id] = c.name;
      return acc;
    }, {});

    const riskyLeads = [
      ...(leadsVenda.data || []).map(l => ({
        id: l.id,
        name: l.name,
        score: l.ai_score,
        since: l.created_at,
        consultant: consultantMap[l.assigned_consultant_id!] || 'Desconhecido',
        interest: l.vehicle_interest,
        vertical: 'venda',
        phone: l.phone
      })),
      ...(leadsCompra.data || []).map(l => ({
        id: l.id,
        name: l.nome,
        score: l.ai_score,
        since: l.criado_em,
        consultant: consultantMap[l.assigned_consultant_id!] || 'Desconhecido',
        interest: l.modelo,
        vertical: 'compra',
        phone: l.telefone
      }))
    ].sort((a, b) => b.score - a.score);

    return NextResponse.json({
      count: riskyLeads.length,
      leads: riskyLeads,
      generated_at: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error in hot-leads-at-risk:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
