import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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
  [/\[\s*(?:\d{1,3}\s*,\s*){31,}\d{1,3}\s*\]/g, "[REDACTED_KEYPAIR_BYTES]"],
  [/\b[1-9A-HJ-NP-Za-km-z]{80,}\b/g, "[REDACTED_BASE58]"],
  [/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "[REDACTED_BLOB]"],
];

/**
 * A Solana signature is 87-88 base58 characters — the same shape as a base58
 * secret key, so the two cannot be told apart by pattern alone. Explorer links
 * are deliberately exempted: SECURITY.md promises that a failed transaction
 * reports its signature, and redacting it there destroys the one piece of
 * information the operator needs to investigate.
 */
const EXPLORER_URL = /https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]+(\?cluster=\w+)?/g;

export function redact(text: string): string {
  const preserved: string[] = [];
  const withPlaceholders = text.replace(EXPLORER_URL, (match) => {
    preserved.push(match);
    return `EXPLORER${preserved.length - 1}`;
  });

  const redacted = SECRET_SHAPES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    withPlaceholders
  );

  return redacted.replace(/EXPLORER(\d+)/g, (_m, i) => preserved[Number(i)]!);
}

/**
 * Convert a thrown value into a tool error the model can act on.
 *
 * Deliberately returns only `error.message` — never `error.stack`, never the
 * raw object. A stack trace handed back to an LLM is both a leak vector and
 * noise it cannot use.
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

  return {
    content: [{ type: "text", text: `❌ ${redact(message)}` }],
    isError: true,
  };
}
