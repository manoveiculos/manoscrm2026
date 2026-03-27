import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// ── Clientes singleton ────────────────────────────────────────────────────────
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

export const anthropic = new Anthropic({
    apiKey: process.env.API_CLAUDE || '',
});

// ── Constantes de modelo ──────────────────────────────────────────────────────
export const AI_MODELS = {
    OPENAI_MINI:    'gpt-4o-mini',
    OPENAI_FULL:    'gpt-4o',
    GEMINI_FLASH:   'gemini-2.0-flash',
    CLAUDE_SONNET:  'claude-sonnet-4-6',
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];

// ── Helper: retorna model Gemini pronto para usar ─────────────────────────────
export function getGeminiModel(model: AIModel | string = AI_MODELS.GEMINI_FLASH) {
    return genAI.getGenerativeModel({ model });
}

/**
 * Estratégia de roteamento por tarefa:
 *
 * | Tarefa                             | Modelo                          |
 * |------------------------------------|----------------------------------|
 * | Elite Closer (analyze-chat)        | Gemini Flash → fallback GPT-4o  |
 * | Scoring, follow-up, churn, brief   | GPT-4o mini                     |
 * | Proposta de financiamento          | GPT-4o                          |
 * | FIPE search                        | Gemini Flash                    |
 * | Análise complexa / reasoning       | Claude Sonnet                   |
 */
