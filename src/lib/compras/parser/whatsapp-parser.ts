export interface RawMessage {
  sent_at: string; // no formato ISO para fácil salvamento no Postgres (timestamptz)
  author: string;
  content: string;
}

// Regex para formato iOS: [23/05/2026, 09:44:08] Autor: Mensagem
const IOS_REGEX = /\[(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s+([\s\S]*?)(?=\r?\n\[\d{2}\/\d{2}\/\d{4}|\r?$"|$)/g;

// Regex para formato Android: 23/05/2026 09:44 - Autor: Mensagem
const ANDROID_REGEX = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})\s+-\s+([^:]+):\s+([\s\S]*?)(?=\r?\n\d{2}\/\d{2}\/\d{4}|\r?$"|$)/g;

function isSystemMessage(body: string): boolean {
  const lowercase = body.toLowerCase();
  return (
    lowercase.includes('imagem ocultada') ||
    lowercase.includes('foto ocultada') ||
    lowercase.includes('video ocultado') ||
    lowercase.includes('áudio ocultado') ||
    lowercase.includes('mensagem apagada') ||
    lowercase.includes('foi adicionado') ||
    lowercase.includes('criou este grupo') ||
    lowercase.includes('criptografia de ponta') ||
    lowercase.includes('entrou usando o link') ||
    lowercase.includes('saiu do grupo') ||
    lowercase.includes('alterou a descrição') ||
    lowercase.includes('mudou o número')
  );
}

export function parseWhatsappTxt(content: string): RawMessage[] {
  const messages: RawMessage[] = [];
  
  // Normaliza quebras de linha para simplificar regex
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Tenta formato iOS primeiro
  let match;
  let matchesFound = 0;

  // Reseta o index dos regex
  IOS_REGEX.lastIndex = 0;
  ANDROID_REGEX.lastIndex = 0;

  // Primeiro teste rápido para decidir o parser
  const iosCount = (normalizedContent.match(/\[\d{2}\/\d{2}\/\d{4}/g) || []).length;
  const androidCount = (normalizedContent.match(/\d{2}\/\d{2}\/\d{4}.*?\s-\s/g) || []).length;

  if (iosCount >= androidCount && iosCount > 0) {
    while ((match = IOS_REGEX.exec(normalizedContent)) !== null) {
      const [_, day, month, year, time, author, body] = match;
      
      if (isSystemMessage(body)) continue;

      // Garantir o formato de hora HH:MM:SS
      const formattedTime = time.split(':').length === 2 ? `${time}:00` : time;
      const sent_at = `${year}-${month}-${day}T${formattedTime}.000Z`;

      messages.push({
        sent_at,
        author: author.trim(),
        content: body.trim()
      });
      matchesFound++;
    }
  } else if (androidCount > 0) {
    while ((match = ANDROID_REGEX.exec(normalizedContent)) !== null) {
      const [_, day, month, year, time, author, body] = match;

      if (isSystemMessage(body)) continue;

      const sent_at = `${year}-${month}-${day}T${time}:00.000Z`;

      messages.push({
        sent_at,
        author: author.trim(),
        content: body.trim()
      });
      matchesFound++;
    }
  }

  // Se nenhum formato casar, tenta uma quebra genérica simples por linha (fallback)
  if (matchesFound === 0) {
    const lines = normalizedContent.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const authorPart = line.substring(0, colonIndex).trim();
        const contentPart = line.substring(colonIndex + 1).trim();
        
        // Evita mensagens de sistema
        if (isSystemMessage(contentPart)) continue;

        messages.push({
          sent_at: new Date().toISOString(),
          author: authorPart,
          content: contentPart
        });
      }
    }
  }

  return messages;
}
