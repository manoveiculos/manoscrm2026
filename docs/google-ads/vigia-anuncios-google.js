/**
 * VIGIA DE ANÚNCIOS — MANOS VEÍCULOS (script do Google Ads)
 *
 * Só LÊ a conta: nunca pausa, edita, cria ou apaga nada. Quando acha problema,
 * manda um e-mail em português com o que achou e onde mexer.
 *
 * O que ele confere:
 *   1. Configuração que desperdiça verba: campanha de Pesquisa com a Rede de
 *      Display ligada; segmentação "presença ou interesse" (mostra o anúncio
 *      para quem mora fora da região).
 *   2. Anúncios: reprovados, grupo de anúncios sem nenhum anúncio ativo e
 *      força do anúncio "Ruim".
 *   3. Links dos anúncios, palavras-chave e sitelinks: página fora do ar
 *      (erro 4xx/5xx ou sem resposta) e página com texto de carro vendido ou
 *      de página de teste (ex.: "Olá, mundo!").
 *   4. Gasto de ontem fora do normal (comparado com a média dos dias
 *      anteriores) e campanha ativa que parou de gastar.
 *   5. Termos de pesquisa que gastaram dinheiro e não deram nenhuma conversão
 *      (candidatos a palavra-chave negativa).
 *
 * Como instalar: veja docs/google-ads/LEIA-ME.md.
 *
 * Ideias tiradas dos scripts de monitoramento da Brainlabs
 * (github.com/Brainlabs-Digital/Google-Ads-Scripts, pasta Monitoring). O
 * código foi escrito do zero para a versão atual do Google Ads (AdsApp + GAQL).
 */

// ============================ CONFIGURAÇÃO ============================
const CONFIG = {
  // Quem recebe o alerta. Ex.: ['dono@empresa.com.br', 'marketing@empresa.com.br']
  EMAILS: ['COLOQUE_SEU_EMAIL_AQUI'],

  // true = manda e-mail mesmo quando está tudo certo (bom na primeira semana,
  // para ter certeza de que o script está rodando).
  ENVIAR_SE_TUDO_OK: true,

  // Textos que indicam página errada para receber anúncio. A busca diferencia
  // maiúsculas de minúsculas. Os três primeiros são os que o site novo da Manos
  // mostra quando o carro foi vendido.
  TEXTOS_DE_PROBLEMA_NA_PAGINA: [
    'Esse carro já foi vendido',
    'não está mais disponível para venda',
    '[VENDIDO]',
    'Página não encontrada',
    'Olá, mundo!',
  ],

  // Links que não são páginas da loja (redes sociais, WhatsApp): não são testados.
  DOMINIOS_IGNORADOS: ['instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com', 'youtube.com'],

  // Gasto: alerta se ontem ficou mais de 60% acima ou abaixo da média diária
  // dos dias anteriores. Campanhas que gastam menos que GASTO_MINIMO_MEDIA por
  // dia (R$) não entram nessa conta, para não gerar alarme à toa.
  VARIACAO_GASTO: 0.6,
  GASTO_MINIMO_MEDIA: 10,

  // Termos de pesquisa: lista os que gastaram pelo menos isso (R$) nos últimos
  // 30 dias sem nenhuma conversão.
  GASTO_MINIMO_TERMO: 15,
  MAX_TERMOS: 15,

  // Limite de páginas testadas por rodada (o Google limita o tempo do script).
  MAX_URLS: 60,
};
// ======================================================================

const CRITICO = 'Corrigir já';
const ATENCAO = 'Vale olhar';

function main() {
  validarConfig_();
  const achados = [];

  executar_(achados, 'configuração', function () { verificarConfiguracao_(achados); });
  const urls = {};
  executar_(achados, 'anúncios', function () { verificarAnuncios_(achados, urls); });
  executar_(achados, 'links', function () { juntarOutrosLinks_(achados, urls); verificarLinks_(achados, urls); });
  executar_(achados, 'gasto', function () { verificarGasto_(achados); });
  executar_(achados, 'termos de pesquisa', function () { verificarTermos_(achados); });

  enviar_(achados);
}

