import { VersionedMessage } from "@solana/web3.js";

/**
 * Refuse to sign a "challenge" that is actually a Solana transaction.
 *
 * A Solana signature is an ed25519 signature over the serialized transaction
 * message. So if the auth endpoint returns a transaction message as the
 * challenge, the "signature" this tool sends back is a valid signature on
 * that transaction, and whoever holds it can broadcast it: a transfer of the
 * whole wallet, signed with no preview, no cap and no confirmation. The
 * endpoint is only as trustworthy as BAGS_API_URL and the Bags API itself.
 *
 * A legitimate challenge is text. A byte string that parses as a message and
 * re-serializes to exactly the same bytes is a transaction, and is refused.
 */
export class TransactionChallengeError extends Error {
  constructor() {
    super(
      "Refusing to sign: the auth challenge is a Solana transaction message, " +
        "not a text challenge. Signing it would authorize that transaction. " +
        "Check BAGS_API_URL; this should never come from the real Bags API."
    );
    this.name = "TransactionChallengeError";
  }
}

export function isTransactionMessage(bytes: Uint8Array): boolean {
  try {
    const message = VersionedMessage.deserialize(bytes);
    return Buffer.from(message.serialize()).equals(Buffer.from(bytes));
  } catch {
    return false;
  }
}

/**
 * Only printable text is signable.
 *
 * The transaction check above is a deny-list: it knows legacy and v0
 * messages, and nothing else. A future message version, a binary off-chain
 * order, or any other structured payload would pass it. Every one of those
 * contains raw 32-byte keys or length prefixes, so none of them is valid,
 * printable UTF-8. A sign-in challenge is. So the rule is: decode strictly as
 * UTF-8, allow no control characters except tab and newlines, and bound the
 * length. The transaction check stays as a second, independent reason.
 */
export const MAX_CHALLENGE_BYTES = 1024;

export class UnsignableChallengeError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to sign: the auth challenge is not a plain-text sign-in message (${reason}). ` +
        `Check BAGS_API_URL.`
    );
    this.name = "UnsignableChallengeError";
  }
}

// U+FEFF is the byte-order mark / zero-width no-break space. It is invisible and
// decodes cleanly as UTF-8, so a BOM-prefixed challenge would otherwise pass this
// text check even though it is not the exact bytes we mean to sign. Refuse it.
// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF]/;

export function assertSignableChallenge(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new UnsignableChallengeError("empty");
  if (bytes.length > MAX_CHALLENGE_BYTES) {
    throw new UnsignableChallengeError(`${bytes.length} bytes, limit ${MAX_CHALLENGE_BYTES}`);
  }
  if (isTransactionMessage(bytes)) throw new TransactionChallengeError();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new UnsignableChallengeError("not valid UTF-8");
  }
  if (DISALLOWED_CONTROL.test(text)) {
    throw new UnsignableChallengeError("contains control characters");
  }
}

/**
 * The auth endpoint decides what gets signed, so it is pinned to Bags unless
 * the operator opts out explicitly. Only https, only bags.fm or a subdomain.
 */
export const DEFAULT_BAGS_API_URL = "https://public-api-v2.bags.fm/api/v1";

export function resolveAuthBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env["BAGS_API_URL"]?.trim() || DEFAULT_BAGS_API_URL;
  if ((env["BAGS_ALLOW_CUSTOM_API_URL"] || "").toLowerCase() === "true") return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BAGS_API_URL is not a valid URL (got "${raw}").`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "bags.fm" || host.endsWith(".bags.fm"))) {
    throw new Error(
      `BAGS_API_URL must be an https URL on bags.fm (got "${raw}"). ` +
        `bags_authenticate signs what this endpoint sends. ` +
        `Set BAGS_ALLOW_CUSTOM_API_URL=true only for a server you control.`
    );
  }
  return raw;
}

/**
 * The exact challenge Bags issues, from bagsfm/bags-skill auth.md,
 * "Raw message format (before base58 encoding)". Only this text, with the
 * nonce from the same init response, is ever signed. If Bags changes the
 * wording, sign-in fails with a clear error instead of signing something new.
 */
export const BAGS_CHALLENGE_PREFIX =
  "Verify Your Wallet.\n\n" +
  "This request will not ask for a transaction or cost any gas fee.\n\n" +
  'Clicking "Sign" or "Approve" only means you have proved this wallet is owned by you.\n\n' +
  "nonce: ";

const NONCE_SHAPE = /^[A-Za-z0-9-]{1,128}$/;

export function bagsChallengeText(nonce: string): string {
  return `${BAGS_CHALLENGE_PREFIX}${nonce}`;
}

/**
 * Throws unless `bytes` is exactly the Bags challenge for `nonce`
 * (one trailing newline tolerated). Runs the generic text checks first, so a
 * transaction message still gets the transaction-specific refusal.
 */
export function assertBagsChallenge(bytes: Uint8Array, nonce: unknown): void {
  assertSignableChallenge(bytes);
  if (typeof nonce !== "string" || !NONCE_SHAPE.test(nonce)) {
    throw new UnsignableChallengeError("the nonce is not a plain identifier");
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const expected = bagsChallengeText(nonce);
  if (text !== expected && text !== `${expected}\n`) {
    throw new UnsignableChallengeError(
      "it does not match the Bags wallet-verification text for this nonce"
    );
  }
}
