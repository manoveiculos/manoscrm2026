import { anthropic, AI_MODELS } from '@/lib/aiProviders';

export async function analyzeWithClaude(
    prompt: string,
    model: string = AI_MODELS.CLAUDE_SONNET,
    systemPrompt?: string
): Promise<string> {
    const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Claude returned non-text content');
    return block.text;
}
