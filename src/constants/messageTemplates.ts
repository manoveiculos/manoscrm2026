export interface MessageTemplate {
  id: string;
  stage: string;       // Status do lead
  label: string;       // Nome do template
  emoji: string;
  message: string;     // Texto com variáveis {nome}, {veiculo}, {valor}
  channel: 'whatsapp'; // Por enquanto só WhatsApp
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // ENTRADA
  {
    id: 'entrada_01',
    stage: 'entrada',
    label: 'Boas-vindas',
    emoji: '👋',
    message: `Olá {nome}! Tudo bem? 😊
Sou da *Manos Veículos* em Tijucas.
Vi que você demonstrou interesse em veículos. Posso te ajudar a encontrar o carro ideal?
Qual tipo de veículo está buscando?`,
    channel: 'whatsapp'
  },
  {
    id: 'entrada_02',
    stage: 'entrada',
    label: 'Recontato rápido',
    emoji: '⚡',
    message: `Oi {nome}! Passando rapidinho pra saber se ainda está procurando veículo.
Temos novidades no estoque que podem te interessar! 🚗
Posso te mostrar?`,
    channel: 'whatsapp'
  },

  // TRIAGEM
  {
    id: 'triagem_01',
    stage: 'triagem',
    label: 'Qualificar orçamento',
    emoji: '💰',
    message: `{nome}, pra eu encontrar as melhores opções pra você, me conta:
1️⃣ Qual faixa de valor você está pensando?
2️⃣ Seria à vista, financiamento ou com troca?
3️⃣ Tem preferência por alguma marca ou modelo?`,
    channel: 'whatsapp'
  },
  {
    id: 'triagem_02',
    stage: 'triagem',
    label: 'Enviar opções',
    emoji: '📋',
    message: `{nome}, separei algumas opções que combinam com o que você busca! 🎯

Dá uma olhada e me diz qual te chamou mais atenção:`,
    channel: 'whatsapp'
  },

  // ATAQUE
  {
    id: 'ataque_01',
    stage: 'ataque',
    label: 'Enviar fotos do veículo',
    emoji: '📸',
    message: `{nome}, olha só esse {veiculo} que separei especialmente pra você! 🔥
Tá em excelente estado, revisado e pronto pra rodar.
Quer que eu mande mais fotos e detalhes?`,
    channel: 'whatsapp'
  },
  {
    id: 'ataque_02',
    stage: 'ataque',
    label: 'Agendar visita',
    emoji: '📅',
    message: `{nome}, que tal vir conhecer o {veiculo} pessoalmente? 
Estamos na Rod. BR-101, Tijucas/SC.
Qual melhor dia e horário pra você? 
Posso reservar o carro pra quando você chegar. 😉`,
    channel: 'whatsapp'
  },
  {
    id: 'ataque_03',
    stage: 'ataque',
    label: 'Simulação de financiamento',
    emoji: '🏦',
    message: `{nome}, fiz uma simulação de financiamento do {veiculo}:

💰 Valor: R$ {valor}
📊 Entrada: a combinar
📅 Parcelas: a partir de R$ ___

Quer que eu ajuste os valores? Consigo condições especiais!`,
    channel: 'whatsapp'
  },

  // FECHAMENTO
  {
    id: 'fechamento_01',
    stage: 'fechamento',
    label: 'Proposta final',
    emoji: '🤝',
    message: `{nome}, preparei uma condição especial pra fecharmos negócio no {veiculo}:

✅ Preço especial: R$ {valor}
✅ Facilito a documentação
✅ Entrega imediata

Essa condição é válida até amanhã. Vamos fechar? 🚀`,
    channel: 'whatsapp'
  },
  {
    id: 'fechamento_02',
    stage: 'fechamento',
    label: 'Criar urgência',
    emoji: '🔥',
    message: `{nome}, quero ser transparente: temos mais um cliente interessado no {veiculo}.
Como você demonstrou interesse primeiro, quero te dar prioridade.
Consegue vir hoje ou amanhã pra garantir?`,
    channel: 'whatsapp'
  },

  // PERDIDO (reativação)
  {
    id: 'perdido_01',
    stage: 'perdido',
    label: 'Reativação',
    emoji: '♻️',
    message: `Oi {nome}, tudo bem? 😊
Faz um tempo que conversamos sobre veículos.
Chegaram novidades no nosso estoque e lembrei de você!
Ainda está no mercado? Posso te mostrar o que temos de novo.`,
    channel: 'whatsapp'
  },
];

// Helper: pegar templates do estágio atual
export function getTemplatesForStage(status: string): MessageTemplate[] {
  // Normalizar status para bater com stage dos templates
  const normalizedStatus = status.toLowerCase()
    .split(' ')[0]; 

  // Mapeamento simples
  const stageMap: Record<string, string> = {
    'entrada': 'entrada',
    'triagem': 'triagem',
    'contacted': 'triagem',
    'ataque': 'ataque',
    'negotiation': 'fechamento',
    'fechamento': 'fechamento',
    'lost': 'perdido',
    'perdido': 'perdido',
    'leads': 'entrada'
  };

  const targetStage = stageMap[normalizedStatus] || normalizedStatus;
  
  return MESSAGE_TEMPLATES.filter(t => t.stage === targetStage);
}

// Helper: substituir variáveis
export function fillTemplate(template: string, lead: any): string {
  // Funçao de formataçao rápida
  const formatValue = (val: any) => {
    const n = Number(String(val).replace(/[^0-9]/g, ''));
    if (isNaN(n) || n === 0) return '---';
    return n.toLocaleString('pt-BR');
  };

  return template
    .replace(/\{nome\}/g, lead.name || 'Cliente')
    .replace(/\{veiculo\}/g, lead.vehicle_interest || 'veículo')
    .replace(/\{valor\}/g, formatValue(lead.valor_investimento));
}
