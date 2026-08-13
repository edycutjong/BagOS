import {
  getNetwork,
  isMainnet,
  getRpcUrl,
  explorerUrl,
  networkBanner,
  resetConnection,
  clusterFromUrl,
  redactedRpcUrl,
} from "../../lib/network.js";

/**
 * The default matters more than anything else here: an unconfigured install
 * must land on devnet. Before v2.0.0 both bags-client and token-gate silently
 * fell back to mainnet-beta.
 */

const saved = { ...process.env };

beforeEach(() => {
  delete process.env['BAGS_NETWORK'];
  delete process.env['SOLANA_RPC_URL'];
  delete process.env['HELIUS_RPC_URL'];
  resetConnection();
});

afterAll(() => {
  process.env = saved;
});

describe("getNetwork", () => {
  it("defaults to devnet when unset", () => {
    expect(getNetwork()).toBe("devnet");
    expect(isMainnet()).toBe(false);
  });

  it("accepts mainnet and mainnet-beta", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    expect(getNetwork()).toBe("mainnet");
    process.env['BAGS_NETWORK'] = 'mainnet-beta';
    expect(getNetwork()).toBe("mainnet");
  });

  it("is case and whitespace insensitive", () => {
    process.env['BAGS_NETWORK'] = '  MAINNET  ';
    expect(getNetwork()).toBe("mainnet");
  });

  it("throws on an unrecognised value rather than guessing", () => {
    process.env['BAGS_NETWORK'] = 'testnet';
    expect(() => getNetwork()).toThrow('BAGS_NETWORK must be');
  });

  it("does not treat an empty value as mainnet", () => {
    process.env['BAGS_NETWORK'] = '';
    expect(getNetwork()).toBe("devnet");
  });
});

describe("getRpcUrl", () => {
  it("uses the devnet cluster endpoint by default", () => {
    expect(getRpcUrl()).toContain("devnet");
  });

  it("uses the mainnet endpoint when explicitly opted in", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    expect(getRpcUrl()).toContain("mainnet");
  });

  it("prefers SOLANA_RPC_URL when provided", () => {
    process.env['SOLANA_RPC_URL'] = 'https://custom.example/rpc';
    expect(getRpcUrl()).toBe('https://custom.example/rpc');
  });

  it("still honours the legacy HELIUS_RPC_URL name", () => {
    process.env['HELIUS_RPC_URL'] = 'https://helius.example/rpc';
    expect(getRpcUrl()).toBe('https://helius.example/rpc');
  });
});

describe("network / RPC agreement", () => {
  /**
   * Regression: a mainnet HELIUS_RPC_URL with BAGS_NETWORK unset reported
   * "devnet — test funds" while signing against mainnet. Caught by running the
   * binary, not by a unit test — hence these.
   */
  it("refuses a mainnet endpoint while declaring devnet", () => {
    process.env['HELIUS_RPC_URL'] = 'https://mainnet.helius-rpc.com/?api-key=abc';
    expect(() => getRpcUrl()).toThrow('Network mismatch');
  });

  it("refuses a devnet endpoint while declaring mainnet", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com';
    expect(() => getRpcUrl()).toThrow('Network mismatch');
  });

  it("accepts an endpoint that agrees with the declared network", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    process.env['SOLANA_RPC_URL'] = 'https://mainnet.helius-rpc.com/?api-key=abc';
    expect(getRpcUrl()).toContain('mainnet');
  });

  it("takes a hintless endpoint on trust", () => {
    process.env['SOLANA_RPC_URL'] = 'http://localhost:8899';
    expect(getRpcUrl()).toBe('http://localhost:8899');
  });

  it("maps cluster hints from a URL", () => {
    expect(clusterFromUrl('https://api.devnet.solana.com')).toBe('devnet');
    expect(clusterFromUrl('https://mainnet.helius-rpc.com')).toBe('mainnet');
    expect(clusterFromUrl('http://localhost:8899')).toBeNull();
    expect(clusterFromUrl('https://api.testnet.solana.com')).toBeNull();
  });
});

describe("redactedRpcUrl", () => {
  it("strips an api key from the query string", () => {
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com/?api-key=SECRET123';
    const out = redactedRpcUrl();
    expect(out).not.toContain('SECRET123');
    expect(out).toContain('REDACTED');
  });

  it("strips every query parameter, not just the first", () => {
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com/?a=one&b=two';
    const out = redactedRpcUrl();
    expect(out).not.toContain('one');
    expect(out).not.toContain('two');
  });

  it("strips basic-auth credentials", () => {
    process.env['SOLANA_RPC_URL'] = 'https://user:pass@rpc.devnet.example/';
    const out = redactedRpcUrl();
    expect(out).not.toContain('pass');
  });

  it("leaves a credential-free URL readable", () => {
    process.env['SOLANA_RPC_URL'] = 'https://api.devnet.solana.com/';
    expect(redactedRpcUrl()).toBe('https://api.devnet.solana.com/');
  });

  it("does not throw on an unparseable URL", () => {
    process.env['SOLANA_RPC_URL'] = 'not a url';
    expect(redactedRpcUrl()).toContain('unparseable');
  });
});

describe("explorerUrl", () => {
  it("appends the devnet cluster param off mainnet", () => {
    expect(explorerUrl("ABC")).toBe("https://explorer.solana.com/tx/ABC?cluster=devnet");
  });

  it("omits the cluster param on mainnet", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    expect(explorerUrl("ABC")).toBe("https://explorer.solana.com/tx/ABC");
  });
});

describe("networkBanner", () => {
  it("marks mainnet as real funds", () => {
    process.env['BAGS_NETWORK'] = 'mainnet';
    expect(networkBanner()).toContain("MAINNET");
  });

  it("marks devnet as test funds", () => {
    expect(networkBanner()).toContain("devnet");
  });
});
