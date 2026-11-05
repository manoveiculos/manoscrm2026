/**
 * Quem escreveu a mensagem. Arquivo PURO (sem import), testável com node --test.
 *
 * - Não é fromMe → cliente.
 * - fromMe para o telefone de um consultor → sistema. A instância da loja
 *   ("teste", o (47) 3300-1352) também é a que o CRM usa para mandar aviso de
 *   lead/SLA ao vendedor (whatsappSender). Isso não é a Laura.
 * - Outro fromMe que chega pelo n8n → laura (o envio feito pelo CRM na Fase 3
 *   já existe gravado como vendedor e não é sobrescrito: a ingestão é idempotente).
 */
export type Autor = 'cliente' | 'laura' | 'vendedor' | 'sistema';

export function decidirAutor(
    fromMe: boolean,
    telefoneDeConsultor: boolean,
    autorFromMe: Exclude<Autor, 'cliente'> = 'laura',
): Autor {
    if (!fromMe) return 'cliente';
    if (telefoneDeConsultor) return 'sistema';
    return autorFromMe;
}
