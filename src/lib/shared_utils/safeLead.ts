/**
 * safeLead.ts — Utilitários de resiliência para dados de lead
 *
 * Garante que nenhum componente quebre por dados nulos/undefined vindos
 * da migração V1 ou de registros incompletos no banco.
 */

import type { Lead, AIClassification } from '@/lib/types';

// ─── Funções de campo seguro ─────────────────────────────────────

/** Retorna nome seguro. Nunca retorna vazio/null/undefined. */
export function safeName(name: unknown): string {
  if (typeof name === 'string' && name.trim().length > 0) return name.trim();
  return 'Lead sem nome';
}

/** Retorna telefone seguro. String vazia se ausente. */
export function safePhone(phone: unknown): string {
  if (typeof phone === 'string') return phone;
  return '';
}

/** Extrai iniciais seguras para avatar (ex: "JS" de "João Silva"). */
export function safeInitials(name: unknown): string {
  const safe = safeName(name);
  if (safe === 'Lead sem nome') return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

/** Extrai primeiro nome seguro (ex: "João" de "João Silva"). */
export function safeFirstName(name: unknown): string {
  const safe = safeName(name);
  if (safe === 'Lead sem nome') return 'Lead';
  return safe.split(/\s+/)[0];
}

/**
 * Nome abreviado seguro para exibição (ex: "João S." de "João Silva").
 * Se só tem 1 nome, retorna sem abreviação.
 */
export function safeDisplayName(name: unknown): string {
  const safe = safeName(name);
  if (safe === 'Lead sem nome') return 'Lead';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

/**
 * Gera link WhatsApp seguro. Retorna null se telefone inválido,
 * permitindo que o componente desabilite o botão em vez de abrir URL quebrada.
 */
export function safeWhatsAppUrl(phone: unknown, script?: string): string | null {
  const clean = safePhone(phone).replace(/\D/g, '');
  if (clean.length < 10) return null;
  const text = script ? `?text=${encodeURIComponent(script)}` : '';
  return `https://wa.me/55${clean}${text}`;
}

/** Retorna ai_classification seguro. Default: 'cold'. */
export function safeClassification(classification: unknown): AIClassification {
  if (classification === 'hot' || classification === 'warm' || classification === 'cold') {
    return classification;
  }
  return 'cold';
}

/** Retorna nome do vendedor/consultor, primeiro disponível entre os aliases. */
export function safeVendorName(lead: Partial<Lead>): string | null {
  const name = lead.vendedor || lead.consultant_name || lead.primeiro_vendedor;
  if (typeof name === 'string' && name.trim().length > 0) return name.trim();
  return null;
}

/** Retorna primeiro nome do vendedor ou null. */
export function safeVendorFirstName(lead: Partial<Lead>): string | null {
  const name = safeVendorName(lead);
  if (!name) return null;
  return name.split(/\s+/)[0];
}
