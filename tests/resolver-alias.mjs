import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTENSOES = ['.ts', '.tsx', '/index.ts'];

function comExtensao(caminho) {
    if (existsSync(caminho) && !caminho.endsWith('/')) {
        if (/\.[cm]?[jt]sx?$/.test(caminho)) return caminho;
    }
    for (const ext of EXTENSOES) if (existsSync(caminho + ext)) return caminho + ext;
    return null;
}

export async function resolve(especificador, contexto, proximo) {
    if (especificador.startsWith('@/')) {
        const alvo = comExtensao(join(SRC, especificador.slice(2)));
        if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true };
    }
    if ((especificador.startsWith('./') || especificador.startsWith('../')) && contexto.parentURL?.startsWith('file:')) {
        const base = dirname(fileURLToPath(contexto.parentURL));
        const alvo = comExtensao(join(base, especificador));
        if (alvo) return { url: pathToFileURL(alvo).href, shortCircuit: true };
    }
    return proximo(especificador, contexto);
}
