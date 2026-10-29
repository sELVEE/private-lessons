// Creates apps/api/.env from .env.example with freshly generated keys.
// Safe to run repeatedly: existing values are never overwritten.
import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../apps/api/', import.meta.url);
const target = new URL('.env', dir);
const generated = [
  'DATA_ENCRYPTION_KEY',
  'TOKEN_HASH_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
];

// VAPID key pair for Web Push (P-256), in the base64url format browsers and web-push expect.
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const values = {
  DATA_ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
  TOKEN_HASH_KEY: () => randomBytes(32).toString('base64'),
  VAPID_PUBLIC_KEY: () => ecdh.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: () => ecdh.getPrivateKey().toString('base64url'),
};

let source = readFileSync(existsSync(target) ? target : new URL('.env.example', dir), 'utf8');
// Older .env files predate some keys: append the missing ones so they get generated.
for (const key of generated) {
  if (!new RegExp(`^${key}=`, 'm').test(source))
    source += `${source.endsWith('\n') ? '' : '\n'}${key}=\n`;
}
const filled = [];
const out = source.replace(/^([A-Z_]+)=(.*)$/gm, (line, key, value) => {
  if (!generated.includes(key) || value.trim()) return line;
  filled.push(key);
  return `${key}=${values[key]()}`;
});

if (!existsSync(target) || filled.length) writeFileSync(target, out, { mode: 0o600 });
console.log(
  filled.length
    ? `apps/api/.env: wygenerowano ${filled.join(', ')}`
    : 'apps/api/.env: klucze już istnieją, nic nie zmieniono',
);
