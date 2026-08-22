const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Small non-cryptographic id. Ids only need to be unique within one device's
 * database plus an invite-code namespace, so this is sufficient - swap for a
 * server-issued uuid when the sync backend lands.
 */
export function newId(prefix = ''): string {
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return prefix ? `${prefix}_${out}` : out;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-shareable invite code: 6 unambiguous characters. */
export function newInviteCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}
