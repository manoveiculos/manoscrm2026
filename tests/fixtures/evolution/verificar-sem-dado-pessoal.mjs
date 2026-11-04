// Confere se as fixtures da Evolution continuam sem dado pessoal.
// Uso: node tests/fixtures/evolution/verificar-sem-dado-pessoal.mjs
//
// Regra: todo número de telefone tem de ser fictício (55 47 90000-0xxx) e
// todo nome de contato tem de ser "Cliente Teste" / "Contato Teste".
// Rode antes de commitar uma captura real anonimizada (Fase 2).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = dirname(fileURLToPath(import.meta.url));
const TELEFONE_FICTICIO = /^55479000000\d\d$/;
const NOMES_PERMITIDOS = new Set(['', 'Cliente Teste', 'Contato Teste']);

let erros = 0;
const arquivos = readdirSync(pasta).filter(f => f.endsWith('.json'));

for (const arquivo of arquivos) {
    const texto = readFileSync(join(pasta, arquivo), 'utf8');
    let json;
    try {
        json = JSON.parse(texto);
    } catch (e) {
        console.error(`✗ ${arquivo}: JSON inválido (${e.message})`);
        erros++;
        continue;
    }

    // Qualquer sequência de 10+ dígitos que pareça telefone brasileiro.
    for (const m of texto.matchAll(/\b55\d{10,11}\b/g)) {
        if (!TELEFONE_FICTICIO.test(m[0])) {
            console.error(`✗ ${arquivo}: telefone fora do padrão fictício: ${m[0]}`);
            erros++;
        }
    }

    const nomes = [];
    const visitar = (v) => {
        if (Array.isArray(v)) return v.forEach(visitar);
        if (v && typeof v === 'object') {
            for (const [k, val] of Object.entries(v)) {
                if ((k === 'pushName' || k === 'displayName') && typeof val === 'string') nomes.push(val);
                visitar(val);
            }
        }
    };
    visitar(json);
    for (const n of nomes) {
        if (!NOMES_PERMITIDOS.has(n)) {
            console.error(`✗ ${arquivo}: nome não permitido: "${n}"`);
            erros++;
        }
    }

    if (!json.event) {
        console.error(`✗ ${arquivo}: sem campo "event"`);
        erros++;
    }
}

if (erros) {
    console.error(`\n${erros} problema(s) em ${arquivos.length} fixtures.`);
    process.exit(1);
}
console.log(`✓ ${arquivos.length} fixtures sem dado pessoal.`);
