import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { initQueueProcessor } from '@/lib/billing-queue';

export async function GET() {
  // Gracefully initialize queue ticks on the first API call
  initQueueProcessor();
  
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('records_cobrancamanos26')
    .select('*')
    .order('vencimento', { ascending: true });

  if (error) {
    console.error('[Supabase API Error] Fetch billing records failed:', error.message);
    return NextResponse.json([]);
  }
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  try {
    const record = await req.json();
    if (!record.id) {
      record.id = `rec-${crypto.randomUUID()}`;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('records_cobrancamanos26')
      .upsert(record)
      .select();

    if (error) {
      console.error('[Supabase API Error] Upsert record failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, record: data ? data[0] : record });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
