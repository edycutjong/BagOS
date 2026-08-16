/**
 * Numeric environment parsing, shared by every limit this server enforces.
 *
 * This lives on its own because the two places that read a numeric limit —
 * spend caps (guards.ts) and the token gate (token-gate.ts) — must agree on
 * what a value means, and they did not. guards.ts used this logic; token-gate.ts
 * used `Number(raw) || DEFAULT`, which is wrong in two ways that both fail open:
 *
 *   BOS_REQUIRED_BALANCE=0      Number("0") is 0, which is falsy, so the
 *                               explicit "no minimum" silently became 10000.
 *                               The operator asked to disable the gate and got
 *                               a gate.
 *   BOS_REQUIRED_BALANCE="abc"  NaN is falsy, so a typo silently became 10000
 *                               instead of being reported. A misconfigured
 *                               limit that never announces itself is the kind
 *                               that is discovered by a transaction.
 *
 * Both directions matter for a security control: one ignores an instruction to
 * lower a limit, the other hides that the limit was never understood.
 */
export function numFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number (got "${raw}").`);
  }
  return parsed;
}
