import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    dataHoraGoogle, hashEmailGoogle, hashTelefoneGoogle, leadEhDoGoogle, montarConversao,
    type ConfigGoogleConv, type ItemGoogle, type PerfilGoogle,
} from '@/lib/services/googleConversoes';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const cfg: ConfigGoogleConv = {
    modo: 'test', versao: 'v22', clienteId: '5870869611', loginClienteId: undefined,
    acoes: { QualifiedLead: '111', Schedule: '222', Purchase: '333' },
};
const item = (event_name: ItemGoogle['event_name'], extra: Partial<ItemGoogle> = {}): ItemGoogle => ({
    fila_id: 7, event_name, order_id: `crm_${event_name.toLowerCase()}_7`, event_time: '2026-11-19T17:03:00Z', created_at: '2026-11-19T17:03:00Z', attempts: 0, ...extra,
});

test('o lead é do Google por gclid, plataforma google no utm ou origem google; Meta e WhatsApp direto não', () => {
    assert.equal(leadEhDoGoogle({ crm26: { utm_params: { gclid: 'abc' } } }), true);
    assert.equal(leadEhDoGoogle({ master: { utm_params: { platform: 'google' } } }), true);
    assert.equal(leadEhDoGoogle({}, 'google'), true);
    assert.equal(leadEhDoGoogle({ crm26: { utm_params: { platform: 'meta', ctwa_clid: 'x' } } }, 'whatsapp'), false);
    assert.equal(leadEhDoGoogle({}, 'whatsapp'), false);
});

test('hashes: e-mail sem os pontos/+tag do gmail, telefone em E.164 (+55)', () => {
    assert.equal(hashEmailGoogle(' Joao.Silva+x@Gmail.com '), sha('joaosilva@gmail.com'));
    assert.equal(hashEmailGoogle('Maria@empresa.com.br'), sha('maria@empresa.com.br'));
    assert.equal(hashEmailGoogle('sem-arroba'), null);
    assert.equal(hashTelefoneGoogle('(47) 99134-3318'), sha('+5547991343318'));
    assert.equal(hashTelefoneGoogle('123'), null);
});

test('data no formato do Google, em Brasília', () => {
    assert.equal(dataHoraGoogle('2026-11-19T17:03:00Z'), '2026-11-19 14:03:00-03:00');
    assert.equal(dataHoraGoogle('2026-11-19T02:00:00Z'), '2026-11-18 23:00:00-03:00');
});

test('com gclid: envia pelo clique, com orderId para deduplicar', () => {
    const d = montarConversao(item('Schedule'), { crm26: { telefone: '47991343318', utm_params: { gclid: 'GCLID123' } } }, cfg);
    assert.equal(d.tipo, 'enviar');
    if (d.tipo !== 'enviar') return;
    assert.equal(d.canal, 'gclid');
    assert.deepEqual(d.conversao, {
        conversionAction: 'customers/5870869611/conversionActions/222', conversionDateTime: '2026-11-19 14:03:00-03:00',
        orderId: 'crm_schedule_7', gclid: 'GCLID123',
    });
});

test('sem gclid: usa e-mail e telefone com hash; nada de dado em texto puro no payload', () => {
    const d = montarConversao(item('QualifiedLead'), { crm26: { telefone: '47991343318' }, master: { email: 'maria@x.com' } }, cfg);
    assert.equal(d.tipo, 'enviar');
    if (d.tipo !== 'enviar') return;
    assert.equal(d.canal, 'enhanced');
    assert.deepEqual(d.conversao.userIdentifiers, [{ hashedEmail: sha('maria@x.com') }, { hashedPhoneNumber: sha('+5547991343318') }]);
    const texto = JSON.stringify(d.conversao);
    assert.ok(!texto.includes('maria@x.com') && !texto.includes('991343318'));
});

test('ignora: sem identificador, sem ação configurada, sem cliente', () => {
    assert.deepEqual(montarConversao(item('QualifiedLead'), {}, cfg), { tipo: 'ignorar', motivo: 'lead sem gclid, e-mail ou telefone para identificar o clique' });
    const semAcao = { ...cfg, acoes: { Schedule: '222' } };
    assert.equal(montarConversao(item('Purchase'), { crm26: { utm_params: { gclid: 'x' } } }, semAcao).tipo, 'ignorar');
    assert.equal(montarConversao(item('Schedule'), { crm26: { utm_params: { gclid: 'x' } } }, { ...cfg, clienteId: undefined }).tipo, 'ignorar');
});

test('venda: leva o valor real; sem valor espera até 24 h e depois manda sem', () => {
    const perfil: PerfilGoogle = { crm26: { utm_params: { gclid: 'g' } }, valor_venda: 68500 };
    const d = montarConversao(item('Purchase'), perfil, cfg);
    assert.equal(d.tipo === 'enviar' && d.conversao.conversionValue, 68500);
    assert.equal(d.tipo === 'enviar' && d.conversao.currencyCode, 'BRL');

    const agora = new Date('2026-11-19T18:00:00Z').getTime();
    const semValor: PerfilGoogle = { crm26: { utm_params: { gclid: 'g' } } };
    assert.deepEqual(montarConversao(item('Purchase'), semValor, cfg, agora), { tipo: 'adiar', motivo: 'aguardando valor da venda', minutos: 120 });
    const velho = item('Purchase', { created_at: '2026-11-17T10:00:00Z' });
    const d2 = montarConversao(velho, semValor, cfg, agora);
    assert.equal(d2.tipo, 'enviar');
    assert.equal(d2.tipo === 'enviar' && 'conversionValue' in d2.conversao, false);
});
