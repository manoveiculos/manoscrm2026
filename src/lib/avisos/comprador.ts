// src/lib/avisos/comprador.ts — regras puras do encaminhamento ao comprador (Felipe Ledra)

export const COMPRADOR_PRIMEIRO_NOME = 'felipe';

export interface Comprador { id: string; name: string; phone: string | null; ativo: boolean; phoneVerificado: boolean }

/** Acha o comprador da loja entre os consultores: primeiro nome "Felipe", ativo e com WhatsApp confirmado. */
export function escolherComprador(consultores: Comprador[]): Comprador | null {
    return consultores.find(c => c.ativo && c.phoneVerificado && Boolean(c.phone)
        && c.name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0] === COMPRADOR_PRIMEIRO_NOME) ?? null;
}

export function textoCompra(p: { cliente: string | null; carro: string | null; resumo: string | null; link: string }): string {
    const quem = (p.cliente || '').trim().split(/\s+/)[0] || 'Cliente';
    const carro = p.carro ? `\n🚗 ${p.carro}` : '';
    const resumo = p.resumo ? `\n🤖 ${p.resumo.replace(/\s+/g, ' ').slice(0, 300)}` : '';
    return `💰 *CLIENTE QUER VENDER O CARRO*\n${quem}${carro}${resumo}\n\nA Laura já recolheu as informações. É seu: avalie e chame o cliente.\n👉 ${p.link}`;
}

