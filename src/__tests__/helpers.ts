/**
 * Shared mock infrastructure for BagOS MCP tool tests.
 *
 * Each tool calls server.tool(name, description, schema, handler).
 * We capture that handler reference so we can invoke it directly in tests.
 *
 * NOTE ON MOCK FIDELITY: these mocks return the shapes the real @bagsfm/bags-sdk
 * returns, verified against its .d.ts files. The previous version of this file
 * mocked `createSwapTransaction` as resolving to `{ signature }` — a shape the
 * SDK never produces — which is how a write path that never signed or sent
 * anything passed a 100%-coverage suite. If you change a mock here, check it
 * against node_modules/@bagsfm/bags-sdk/dist/types/*.d.ts first.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jest } from "@jest/globals";

/** Creates a mock McpServer that records registered tool handlers. */
export function createMockServer() {
  const handlers: { [key: string]: (args: any) => Promise<any> } = {};

  const server = {
    tool: jest.fn((_name: string, _desc: string, _schema: any, handler: any) => {
      handlers[_name] = handler;
    }),
  } as unknown as McpServer;

  /** Type-safe handler accessor with runtime assertion. */
  const getHandler = (name: string) => {
    const h = handlers[name];
    if (!h) throw new Error(`Tool "${name}" was not registered`);
    return h;
  };

  return { server, handlers, getHandler };
}

/** A stand-in for VersionedTransaction — enough surface for the execute layer. */
export function fakeVersionedTransaction() {
  return {
    message: {},
    sign: jest.fn(),
    serialize: jest.fn(() => new Uint8Array([1, 2, 3])),
  };
}

/** A stand-in for a legacy Transaction (what getClaimTransactions returns). */
export function fakeLegacyTransaction() {
  return {
    instructions: [],
    feePayer: undefined,
    recentBlockhash: undefined,
    sign: jest.fn(),
    serialize: jest.fn(() => new Uint8Array([4, 5, 6])),
  };
}

/**
 * Mock the bags-client module to return a fake SDK.
 * Shapes match the real SDK's declared return types.
 */
export function createMockBagsClient() {
  return {
    fee: {
      getAllClaimablePositions: jest.fn<any>().mockResolvedValue([{ token: "SOL", amount: 1.5 }]),
      // Real signature: (wallet, tokenMint) => Promise<Array<Transaction>>
      getClaimTransactions: jest.fn<any>().mockResolvedValue([fakeLegacyTransaction()]),
    },
    trade: {
      // Real signature: => Promise<TradeQuoteResponse>
      getQuote: jest.fn<any>().mockResolvedValue({
        inAmount: "100000000",
        outAmount: "500000000",
        minOutAmount: "485000000",
        otherAmountThreshold: "485000000",
        inputMint: "So11111111111111111111111111111111111111112",
        contextSlot: 1,
      }),
      // Real signature: => Promise<CreateSwapTransactionResult>
      createSwapTransaction: jest.fn<any>().mockResolvedValue({
        transaction: fakeVersionedTransaction(),
        computeUnitLimit: 200_000,
        lastValidBlockHeight: 1000,
        prioritizationFeeLamports: 5000,
      }),
    },
    state: {
      getTopTokensByLifetimeFees: jest.fn<any>().mockResolvedValue([{ creator: "Alice", fees: 100 }]),
      getTokenLifetimeFees: jest.fn<any>().mockResolvedValue({ totalFees: 42 }),
    },
    partner: {
      getPartnerConfigClaimStats: jest.fn<any>().mockResolvedValue({ earnings: 10 }),
    },
    tokenLaunch: {
      // Real signature: => Promise<CreateTokenInfoResponse>
      createTokenInfoAndMetadata: jest.fn<any>().mockResolvedValue({
        tokenMint: "MockMint111",
        tokenMetadata: "https://example.test/metadata.json",
        tokenLaunch: {},
      }),
    },
  };
}

/** Env needed for the write tools to get past configuration checks. */
export function setWriteToolEnv() {
  process.env['BAGS_API_KEY'] = 'test-key';
  process.env['BOS_TOKEN_MINT'] = 'EkJuyYyD3to61CHVPJn6wHb7xANxvqApnVJ4o2SdBAGS';
  process.env['BOS_REQUIRED_BALANCE'] = '10000';
  process.env['BAGS_KEYPAIR_PATH'] = '/tmp/bagos-test-keypair.json';
  delete process.env['BAGS_NETWORK'];
  delete process.env['BAGS_ALLOW_UNCONFIRMED'];
  delete process.env['BAGS_MAX_SOL_PER_TX'];
  delete process.env['BAGS_MAX_SOL_PER_SESSION'];
}

/** Pull the confirmation token out of a preview response. */
export function tokenFrom(result: any): string {
  const text = result?.content?.[0]?.text ?? '';
  const match = text.match(/confirm:\s*"([^"]+)"/);
  if (!match) throw new Error(`No confirmation token in response:\n${text}`);
  return match[1];
}
