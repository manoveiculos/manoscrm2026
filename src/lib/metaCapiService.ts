/**
 * Meta Conversions API (CAPI) Service
 * Used to trigger lead conversion events from the CRM
 */

import { Lead, LeadStatus } from './types';

export const metaCapiService = {
    /**
     * Map CRM LeadStatus to Meta Standard Events
     */
    mapStatusToEvent(status: LeadStatus): string | null {
        switch (status) {
            case 'new':
            case 'received':
                return 'Lead';
            case 'negotiation':
            case 'proposed':
                return 'Contact';
            case 'scheduled':
                return 'Schedule';
            case 'comprado':
            case 'closed':
                return 'Purchase';
            default:
                return null;
        }
    },

    /**
     * Sends a conversion event to our internal API route
     */
    async sendEvent(lead: Lead, eventName: string) {
        try {
            const response = await fetch('/api/meta-capi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventName,
                    userData: {
                        email: lead.email,
                        phone: lead.phone,
                        externalId: lead.id
                    },
                    customData: {
                        lead_event_source: 'ManoVeiculosCRM',
                        event_source: 'crm'
                    }
                })
            });

            if (!response.ok) {
                const err = await response.json();
                console.error('Meta CAPI Error Response:', err);
                return false;
            }

            return true;
        } catch (err) {
            console.error('Meta CAPI Service Error:', err);
            return false;
        }
    }
};
