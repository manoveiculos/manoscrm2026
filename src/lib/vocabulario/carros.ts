// src/lib/vocabulario/carros.ts — vocabulário de carro do brasileiro (PURO)
//
// Pedido do Alexandre (13/11/2026): a Laura não entendia "SUV". O feed da Altimus não traz o tipo de
// carroceria, então este arquivo (1) entende como o cliente pede (suv, sedã, hatch, caminhonete,
// caminhoneta, picape, perua, monovolume…), (2) diz a que tipo cada modelo da loja pertence e
// (3) dá à Laura o glossário para conversar do jeito que o brasileiro fala.

export type Carroceria = 'hatch' | 'sedan' | 'suv' | 'picape' | 'utilitario' | 'minivan' | 'perua' | 'esportivo' | 'conversivel';

export const ROTULO_CARROCERIA: Record<Carroceria, string> = {
    hatch: 'hatch', sedan: 'sedã', suv: 'SUV', picape: 'picape', utilitario: 'utilitário', minivan: 'minivan',
    perua: 'perua', esportivo: 'esportivo', conversivel: 'conversível',
};

const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── como o cliente PEDE ─────────────────────────────────────────────────────

const PEDIDOS: [Carroceria, RegExp][] = [
    ['suv', /\b(suvs?|crossover|utilitario esportivo|jipe|jeep|4x4|quatro por quatro|carro alto)\b/],
    ['sedan', /\b(sedan|sedas?|tres volumes|3 volumes|sedan)\b/],
    ['hatch', /\b(hatch|hatchback|compacto|popular|populares)\b/],
    ['picape', /\b(picapes?|pickups?|pick ups?|caminhonetes?|caminhonetas?|camionetes?|camionetas?|cabine dupla|cabine simples|carroceria aberta)\b/],
    ['utilitario', /\b(utilitarios?|furgao|furgoes|van de carga)\b/],
    ['minivan', /\b(minivans?|mini van|monovolume|7 lugares|sete lugares)\b/],
    ['perua', /\b(perua|peruas|station wagon|wagon)\b/],
    ['esportivo', /\b(esportivos?|coupe|cupe)\b/],
    ['conversivel', /\b(conversiveis|conversivel|cabrio|cabriolet|roadster)\b/],
];

/** Tipos de carroceria que o cliente pediu no texto ("quero um SUV automático", "tem caminhoneta?"). */
export function carroceriasPedidas(texto: string | null | undefined): Carroceria[] {
    const t = norm(texto);
    if (!t) return [];
    const achadas: Carroceria[] = [];
    for (const [tipo, rx] of PEDIDOS) if (rx.test(t) && !achadas.includes(tipo)) achadas.push(tipo);
    // "caminhonete" não é "utilitário"/"van de carga": se pediu picape, o resto não vale
    return achadas;
}

/** O mesmo texto, sem as palavras de tipo (sobra o que identifica o carro: marca, modelo, ano). */
export function semPalavrasDeCarroceria(texto: string | null | undefined): string {
    let t = norm(texto);
    for (const [, rx] of PEDIDOS) t = t.replace(new RegExp(rx.source, 'g'), ' ');
    return t.replace(/\s+/g, ' ').trim();
}

// ── a que tipo o MODELO pertence (ordem importa: o mais específico primeiro) ─

const MODELOS: [Carroceria, RegExp][] = [
    // específicos antes dos genéricos
    ['picape', /\b(oroch|duster oroch)\b/],
    ['utilitario', /\b(doblo cargo|fiorino|kangoo express)\b/],
    ['suv', /\b(corolla cross|cross|taos|t ?cross|nivus|compass|renegade|commander|creta|tracker|kicks|hr ?v|wr ?v|duster|captur|pulse|fastback|tiggo|haval|jolion|h6|ecosport|territory|tiguan|tucson|ix35|sportage|sorento|outlander|asx|pajero|tr4|eclipse|cx ?[3-9]|rav4|bronco|equinox|trailblazer|sw4|q[2-8]|x[1-6]|gl[abce]|evoque|discovery|freelander|grand vitara|vitara|jimny|kardian|stepway|aircross|c4 cactus|song|haval|santa fe|palisade|cherokee|wrangler|grand cherokee|defender|bj40|tcross)\b/],
    ['perua', /\b(weekend|parati|space ?fox|pointer|quantum|sw|variant|wagon|station)\b/],
    ['sedan', /\b(onix plus|hb20 ?s|etios sedan|ka sedan|focus sedan|fiesta sedan|corsa sedan|astra sedan|megane sedan|polo sedan|cruze(?! sport)|corolla|civic|virtus|voyage|cronos|logan|versa|sentra|jetta|city|prisma|grand siena|siena|linea|fluence|accord|camry|cobalt|elantra|sonata|azera|fusion|passat|classic|vectra|cerato|optima|yaris sedan|classe c|serie 3|a4|a6|c4 lounge|408|307 sedan|206 sedan|clio sedan|symbol|spirit|santana|tempra)\b/],
    ['picape', /\b(strada|toro|saveiro|montana|hilux|s10|ranger|l200|triton|amarok|frontier|courier|f ?1000|f ?250|d20|maverick|dakota|ram|silverado|hoggar|ssangyong|rexton sports|musso|titano|rampage|ford f)\b/],
    ['minivan', /\b(spin|zafira|meriva|livina|grand livina|idea|picasso|xsara picasso|scenic|carens|sedona|grand c4|caravan|touran|sharan|odyssey|doblo(?! cargo))\b/],
    ['utilitario', /\b(fiorino|kangoo|partner|berlingo|master|sprinter|ducato|daily|hr|bongo|transit|express|furgao|van|boxer|jumper|expert|scudo|canter|accelo|cargo)\b/],
    ['esportivo', /\b(mustang|camaro|911|z4|tt|mx 5|supra|brz|gt86|corvette|cayman|boxster|challenger|charger|veloster|mini cooper)\b/],
    ['conversivel', /\b(cabrio|cabriolet|conversivel|roadster|spider)\b/],
    ['hatch', /\b(onix|hb20|polo|gol|argo|mobi|kwid|fox|uno|palio|celta|ka|fit|208|206|207|c3|sandero|up|fusca|i30|etios|golf|308|clio|march|picanto|punto|bravo|focus|fiesta|corsa|agile|sport6|cruze sport|stilo|marea|escort|monza|kadett|tigra|polo track|kicks play|new beetle|beetle|mini|a1|a3|serie 1|classe a|c4|307|twingo|ds3|i10)\b/],
];

