
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return env;
}

const env = getEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('Checking schema for "leads" table/view...');
  
  const { data, error } = await supabase.from('leads').select('*').limit(1);
  
  if (error) {
    console.error('Error selecting from leads:', error);
  } else if (data && data.length > 0) {
    console.log('Columns found:', Object.keys(data[0]).join(', '));
  } else {
    console.log('No data found in leads.');
  }
}

checkSchema();
