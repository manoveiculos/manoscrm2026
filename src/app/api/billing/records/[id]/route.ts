import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Resolve params to ensure compatibility with Next.js 14/15
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('records_cobrancamanos26')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase API Error] Delete record failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 550 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
