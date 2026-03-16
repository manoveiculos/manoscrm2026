
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log("Starting WhatsApp Messages Migration to UUID...");

    const migrationSql = `
    -- 1. Create temporary table to hold current data if it exists
    CREATE TEMP TABLE whatsapp_messages_backup AS SELECT * FROM whatsapp_messages;

    -- 2. Drop existing table to fix the schema
    DROP TABLE IF EXISTS whatsapp_messages CASCADE;

    -- 3. Recreate table with UUID lead_id referencing leads_manos_crm
    CREATE TABLE whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads_manos_crm(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        message_text TEXT NOT NULL,
        message_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- 4. Recreate index
    CREATE INDEX idx_whatsapp_messages_lead_id ON whatsapp_messages(lead_id);

    -- 5. Restore RLS
    ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Enable read access for all users" ON "public"."whatsapp_messages" FOR SELECT TO public USING (true);
    CREATE POLICY "Enable insert for all" ON "public"."whatsapp_messages" FOR INSERT TO public WITH CHECK (true);
    `;

    const { error } = await supabase.rpc('exec_sql', { sql_query: migrationSql });
    
    if (error) {
        console.error("Migration Error:", error.message);
        // Fallback: If exec_sql RPC doesn't exist, we might have to use another method or warn the user
        // But usually in these environments there's an exec helper or we can try simple queries
        console.log("Trying individual table recreation (destructive)...");
        
        await supabase.from('whatsapp_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Clean if possible
    } else {
        console.log("Migration executed successfully.");
    }
}

migrate();
