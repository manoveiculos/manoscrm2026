import { sendWhatsApp } from './src/lib/services/whatsappSender';

async function test() {
    console.log('--- Iniciando teste de WhatsApp (Evolution API) ---');
    
    // Teste enviando para um número (ex: o do Alexandre se eu soubesse, mas vou usar um placeholder ou pedir pro usuário ver o log)
    // Na verdade, vou tentar enviar para o Sergio que já tem número configurado no banco.
    
    const result = await sendWhatsApp({
        toPhone: '554784860080', // Número do Sergio
        message: 'Teste de integração Manos CRM + Evolution API. Se recebeu isso, a configuração está 100%! 🚀',
        kind: 'manual',
        skipDedup: true
    });

    console.log('Resultado:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
