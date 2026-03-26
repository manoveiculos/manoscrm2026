const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testUpdatePassword() {
    const userId = '9a46bdd2-8ee4-4c22-b0fa-7b3f8ca9cb53'; // Karoline Bot
    const newPassword = 'testPassword123';
    
    console.log(`Attempting to update password for user ${userId}...`);
    
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
    });
    
    if (error) {
        console.error('Error updating password:', error);
    } else {
        console.log('Password updated successfully:', data);
    }
}

testUpdatePassword();
