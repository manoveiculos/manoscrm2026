import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

// Webhook URL de destino do n8n
const N8N_WEBHOOK_URL = 'https://n8n.drivvoo.com/webhook/d1911d38-9289-4771-b4e4-d0e25590cf65';

// Token de segurança para autenticar requisições de webhook do Supabase
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key';

// Função para validar a segurança da chamada
function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const { searchParams } = new URL(request.url);
  
  const token = searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null);
  return token === ADMIN_SECRET_KEY;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Autorização básica da chamada
    if (!isAuthorized(request)) {
      console.warn('[Webhook Alertas] Chamada não autorizada bloqueada.');
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    
    // Suporta tanto o payload padrão do Database Webhook do Supabase (que vem com { record })
    // quanto uma chamada HTTP direta com o objeto do veículo no root.
    const veiculo = body.record || body;

    if (!veiculo || !veiculo.marca || !veiculo.modelo) {
      console.error('[Webhook Alertas] Dados do veículo inválidos ou ausentes no payload:', body);
      return NextResponse.json(
        { success: false, error: 'Dados do veículo inválidos ou ausentes.' },
        { status: 400 }
      );
    }

    console.log(`[Webhook Alertas] Processando novo veículo inserido: ${veiculo.marca} ${veiculo.modelo} (ID: ${veiculo.id})`);

    // 2. Extrai o ano do veículo (ex: "2019/2020" -> 2019)
    const anoMatch = veiculo.ano_modelo ? String(veiculo.ano_modelo).match(/\d{4}/) : null;
    const anoVeiculo = anoMatch ? parseInt(anoMatch[0], 10) : null;

    // 3. Busca todos os alertas ativos na tabela 'alertas_clientes'
    const { data: alertas, error: alertasError } = await supabaseAdmin
      .from('alertas_clientes')
      .select('*')
      .eq('ativo', true);

    if (alertasError) {
      console.error('[Webhook Alertas] Erro ao buscar alertas no banco:', alertasError);
      return NextResponse.json(
        { success: false, error: 'Erro ao buscar alertas ativos no banco.' },
        { status: 500 }
      );
    }

    if (!alertas || alertas.length === 0) {
      console.log('[Webhook Alertas] Nenhum alerta ativo cadastrado no sistema.');
      return NextResponse.json({ success: true, matchesCount: 0, messages: 'Nenhum alerta ativo cadastrado.' });
    }

    // 4. Executa o algoritmo de matching inteligente
    const alertasCorrespondentes = alertas.filter(alerta => {
      // A. Filtro de Marca
      const marcaAlerta = (alerta.marca || '').trim().toUpperCase();
      const marcaVeiculo = (veiculo.marca || '').trim().toUpperCase();
      if (marcaAlerta !== 'TODAS' && marcaAlerta !== 'OUTROS' && marcaAlerta !== '' && marcaAlerta !== marcaVeiculo) {
        return false;
      }

      // B. Filtro de Modelo / Palavra-Chave (suporta buscas por múltiplas palavras-chave separadas por vírgula)
      if (alerta.modelo) {
        const palavrasChave = alerta.modelo.split(',').map((termo: string) => termo.trim().toLowerCase());
        const modeloVeiculo = (veiculo.modelo || '').toLowerCase();
        
        // Verifica se pelo menos uma das palavras-chave está contida no modelo do carro
        const bateModelo = palavrasChave.some((termo: string) => termo !== '' && modeloVeiculo.includes(termo));
        if (!bateModelo) {
          return false;
        }
      } else {
        // Se o alerta não tiver modelo, assume que não quer filtrar por modelo
        return false;
      }

      // C. Filtro de Faixa de Preço (Mínimo e Máximo)
      const precoPedido = Number(veiculo.preco_pedido || 0);
      const valorMin = alerta.valor_minimo ? Number(alerta.valor_minimo) : 0;
      const valorMax = alerta.valor_maximo ? Number(alerta.valor_maximo) : 0;
      
      if (valorMin > 0 && precoPedido < valorMin) return false;
      if (valorMax > 0 && precoPedido > valorMax) return false;

      // D. Filtro de Ano Modelo
      if (anoVeiculo) {
        const anoMin = alerta.ano_minimo ? Number(alerta.ano_minimo) : 0;
        const anoMax = alerta.ano_maximo ? Number(alerta.ano_maximo) : 0;
        
        if (anoMin > 0 && anoVeiculo < anoMin) return false;
        if (anoMax > 0 && anoVeiculo > anoMax) return false;
      }

      // E. Filtro de Quilometragem Máxima
      const kmVeiculo = Number(veiculo.km || 0);
      const kmMax = alerta.km_maximo ? Number(alerta.km_maximo) : 0;
      
      if (kmMax > 0 && kmVeiculo > kmMax) return false;

      return true;
    });

    console.log(`[Webhook Alertas] Encontrados ${alertasCorrespondentes.length} compradores interessados para ${veiculo.marca} ${veiculo.modelo}.`);

    if (alertasCorrespondentes.length === 0) {
      return NextResponse.json({
        success: true,
        matchesCount: 0,
        message: 'Nenhum comprador correspondente encontrado para este veículo.'
      });
    }

    // 5. Normaliza a classificação de relevância do veículo para o padrão "ALTA" ou "MEDIA"
    const rawRelevancia = veiculo.classificacao_relevancia || 'MEDIA';
    const classificacaoRelevancia = rawRelevancia
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos (MÉDIA -> MEDIA)
      .trim();

    // 6. Looping de Disparo de Webhooks Individuais (Totalmente Independentes)
    const resultadosDisparos = [];

    for (const alerta of alertasCorrespondentes) {
      const payload = {
        alerta_id: alerta.id,
        nome_comprador: alerta.nome_cliente,
        whatsapp_comprador: alerta.telefone_cliente,
        carro_correspondente: {
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano_modelo: anoVeiculo || veiculo.ano_modelo,
          km: veiculo.km,
          preco_pedido: veiculo.preco_pedido,
          preco_fipe: veiculo.preco_fipe,
          classificacao_relevancia: classificacaoRelevancia === 'ALTA' ? 'ALTA' : 'MEDIA'
        }
      };

      try {
        console.log(`[Webhook Alertas] Disparando webhook para comprador ${alerta.nome_cliente} (${alerta.telefone_cliente})`);
        
        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`n8n retornou status ${response.status} ${response.statusText}`);
        }

        resultadosDisparos.push({
          alerta_id: alerta.id,
          nome_cliente: alerta.nome_cliente,
          status: 'success'
        });
      } catch (err: any) {
        // Tratamento de erro isolado por disparo para que o fluxo principal não quebre
        console.error(`[Webhook Alertas] Falha ao enviar notificação para o alerta ${alerta.id} (Cliente: ${alerta.nome_cliente}):`, err.message);
        
        resultadosDisparos.push({
          alerta_id: alerta.id,
          nome_cliente: alerta.nome_cliente,
          status: 'failed',
          error: err.message
        });
      }
    }

    // Retorna o resultado consolidado do cruzamento e disparos
    return NextResponse.json({
      success: true,
      veiculo: `${veiculo.marca} ${veiculo.modelo}`,
      matchesCount: alertasCorrespondentes.length,
      dispatches: resultadosDisparos
    });

  } catch (globalError: any) {
    console.error('[Webhook Alertas] Erro crítico no processamento de alertas:', globalError);
    return NextResponse.json(
      { success: false, error: 'Erro crítico interno no servidor ao processar o alerta.' },
      { status: 500 }
    );
  }
}
