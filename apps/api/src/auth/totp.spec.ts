import { describe, expect, it } from 'vitest';
import { generateSecret, hotp, verifyTotp } from './totp.js';

// RFC 4226 appendix D test secret "12345678901234567890" in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('matches RFC 4226 HOTP test vectors', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082');
    expect(hotp(RFC_SECRET, 9)).toBe('520489');
  });

  it('accepts the current code once and rejects replay', () => {
    const secret = generateSecret();
    const now = Date.now();
    const code = hotp(secret, Math.floor(now / 30000));
    const step = verifyTotp(secret, code, null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, step, now)).toBeNull();
  });

  it('rejects wrong codes', () => {
    expect(verifyTotp(generateSecret(), '000000', null)).toBeNull();
  });
});
