import Anthropic from '@anthropic-ai/sdk';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('A variável de ambiente ANTHROPIC_API_KEY não foi configurada.');
  }

  anthropicClient = new Anthropic({
    apiKey,
  });

  return anthropicClient;
}

interface CallClaudeParams {
  model: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export async function callClaude({
  model,
  system,
  messages,
  temperature = 0,
  maxTokens = 1000,
}: CallClaudeParams): Promise<string> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages,
    });

    const contentBlock = response.content[0];
    if (contentBlock && contentBlock.type === 'text') {
      return contentBlock.text;
    }
    
    return '';
  } catch (error) {
    console.error('Erro na chamada do Claude API:', error);
    throw error;
  }
}
