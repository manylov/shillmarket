import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Shillmarket } from "../target/types/shillmarket";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";

describe("shillmarket", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Shillmarket as Program<Shillmarket>;
  
  const authority = provider.wallet;
  let treasuryPda: PublicKey;
  let treasuryBump: number;
  
  const orderId = new anchor.BN(1);
  const amount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL
  const feeBps = 300; // 3%

  const executor = Keypair.generate();
  const client = Keypair.generate();
  
  let escrowPda: PublicKey;
  let escrowBump: number;

  before(async () => {
    // Calculate PDAs
    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    [escrowPda, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), orderId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Airdrop SOL to client for testing
    const sig = await provider.connection.requestAirdrop(
      client.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("Initializes treasury", async () => {
    await program.methods
      .initializeTreasury(feeBps)
      .accounts({
        treasury: treasuryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const treasuryAccount = await program.account.treasury.fetch(treasuryPda);
    expect(treasuryAccount.authority.toString()).to.equal(authority.publicKey.toString());
    expect(treasuryAccount.feeBps).to.equal(feeBps);
  });

  it("Creates escrow", async () => {
    await program.methods
      .createEscrow(orderId, amount, feeBps)
      .accounts({
        escrow: escrowPda,
        client: client.publicKey,
        executor: executor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(escrowPda);
    expect(escrowAccount.orderId.toNumber()).to.equal(1);
    expect(escrowAccount.client.toString()).to.equal(client.publicKey.toString());
    expect(escrowAccount.executor.toString()).to.equal(executor.publicKey.toString());
    expect(escrowAccount.amount.toNumber()).to.equal(1 * LAMPORTS_PER_SOL);
    expect(escrowAccount.feeBps).to.equal(feeBps);
    expect(escrowAccount.status).to.deep.equal({ locked: {} });
  });

  it("Releases escrow to executor with fee", async () => {
    const executorBalanceBefore = await provider.connection.getBalance(executor.publicKey);
    const treasuryBalanceBefore = await provider.connection.getBalance(treasuryPda);

    await program.methods
      .releaseEscrow(orderId)
      .accounts({
        escrow: escrowPda,
        treasury: treasuryPda,
        authority: authority.publicKey,
        executor: executor.publicKey,
      })
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(escrowPda);
    expect(escrowAccount.status).to.deep.equal({ released: {} });

    const executorBalanceAfter = await provider.connection.getBalance(executor.publicKey);
    const treasuryBalanceAfter = await provider.connection.getBalance(treasuryPda);

    const fee = Math.floor((1 * LAMPORTS_PER_SOL * feeBps) / 10000);
    const executorPayment = 1 * LAMPORTS_PER_SOL - fee;

    expect(executorBalanceAfter - executorBalanceBefore).to.equal(executorPayment);
    expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(fee);
  });

  // Test refund with a separate order
  describe("Refund flow", () => {
    const refundOrderId = new anchor.BN(2);
    let refundEscrowPda: PublicKey;
    const refundAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

    before(async () => {
      [refundEscrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), refundOrderId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );
    });

    it("Creates escrow for refund test", async () => {
      await program.methods
        .createEscrow(refundOrderId, refundAmount, feeBps)
        .accounts({
          escrow: refundEscrowPda,
          client: client.publicKey,
          executor: executor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([client])
        .rpc();
    });

    it("Refunds escrow to client", async () => {
      const clientBalanceBefore = await provider.connection.getBalance(client.publicKey);

      await program.methods
        .refundEscrow(refundOrderId)
        .accounts({
          escrow: refundEscrowPda,
          treasury: treasuryPda,
          authority: authority.publicKey,
          client: client.publicKey,
        })
        .rpc();

      const escrowAccount = await program.account.escrowAccount.fetch(refundEscrowPda);
      expect(escrowAccount.status).to.deep.equal({ refunded: {} });

      const clientBalanceAfter = await provider.connection.getBalance(client.publicKey);
      expect(clientBalanceAfter - clientBalanceBefore).to.equal(0.5 * LAMPORTS_PER_SOL);
    });
  });

  it("Fails to release an already-released escrow", async () => {
    try {
      await program.methods
        .releaseEscrow(orderId)
        .accounts({
          escrow: escrowPda,
          treasury: treasuryPda,
          authority: authority.publicKey,
          executor: executor.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("EscrowNotLocked");
    }
  });
});
