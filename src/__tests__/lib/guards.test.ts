import {
  maxSolPerTx,
  maxSolPerSession,
  sessionSpend,
  resetGuards,
  assertWithinCaps,
  recordSpend,
  SpendCapError,
  confirmationRequired,
  fingerprint,
  issueToken,
  consumeToken,
  ConfirmationError,
  previewText,
} from "../../lib/guards.js";

beforeEach(() => {
  resetGuards();
  delete process.env['BAGS_MAX_SOL_PER_TX'];
  delete process.env['BAGS_MAX_SOL_PER_SESSION'];
  delete process.env['BAGS_ALLOW_UNCONFIRMED'];
  delete process.env['BAGS_NETWORK'];
});

describe("cap configuration", () => {
  it("uses conservative defaults", () => {
    expect(maxSolPerTx()).toBe(0.1);
    expect(maxSolPerSession()).toBe(1.0);
  });

  it("reads overrides from the environment", () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '2.5';
    expect(maxSolPerTx()).toBe(2.5);
  });

  it("treats an empty value as unset", () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '';
    expect(maxSolPerTx()).toBe(0.1);
  });

  it("rejects a non-numeric cap rather than silently defaulting", () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = 'lots';
    expect(() => maxSolPerTx()).toThrow('must be a non-negative number');
  });

  it("rejects a negative cap", () => {
    process.env['BAGS_MAX_SOL_PER_SESSION'] = '-1';
    expect(() => maxSolPerSession()).toThrow('must be a non-negative number');
  });

  it("allows a zero cap, which blocks all spending", () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '0';
    expect(() => assertWithinCaps(0.0001)).toThrow(SpendCapError);
  });
});

describe("assertWithinCaps", () => {
  it("permits a spend inside both caps", () => {
    expect(() => assertWithinCaps(0.05)).not.toThrow();
  });

  it("permits exactly the per-tx cap", () => {
    expect(() => assertWithinCaps(0.1)).not.toThrow();
  });

  it("rejects a spend over the per-tx cap", () => {
    expect(() => assertWithinCaps(0.11)).toThrow('Per-transaction cap exceeded');
  });

  it("rejects NaN and Infinity", () => {
    expect(() => assertWithinCaps(NaN)).toThrow(SpendCapError);
    expect(() => assertWithinCaps(Infinity)).toThrow(SpendCapError);
  });

  it("rejects a negative spend", () => {
    expect(() => assertWithinCaps(-1)).toThrow(SpendCapError);
  });

  it("accumulates recorded spend against the session cap", () => {
    process.env['BAGS_MAX_SOL_PER_TX'] = '1';
    process.env['BAGS_MAX_SOL_PER_SESSION'] = '1';
    recordSpend(0.8);
    expect(sessionSpend()).toBe(0.8);
    expect(() => assertWithinCaps(0.3)).toThrow('Session cap exceeded');
    expect(() => assertWithinCaps(0.2)).not.toThrow();
  });

  it("does not mutate the session total", () => {
    assertWithinCaps(0.05);
    expect(sessionSpend()).toBe(0);
  });
});

describe("confirmationRequired", () => {
  it("is on by default", () => {
    expect(confirmationRequired()).toBe(true);
  });

  it("turns off only for an exact true", () => {
    process.env['BAGS_ALLOW_UNCONFIRMED'] = 'TRUE';
    expect(confirmationRequired()).toBe(false);
    process.env['BAGS_ALLOW_UNCONFIRMED'] = 'yes';
    expect(confirmationRequired()).toBe(true);
  });
});

describe("confirmation tokens", () => {
  it("fingerprints tool name and arguments together", () => {
    expect(fingerprint('a', { x: 1 })).toBe(fingerprint('a', { x: 1 }));
    expect(fingerprint('a', { x: 1 })).not.toBe(fingerprint('b', { x: 1 }));
    expect(fingerprint('a', { x: 1 })).not.toBe(fingerprint('a', { x: 2 }));
  });

  it("accepts a matching token exactly once", () => {
    const token = issueToken('tool', { a: 1 }, 0.05);
    expect(() => consumeToken(token, 'tool', { a: 1 })).not.toThrow();
    expect(() => consumeToken(token, 'tool', { a: 1 })).toThrow(ConfirmationError);
  });

  it("rejects an unknown token", () => {
    expect(() => consumeToken('nope', 'tool', {})).toThrow('Unknown or already-used');
  });

  it("rejects a token used against different arguments", () => {
    const token = issueToken('tool', { a: 1 }, 0.05);
    expect(() => consumeToken(token, 'tool', { a: 2 })).toThrow('does not match');
  });

  it("rejects a token used against a different tool", () => {
    const token = issueToken('tool', { a: 1 }, 0.05);
    expect(() => consumeToken(token, 'other', { a: 1 })).toThrow('does not match');
  });

  it("consumes the token even when validation fails, so it cannot be retried", () => {
    const token = issueToken('tool', { a: 1 }, 0.05);
    expect(() => consumeToken(token, 'tool', { a: 2 })).toThrow();
    expect(() => consumeToken(token, 'tool', { a: 1 })).toThrow('Unknown or already-used');
  });

  it("expires a token after its TTL", () => {
    const token = issueToken('tool', { a: 1 }, 0.05);
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
      expect(() => consumeToken(token, 'tool', { a: 1 })).toThrow('expired');
    } finally {
      Date.now = realNow;
    }
  });

  it("issues distinct tokens for identical actions", () => {
    expect(issueToken('t', { a: 1 }, 0)).not.toBe(issueToken('t', { a: 1 }, 0));
  });
});

describe("previewText", () => {
  const base = { action: 'Swap', amountSol: 0.05, details: ['x'], token: 'TOK', toolName: 'tool' };

  it("states that nothing has been sent yet", () => {
    expect(previewText(base)).toContain('nothing has been signed or sent');
  });

  it("shows the token and how to use it", () => {
    const text = previewText(base);
    expect(text).toContain('confirm: "TOK"');
    expect(text).toContain('tool');
  });

  it("adds a real-funds warning on mainnet only", () => {
    expect(previewText(base)).not.toContain('MAINNET');
    process.env['BAGS_NETWORK'] = 'mainnet';
    expect(previewText(base)).toContain('MAINNET');
  });
});
