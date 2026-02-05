import { Connection, PublicKey, Keypair } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('8GCsBLbmEhNigfHNjTL3SH3r7HUVjKczsu8aDoF5Tx73');
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

function getEscrowPda(orderId: bigint): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(orderId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buffer],
    PROGRAM_ID
  );
}

function getTreasuryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  );
}

// In MVP, the server authority keypair handles release/refund
function getAuthorityKeypair(): Keypair {
  const key = process.env.SERVER_AUTHORITY_KEY;
  if (!key) throw new Error('SERVER_AUTHORITY_KEY not set');
  return Keypair.fromSecretKey(Buffer.from(JSON.parse(key)));
}

export async function getEscrowInfo(orderId: bigint) {
  const [pda] = getEscrowPda(orderId);
  return { pda: pda.toString() };
}

export async function releaseEscrow(orderId: bigint) {
  // In MVP, this would call the on-chain program
  // For now, log and return the PDA info
  const [escrowPda] = getEscrowPda(orderId);
  const [treasuryPda] = getTreasuryPda();
  console.log(`[escrow] Release escrow for order ${orderId}: ${escrowPda.toString()}`);
  return { escrowPda: escrowPda.toString(), treasuryPda: treasuryPda.toString() };
}

export async function refundEscrow(orderId: bigint) {
  const [escrowPda] = getEscrowPda(orderId);
  const [treasuryPda] = getTreasuryPda();
  console.log(`[escrow] Refund escrow for order ${orderId}: ${escrowPda.toString()}`);
  return { escrowPda: escrowPda.toString(), treasuryPda: treasuryPda.toString() };
}
