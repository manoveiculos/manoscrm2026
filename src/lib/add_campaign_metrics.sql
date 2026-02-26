-- ENHANCEMENT: Add Detailed Analytics Columns to Campaigns (manoscrm26)
-- Run this in your Supabase SQL Editor

ALTER TABLE campaigns_manoscrm26 
ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cpc DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ctr DECIMAL DEFAULT 0;

COMMENT ON COLUMN campaigns_manoscrm26.link_clicks IS 'Cliques no link (Meta Ads Conversion)';
COMMENT ON COLUMN campaigns_manoscrm26.reach IS 'Alcance único da campanha';
