import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { parseWhatsappTxt } from '@/lib/compras/parser/whatsapp-parser';

const supabaseAdmin = createClient();

export async function POST(req: NextRequest) {
  try {
    const { content, sourceName } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Conteúdo da mensagem não fornecido.' }, { status: 400 });
    }

    let name = sourceName || 'WhatsApp Import ' + new Date().toLocaleDateString('pt-BR');
    
    // Mapeamento inteligente de grupos para nomes amigáveis requisitados pelo usuário
    const GROUP_MAP: { [key: string]: string } = {
      '1': 'MVJP REPASSES',
      'grupo 1': 'MVJP REPASSES',
      '2': 'Repasse Alto vale VIP',
      'grupo 2': 'Repasse Alto vale VIP',
      '5': 'Autopay Express',
      'grupo 5': 'Autopay Express',
    };

    const normalizedKey = String(name).trim().toLowerCase();
    if (GROUP_MAP[normalizedKey]) {
      name = GROUP_MAP[normalizedKey];
    }
    
    // 1. Garante ou cria a fonte (source)
    let { data: source, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('*')
      .eq('name', name)
      .single();

    if (sourceError || !source) {
      const { data: newSource, error: createSourceError } = await supabaseAdmin
        .from('sources')
        .insert({
          name,
          type: 'manual',
          format_hint: 'free'
        })
        .select()
        .single();

      if (createSourceError) {
        console.error('Erro ao criar fonte:', createSourceError);
        return NextResponse.json({ error: 'Falha ao criar fonte de dados no banco.' }, { status: 500 });
      }
      source = newSource;
    }

    // 2. Faz o parsing rápido do texto com regex
    const rawMessages = parseWhatsappTxt(content);
    if (rawMessages.length === 0) {
      return NextResponse.json({
        success: true,
        total: 0,
        message: 'Nenhuma mensagem válida encontrada no arquivo.'
      });
    }

    // 3. Salva no banco de dados em lotes (para evitar limites de payload do Postgres)
    const BATCH_SIZE = 1000;
    let insertedCount = 0;

    for (let i = 0; i < rawMessages.length; i += BATCH_SIZE) {
      const batch = rawMessages.slice(i, i + BATCH_SIZE).map(msg => ({
        source_id: source.id,
        author: msg.author,
        sent_at: msg.sent_at,
        content: msg.content,
        parsed: false
      }));

      const { error: insertError } = await supabaseAdmin
        .from('raw_messages')
        .insert(batch);

      if (insertError) {
        console.error('Erro ao inserir lote de mensagens:', insertError);
        return NextResponse.json({ error: 'Falha ao salvar as mensagens brutas no banco.' }, { status: 500 });
      }
      
      insertedCount += batch.length;
    }

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      total: insertedCount,
      message: `${insertedCount} mensagens importadas com sucesso e prontas para processamento.`
    });

  } catch (error) {
    console.error('Erro na rota de parsing:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
