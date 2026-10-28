import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

const KEY_VERSION = 'v1';

/**
 * Field-level encryption (AES-256-GCM) and keyed hashing for tokens.
 *
 * Ciphertexts are prefixed with the key version so the key can be rotated: add a new version,
 * re-encrypt in the background, then retire the old key. In production the keys come from the
 * secret manager (or are unwrapped by a KMS) and never from the repository.
 */
@Injectable()
export class CryptoService {
  private readonly dataKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.dataKey = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
    this.hashKey = Buffer.from(env.TOKEN_HASH_KEY, 'base64');
  }

  encrypt(plaintext: string, aad = ''): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.dataKey, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [KEY_VERSION, iv.toString('base64url'), data.toString('base64url'), tag.toString('base64url')].join(':');
  }

  decrypt(payload: string, aad = ''): string {
    const [version, iv, data, tag] = payload.split(':');
    if (version !== KEY_VERSION || !iv || !data || !tag) throw new Error('Unsupported ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.dataKey, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Keyed hash for values we look up but never need back (session tokens, e-mail links). */
  hash(value: string): string {
    return createHmac('sha256', this.hashKey).update(value).digest('base64url');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