// ---------------------------------------------------------------- 1
function verificarConfiguracao_(achados) {
  const linhas = AdsApp.search(
    'SELECT campaign.name, campaign.advertising_channel_type, ' +
    'campaign.network_settings.target_content_network, ' +
    'campaign.geo_target_type_setting.positive_geo_target_type ' +
    "FROM campaign WHERE campaign.status = 'ENABLED'"
  );
  while (linhas.hasNext()) {
    const c = linhas.next().campaign;
    const rede = c.networkSettings || {};
    const geo = (c.geoTargetTypeSetting || {}).positiveGeoTargetType;

    if (c.advertisingChannelType === 'SEARCH' && rede.targetContentNetwork) {
      achados.push([CRITICO, 'Configuração',
        `"${c.name}": campanha de Pesquisa com a Rede de Display ligada. Parte da verba vai para sites e apps, ` +
        'que costumam trazer clique barato e lead fraco. Onde mudar: Campanha → Configurações → Redes → desmarcar "Rede de Display".']);
    }
    if (geo === 'PRESENCE_OR_INTEREST') {
      achados.push([CRITICO, 'Configuração',
        `"${c.name}": local configurado como "Presença ou interesse". O anúncio aparece para quem mora fora da região ` +
        'mas pesquisou sobre ela. Onde mudar: Campanha → Configurações → Locais → Opções → "Presença: pessoas que estão ou costumam estar nos seus locais".']);
    }
  }
}

// ---------------------------------------------------------------- 2
function verificarAnuncios_(achados, urls) {
  const grupos = {};
  const gruposLinhas = AdsApp.search(
    'SELECT campaign.name, ad_group.id, ad_group.name FROM ad_group ' +
    "WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' " +
    "AND campaign.advertising_channel_type IN ('SEARCH', 'DISPLAY')"
  );
  while (gruposLinhas.hasNext()) {
    const l = gruposLinhas.next();
    grupos[l.adGroup.id] = { campanha: l.campaign.name, grupo: l.adGroup.name, ativos: 0 };
  }

  const anuncios = AdsApp.search(
    'SELECT campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad_strength, ' +
    'ad_group_ad.policy_summary.approval_status, ad_group_ad.ad.final_urls FROM ad_group_ad ' +
    "WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'"
  );
  while (anuncios.hasNext()) {
    const l = anuncios.next();
    const aga = l.adGroupAd;
    const onde = `"${l.campaign.name}" › "${l.adGroup.name}" (anúncio ${aga.ad.id})`;
    const aprovacao = (aga.policySummary || {}).approvalStatus;

    if (aprovacao === 'DISAPPROVED') {
      achados.push([CRITICO, 'Anúncios', `${onde}: anúncio REPROVADO. Abra o anúncio no Google Ads para ver o motivo.`]);
    } else if (grupos[l.adGroup.id]) {
      grupos[l.adGroup.id].ativos++;
    }
    if (aga.adStrength === 'POOR') {
      achados.push([ATENCAO, 'Anúncios', `${onde}: força do anúncio "Ruim". Mais títulos diferentes entre si costumam melhorar a entrega.`]);
    }
    (aga.ad.finalUrls || []).forEach(function (u) { guardarUrl_(urls, u, onde); });
  }

  Object.keys(grupos).forEach(function (id) {
    const g = grupos[id];
    if (g.ativos === 0) {
      achados.push([CRITICO, 'Anúncios', `"${g.campanha}" › "${g.grupo}": grupo ativo sem nenhum anúncio aprovado no ar.`]);
    }
  });
}

// ---------------------------------------------------------------- 3
function juntarOutrosLinks_(achados, urls) {
  const consultas = [
    ['palavra-chave',
      'SELECT campaign.name, ad_group_criterion.final_urls FROM ad_group_criterion ' +
      "WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' " +
      "AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'"],
    ['sitelink da campanha',
      'SELECT campaign.name, asset.name, asset.final_urls, asset.sitelink_asset.link_text FROM campaign_asset ' +
      "WHERE campaign_asset.status = 'ENABLED' AND campaign.status = 'ENABLED'"],
    ['sitelink da conta',
      'SELECT asset.name, asset.final_urls, asset.sitelink_asset.link_text FROM customer_asset ' +
      "WHERE customer_asset.status = 'ENABLED'"],
  ];
  consultas.forEach(function (par) {
    try {
      const linhas = AdsApp.search(par[1]);
      while (linhas.hasNext()) {
        const l = linhas.next();
        const lista = (l.adGroupCriterion && l.adGroupCriterion.finalUrls) || (l.asset && l.asset.finalUrls) || [];
        const texto = l.asset && l.asset.sitelinkAsset && l.asset.sitelinkAsset.linkText;
        const onde = par[0] + (texto ? ` "${texto}"` : '') + (l.campaign ? ` em "${l.campaign.name}"` : '');
        lista.forEach(function (u) { guardarUrl_(urls, u, onde); });
      }
    } catch (e) {
      Logger.log(`Não consegui ler os links de ${par[0]}: ${e}`);
      achados.push([ATENCAO, 'Script', `Não consegui ler os links de ${par[0]} (${e}); esses links ficaram sem teste.`]);
    }
  });
}

