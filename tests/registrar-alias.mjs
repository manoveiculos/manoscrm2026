// Permite rodar testes .ts com o Node puro (node:test + --experimental-strip-types):
// resolve o alias "@/..." para src/ e completa a extensão .ts/.tsx.
// Uso: node --experimental-strip-types --import ./tests/registrar-alias.mjs --test tests/**/*.test.ts
import { register } from 'node:module';

register('./resolver-alias.mjs', import.meta.url);
