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

const { Executor, SimulationError, ConfirmationFailedError, ConfirmationUnknownError } = await import("../../lib/execute.js");
const { SendTransactionError } = await import("@solana/web3.js");
const bs58 = (await import("bs58")).default;

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

  // The RPC's SimulatedTransactionResponse declares logs as `Array | null`,
  // and some RPC providers omit the field entirely. The contract here is that
  // simulate() normalizes that to exactly null — never undefined — so callers
  // can rely on `logs === null` checks.
  it("normalizes absent logs to null on a successful simulation", async () => {
    mockConnection.simulateTransaction.mockResolvedValue({ value: { err: null } });
    await expect(Executor.simulate(versionedTx())).resolves.toBeNull();
  });

  it("normalizes absent logs to null on a failed simulation", async () => {
    mockConnection.simulateTransaction.mockResolvedValue({ value: { err: "bad" } });
    const err = await Executor.simulate(versionedTx()).then(
      () => { throw new Error("expected simulate to reject"); },
      (e) => e
    );
    expect(err).toBeInstanceOf(SimulationError);
    expect(err.logs).toBeNull();
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

  it("throws ConfirmationUnknownError, with the signature, when confirmation itself throws", async () => {
    mockConnection.confirmTransaction.mockRejectedValue(new Error("block height exceeded"));
    const attempt = Executor.signSendConfirm(versionedTx(), keypair);
    await expect(attempt).rejects.toBeInstanceOf(ConfirmationUnknownError);
    await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toMatchObject({
      signature: "SIG123",
      message: expect.stringContaining("may still land"),
    });
  });

  it("reports a non-Error confirmation failure too", async () => {
    mockConnection.confirmTransaction.mockRejectedValue("rpc down");
    await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toThrow("rpc down");
  });

  describe("when the send call itself throws", () => {
    const sigBytes = new Uint8Array(64).fill(9);

    it("reports an unknown outcome, with the locally known signature", async () => {
      mockConnection.sendRawTransaction.mockRejectedValue(new Error("socket hang up"));
      const tx = { ...versionedTx(), signatures: [sigBytes] };
      await expect(Executor.signSendConfirm(tx, keypair)).rejects.toMatchObject({
        name: "ConfirmationUnknownError",
        signature: bs58.encode(sigBytes),
        message: expect.stringContaining("may still land"),
      });
    });

    it("reads a legacy transaction's signature too", async () => {
      mockConnection.sendRawTransaction.mockRejectedValue("timeout");
      const tx = { ...legacyTx(), signature: sigBytes };
      await expect(Executor.signSendConfirm(tx, keypair)).rejects.toMatchObject({
        signature: bs58.encode(sigBytes),
        message: expect.stringContaining("timeout"),
      });
    });

    it("says so when no signature can be read", async () => {
      mockConnection.sendRawTransaction.mockRejectedValue(new Error("reset"));
      await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toMatchObject({
        signature: "unknown",
        message: expect.stringContaining("recent transactions"),
      });
    });

    const rpcError = (transactionMessage: string) =>
      new SendTransactionError({ action: "simulate", signature: "", transactionMessage, logs: [] });

    it.each([
      "Transaction simulation failed: Blockhash not found",
      "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1",
      "Transaction signature verification failure",
      "invalid transaction: Transaction failed to sanitize accounts offsets correctly",
    ])("treats a pre-forward rejection as definite: %s", async (msg) => {
      const rejection = rpcError(msg);
      mockConnection.sendRawTransaction.mockRejectedValue(rejection);
      await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toBe(rejection);
    });

    it("never treats 'already been processed' as a failure: the transaction landed", async () => {
      mockConnection.sendRawTransaction.mockRejectedValue(
        rpcError("Transaction simulation failed: This transaction has already been processed")
      );
      await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toBeInstanceOf(
        ConfirmationUnknownError
      );
    });

    /* These can arrive after the node already forwarded the bytes. */
    it.each([
      ["-32603 internal error", rpcError("Internal error")],
      ["node is behind", rpcError("Node is behind by 42 slots")],
      ["proxy 502", new Error("502 Bad Gateway: upstream connect error")],
      ["429 after retries", new Error("429 Too Many Requests: {}")],
    ])("treats %s as an unknown outcome", async (_label, err) => {
      mockConnection.sendRawTransaction.mockRejectedValue(err);
      await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.toBeInstanceOf(
        ConfirmationUnknownError
      );
    });

    it("passes an RPC rejection through unchanged, since nothing was forwarded", async () => {
      const rejection = new SendTransactionError({
        action: "send",
        signature: "",
        transactionMessage: "Transaction simulation failed",
        logs: [],
      });
      mockConnection.sendRawTransaction.mockRejectedValue(rejection);
      const attempt = Executor.signSendConfirm(versionedTx(), keypair);
      await expect(attempt).rejects.toBe(rejection);
      await expect(Executor.signSendConfirm(versionedTx(), keypair)).rejects.not.toBeInstanceOf(
        ConfirmationUnknownError
      );
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

  it("does not mutate a versioned transaction, but still bounds confirmation height", async () => {
    const tx = versionedTx();
    tx.message.recentBlockhash = "sdk-blockhash";
    const ctx = await Executor.prepare(tx, keypair);
    // Confirms against the SDK's own blockhash, not a fresher one — otherwise
    // a transaction that landed can be reported as expired.
    expect(ctx.blockhash).toBe("sdk-blockhash");
    expect(ctx.lastValidBlockHeight).toBe(99);
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
