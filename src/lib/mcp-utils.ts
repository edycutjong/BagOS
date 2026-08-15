import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { explorerUrl } from "./network.js";

export const McpUtilities = {
  createTextResponse: (
    text: string,
    options: { isError: boolean } = { isError: false },
  ): CallToolResult => {
    return {
      content: [{ type: "text", text }],
      isError: options.isError,
    };
  },
};

/**
 * Anything that could plausibly be key material, redacted before it can reach
 * the model or a log. Base58 secret keys, byte-array keypair files, and long
 * base64 blobs are all shapes that have leaked out of error messages before.
 */
const SECRET_SHAPES: Array<[RegExp, string]> = [
  // The shape from the original incident: a live `bags_prod_*` API key. The three
  // shapes below are length-based and do NOT catch it — a Bags key contains an
  // underscore, so it is neither base58 nor base64, and it is well under 80 chars.
  // Added when AuthenticateTool started routing upstream auth-endpoint response
  // bodies through here: that endpoint is the one that mints these keys, so its
  // error bodies are the likeliest place for one to surface.
  //
  // The lookahead is load-bearing. Every tool in this server is named
  // `bags_<lowercase words>` — and `bags_get_claimable_fees` matches
  // `bags_[a-z]+_[A-Za-z0-9]{8,}` on its own, so without the lookahead this rule
  // rewrote that tool's name to "[REDACTED_API_KEY]_fees" inside otherwise
  // ordinary error text. Requiring at least one uppercase letter or digit in the
  // trailing segment separates a minted key from an all-lowercase tool name.
  // Trade-off, stated rather than hidden: an all-lowercase key would slip past
  // this rule. Keys observed so far are mixed-case, and corrupting every error
  // message that names a tool is the worse failure.
  [/\bbags_[a-z]+_(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]{8,}/g, "[REDACTED_API_KEY]"],
  [/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/g, "[REDACTED_KEYPAIR_BYTES]"],
  [/\b[1-9A-HJ-NP-Za-km-z]{80,}\b/g, "[REDACTED_BASE58]"],
  [/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "[REDACTED_BLOB]"],
];

/**
 * Redaction is unconditional. There are deliberately NO exemptions.
 *
 * An earlier version carved out explorer URLs so a failed transaction could
 * still report its signature. That was a smuggling channel: a Solana signature
 * and a base58 secret key are the same shape, the carve-out put no length
 * bound on the base58 segment, and any attacker-influenced string placing
 * "https://explorer.solana.com/tx/" before key material defeated redaction
 * completely. The placeholder scheme also rendered a literal "EXPLORER0" in an
 * incoming message as "undefined".
 *
 * The signature is now carried out-of-band on the error object instead — see
 * `toolError` — so nothing needs to survive this function.
 */
export function redact(text: string): string {
  return SECRET_SHAPES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );
}

/** A signature carried on the error object rather than inside its message. */
function signatureOf(error: unknown): string | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "signature" in error &&
    typeof (error as { signature: unknown }).signature === "string"
  ) {
    return (error as { signature: string }).signature;
  }
  return null;
}

/**
 * Convert a thrown value into a tool error the model can act on.
 *
 * Deliberately returns only `error.message` — never `error.stack`, never the
 * raw object. A stack trace handed back to an LLM is both a leak vector and
 * noise it cannot use.
 *
 * When the error carries a transaction signature, it is appended AFTER
 * redaction from that structured field. This is how SECURITY.md's promise —
 * that a failed transaction still reports its signature — is kept without
 * poking a hole in `redact`.
 */
export function toolError(error: unknown): CallToolResult {
  let message: string;

  if (error instanceof Error) {
    message = error.name && error.name !== "Error"
      ? `${error.name}: ${error.message}`
      : error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "An unknown error occurred.";
  }

  let text = `❌ ${redact(message)}`;

  const signature = signatureOf(error);
  if (signature) {
    text += `\n\nSignature: ${signature}\nExplorer:  ${explorerUrl(signature)}`;
  }

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}
