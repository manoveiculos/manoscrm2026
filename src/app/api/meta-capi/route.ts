import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Helper to hash data to SHA256 as required by Meta
 */
function hashData(data: string | undefined): string | null {
    if (!data) return null;
    // Remove whitespace and convert to lowercase as per Meta recommendations
    const cleanData = data.trim().toLowerCase();
    return crypto.createHash('sha256').update(cleanData).digest('hex');
}

export async function POST(req: NextRequest) {
    const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;

    if (!PIXEL_ID || !ACCESS_TOKEN) {
        return NextResponse.json({ error: 'Meta implementation: Missing credentials in environment' }, { status: 500 });
    }

    try {
        const { eventName, userData, customData } = await req.json();

        // 1. Format User Data (Hashed)
        const hashedUserData: any = {
            external_id: [hashData(userData.externalId)], // External ID is also usually hashed for consistency
        };

        if (userData.email) hashedUserData.em = [hashData(userData.email)];
        if (userData.phone) hashedUserData.ph = [hashData(userData.phone)];

        // 2. Build Event Payload
        const payload = {
            data: [{
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                action_source: 'system_generated',
                user_data: hashedUserData,
                custom_data: {
                    ...customData,
                    currency: 'BRL', // Default for this CRM
                }
            }]
        };

        // 3. Send to Meta Graph API
        const response = await fetch(`https://graph.facebook.com/v25.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.error) {
            console.error('Meta API Error:', result.error);
            return NextResponse.json({ error: result.error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, fb_result: result });

    } catch (err: any) {
        console.error('CAPI Route Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
