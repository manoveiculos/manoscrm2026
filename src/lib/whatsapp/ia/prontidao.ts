// src/lib/whatsapp/ia/prontidao.ts — a Laura do CRM está pronta para atender de verdade? (PURO)
//
// Lê SÓ se cada variável existe (e se tem o valor esperado). Nunca devolve o valor:
// segredo e chave não saem daqui. Usado por GET /api/wa/ia/prontidao (admin) e pelo
// painel "Prontidão" da tela Conversas. Passo a passo da troca: docs/laura-sem-n8n.md.

export type GrupoProntidao = 'base' | 'troca' | 'opcional';

export interface ItemProntidao {
    id: string;
    grupo: GrupoProntidao;
    ok: boolean;
    titulo: string;
    /** O que fazer quando não está ok (texto para o Alexandre). */
    como: string;
}

type Env = Record<string, string | undefined>;
const tem = (v: string | undefined) => !!(v || '').replace(/"/g, '').trim();
const verdadeiro = (v: string | undefined) => (v || '').trim().toLowerCase() === 'true';

export function avaliarEnv(env: Env): ItemProntidao[] {
    const it = (id: string, grupo: GrupoProntidao, ok: boolean, titulo: string, como: string): ItemProntidao => ({ id, grupo, ok, titulo, como });
    return [
        // base: precisa estar certo para a Laura funcionar (ensaio ou envio)
        it('ingestao', 'base', env.WA_INGEST_ATIVO === 'true', 'Ingestão do WhatsApp ligada', 'Hostinger: WA_INGEST_ATIVO=true (fica ligada para sempre).'),
        it('segredo', 'base', tem(env.WHATSAPP_INGEST_SECRET), 'Segredo do webhook configurado', 'Hostinger: WHATSAPP_INGEST_SECRET com um valor longo e aleatório.'),
        it('instancia', 'base', tem(env.WA_LOJA_INSTANCIA), 'Instância da Evolution (número da loja)', 'Hostinger: WA_LOJA_INSTANCIA=teste (o nome da instância do (47) 3300-1352).'),
        it('token', 'base', tem(env.WA_LOJA_TOKEN), 'Chave da instância da Evolution', 'Hostinger: WA_LOJA_TOKEN = a apikey da instância.'),
        it('evolution_url', 'base', tem(env.WA_LOJA_EVOLUTION_URL) || tem(env.EVOLUTION_BASE_URL), 'Endereço da Evolution', 'Hostinger: EVOLUTION_BASE_URL (ou WA_LOJA_EVOLUTION_URL).'),
        it('claude', 'base', tem(env.API_CLAUDE) || tem(env.ANTHROPIC_API_KEY), 'Chave da Anthropic (Claude)', 'Hostinger: API_CLAUDE com a chave do console.anthropic.com (e saldo na conta).'),
        it('ia_ativa', 'base', env.WA_IA_ATIVA === 'true', 'Laura do CRM liberada no servidor', 'Hostinger: WA_IA_ATIVA=true.'),
        // troca: só no dia de tirar o n8n
        it('criar_lead', 'troca', verdadeiro(env.WA_CRIAR_LEAD), 'CRM cria o lead e a roleta distribui', 'Dia da troca: WA_CRIAR_LEAD=true.'),
        it('sem_n8n', 'troca', verdadeiro(env.WA_SEM_N8N), 'Mensagem do celular da loja = humano assumiu', 'Dia da troca: WA_SEM_N8N=true (só junto com a troca do webhook na Evolution).'),
        it('envio_crm', 'troca', verdadeiro(env.WA_ENVIO_PELO_CRM), 'Envio pelo CRM liberado (vendedor responde pela tela)', 'Dia da troca: WA_ENVIO_PELO_CRM=true.'),
        it('envio_tela', 'troca', verdadeiro(env.NEXT_PUBLIC_WA_ENVIO), 'Caixa de resposta aparece na tela', 'Dia da troca: NEXT_PUBLIC_WA_ENVIO=true (exige novo deploy).'),
        it('envio_laura', 'troca', verdadeiro(env.WA_IA_ENVIO_LIBERADO), 'Laura autorizada a ENVIAR ao cliente', 'Dia da troca, só com o "aprovado": WA_IA_ENVIO_LIBERADO=true.'),
        // opcional
        it('identificacao', 'opcional', (env.WA_IDENTIFICACAO || '').trim().toLowerCase() === 'on', 'Nome e carro corrigidos sozinhos', 'Hostinger: WA_IDENTIFICACAO=on (a migration já está aplicada).'),
        it('limite', 'opcional', tem(env.WA_IA_LIMITE_DIA), 'Limite diário de respostas definido', 'Opcional: WA_IA_LIMITE_DIA (padrão 300).'),
    ];
}

export interface ResumoProntidao {
    baseOk: boolean;
    trocaOk: boolean;
    faltaBase: number;
    faltaTroca: number;
}

export function resumirProntidao(itens: ItemProntidao[]): ResumoProntidao {
    const falta = (g: GrupoProntidao) => itens.filter(i => i.grupo === g && !i.ok).length;
    return { baseOk: falta('base') === 0, trocaOk: falta('troca') === 0, faltaBase: falta('base'), faltaTroca: falta('troca') };
}
