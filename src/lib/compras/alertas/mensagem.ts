import type { AlertaMatch, VeiculoMatch } from './matcher';
import { extrairAno } from './matcher';

const brl = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

const km = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${n.toLocaleString('pt-BR')} km`;
};

/**
 * Mensagem que chega no WhatsApp do vendedor.
 * Curta, com o dado que decide a ligação: preço, ano, km e quem anunciou.
 */
export function montarMensagemAlerta(
    alerta: Pick<AlertaMatch, 'nome_cliente' | 'cliente_final'>,
    veiculo: VeiculoMatch & {
        nome_grupo?: string | null;
        nome_anunciante?: string | null;
        numero_anunciante?: string | null;
    },
): string {
    const primeiroNome = (alerta.nome_cliente || '').trim().split(/\s+/)[0] || 'chefe';
    const ano = extrairAno(veiculo.ano_modelo) || veiculo.ano_modelo;
    const preco = brl(veiculo.preco_pedido);
    const fipe = brl(veiculo.preco_fipe);
    const rodagem = km(veiculo.km);

    const linhas: string[] = [
        '🚨 *ACHEI O CARRO QUE TU PROCURA*',
        '',
        `Fala ${primeiroNome}! Acabou de entrar no radar de compras da Manos:`,
        '',
        `🚗 *${(veiculo.marca || '').toUpperCase()} ${veiculo.modelo || ''}*`.trim(),
    ];

    const ficha = [ano ? `📅 ${ano}` : null, rodagem ? `🛣️ ${rodagem}` : null]
        .filter(Boolean)
        .join('  ·  ');
    if (ficha) linhas.push(ficha);

    if (preco) {
        let linhaPreco = `💰 Pedem ${preco}`;
        const pedido = Number(veiculo.preco_pedido);
        const tabela = Number(veiculo.preco_fipe);
        if (fipe && Number.isFinite(pedido) && Number.isFinite(tabela) && tabela > 0 && pedido < tabela) {
            const desagio = Math.round(((tabela - pedido) / tabela) * 100);
            linhaPreco += `  ·  FIPE ${fipe} (${desagio}% abaixo)`;
        } else if (fipe) {
            linhaPreco += `  ·  FIPE ${fipe}`;
        }
        linhas.push(linhaPreco);
    }

    if (alerta.cliente_final) {
        linhas.push('', `👤 Cliente que tá esperando: *${alerta.cliente_final}*`);
    }

    const anunciante = [veiculo.nome_anunciante, veiculo.numero_anunciante].filter(Boolean).join(' · ');
    if (anunciante) linhas.push('', `📢 Anunciante: ${anunciante}`);
    if (veiculo.nome_grupo && veiculo.nome_grupo !== 'Grupo Desconhecido') {
        linhas.push(`   Grupo: ${veiculo.nome_grupo}`);
    }

    linhas.push('', '👉 Detalhes em manoscrm.com.br/compras', '', 'Corre que carro bom não espera. 🏁');

    return linhas.join('\n');
}
