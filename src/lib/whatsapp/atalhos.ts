// src/lib/whatsapp/atalhos.ts — atalhos "@" do campo de resposta (PURO)
//
// Digitou "@palio": abre a lista de carros do estoque para escolher. "@endereco", "@horario",
// "@pix" e "@apresentacao" preenchem o texto da loja. O consultor sempre vê e edita antes de enviar.

import { textoApresentacao, textoEndereco, textoHorario, textoPix } from '@/lib/loja';

export interface AtalhoFixo { chave: string; rotulo: string; texto: (c: { consultor?: string | null; cliente?: string | null }) => string }

export const ATALHOS_FIXOS: AtalhoFixo[] = [
    { chave: 'endereco', rotulo: 'Endereço completo da loja', texto: () => textoEndereco() },
    { chave: 'horario', rotulo: 'Horário de funcionamento', texto: () => textoHorario() },
    { chave: 'pix', rotulo: 'Pix (CNPJ) da loja', texto: () => textoPix() },
    { chave: 'apresentacao', rotulo: 'Apresentação do consultor', texto: c => textoApresentacao(c.consultor, c.cliente) },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Acha o "@algo" que está sendo digitado logo antes do cursor.
 * Só vale se o "@" abre uma palavra (início do texto ou depois de espaço/quebra de linha).
 */
export function atalhoEmDigitacao(texto: string, cursor: number): { inicio: number; busca: string } | null {
    const antes = texto.slice(0, cursor);
    const m = /(^|\s)@([^\s@]{0,40}(?:\s[^\s@]{1,20})?)$/.exec(antes);
    if (!m) return null;
    const busca = m[2];
    return { inicio: antes.length - busca.length - 1, busca };
}

/** Atalhos fixos que combinam com o que foi digitado (começo da chave ou do rótulo). */
export function filtrarFixos(busca: string): AtalhoFixo[] {
    const b = norm(busca.trim());
    if (!b) return ATALHOS_FIXOS;
    return ATALHOS_FIXOS.filter(a => a.chave.startsWith(b) || norm(a.rotulo).split(' ').some(p => p.startsWith(b)));
}

/** Troca o "@busca" pelo texto escolhido. */
export function aplicarAtalho(texto: string, inicio: number, cursor: number, inserir: string): { texto: string; cursor: number } {
    const novo = texto.slice(0, inicio) + inserir + texto.slice(cursor);
    return { texto: novo, cursor: inicio + inserir.length };
}

export interface CarroParaTexto {
    descricao: string;
    cor: string | null;
    km: number | null;
    cambio: string | null;
    combustivel: string | null;
    preco: number | null;
    link: string | null;
}

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;

/** Texto do carro para o cliente: só dados do estoque, do jeito que vieram. */
export function textoDoCarro(c: CarroParaTexto): string {
    const linha2 = [
        c.cor,
        c.km != null ? `${c.km.toLocaleString('pt-BR')} km` : null,
        c.cambio,
        c.combustivel,
    ].filter(Boolean).join(' · ');
    return [c.descricao, linha2, c.preco != null && c.preco > 0 ? brl(c.preco) : null, c.link].filter(Boolean).join('\n');
}
