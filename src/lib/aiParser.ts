export function extractWhatsAppScript(instruction: string): string {
    if (!instruction) return '';
    
    // Look for text between single quotes ('...') or double quotes ("...")
    // This matches the mentor prompt instruction: Ex: "Mande EXATAMENTE este áudio: 'Fala [Nome]...'"
    const matchSingle = instruction.match(/'([^']*)'/);
    if (matchSingle && matchSingle[1]) {
        return matchSingle[1].trim();
    }
    
    const matchDouble = instruction.match(/"([^"]*)"/);
    if (matchDouble && matchDouble[1]) {
        return matchDouble[1].trim();
    }
    
    // Fallback: if there's no quote but it says "Mande:", "Envie:", "Diga:", etc.
    const keywordMatch = instruction.match(/(?:mande|envie|diga|áudio|mensagem|escreva)(?:.*?):\s*(.*)/i);
    if (keywordMatch && keywordMatch[1]) {
        return keywordMatch[1].replace(/['"]/g, '').trim();
    }
    
    // If we absolutely cannot parse a specific script, we return the instruction itself 
    // stripping out words like "Instrução cirúrgica:" or similar meta-talk if present
    const cleaned = instruction.replace(/^.*(?:mande|envie|diga|áudio|mensagem|escreva):?/i, '').trim();
    return cleaned.length > 5 ? cleaned : instruction;
}
