import { anthropic, AI_MODELS, openai } from '@/lib/aiProviders';

export async function analyzeWithClaude(
    prompt: string,
    model: string = AI_MODELS.CLAUDE_SONNET,
    systemPrompt?: string
): Promise<string> {
    try {
        const response = await anthropic.messages.create({
            model,
            max_tokens: 4096,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: 'user', content: prompt }],
        });

        const block = response.content[0];
        if (block.type !== 'text') throw new Error('Claude returned non-text content');
        return block.text;
    } catch (e: any) {
        console.warn(`[analyzeWithClaude] Erro no Claude (${e.message}), ativando fallback para OpenAI (gpt-4o)...`);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
                { role: 'user' as const, content: prompt }
            ],
            max_tokens: 4096,
        });
        return response.choices[0]?.message?.content || '';
    }
}
