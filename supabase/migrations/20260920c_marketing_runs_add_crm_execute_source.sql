ALTER TABLE public.marketing_agent_runs DROP CONSTRAINT IF EXISTS marketing_agent_runs_source_check;
ALTER TABLE public.marketing_agent_runs ADD CONSTRAINT marketing_agent_runs_source_check
    CHECK (source IN ('claude_cowork', 'n8n', 'manual', 'crm_execute'));
COMMENT ON COLUMN public.marketing_agent_runs.source IS 'claude_cowork = squad rodando via Claude Code/Cowork; n8n = workflow; manual = alguém registrou à mão; crm_execute = disparado pela caixa "Executar" do painel /admin/marketing';
