// src/lib/whatsapp/ia/visao.ts — a Laura enxergando as fotos que o cliente manda
//
// Antes (18/11/2026) a Laura só via "[foto]" no histórico: o carro da troca, o print do anúncio e a foto
// do carro que o cliente gostou passavam em branco. Agora cada foto do cliente é descrita UMA vez pelo
// Claude (visão) e a descrição fica em wa_mensagens.extra.visao (sem migration). O histórico passa a
// mostrar "[foto] Parece um Onix 2018 prata..." e a Laura responde em cima disso.
//
// Regras de segurança:
//   - documento pessoal (CNH, RG, comprovante): só diz que é documento, NUNCA copia número nem nome;
//   - a IA descreve o que VÊ; modelo/ano de foto de carro vêm com grau de confiança, nunca como certeza;
//   - nada aqui avalia preço do carro (isso continua proibido em guardrails.ts).
//
// Este arquivo tem a parte PURA (testada) e a chamada ao Claude. A leitura do bucket e a gravação ficam
// em visaoRodada.ts.

import type Anthropic from '@anthropic-ai/sdk';

export const MIMES_VISAO = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
/** O Claude aceita até 5 MB por imagem. */
export const LIMITE_BYTES_VISAO = 5 * 1024 * 1024;
export const MAX_TENTATIVAS_VISAO = 2;

export type TipoImagem = 'carro' | 'print_anuncio' | 'documento' | 'outro';
export type Confianca = 'alta' | 'media' | 'baixa';

export interface DescricaoImagem {
    tipo: TipoImagem;
    /** Marca/modelo/ano que aparecem ou que parecem aparecer. Vazio quando não dá para saber. */
    marca: string | null;
    modelo: string | null;
    ano: string | null;
    cor: string | null;
    confianca: Confianca;
    /** Uma frase: o que a imagem mostra, sem dado pessoal. */
    resumo: string;
    /** Texto de anúncio/print que ajuda a achar o carro (título, preço). Nunca dado pessoal. */
    texto_visivel: string | null;
}

export const PROMPT_VISAO = `Você ajuda o WhatsApp de uma loja de carros (Manos Veículos). Um cliente mandou esta imagem. Descreva o que ela mostra, para que a atendente entenda.

Responda SOMENTE com um JSON, sem texto antes ou depois:
{"tipo":"carro|print_anuncio|documento|outro","marca":string|null,"modelo":string|null,"ano":string|null,"cor":string|null,"confianca":"alta|media|baixa","resumo":string,"texto_visivel":string|null}

Regras:
- tipo "carro": foto de um veículo (de rua, de garagem, de anúncio). Identifique marca, modelo e faixa de ano pelo que vê (faróis, grade, lanternas, emblemas, painel). Se não tiver certeza, deixe null o que não souber e use confianca "baixa". Nunca invente.
- tipo "print_anuncio": captura de tela de anúncio ou site (OLX, Webmotors, Instagram, site da loja...). Copie em texto_visivel só o título do carro, ano e preço anunciado. Preencha marca/modelo/ano se aparecerem.
- tipo "documento": CNH, RG, CRLV, comprovante, contrato, extrato. Em resumo diga SÓ o tipo do documento. NUNCA copie nome, CPF, RG, números, endereço ou valores. marca/modelo/ano/cor: null.
- tipo "outro": qualquer coisa que não seja carro nem anúncio (pessoa, paisagem, meme, tela do celular). Resumo curto e neutro.
- resumo: UMA frase em português, sem dado pessoal, dizendo o que se vê (ex.: "Hatch prata de frente, parece em bom estado, com a placa coberta"). Não avalie preço nem valor do carro.
- Placa: não escreva placa nenhuma.`;

const TIPOS: TipoImagem[] = ['carro', 'print_anuncio', 'documento', 'outro'];
const CONFIANCAS: Confianca[] = ['alta', 'media', 'baixa'];

const limpa = (v: unknown, max = 120): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
    return t && t.toLowerCase() !== 'null' ? t : null;
};

