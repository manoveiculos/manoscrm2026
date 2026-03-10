
import { dataService } from './src/lib/dataService';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase to use service role if needed, or just let it use the default one
// Assuming env vars are already in the environment

async function testSync() {
    const token = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID || process.env.NEXT_PUBLIC_META_AD_ACCOUNT_ID;

    if (!token || !adAccountId) {
        console.error("Missing Meta credentials in env");
        return;
    }

    console.log("Starting debug sync test...");

    try {
        console.log("Calling syncMetaCampaigns...");
        const campaignCount = await dataService.syncMetaCampaigns(token, adAccountId);
        console.log(`Success! Synced ${campaignCount} campaigns.`);
    } catch (err) {
        console.error("syncMetaCampaigns FAILED:", err);
    }

    try {
        console.log("Calling syncMetaLeads...");
        const leadCount = await dataService.syncMetaLeads(token, adAccountId);
        console.log(`Success! Synced ${leadCount} leads.`);
    } catch (err) {
        console.error("syncMetaLeads FAILED:", err);
    }
}

testSync();
