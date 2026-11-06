// Dados FICTÍCIOS da prévia /dev/conversas e dos testes (npm run test:conversas).
// Nomes, telefones e carros inventados: nada aqui vem do banco.

import type { ConversaDetalhe, ConversaItem, MensagemView } from '@/lib/whatsapp/conversasView';
import type { RodadaEnsaio } from '@/lib/whatsapp/ia/ensaioView';
import type { DadosBarraIa } from '@/app/conversas/_components/LauraCrm';

/** 06/11/2026 14:00 em Rio do Sul. */
export const AGORA_EXEMPLO = Date.parse('2026-11-06T14:00:00-03:00');
const em = (minAtras: number) => new Date(AGORA_EXEMPLO - minAtras * 60_000).toISOString();

export const CONVERSAS_EXEMPLO: ConversaItem[] = [
    {
        id: '00000000-0000-4000-8000-000000000001', nome: 'Mariana Teste', telefoneKey: '47988880001',
        leadUid: 'leads_distribuicao_crm_26:9001', vendedorId: 'v1', vendedorNome: 'Carlos Exemplo',
        status: 'ia', naoLidas: 3, ultimaEm: em(4),
        ultima: { autor: 'cliente', tipo: 'audio', resumo: '🎤 Consigo dar uns 20 mil de entrada e o meu Gol 2015 na troca', em: em(4) },
        selo: 'quente', carro: 'Onix 2021',
    },
    {
        id: '00000000-0000-4000-8000-000000000002', nome: 'Roberto Exemplo', telefoneKey: '47988880002',
        leadUid: 'leads_distribuicao_crm_26:9002', vendedorId: 'v1', vendedorNome: 'Carlos Exemplo',
        status: 'ia', naoLidas: 0, ultimaEm: em(35),
        ultima: { autor: 'laura', tipo: 'texto', resumo: 'Perfeito! Vou pedir para um consultor confirmar a visita de sábado.', em: em(35) },
        selo: 'morno', carro: 'Hilux 2019',
    },
    {
        id: '00000000-0000-4000-8000-000000000003', nome: 'Ana Fictícia', telefoneKey: '4733334444',
        leadUid: 'leads_distribuicao_crm_26:9003', vendedorId: 'v1', vendedorNome: 'Carlos Exemplo',
        status: 'ia', naoLidas: 1, ultimaEm: em(80),
        ultima: { autor: 'cliente', tipo: 'imagem', resumo: '📷 Esse é o carro da troca', em: em(80) },
        selo: 'sem_qualificacao', carro: null,
    },
    {
        id: '00000000-0000-4000-8000-000000000004', nome: null, telefoneKey: '47988880004',
        leadUid: null, vendedorId: null, vendedorNome: null,
        status: 'ia', naoLidas: 0, ultimaEm: em(60 * 20),
        ultima: { autor: 'cliente', tipo: 'texto', resumo: 'Vocês aceitam moto na troca?', em: em(60 * 20) },
        selo: null, carro: null,
    },
    {
        id: '00000000-0000-4000-8000-000000000005', nome: 'Paulo Modelo', telefoneKey: '47988880005',
        leadUid: 'leads_distribuicao_crm_26:9005', vendedorId: 'v2', vendedorNome: 'Juliana Exemplo',
        status: 'humano', naoLidas: 0, ultimaEm: em(60 * 30),
        ultima: { autor: 'vendedor', tipo: 'texto', resumo: 'Combinado, te espero amanhã às 10h.', em: em(60 * 30) },
        selo: 'quente', carro: 'Compass 2022',
    },
    {
        id: '00000000-0000-4000-8000-000000000006', nome: 'Lúcia Demo', telefoneKey: '47988880006',
        leadUid: 'leads_distribuicao_crm_26:9006', vendedorId: 'v1', vendedorNome: 'Carlos Exemplo',
        status: 'encerrada', naoLidas: 0, ultimaEm: em(60 * 24 * 4),
        ultima: { autor: 'laura', tipo: 'texto', resumo: 'Obrigada pelo contato! Qualquer coisa é só chamar.', em: em(60 * 24 * 4) },
        selo: 'fora_do_perfil', carro: 'Kwid 2018',
    },
];

