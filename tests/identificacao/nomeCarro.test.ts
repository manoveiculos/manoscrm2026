// Nome e carro identificados vão para o lead. Rodar: npm run test:nome-carro
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNome } from '@/lib/identificacao/nome';
import { gravarInteresseGenerico, leadSemInteresse, textoDeInteresse } from '@/lib/identificacao/interesseGenerico';
import { nomeInicial } from '@/lib/whatsapp/criarLead';
import type { SupabaseClient } from '@supabase/supabase-js';

test('pergunta sobre a loja não vira nome (caso "Vocês abrem amanhã", 13/11/2026)', () => {
    for (const frase of ['Vocês abrem amanhã', 'Voces abrem amanha', 'Vocês funcionam sábado', 'Hoje à tarde', 'Abrem domingo', 'Aceitam pix', 'Qual o horário']) {
        assert.equal(validarNome(frase), null, frase);
    }
});

test('nomes de verdade continuam sendo reconhecidos', () => {
    assert.equal(validarNome('Maria da Silva'), 'Maria da Silva');
    assert.equal(validarNome('joão pedro'), 'João Pedro');
    assert.equal(validarNome('Ana Júlia'), 'Ana Júlia');
    assert.equal(validarNome('Vinicius Vieira'), 'Vinicius Vieira');
    assert.equal(validarNome('Prof. Jayme da Costa'), 'Jayme da Costa');
    assert.equal(validarNome('Marlise'), 'Marlise');
});

test('nome do perfil do WhatsApp entra no lead sem emoji nem enfeite', () => {
    assert.equal(nomeInicial('Thais✨'), 'Thais');
    assert.equal(nomeInicial('Joce 👨‍👩‍👧‍👧'), 'Joce');
    assert.equal(nomeInicial('Ani'), 'Ani');
    assert.equal(nomeInicial('Vex Visual Exper'), 'Vex Visual Exper');
    assert.equal(nomeInicial('😀😀'), 'Lead WhatsApp');            // só emoji: continua genérico
    assert.equal(nomeInicial(null), 'Lead WhatsApp');
    assert.equal(nomeInicial('5547999990001'), 'Lead WhatsApp');
});

test('interesse do cliente sem carro reconhecido: o texto vai para o lead, limpo', () => {
    assert.equal(textoDeInteresse('carro popular (hatch)'), 'Carro popular (hatch)');
    assert.equal(textoDeInteresse('  sedan ou SUV  '), 'Sedan ou SUV');
    assert.equal(textoDeInteresse('picape até 90 mil.'), 'Picape até 90 mil');
    for (const vazio of ['', null, 'não sei', 'qualquer um', 'tanto faz', 'Lead Google - Não especificado', 'Analisar Perfil', '...', 'ok']) {
        assert.equal(textoDeInteresse(vazio as string), null, String(vazio));
    }
    assert.equal(textoDeInteresse('x'.repeat(200))!.length, 90);
});

test('lead sem interesse = vazio ou só texto de preenchimento', () => {
    assert.equal(leadSemInteresse({ vehicle_interest: null, interesse: null }), true);
    assert.equal(leadSemInteresse({ vehicle_interest: '', interesse: 'Lead Google - Não especificado' }), true);
    assert.equal(leadSemInteresse({ vehicle_interest: 'Analisar Perfil', interesse: null }), true);
    assert.equal(leadSemInteresse({ vehicle_interest: 'Honda Civic LXS', interesse: null }), false);
    assert.equal(leadSemInteresse({ vehicle_interest: null, interesse: 'Corolla' }), false);
});

/** Banco de mentira: um lead e o registro dos updates. */
function banco(lead: Record<string, unknown> | null) {
    const updates: Record<string, unknown>[] = [];
    const from = () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lead, error: null }) }) }),
        update: (d: Record<string, unknown>) => ({ eq: async () => { updates.push(d); return { error: null }; } }),
    });
    return { admin: { from } as unknown as SupabaseClient, updates };
}

test('grava só em lead sem interesse; nunca sobrescreve um carro já gravado', async () => {
    const vazio = banco({ vehicle_interest: null, interesse: 'Lead Google - Não especificado' });
    assert.equal(await gravarInteresseGenerico(vazio.admin, 'leads_distribuicao_crm_26:4182', 'sedan ou SUV'), true);
    assert.equal(vazio.updates[0].vehicle_interest, 'Sedan ou SUV');

    const comCarro = banco({ vehicle_interest: 'Honda Civic LXS 2012', interesse: null });
    assert.equal(await gravarInteresseGenerico(comCarro.admin, 'leads_distribuicao_crm_26:4183', 'sedan ou SUV'), false);
    assert.equal(comCarro.updates.length, 0);

    // sem texto útil, sem lead, ou lead de outra tabela: não faz nada
    assert.equal(await gravarInteresseGenerico(banco({ vehicle_interest: null, interesse: null }).admin, 'leads_distribuicao_crm_26:1', 'não sei'), false);
    assert.equal(await gravarInteresseGenerico(banco(null).admin, 'leads_distribuicao_crm_26:1', 'sedan'), false);
    assert.equal(await gravarInteresseGenerico(banco({ vehicle_interest: null, interesse: null }).admin, 'leadsfacebook:abc', 'sedan'), false);
    assert.equal(await gravarInteresseGenerico(banco({ vehicle_interest: null, interesse: null }).admin, null, 'sedan'), false);
});
