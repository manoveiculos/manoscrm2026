import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { getInventory } from '@/lib/services/altimusInventory';
import { openai } from '@/lib/aiProviders';

export async function GET(req: NextRequest) {
    try {
        // Validação de segurança básica para evitar execuções maliciosas do cron
        const authHeader = req.headers.get('authorization');
        const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
        const isLocal = process.env.NODE_ENV === 'development';

        if (!isCron && !isLocal) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        console.log('[SyncInventory] Iniciando sincronização de estoque com Altimus...');
        
        // Força refresh do cache do Altimus
        const vehicles = await getInventory(true);

        if (!vehicles || vehicles.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Nenhum veículo retornado do feed Altimus'
            }, { status: 500 });
        }

        const admin = createClient();

        // Mapeia os veículos do feed para a estrutura do banco de dados
        const recordsToUpsert = vehicles.map(v => {
            const idExterno = v.id_externo || v.link || `${v.marca}-${v.modelo}-${v.ano}-${v.preco}`;
            return {
                id_externo: idExterno,
                marca: v.marca,
                modelo: v.modelo,
                versao: v.versao || null,
                ano: v.ano,
                ano_fabricacao: v.anoFabricacao || null,
                preco: v.preco,
                km: v.km || null,
                cambio: v.cambio || null,
                combustivel: v.combustivel || null,
                cor: v.cor || null,
                link: v.link || null,
            };
        });

        // 1. Executa o upsert no Supabase (sem mexer na coluna embedding dos que já existem)
        console.log(`[SyncInventory] Executando upsert de ${recordsToUpsert.length} veículos...`);
        const { error: upsertError } = await admin
            .from('estoque_sincronizado')
            .upsert(recordsToUpsert, { onConflict: 'id_externo' });

        if (upsertError) {
            console.error('[SyncInventory] Erro no upsert:', upsertError);
            throw new Error(`Erro no upsert: ${upsertError.message}`);
        }

        // 2. Limpa veículos antigos que não estão mais no feed
        const activeIds = recordsToUpsert.map(r => r.id_externo).filter(Boolean);
        if (activeIds.length > 0) {
            const formattedIds = `(${activeIds.map(id => `"${id}"`).join(',')})`;
            const { data: deleted, error: deleteError } = await admin
                .from('estoque_sincronizado')
                .delete()
                .not('id_externo', 'in', formattedIds)
                .select('id, marca, modelo');

            if (deleteError) {
                console.error('[SyncInventory] Erro ao limpar veículos antigos:', deleteError);
            } else {
                console.log(`[SyncInventory] Limpeza concluída. ${deleted?.length || 0} veículos removidos do estoque local.`);
            }
        }

        // 3. Processamento de Embeddings Semânticos para novos veículos (Batch de no máximo 50)
        console.log('[SyncInventory] Verificando veículos sem embedding semântico...');
        const { data: pendingVehicles, error: fetchPendingError } = await admin
            .from('estoque_sincronizado')
            .select('id, marca, modelo, versao, ano, preco, cambio, combustivel, cor')
            .is('embedding', null)
            .limit(50);

        let embeddingsGenerated = 0;

        if (fetchPendingError) {
            console.error('[SyncInventory] Erro ao buscar veículos sem embedding:', fetchPendingError);
        } else if (pendingVehicles && pendingVehicles.length > 0) {
            console.log(`[SyncInventory] Encontrados ${pendingVehicles.length} veículos sem embedding. Gerando...`);
            
            // Constrói os textos descritivos para o embedding
            const textInputs = pendingVehicles.map(v => {
                const parts = [
                    `Marca: ${v.marca}`,
                    `Modelo: ${v.modelo}`,
                    v.versao ? `Versão: ${v.versao}` : '',
                    v.ano ? `Ano: ${v.ano}` : '',
                    v.preco ? `Preço: R$ ${Number(v.preco).toLocaleString('pt-BR')}` : '',
                    v.cambio ? `Câmbio: ${v.cambio}` : '',
                    v.combustivel ? `Combustível: ${v.combustivel}` : '',
                    v.cor ? `Cor: ${v.cor}` : ''
                ].filter(Boolean);
                return parts.join(', ');
            });

            try {
                // Chama a API de embeddings da OpenAI
                const embeddingResponse = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: textInputs
                });

                if (embeddingResponse.data && embeddingResponse.data.length === pendingVehicles.length) {
                    const updates = pendingVehicles.map((v, index) => ({
                        id: v.id,
                        embedding: embeddingResponse.data[index].embedding
                    }));

                    // Upsert dos embeddings gerados
                    const { error: updateEmbeddingsError } = await admin
                        .from('estoque_sincronizado')
                        .upsert(updates);

                    if (updateEmbeddingsError) {
                        console.error('[SyncInventory] Erro ao salvar embeddings no banco:', updateEmbeddingsError);
                    } else {
                        embeddingsGenerated = updates.length;
                        console.log(`[SyncInventory] ${embeddingsGenerated} embeddings gerados e salvos com sucesso!`);
                    }
                }
            } catch (openaiError) {
                console.error('[SyncInventory] Falha ao gerar embeddings na OpenAI:', openaiError);
            }
        } else {
            console.log('[SyncInventory] Todos os veículos já possuem embeddings.');
        }

        return NextResponse.json({
            success: true,
            synchronizedCount: recordsToUpsert.length,
            embeddingsGenerated
        });
    } catch (e: any) {
        console.error('[SyncInventory] Critical exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal Server Error' }, { status: 500 });
    }
}
