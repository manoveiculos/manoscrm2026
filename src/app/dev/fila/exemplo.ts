// Dados FICTÍCIOS para a prévia da Minha Fila (/dev/fila). Nenhum cliente real:
// nomes inventados, telefones 47 90000-0xxx.

import type { EntradaFila, LeadFila } from '@/lib/fila/montarFila';

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

/** 04/11/2026 14:30 em Brasília. */
export const AGORA_EXEMPLO = Date.parse('2026-11-04T17:30:00Z');

const iso = (t: number) => new Date(t).toISOString();
const atras = (ms: number) => iso(AGORA_EXEMPLO - ms);
const daqui = (ms: number) => iso(AGORA_EXEMPLO + ms);

const lead = (n: number, p: Partial<LeadFila>): LeadFila => ({
    uid: `leads_distribuicao_crm_26:${9000 + n}`,
    table: 'leads_distribuicao_crm_26',
    nativeId: String(9000 + n),
    nome: null,
    telefone: `55479000001${String(n).padStart(2, '0')}`,
    carro: null,
    status: 'contacted',
    criadoEm: atras(2 * D),
    atendimentoIniciadoEm: atras(2 * D),
    ultimaInteracaoHumana: atras(1 * H),
    primeiroContatoEm: atras(2 * D),
    primeiroContatoCanal: 'whatsapp',
    qualificacao: {},
    orientacaoIA: null,
    ...p,
});

