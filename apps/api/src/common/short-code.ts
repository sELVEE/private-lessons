import { randomInt } from 'node:crypto';
import { SHORT_CODE_ALPHABET } from '@pl/shared';

/** 8 characters from a 32-letter alphabet = 40 bits; always paired with rate limits and expiry. */
export function generateShortCode(): string {
  return Array.from(
    { length: 8 },
    () => SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)],
  ).join('');
}
