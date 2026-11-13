// Filtro de regras da Laura: tração do carro (4x2/4x4) não é parcela. Rodar: npm run test:filtro
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarResposta, semTracao } from '@/lib/laura/guardrails';

const PRECOS = [88900, 119900];

test('caso real de 13/11: "Frontier 4x2 2014" não é simulação de parcela', () => {
    const texto = 'Caminhão não temos no estoque agora, mas posso confirmar com o consultor. Tenho uma picape: Nissan Frontier SV Attack CD 4x2 2014 · verde · 100.000 km · R$ 88.900. Quer ver? Qual seu nome?';
    const r = revisarResposta(texto, PRECOS, [], { fraseDeCredito: false });
    assert.deepEqual(r.violacoes, []);
    assert.equal(r.texto_seguro, texto);                       // a resposta certa vai ao cliente, sem a frase de segurança
});

test('tração 4x4, 6x4, 4 x 2 e 8x2 também passam', () => {
    for (const t of ['Hilux SRX 4x4 2019 · R$ 119.900', 'Caminhão 6x4 trucado', 'Strada 4 x 2 manual', 'Cavalo mecânico 8x2']) {
        assert.deepEqual(revisarResposta(t, PRECOS, [], { fraseDeCredito: false }).violacoes.includes('simulou_parcela'), false, t);
    }
    assert.equal(semTracao('Frontier 4x2 2014'), 'Frontier   2014');
});

test('simulação de parcela de verdade continua barrada (inclusive com 4x)', () => {
    for (const t of ['Fica em 48x de R$ 1.200', 'dá 4x de 500', 'em 12x 900 reais', 'a parcela fica em R$ 1.100', 'taxa de 1,5%', 'Frontier 4x2: 48x de R$ 2.000']) {
        assert.ok(revisarResposta(t, PRECOS, [], { fraseDeCredito: false }).violacoes.includes('simulou_parcela'), t);
    }
});

test('4x seguido de dígitos (valor) não é tração: "4x2000" continua suspeito', () => {
    assert.ok(revisarResposta('em 4x2000 reais', PRECOS, [], { fraseDeCredito: false }).violacoes.includes('simulou_parcela'));
});