/** Lê o JSON que o Claude devolveu (aceita cerca ```json e texto em volta). null = resposta inutilizável. */
export function lerDescricao(bruto: string): DescricaoImagem | null {
    const ini = bruto.indexOf('{');
    const fim = bruto.lastIndexOf('}');
    if (ini < 0 || fim <= ini) return null;
    let o: Record<string, unknown>;
    try { o = JSON.parse(bruto.slice(ini, fim + 1)) as Record<string, unknown>; } catch { return null; }
    const tipo = TIPOS.includes(o.tipo as TipoImagem) ? (o.tipo as TipoImagem) : 'outro';
    const doc = tipo === 'documento';
    // documento: o resumo do modelo NUNCA entra (pode trazer nome ou CPF); fica um texto fixo
    const resumo = doc ? 'documento pessoal ou comprovante' : limpa(o.resumo, 240);
    if (!resumo) return null;
    return {
        tipo,
        marca: doc ? null : limpa(o.marca, 40),
        modelo: doc ? null : limpa(o.modelo, 60),
        ano: doc ? null : limpa(o.ano, 20),
        cor: doc ? null : limpa(o.cor, 30),
        confianca: CONFIANCAS.includes(o.confianca as Confianca) ? (o.confianca as Confianca) : 'baixa',
        resumo,
        // documento nunca leva texto da imagem para o histórico
        texto_visivel: doc ? null : limpa(o.texto_visivel, 160),
    };
}

/** Linha que entra no histórico da Laura, logo depois de "[foto]". */
export function descricaoParaIa(d: DescricaoImagem): string {
    if (d.tipo === 'documento') {
        return `(documento do cliente: ${d.resumo}. Não leia nem peça dados dele; o consultor cuida disso.)`;
    }
    const carro = [d.marca, d.modelo, d.ano].filter(Boolean).join(' ');
    const partes: string[] = [];
    if (d.tipo === 'print_anuncio') partes.push('print de anúncio');
    if (carro) {
        const prefixo = d.tipo === 'carro' && d.confianca !== 'alta' ? 'parece ser ' : '';
        partes.push(`${prefixo}${carro}${d.cor ? ` ${d.cor}` : ''}`);
    }
    partes.push(d.resumo);
    if (d.texto_visivel) partes.push(`texto no print: ${d.texto_visivel}`);
    if (d.tipo === 'carro' && d.confianca === 'baixa') partes.push('(identificação incerta: confirme com o cliente)');
    return `(${partes.join(' · ')})`;
}

/** Linha para quem NÃO conseguiu ver a foto (formato não suportado, grande demais, falha). */
export const FOTO_SEM_DESCRICAO = '(não consegui abrir esta foto)';

/** O que está gravado em wa_mensagens.extra → texto do histórico (ou null). */
export function descricaoDoExtra(extra: unknown): string | null {
    if (!extra || typeof extra !== 'object') return null;
    const e = extra as Record<string, unknown>;
    const v = e.visao;
    if (v && typeof v === 'object') {
        const d = lerDescricao(JSON.stringify(v));
        if (d) return descricaoParaIa(d);
    }
    if (Number(e.visao_tentativas) >= MAX_TENTATIVAS_VISAO) return FOTO_SEM_DESCRICAO;
    return null;
}

export function mimeSuportado(mime: string | null | undefined): string | null {
    const b = (mime || '').split(';')[0].trim().toLowerCase();
    const norm = b === 'image/jpg' ? 'image/jpeg' : b;
    return MIMES_VISAO.has(norm) ? norm : null;
}

export interface UsoVisao { input_tokens: number; output_tokens: number }

/** Chama o Claude com a imagem. Lança em erro de API; devolve null se a resposta não for utilizável. */
export async function descreverImagem(
    cliente: Anthropic,
    p: { base64: string; mime: string; legenda?: string | null; modelo: string },
): Promise<{ descricao: DescricaoImagem | null; uso: UsoVisao }> {
    const legenda = p.legenda?.trim();
    const resp = await cliente.messages.create({
        model: p.modelo,
        max_tokens: 2048,
        messages: [{
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: p.mime as 'image/jpeg', data: p.base64 } },
                { type: 'text', text: `${PROMPT_VISAO}${legenda ? `\n\nLegenda que o cliente escreveu junto: "${legenda.slice(0, 300)}"` : ''}` },
            ],
        }],
        output_config: { effort: 'low' },
    });
    const texto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
    return { descricao: lerDescricao(texto), uso: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens } };
}
