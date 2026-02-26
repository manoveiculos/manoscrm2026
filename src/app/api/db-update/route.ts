import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { error } = await supabase.rpc('exec_sql', {
            sql_query: "ALTER TABLE leads_distribuicao ADD COLUMN IF NOT EXISTS ai_classification TEXT CHECK (ai_classification IN ('hot', 'warm', 'cold'));"
        });

        if (error) {
            // Fallback: try to just run a raw query if rpc doesn't exist
            // Actually, in many Supabase setups, you don't have rpc('exec_sql').
            // Let's try to just select and see if column exists.
            const { data } = await supabase.from('leads_distribuicao').select('*').limit(1);
            if (data && data.length > 0 && 'ai_classification' in data[0]) {
                return NextResponse.json({ message: "Column already exists" });
            }
            return NextResponse.json({ error: "Could not add column via RPC", details: error });
        }
        return NextResponse.json({ message: "Column added successfully" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
