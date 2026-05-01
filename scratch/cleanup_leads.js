
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  console.log('--- Iniciando Cleanup de Leads de Teste ---');
  
  // 1. Marcar leads de teste/lixo como já contatados
  const { data: updatedLeads, error: updateError } = await supabase
    .from('leads_compra')
    .update({
      first_contact_at: new Date().toISOString(),
      first_contact_channel: 'cleanup_skip',
      status: 'perdido'
    })
    .or('nome.ilike.SMOKE%,nome.ilike.TESTE%,nome.ilike.Teste Antigravity%,telefone.eq.47999999999,telefone.eq.5547988467855,telefone.is.null,nome.eq.Lead sem nome')
    .is('first_contact_at', null)
    .select('id, nome, telefone');

  if (updateError) {
    console.error('Erro ao atualizar leads:', updateError);
  } else {
    console.log(`Leads atualizados (${updatedLeads.length}):`);
    console.table(updatedLeads);
  }

  console.log('\n--- Removendo duplicata Naikow Krueger ---');
  
  // 2. Remover duplicata Naikow Krueger
  const { data: deletedLead, error: deleteError } = await supabase
    .from('leads_compra')
    .delete()
    .eq('id', 'b795f920-8b47-4fcb-a227-4e712ce93428')
    .select('id, nome');

  if (deleteError) {
    console.error('Erro ao deletar lead:', deleteError);
  } else {
    console.log('Lead deletado:', deletedLead);
  }
}

cleanup();