export function entradaExemplo(): EntradaFila {
    const leads: LeadFila[] = [
        lead(1, {
            nome: 'Marcos Fictício', carro: 'Onix 2020 até 70 mil', status: 'attempt',
            criadoEm: atras(55 * MIN), atendimentoIniciadoEm: atras(50 * MIN), ultimaInteracaoHumana: atras(50 * MIN),
            primeiroContatoEm: null, primeiroContatoCanal: null,
            qualificacao: { vehicle_interest: 'Onix 2020 até 70 mil', valor_investimento: 'R$ 15.000', carro_troca: 'Gol 2012', prazo_compra: 'esta_semana' },
            orientacaoIA: 'Ofereça visita no sábado de manhã e peça fotos do Gol para adiantar a avaliação. Não passe valor de troca por mensagem.',
        }),
        lead(2, {
            nome: 'Juliana Fictícia', carro: 'HB20 2021', status: 'scheduled',
            qualificacao: { vehicle_interest: 'HB20 2021', valor_investimento: 'R$ 8.000', carro_troca: 'Sem troca', prazo_compra: 'este_mes' },
            ultimaInteracaoHumana: atras(3 * H),
        }),
        lead(3, {
            nome: 'Pedro Fictício', carro: 'Kwid 2022', status: 'contacted',
            criadoEm: atras(12 * D), atendimentoIniciadoEm: atras(12 * D), ultimaInteracaoHumana: atras(6 * D),
            qualificacao: { vehicle_interest: 'Kwid 2022', valor_investimento: '', carro_troca: '', prazo_compra: '' },
        }),
        lead(4, {
            nome: 'Fernanda Fictícia', carro: 'Corolla 2019', status: 'contacted',
            criadoEm: atras(3.6 * D), atendimentoIniciadoEm: atras(3.5 * D), ultimaInteracaoHumana: atras(3.4 * D),
            qualificacao: { vehicle_interest: 'Corolla 2019', valor_investimento: 'R$ 30.000', carro_troca: 'Sem troca', prazo_compra: '1_3_meses' },
        }),
        lead(5, {
            nome: 'Ricardo Fictício', carro: 'Strada 2020', status: 'contacted',
            ultimaInteracaoHumana: atras(1.2 * D),
            qualificacao: { vehicle_interest: 'Strada 2020', valor_investimento: 'Sem entrada', carro_troca: 'Uno 2015', prazo_compra: 'este_mes' },
        }),
        lead(6, {
            nome: 'Lucas Fictício', carro: 'Lead WhatsApp', status: 'received',
            criadoEm: atras(40 * MIN), atendimentoIniciadoEm: null, ultimaInteracaoHumana: null, primeiroContatoEm: null, primeiroContatoCanal: null,
            qualificacao: { vehicle_interest: 'Lead WhatsApp' },
        }),
        lead(7, {
            nome: 'Beatriz Fictícia', carro: 'T-Cross 2021', status: 'contacted',
            criadoEm: atras(1.6 * D), atendimentoIniciadoEm: atras(1.5 * D), ultimaInteracaoHumana: atras(2 * H),
            qualificacao: { vehicle_interest: 'T-Cross 2021', valor_investimento: 'R$ 5.000', carro_troca: 'Sem troca', prazo_compra: '1_3_meses' },
        }),
        lead(8, {
            nome: 'Rafael Fictício', carro: 'Carro até 20 mil', status: 'contacted',
            criadoEm: atras(20 * H), atendimentoIniciadoEm: atras(20 * H), ultimaInteracaoHumana: atras(4 * H),
            qualificacao: { vehicle_interest: 'Carro até 20 mil', valor_investimento: 'Sem entrada', carro_troca: 'Sem troca', prazo_compra: 'pesquisando' },
        }),
        lead(10, {
            nome: 'Tiago Fictício', carro: 'Compass 2020', status: 'contacted',
            qualificacao: { vehicle_interest: 'Compass 2020', valor_investimento: 'R$ 40.000', carro_troca: 'Sem troca', prazo_compra: '1_3_meses' },
        }),
    ];

    const perdidos: LeadFila[] = [
        lead(9, {
            nome: 'Sandra Fictícia', carro: 'Onix Plus 2021', status: 'perdido',
            qualificacao: { vehicle_interest: 'Onix Plus 2021' },
            motivoPerda: 'carro_fora_estoque', perdidoEm: atras(20 * D),
        }),
    ];

    return {
        agora: AGORA_EXEMPLO,
        pisoEstoque: 35000,
        leads,
        perdidos,
        estoque: [
            { marca: 'CHEVROLET', modelo: 'ONIX PLUS LTZ', ano: '2021', preco: 'R$ 79.900' },
            { marca: 'FIAT', modelo: 'MOBI LIKE', ano: '2022', preco: 'R$ 52.900' },
        ],
        visitas: [
            { id: 'v1', leadUid: 'leads_distribuicao_crm_26:9002', clienteNome: 'Juliana Fictícia', telefone: '5547900000102', veiculo: 'HB20 2021', dataHora: daqui(1.5 * H), tipo: 'loja', status: 'agendado' },
        ],
        retornos: [
            { id: 'r1', leadUid: 'leads_distribuicao_crm_26:9005', quando: atras(21.5 * H), nota: 'Ligar depois do trabalho' },
            { id: 'r2', leadUid: 'leads_distribuicao_crm_26:9010', quando: daqui(3 * D), nota: null },
        ],
        voltou: [
            { leadUid: 'leads_distribuicao_crm_26:9003', em: atras(2 * H), texto: 'Oi, ainda tem aquele Kwid?' },
        ],
        conversas: {
            'leads_distribuicao_crm_26:9001': {
                ultima: { texto: 'Consigo dar 15 mil de entrada e o Gol na troca. Dá pra ver sábado?', autor: 'cliente', em: atras(32 * MIN) },
                ultimaDoClienteEm: atras(32 * MIN),
            },
            'leads_distribuicao_crm_26:9002': {
                ultima: { texto: 'Perfeito, Juliana! Sua visita está marcada para hoje às 16h. Até logo!', autor: 'laura', em: atras(5 * H) },
                ultimaDoClienteEm: atras(5.1 * H),
            },
            'leads_distribuicao_crm_26:9003': {
                ultima: { texto: 'Oi, ainda tem aquele Kwid?', autor: 'cliente', em: atras(2 * H) },
                ultimaDoClienteEm: atras(2 * H),
            },
            'leads_distribuicao_crm_26:9006': {
                ultima: { texto: 'Oi! Aqui é a Laura, da Manos Veículos. Qual carro você procura?', autor: 'laura', em: atras(38 * MIN) },
                ultimaDoClienteEm: atras(39 * MIN),
            },
            'leads_distribuicao_crm_26:9007': {
                ultima: { texto: 'Vou ver com meu marido e te falo.', autor: 'cliente', em: atras(3 * H) },
                ultimaDoClienteEm: atras(3 * H),
            },
        },
    };
}