/** Carroceria do carro, pelo nome. null = não reconheci (a Laura não afirma o tipo). Moto não casa com nenhum modelo de carro, então volta null. */
export function carroceriaDoModelo(marca: string | null | undefined, modelo: string | null | undefined, versao?: string | null): Carroceria | null {
    const t = norm(`${marca || ''} ${modelo || ''} ${versao || ''}`);
    if (!t) return null;
    for (const [tipo, rx] of MODELOS) if (rx.test(t)) return tipo;
    return null;
}

// ── glossário para a Laura ──────────────────────────────────────────────────

export const GLOSSARIO_BRASIL = `ENTENDER O CLIENTE BRASILEIRO (carro e conversa)
Tipos de carro, do jeito que o cliente fala:
- SUV (também "utilitário esportivo", "carro alto", "crossover"): carro mais alto e espaçoso, estilo jipe, porta-malas grande. Ex.: Compass, Creta, T-Cross, Tracker, Kicks, Nivus, Renegade, HR-V.
- Sedã ("sedan", "três volumes"): carro com porta-malas separado da cabine, mais comprido. Ex.: Corolla, Civic, Virtus, Cronos, Onix Plus, HB20S.
- Hatch ("hatchback", "compacto", "carro popular"): carro menor, traseira curta com porta-malas na tampa. Ex.: Onix, HB20, Gol, Polo, Argo, Mobi, Kwid.
- Picape, caminhonete ou caminhoneta ("pickup", "camionete", "cabine dupla"): carro com caçamba aberta. Ex.: Strada, Toro, Saveiro, Hilux, S10, Ranger, Amarok.
- Utilitário ("furgão"): carro de carga fechado. Ex.: Fiorino, Kangoo, Doblò.
- Minivan ("monovolume", "7 lugares"): carro familiar alto com várias fileiras de banco. Ex.: Spin, Zafira.
- Perua ("station wagon"): carro comprido com traseira estendida. Ex.: Palio Weekend, Parati, SpaceFox.
Termos do dia a dia:
- "Zero" é carro novo, "seminovo" ou "usado" é de segunda mão; "único dono" teve só um dono; "baixa km" rodou pouco.
- "Completo" é o carro cheio de itens (ar, vidro e trava elétricos); "básico" é o mais simples. "Flex" roda com gasolina e etanol. "Automático" (ou "CVT", "automatizado") não tem pedal de embreagem.
- "Financiar" é pagar em parcelas pelo banco; "entrada" é o que paga na hora; "parcela" é a prestação; "à vista" é pagar tudo de uma vez; "troca" é dar o carro dele como parte do pagamento; "quitado" é carro sem dívida; "repasse" é carro de revenda entre lojas.
- "Econômico" é o que gasta pouco combustível; "carro de família" é espaçoso e confortável; "pra trabalhar" costuma ser picape, utilitário ou hatch simples.
- Abreviações comuns: vc/vcs (você/vocês), pq (por que), tb (também), blz (beleza), td bem, mto, obg, "tá", "pra".
Regra: quando o cliente pedir pelo tipo (ex.: "tem SUV?", "quero uma caminhoneta"), chame buscar_estoque com a palavra do tipo na consulta (ex.: "suv", "picape", "sedan automático"). Se a loja não tiver aquele tipo agora, diga isso com simplicidade e ofereça o mais parecido do estoque. Nunca diga que um carro é de um tipo se buscar_estoque não confirmou o tipo.`;
