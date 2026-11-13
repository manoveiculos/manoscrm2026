// src/lib/telefone.ts — telefone do consultor: formato único (PURO, serve no navegador e no servidor)
//
// Decisão do Alexandre (11/11/2026): todo login confirma o próprio WhatsApp por código, e o
// número é guardado e enviado ao webhook sempre no formato 55 + DDD + número, só dígitos
// (ex.: 5547988467855).

/** DDDs em uso no Brasil. */
const DDDS_BR = new Set([
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99',
]);

/**
 * Qualquer jeito de digitar → "55DDDNÚMERO" (12 ou 13 dígitos), ou null se não for um número brasileiro válido.
 * Aceita "(47) 98846-7855", "047988467855", "+55 47 98846-7855", "5547988467855".
 * Sem DDD não passa: o DDD é obrigatório.
 */
export function normalizarTelefoneBR(bruto: string | null | undefined): string | null {
    let d = (bruto || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    else d = d.replace(/^0+/, '');
    if (d.length !== 10 && d.length !== 11) return null;
    if (!DDDS_BR.has(d.slice(0, 2))) return null;
    const numero = d.slice(2);
    if (numero.length === 9 && numero[0] !== '9') return null;      // celular de 9 dígitos começa com 9
    if (numero.length === 8 && !/^[2-9]/.test(numero)) return null;
    return `55${d}`;
}

/** "5547988467855" → "(47) 98846-7855" para mostrar na tela. */
export function formatarTelefoneBR(e164: string | null | undefined): string {
    const n = normalizarTelefoneBR(e164);
    if (!n) return (e164 || '').trim();
    const ddd = n.slice(2, 4);
    const num = n.slice(4);
    return `(${ddd}) ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
}