function guardarUrl_(urls, url, onde) {
  if (!url || url.indexOf('{') !== -1) return; // link com parâmetro dinâmico não dá para testar
  const dominio = (url.match(/^https?:\/\/([^/?#]+)/i) || [])[1] || '';
  if (CONFIG.DOMINIOS_IGNORADOS.some(function (d) { return dominio.toLowerCase().indexOf(d) !== -1; })) return;
  if (!urls[url]) urls[url] = [];
  if (urls[url].indexOf(onde) === -1) urls[url].push(onde);
}

function verificarLinks_(achados, urls) {
  const lista = Object.keys(urls);
  if (lista.length > CONFIG.MAX_URLS) {
    achados.push([ATENCAO, 'Links', `Há ${lista.length} links diferentes; testei só os primeiros ${CONFIG.MAX_URLS}.`]);
  }
  lista.slice(0, CONFIG.MAX_URLS).forEach(function (url) {
    const usadoEm = urls[url].slice(0, 3).join('; ');
    let resposta;
    try {
      resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    } catch (e) {
      achados.push([CRITICO, 'Links', `${url} não respondeu (${e}). Usado em: ${usadoEm}.`]);
      return;
    }
    const codigo = resposta.getResponseCode();
    if (codigo >= 400) {
      achados.push([CRITICO, 'Links', `${url} está com erro ${codigo}. Usado em: ${usadoEm}.`]);
      return;
    }
    const html = resposta.getContentText();
    const achado = CONFIG.TEXTOS_DE_PROBLEMA_NA_PAGINA.filter(function (t) { return html.indexOf(t) !== -1; });
    if (achado.length) {
      achados.push([CRITICO, 'Links',
        `${url} mostra "${achado.join('", "')}". O anúncio está levando para uma página errada. Usado em: ${usadoEm}.`]);
    }
  });
}

// ---------------------------------------------------------------- 4
function verificarGasto_(achados) {
  const fuso = AdsApp.currentAccount().getTimeZone();
  const ontem = Utilities.formatDate(new Date(Date.now() - 24 * 3600 * 1000), fuso, 'yyyy-MM-dd');
  const diasAnteriores = 13; // LAST_14_DAYS = ontem + 13 dias antes (não inclui hoje)

  const porCampanha = {};
  const linhas = AdsApp.search(
    'SELECT campaign.name, segments.date, metrics.cost_micros, metrics.conversions FROM campaign ' +
    "WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_14_DAYS"
  );
  while (linhas.hasNext()) {
    const l = linhas.next();
    const nome = l.campaign.name;
    const gasto = Number(l.metrics.costMicros || 0) / 1e6;
    if (!porCampanha[nome]) porCampanha[nome] = { ontem: 0, antes: 0, convOntem: 0 };
    if (l.segments.date === ontem) {
      porCampanha[nome].ontem += gasto;
      porCampanha[nome].convOntem += Number(l.metrics.conversions || 0);
    } else {
      porCampanha[nome].antes += gasto;
    }
  }

  Object.keys(porCampanha).forEach(function (nome) {
    const c = porCampanha[nome];
    const media = c.antes / diasAnteriores;
    if (media < CONFIG.GASTO_MINIMO_MEDIA) return;
    if (c.ontem === 0) {
      achados.push([CRITICO, 'Gasto', `"${nome}" não gastou nada ontem (média de ${reais_(media)} por dia). Veja se foi pausada, reprovada ou ficou sem saldo.`]);
    } else if (c.ontem > media * (1 + CONFIG.VARIACAO_GASTO)) {
      achados.push([CRITICO, 'Gasto', `"${nome}" gastou ${reais_(c.ontem)} ontem, bem acima da média de ${reais_(media)} por dia (conversões ontem: ${c.convOntem}).`]);
    } else if (c.ontem < media * (1 - CONFIG.VARIACAO_GASTO)) {
      achados.push([ATENCAO, 'Gasto', `"${nome}" gastou só ${reais_(c.ontem)} ontem; a média é ${reais_(media)} por dia. Pode estar com entrega limitada.`]);
    }
  });
}

// ---------------------------------------------------------------- 5
function verificarTermos_(achados) {
  const minimo = Math.round(CONFIG.GASTO_MINIMO_TERMO * 1e6);
  const linhas = AdsApp.search(
    'SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions ' +
    'FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ' +
    `AND metrics.conversions = 0 AND metrics.cost_micros > ${minimo} ` +
    `ORDER BY metrics.cost_micros DESC LIMIT ${CONFIG.MAX_TERMOS}`
  );
  const termos = [];
  while (linhas.hasNext()) {
    const l = linhas.next();
    termos.push(`"${l.searchTermView.searchTerm}" — ${reais_(Number(l.metrics.costMicros) / 1e6)}, ${l.metrics.clicks} cliques, 0 conversões (${l.campaign.name})`);
  }
  if (termos.length) {
    achados.push([ATENCAO, 'Termos de pesquisa',
      'Gastaram nos últimos 30 dias sem nenhuma conversão. Se não tiverem a ver com comprar carro na loja, ' +
      'entram como palavra-chave negativa:\n    ' + termos.join('\n    ')]);
  }
}

// ---------------------------------------------------------------- e-mail
function enviar_(achados) {
  const conta = AdsApp.currentAccount().getName();
  achados.forEach(function (a) { Logger.log(`[${a[0]}] ${a[1]}: ${a[2]}`); });

  if (!achados.length && !CONFIG.ENVIAR_SE_TUDO_OK) {
    Logger.log('Nada a avisar.');
    return;
  }

  const criticos = achados.filter(function (a) { return a[0] === CRITICO; });
  const assunto = achados.length
    ? `Vigia Google Ads — ${conta}: ${criticos.length} para corrigir já, ${achados.length - criticos.length} para olhar`
    : `Vigia Google Ads — ${conta}: tudo certo`;

  let corpo = `Conta: ${conta}\nRodou em: ${Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'dd/MM/yyyy HH:mm')}\n\n`;
  if (!achados.length) {
    corpo += 'Nenhum problema encontrado.\n';
  }
  [CRITICO, ATENCAO].forEach(function (nivel) {
    const doNivel = achados.filter(function (a) { return a[0] === nivel; });
    if (!doNivel.length) return;
    corpo += `== ${nivel.toUpperCase()} (${doNivel.length}) ==\n`;
    doNivel.forEach(function (a, i) { corpo += `${i + 1}. [${a[1]}] ${a[2]}\n`; });
    corpo += '\n';
  });
  corpo += 'Este script só lê a conta: nenhuma mudança foi feita.\n';

  if (AdsApp.getExecutionInfo().isPreview()) {
    Logger.log('Modo Visualizar: o e-mail não foi enviado. Assunto seria: ' + assunto);
    return;
  }
  MailApp.sendEmail(CONFIG.EMAILS.join(','), assunto, corpo);
  Logger.log('E-mail enviado para ' + CONFIG.EMAILS.join(', '));
}

// ---------------------------------------------------------------- utilidades
// Uma etapa que falha não derruba as outras, e a falha aparece no e-mail.
function executar_(achados, etapa, fn) {
  try {
    fn();
  } catch (e) {
    Logger.log(`Falha na etapa "${etapa}": ${e}`);
    achados.push([ATENCAO, 'Script', `A verificação de ${etapa} não rodou: ${e}`]);
  }
}

function validarConfig_() {
  if (!CONFIG.EMAILS.length || CONFIG.EMAILS.some(function (e) { return e.indexOf('@') === -1; })) {
    throw new Error('Coloque o e-mail de quem recebe os alertas em CONFIG.EMAILS (no começo do script).');
  }
}

function reais_(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',');
}
