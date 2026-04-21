/**
 * Shared mock infrastructure for BagOS MCP tool tests.
 *
 * Each tool calls server.tool(name, description, schema, handler).
 * We capture that handler reference so we can invoke it directly in tests.
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

/** Mock the bags-client module to return a fake SDK. */
export function createMockBagsClient() {
  return {
    fee: {
      getAllClaimablePositions: jest.fn().mockResolvedValue([{ token: "SOL", amount: 1.5 }]),
      getClaimTransactions: jest.fn().mockResolvedValue({ signature: "mock-tx-sig" }),
    },
    trade: {
      getQuote: jest.fn().mockResolvedValue({ inputAmount: 1, outputAmount: 500, priceImpact: 0.01 }),
      createSwapTransaction: jest.fn().mockResolvedValue({ signature: "mock-swap-sig" }),
    },
    state: {
      getTopTokensByLifetimeFees: jest.fn().mockResolvedValue([{ creator: "Alice", fees: 100 }]),
      getTokenLifetimeFees: jest.fn().mockResolvedValue({ totalFees: 42 }),
    },
    partner: {
      getPartnerConfigClaimStats: jest.fn().mockResolvedValue({ earnings: 10 }),
    },
    tokenLaunch: {
      createTokenInfoAndMetadata: jest.fn().mockResolvedValue({ tokenMint: "MockMint111" }),
    },
  };
}
