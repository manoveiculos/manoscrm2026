
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const { data: consultants, error } = await supabaseAdmin
            .from('consultants_manos_crm')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ success: true, consultants });

    } catch (err: any) {
        console.error("Extension Get Consultants API Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