let seq = 0;
function msg(p: Partial<MensagemView> & Pick<MensagemView, 'autor' | 'tipo'>, minAtras: number): MensagemView {
    seq += 1;
    return {
        id: `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`,
        providerId: `3EB0EXEMPLO${String(seq).padStart(8, '0')}`,
        direcao: p.autor === 'cliente' ? 'in' : 'out',
        texto: null, legenda: null, temMidia: false, midiaMime: null, midiaBytes: null, midiaNome: null,
        midiaExpirada: false, midiaErro: null, duracaoS: null, transcricao: null, citadaId: null,
        statusEntrega: p.autor === 'cliente' ? null : 'lida', editadaEm: null, apagadaEm: null,
        criadaEm: em(minAtras), localizacao: null, contatos: null, analiseAudio: null,
        ...p,
    };
}

export function mensagensExemplo(): MensagemView[] {
    seq = 0;
    const ontem1 = msg({ autor: 'cliente', tipo: 'texto', texto: 'Boa tarde! Vi o anúncio do Onix 2021 prata. Ainda está disponível?' }, 60 * 22);
    const ontem2 = msg({ autor: 'laura', tipo: 'texto', texto: 'Boa tarde, Mariana! Está sim 😊 Para eu te ajudar melhor: você pretende dar entrada ou usar um carro na troca?' }, 60 * 22 - 1);
    const fotoTroca = msg({ autor: 'cliente', tipo: 'imagem', temMidia: true, midiaMime: 'image/jpeg', midiaBytes: 245_760, legenda: 'Esse é o meu Gol para a troca' }, 60 * 21);
    const expirada = msg({ autor: 'cliente', tipo: 'imagem', midiaExpirada: true, midiaBytes: 198_000 }, 60 * 21 - 1);
    const pergunta = msg({ autor: 'laura', tipo: 'texto', texto: 'Ótimo! Qual seria o melhor dia para você vir conhecer o carro?' }, 30);
    const editada = msg({ autor: 'cliente', tipo: 'texto', texto: 'Pode ser sábado de manhã, umas 10h', editadaEm: em(19) }, 20);
    const citada = msg({ autor: 'cliente', tipo: 'texto', texto: 'Ah, e vocês financiam?', citadaId: pergunta.providerId }, 18);
    const reacao = msg({ autor: 'cliente', tipo: 'reacao', texto: '👍', citadaId: pergunta.providerId }, 17);
    const apagada = msg({ autor: 'cliente', tipo: 'texto', texto: 'mensagem errada', apagadaEm: em(15) }, 16);
    const doc = msg({ autor: 'cliente', tipo: 'documento', temMidia: true, midiaMime: 'application/pdf', midiaNome: 'comprovante-renda.pdf', midiaBytes: 88_123 }, 12);
    const local = msg({ autor: 'cliente', tipo: 'localizacao', texto: 'Centro — Rio do Sul', localizacao: { lat: -27.2142, lng: -49.6431, nome: 'Centro', endereco: 'Rio do Sul - SC' } }, 10);
    const contato = msg({ autor: 'cliente', tipo: 'contato', texto: 'Contato Exemplo', contatos: [{ nome: 'Contato Exemplo (esposo)', telefones: ['5547977770003'] }] }, 8);
    const audio = msg({
        autor: 'cliente', tipo: 'audio', temMidia: true, midiaMime: 'audio/ogg; codecs=opus', midiaBytes: 18_432, duracaoS: 9,
        transcricao: 'Consigo dar uns 20 mil de entrada e o meu Gol 2015 na troca. Queria ver se as parcelas ficam até 1.500.',
        analiseAudio: { sentimento: 'muito interessado', objecao: 'parcela', resumo: 'Tem entrada e troca; quer parcela até R$ 1.500' },
    }, 4);
    return [ontem1, ontem2, fotoTroca, expirada, pergunta, editada, citada, reacao, apagada, doc, local, contato, audio];
}

