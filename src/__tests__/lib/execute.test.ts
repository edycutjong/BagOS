import { jest } from "@jest/globals";

/**
 * Direct tests for the write path. The tool tests mock this module out, so
 * without these the simulate/sign/send/confirm logic — the code that decides
 * whether real funds move — would be entirely unexercised.
 */

const mockConnection = {
  simulateTransaction: jest.fn<any>(),
  getLatestBlockhash: jest.fn<any>(),
  sendRawTransaction: jest.fn<any>(),
  confirmTransaction: jest.fn<any>(),
};

jest.unstable_mockModule("../../lib/network.js", () => ({
  getConnection: () => mockConnection,
  explorerUrl: (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  getNetwork: () => "devnet",
  isMainnet: () => false,
  getRpcUrl: () => "http://localhost:8899",
  resetConnection: () => {},
  networkBanner: () => "🧪 devnet — test funds",
}));

const { Executor, SimulationError, ConfirmationFailedError } = await import("../../lib/execute.js");

const keypair = { publicKey: { toBase58: () => "Wallet111" } } as any;

function versionedTx() {
  return { message: {}, sign: jest.fn(), serialize: jest.fn(() => new Uint8Array([1])) } as any;
}
function legacyTx() {
  return {
    instructions: [],
    feePayer: undefined,
    recentBlockhash: undefined,
    sign: jest.fn(),
    serialize: jest.fn(() => new Uint8Array([2])),
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.simulateTransaction.mockResolvedValue({ value: { err: null, logs: ["ok"] } });
  mockConnection.getLatestBlockhash.mockResolvedValue({ blockhash: "bh", lastValidBlockHeight: 99 });
  mockConnection.sendRawTransaction.mockResolvedValue("SIG123");
  mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null }, context: { slot: 7 } });
});

describe("Executor.simulate", () => {
  it("returns logs when simulation succeeds", async () => {
    await expect(Executor.simulate(versionedTx())).resolves.toEqual(["ok"]);
  });

  it("throws SimulationError when the program errors", async () => {
    mockConnection.simulateTransaction.mockResolvedValue({
      value: { err: { InstructionError: [0, "Custom"] }, logs: ["boom"] },
    });
    await expect(Executor.simulate(versionedTx())).rejects.toThrow(SimulationError);
  });

  it("carries the program logs on the error for debugging", async () => {
    mockConnection.simulateTransaction.mockResolvedValue({
      value: { err: "bad", logs: ["line1", "line2"] },
    });
    await expect(Executor.simulate(versionedTx())).rejects.toMatchObject({
      logs: ["line1", "line2"],
    });
  });
});

describe("Executor.signSendConfirm", () => {
  it("signs a versioned transaction with the keypair array form", async () => {
    const tx = versionedTx();
    await Executor.signSendConfirm(tx, keypair);
    expect(tx.sign).toHaveBeenCalledWith([keypair]);
  });

  it("sets feePayer and blockhash before signing a legacy transaction", async () => {
    const tx = legacyTx();
    await Executor.signSendConfirm(tx, keypair);
    expect(tx.feePayer).toBe(keypair.publicKey);
    expect(tx.recentBlockhash).toBe("bh");
    expect(tx.sign).toHaveBeenCalledWith(keypair);
  });

  it("returns the confirmed signature, explorer link and slot", async () => {
    const result = await Executor.signSendConfirm(versionedTx(), keypair);
    expect(result).toEqual({
      signature: "SIG123",
      explorer: "https://explorer.solana.com/tx/SIG123?cluster=devnet",
      slot: 7,
    });
  });

  it("does not skip preflight when submitting", async () => {
    await Executor.signSendConfirm(versionedTx(), keypair);
    expect(mockConnection.sendRawTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipPreflight: false })
    );
  });

  it("throws ConfirmationFailedError when the tx lands but fails on chain", async () => {
    mockConnection.confirmTransaction.mockResolvedValue({
      value: { err: { InstructionError: [1, "Custom"] } },
      context: { slot: 8 },
    });
    await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toThrow(
      ConfirmationFailedError
    );
  });

  it("includes the signature on a confirmation failure so it can be inspected", async () => {
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: "x" }, context: { slot: 8 } });
    await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toMatchObject({
      signature: "SIG123",
    });
  });

  it("tolerates a missing context slot", async () => {
    mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
    await expect(Executor.signSendConfirm(versionedTx(), keypair)).resolves.toMatchObject({
      slot: null,
    });
  });
});

