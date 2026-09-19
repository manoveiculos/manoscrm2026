import { NextResponse } from 'next/server';

export async function GET() {
    const openApiSpec = {
        openapi: "3.0.0",
        info: {
            title: "Manos CRM & Altimus - Meta Business Agent Connector API",
            description: "API de integração de Conectores e Ferramentas da IA para consulta de estoque, ficha técnica de veículos, simulação de financiamento e agendamento de visitas para Mano's Veículos.",
            version: "1.0.0"
        },
        servers: [
            {
                url: process.env.NEXT_PUBLIC_APP_URL || "https://crm.manosveiculos.com.br",
                description: "Servidor de Produção Manos CRM"
            }
        ],
        paths: {
            "/api/meta-agent/inventory": {
                get: {
                    operationId: "search_inventory",
                    summary: "Consultar estoque de veículos",
                    description: "Busca veículos disponíveis no estoque da loja por modelo, faixa de preço, ano ou marca.",
                    parameters: [
                        {
                            name: "query",
                            in: "query",
                            description: "Termo livre de busca (ex: 'Civic', 'SUV automático', 'Hilux')",
                            required: false,
                            schema: { type: "string" }
                        },
                        {
                            name: "max_price",
                            in: "query",
                            description: "Preço máximo em Reais (ex: 80000)",
                            required: false,
                            schema: { type: "number" }
                        },
                        {
                            name: "min_year",
                            in: "query",
                            description: "Ano mínimo de fabricação (ex: 2018)",
                            required: false,
                            schema: { type: "integer" }
                        },
                        {
                            name: "transmission",
                            in: "query",
                            description: "Tipo de câmbio: 'automático' ou 'manual'",
                            required: false,
                            schema: { type: "string" }
                        }
                    ],
                    responses: {
                        "200": {
                            description: "Lista de veículos encontrados",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            total: { type: "integer" },
                                            vehicles: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    properties: {
                                                        id: { type: "string" },
                                                        name: { type: "string" },
                                                        price: { type: "number" },
                                                        year: { type: "integer" },
                                                        km: { type: "number font-mono" },
                                                        transmission: { type: "string" },
                                                        color: { type: "string" },
                                                        summary: { type: "string" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/api/meta-agent/vehicle/{id}": {
                get: {
                    operationId: "get_vehicle_details",
                    summary: "Obter detalhes completos do veículo",
                    description: "Retorna a ficha técnica completa, opcionais, preço, km e fotos de um veículo do estoque.",
                    parameters: [
                        {
                            name: "id",
                            in: "path",
                            description: "ID ou código do veículo",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    responses: {
                        "200": {
                            description: "Ficha técnica e fotos do veículo",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string" },
                                            name: { type: "string" },
                                            price: { type: "number" },
                                            year: { type: "integer" },
                                            km: { type: "number" },
                                            transmission: { type: "string" },
                                            fuel: { type: "string" },
                                            color: { type: "string" },
                                            description: { type: "string" },
                                            options: { type: "array", items: { type: "string" } },
                                            photos: { type: "array", items: { type: "string" } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/api/meta-agent/financing": {
                post: {
                    operationId: "calculate_financing",
                    summary: "Simular financiamento de veículo",
                    description: "Calcula valor estimado de entrada e parcelas mensais (ex: 24x, 36x, 48x, 60x) para um determinado valor ou veículo.",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["vehicle_price"],
                                    properties: {
                                        vehicle_price: { type: "number", description: "Preço total do veículo" },
                                        down_payment: { type: "number", description: "Valor de entrada proposto em Reais" },
                                        installments: { type: "integer", description: "Quantidade de parcelas (ex: 48)" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        "200": {
                            description: "Simulação de financiamento gerada",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            vehicle_price: { type: "number" },
                                            down_payment: { type: "number" },
                                            financed_amount: { type: "number" },
                                            simulation: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    properties: {
                                                        installments: { type: "integer" },
                                                        monthly_payment: { type: "number" },
                                                        estimated_total: { type: "number" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/api/meta-agent/lead-schedule": {
                post: {
                    operationId: "create_lead_and_schedule",
                    summary: "Cadastrar lead e agendar visita / test drive",
                    description: "Registra os dados do cliente no Manos-CRM / Altimus e agenda um horário de atendimento com os consultores.",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["customer_name", "customer_phone"],
                                    properties: {
                                        customer_name: { type: "string", description: "Nome do cliente" },
                                        customer_phone: { type: "string", description: "Telefone / WhatsApp do cliente" },
                                        vehicle_id: { type: "string", description: "ID do veículo de interesse" },
                                        desired_date: { type: "string", description: "Data e horário desejado (ex: '2026-09-22 14:00')" },
                                        notes: { type: "string", description: "Observações ou carro de troca" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        "200": {
                            description: "Lead registrado e visita agendada",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            lead_id: { type: "string" },
                                            message: { type: "string" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "Token"
                }
            }
        },
        security: [
            {
                BearerAuth: []
            }
        ]
    };

    return NextResponse.json(openApiSpec);
}
