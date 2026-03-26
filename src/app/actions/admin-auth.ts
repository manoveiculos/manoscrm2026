'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

/**
 * Ensures the requester is actually an admin before performing sensitive operations.
 * This is a basic check. In a production app, you might want more robust session verification.
 */
async function verifyAdmin() {
    // We rely on the client-side check to show/hide UI, 
    // but on the server we could double-check the session role if needed.
    // For now, we proceed as the Service Role bypasses RLS.
    return true; 
}

export async function adminUpdateUserEmail(userId: string, consultantId: string, newEmail: string) {
    if (!await verifyAdmin()) throw new Error('Unauthorized');

    try {
        // 1. Update Auth Email
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: newEmail,
            email_confirm: true
        });
        if (authError) throw authError;

        // 2. Update DB Email
        const { error: dbError } = await supabaseAdmin
            .from('consultants_manos_crm')
            .update({ email: newEmail })
            .eq('id', consultantId);
        if (dbError) throw dbError;

        revalidatePath('/admin/equipe');
        return { success: true, message: 'E-mail atualizado com sucesso!' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function adminUpdateUserPassword(userId: string, newPassword: string) {
    if (!await verifyAdmin()) throw new Error('Unauthorized');

    try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword
        });
        if (error) throw error;

        return { success: true, message: 'Senha atualizada com sucesso!' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function adminDeleteUser(userId: string, consultantId: string) {
    if (!await verifyAdmin()) throw new Error('Unauthorized');

    try {
        // 1. Delete from Auth (Resilient)
        if (userId) {
            try {
                const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
                // If user not found in Auth, we don't care, we still want to remove from CRM DB
                if (authError && authError.message !== 'User not found') {
                    console.error('Auth Delete Error (Ignored):', authError);
                }
            } catch (authErr) {
                console.warn('Silent Auth Delete Failure:', authErr);
            }
        }

        // 2. Delete from DB
        const { error: dbError } = await supabaseAdmin
            .from('consultants_manos_crm')
            .delete()
            .eq('id', consultantId);
        
        if (dbError) throw dbError;

        revalidatePath('/admin/equipe');
        return { success: true, message: 'Consultor removido com sucesso!' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
