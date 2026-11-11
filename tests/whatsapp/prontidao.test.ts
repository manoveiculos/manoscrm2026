// Prontidão da Laura do CRM. Rodar: npm run test:prontidao (sem banco, sem rede)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarEnv, resumirProntidao } from '@/lib/whatsapp/ia/prontidao';

const BASE_OK = {
    WA_INGEST_ATIVO: 'true', WHATSAPP_INGEST_SECRET: 'x', WA_LOJA_INSTANCIA: 'teste', WA_LOJA_TOKEN: 'k',
    EVOLUTION_BASE_URL: 'https://evo.exemplo.com', API_CLAUDE: 'sk', WA_IA_ATIVA: 'true',
};

test('sem nenhuma variável: a base inteira falta e o texto diz o que criar', () => {
    const itens = avaliarEnv({});
    const r = resumirProntidao(itens);
    assert.equal(r.baseOk, false);
    assert.equal(r.faltaBase, 7);
    assert.match(itens.find(i => i.id === 'claude')!.como, /API_CLAUDE/);
});

test('base completa: base ok; troca ainda faltando até as chaves do dia da troca', () => {
    let r = resumirProntidao(avaliarEnv(BASE_OK));
    assert.equal(r.baseOk, true);
    assert.equal(r.trocaOk, false);
    assert.equal(r.faltaTroca, 5);
    r = resumirProntidao(avaliarEnv({
        ...BASE_OK, WA_CRIAR_LEAD: 'true', WA_SEM_N8N: 'true', WA_ENVIO_PELO_CRM: 'true', NEXT_PUBLIC_WA_ENVIO: 'true', WA_IA_ENVIO_LIBERADO: 'true',
    }));
    assert.equal(r.trocaOk, true);
});

test('ANTHROPIC_API_KEY também vale para a chave do Claude; valores com aspas e "false" não contam', () => {
    const { API_CLAUDE: _ignorada, ...semClaude } = BASE_OK;
    void _ignorada;
    assert.equal(avaliarEnv({ ...semClaude, ANTHROPIC_API_KEY: 'sk' }).find(i => i.id === 'claude')!.ok, true);
    assert.equal(avaliarEnv({ ...BASE_OK, WA_LOJA_INSTANCIA: '""' }).find(i => i.id === 'instancia')!.ok, false);
    assert.equal(avaliarEnv({ ...BASE_OK, WA_SEM_N8N: 'false' }).find(i => i.id === 'sem_n8n')!.ok, false);
    assert.equal(avaliarEnv({ ...BASE_OK, WA_IDENTIFICACAO: 'ON' }).find(i => i.id === 'identificacao')!.ok, true);
});

test('o resultado nunca carrega o valor das variáveis', () => {
    const json = JSON.stringify(avaliarEnv({ ...BASE_OK, WHATSAPP_INGEST_SECRET: 'SEGREDO-QUE-NAO-PODE-VAZAR', WA_LOJA_TOKEN: 'TOKEN-SECRETO' }));
    assert.ok(!json.includes('SEGREDO-QUE-NAO-PODE-VAZAR'));
    assert.ok(!json.includes('TOKEN-SECRETO'));
});
