// src/lib/agentes/ocioso.ts — o que cada agente "faz" quando não tem tarefa (PURO)
//
// Pedido do Alexandre (11/11/2026): ninguém fica parado na Central. Sem tarefa na fila,
// os agentes aparecem "pesquisando" e os consultores "criando anúncios". É só o rótulo e
// a fala de descanso: o estado real (ocioso) e o histórico de ações continuam intactos,
// e a gaveta do agente mostra "sem tarefa na fila" com a última ação de verdade.

export const ROTULO_OCIOSO = 'pesquisando';
// 13/11/2026: o rótulo "criando anúncios" era enfeite e passava a impressão de que o vendedor
// estava fazendo algo. Sem ação registrada, o consultor aparece como "sem ação registrada";
// o acesso real (entrou/saiu, tempo online, o que fez) está em "Acesso da equipe ao CRM".
export const ROTULO_OCIOSO_CONSULTOR = 'sem ação registrada';

export const ehConsultor = (id: string) => id.startsWith('consultor_');

const CONSULTOR = ['Nenhuma ação registrada nas últimas horas.'];

const POR_AGENTE: Record<string, string[]> = {
    laura: ['Pesquisando o estoque…', 'Estudando as últimas conversas…', 'Pesquisando como ajudar melhor…'],
    distribuidor: ['Pesquisando quem está disponível…', 'Conferindo a fila da roleta…'],
    reengajamento: ['Pesquisando leads parados…', 'Procurando quem merece uma retomada…'],
    supervisor: ['Pesquisando leads sem resposta…', 'Vigiando o tempo de resposta…'],
    copiloto: ['Pesquisando o próximo passo…', 'Lendo conversas para ajudar a equipe…'],
    vitrine: ['Pesquisando carros para postar…', 'Procurando o melhor ângulo do carro…'],
    diretor_arte: ['Pesquisando referências de arte…', 'Estudando cores e tipografia…'],
    publisher: ['Pesquisando o melhor horário de postar…', 'Conferindo o calendário de posts…'],
    trafego: ['Pesquisando o custo por lead…', 'Comparando campanhas…'],
    sentinela: ['Pesquisando preços do mercado…', 'Vigiando os concorrentes…'],
    perito: ['Pesquisando valor de mercado…', 'Analisando carros do estoque…'],
    recepcao: ['Pesquisando quem voltou a falar…', 'Organizando as fichas…'],
    growth: ['Pesquisando os números da loja…', 'Procurando a próxima jogada…'],
};

const GENERICAS = ['Pesquisando melhorias…', 'Estudando os números…'];

export function frasesOciosas(id: string): string[] {
    if (ehConsultor(id)) return CONSULTOR;
    return POR_AGENTE[id] ?? GENERICAS;
}

/** Escolhe uma fala de descanso. `semente` (ex.: contador de tempo) faz a escolha rodar sem repetir sempre a mesma. */
export function fraseOciosa(id: string, semente: number): string {
    const lista = frasesOciosas(id);
    return lista[Math.abs(Math.floor(semente)) % lista.length];
}

/** Rótulo do chip de estado quando o agente está sem tarefa. */
export function rotuloOcioso(id: string): string {
    return ehConsultor(id) ? ROTULO_OCIOSO_CONSULTOR : ROTULO_OCIOSO;
}
