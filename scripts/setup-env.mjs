// Creates apps/api/.env from .env.example with freshly generated keys.
// Safe to run repeatedly: existing values are never overwritten.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../apps/api/', import.meta.url);
const target = new URL('.env', dir);
const generated = ['DATA_ENCRYPTION_KEY', 'TOKEN_HASH_KEY'];

const source = readFileSync(existsSync(target) ? target : new URL('.env.example', dir), 'utf8');
const filled = [];
const out = source.replace(/^([A-Z_]+)=(.*)$/gm, (line, key, value) => {
  if (!generated.includes(key) || value.trim()) return line;
  filled.push(key);
  return `${key}=${randomBytes(32).toString('base64')}`;
});

if (!existsSync(target) || filled.length) writeFileSync(target, out, { mode: 0o600 });
console.log(
  filled.length
    ? `apps/api/.env: wygenerowano ${filled.join(', ')}`
    : 'apps/api/.env: klucze już istnieją, nic nie zmieniono',
);