export function detalheExemplo(): ConversaDetalhe {
    return { conversa: CONVERSAS_EXEMPLO[0], mensagens: mensagensExemplo(), citadas: {}, temMais: true };
}

// ---------------------------------------------------------------------------
// Laura do CRM (etapa B, ensaio) — dados FICTÍCIOS para a prévia
// ---------------------------------------------------------------------------

export const BARRA_IA_EXEMPLO: DadosBarraIa = {
    podeMudar: true,
    config: { modo: 'ensaio', modoGravado: 'ensaio', motivo: null, ativaNoServidor: true },
    resumo: {
        desde: '2026-11-06T03:00:00.000Z', rodadas: 14, ok: 13, erro: 1, puladas: 2, barradas: 1,
        violacoes: { simulou_parcela: 1 }, tempoMedioMs: 6200, custoTotalUsd: 0.0412, conversas: 6, custoPorConversaUsd: 0.0069,
    },
};

export const RODADAS_EXEMPLO: RodadaEnsaio[] = [
    {
        id: 'r3', status: 'ok', motivo: null, modo: 'ensaio',
        iniciadaEm: '2026-11-06T13:41:10-03:00', terminadaEm: '2026-11-06T13:41:17-03:00', tempoMs: 7100, custoUsd: 0.0038,
        gatilho: { texto: 'Dá pra fazer em 48x? Quanto fica a parcela?', em: '2026-11-06T13:41:00-03:00' },
        rascunho: 'Essa parte o consultor passa certinho pra você aqui na loja 😊 Posso já deixar sua visita agendada pra ele te mostrar tudo pessoalmente?',
        original: 'Fica em torno de 48x de R$ 1.890, mas depende do banco!',
        violacoes: ['simulou_parcela'],
        ferramentas: [{ nome: 'salvar_ficha', erro: false }],
        fotos: [], agendamento: null, passagem: null,
        reais: [{ autor: 'laura', texto: 'O consultor faz a simulação certinha com você, sujeito a análise de crédito. Quer agendar uma visita?', em: '2026-11-06T13:41:20-03:00' }],
    },
    {
        id: 'r2', status: 'ok', motivo: null, modo: 'ensaio',
        iniciadaEm: '2026-11-06T13:30:12-03:00', terminadaEm: '2026-11-06T13:30:18-03:00', tempoMs: 5900, custoUsd: 0.0031,
        gatilho: { texto: 'Sou o Carlos, de Ibirama. Tem fotos do Onix?', em: '2026-11-06T13:30:00-03:00' },
        rascunho: 'Prazer, Carlos! Te mandei as fotos do Onix LT 1.0 2020 (R$ 62.900, 58.000 km). Você pensa em pagar à vista ou financiado?',
        original: null, violacoes: [],
        ferramentas: [{ nome: 'salvar_ficha', erro: false }, { nome: 'buscar_estoque', erro: false }, { nome: 'enviar_fotos', erro: false }],
        fotos: [{ carro: 'Chevrolet Onix LT 1.0', quantidade: 4 }], agendamento: null, passagem: null,
        reais: [{ autor: 'laura', texto: 'Oi Carlos! Tenho sim, vou te mandar. Qual o seu nome completo?', em: '2026-11-06T13:30:25-03:00' }],
    },
    {
        id: 'r1', status: 'erro', motivo: 'o modelo recusou responder', modo: 'ensaio',
        iniciadaEm: '2026-11-06T13:20:02-03:00', terminadaEm: '2026-11-06T13:20:04-03:00', tempoMs: 2100, custoUsd: 0.0009,
        gatilho: { texto: '🎤 Bom dia, vi o anúncio do Onix', em: '2026-11-06T13:19:50-03:00' },
        rascunho: null, original: null, violacoes: [], ferramentas: [], fotos: [], agendamento: null, passagem: null,
        reais: [],
    },
];
