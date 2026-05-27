import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('reminders_cobrancamanos26')
    .select('*')
    .order('sentAt', { ascending: false });

  if (error) {
    console.error('[Supabase API Error] Fetch reminders failed:', error.message);
    return NextResponse.json([]);
  }
  return NextResponse.json(data || []);
}