describe("Executor.prepare", () => {
  /**
   * Regression: executeTransaction simulated before signSendConfirm set the
   * feePayer, so a freshly built legacy Transaction threw
   * "Transaction fee payer required" from compileMessage() and could never be
   * executed. proof:devnet builds exactly such a transaction.
   */
  it("sets feePayer and blockhash on a bare legacy transaction", async () => {
    const tx = legacyTx();
    await Executor.prepare(tx, keypair);
    expect(tx.feePayer).toBe(keypair.publicKey);
    expect(tx.recentBlockhash).toBe("bh");
  });

  it("leaves an already-populated legacy transaction alone", async () => {
    const tx = legacyTx();
    tx.feePayer = "existing";
    tx.recentBlockhash = "existing-bh";
    await Executor.prepare(tx, keypair);
    expect(tx.feePayer).toBe("existing");
    expect(tx.recentBlockhash).toBe("existing-bh");
  });

  it("is a no-op for a versioned transaction", async () => {
    await Executor.prepare(versionedTx(), keypair);
    expect(mockConnection.getLatestBlockhash).not.toHaveBeenCalled();
  });
});

describe("Executor.executeTransaction", () => {
  it("prepares a legacy transaction before simulating it", async () => {
    const tx = legacyTx();
    let feePayerAtSimulation: unknown = "unset";
    mockConnection.simulateTransaction.mockImplementation(async () => {
      feePayerAtSimulation = tx.feePayer;
      return { value: { err: null, logs: [] } };
    });
    await Executor.executeTransaction(tx, keypair);
    expect(feePayerAtSimulation).toBe(keypair.publicKey);
  });

  it("simulates before it sends", async () => {
    await Executor.executeTransaction(versionedTx(), keypair);
    expect(mockConnection.simulateTransaction).toHaveBeenCalled();
    expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
  });

  it("never sends when simulation fails", async () => {
    mockConnection.simulateTransaction.mockResolvedValue({ value: { err: "nope", logs: [] } });
    await expect(Executor.executeTransaction(versionedTx(), keypair)).rejects.toThrow(SimulationError);
    expect(mockConnection.sendRawTransaction).not.toHaveBeenCalled();
  });
});

describe("Executor.executeAll", () => {
  it("executes every transaction in order", async () => {
    const result = await Executor.executeAll([versionedTx(), versionedTx()], keypair);
    expect(result.executed).toHaveLength(2);
    expect(result.failedAt).toBeNull();
    expect(result.error).toBeNull();
  });

  it("stops at the first failure and reports what landed", async () => {
    mockConnection.sendRawTransaction
      .mockResolvedValueOnce("SIG_A")
      .mockRejectedValueOnce(new Error("insufficient funds"));

    const result = await Executor.executeAll([versionedTx(), versionedTx(), versionedTx()], keypair);

    expect(result.executed).toHaveLength(1);
    expect(result.executed[0]!.signature).toBe("SIG_A");
    expect(result.failedAt).toBe(1);
    expect(result.error?.message).toContain("insufficient funds");
    // The third was never attempted.
    expect(mockConnection.sendRawTransaction).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result set for no transactions", async () => {
    await expect(Executor.executeAll([], keypair)).resolves.toEqual({
      executed: [], failedAt: null, error: null,
    });
  });
});
