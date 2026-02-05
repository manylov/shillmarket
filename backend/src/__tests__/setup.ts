import { vi } from 'vitest';

// Mock Prisma client
vi.mock('../lib/prisma', () => {
  const mockPrisma = {
    agent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    campaign: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    offer: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

// Mock Redis
vi.mock('../lib/redis', () => {
  return { default: {} };
});

// Mock BullMQ queue
vi.mock('../lib/queue', () => {
  return {
    verifyOrderQueue: {
      add: vi.fn().mockResolvedValue({}),
    },
    createVerifyOrderWorker: vi.fn().mockReturnValue({
      on: vi.fn(),
    }),
  };
});

// Mock Twitter service
vi.mock('../services/twitter', () => ({
  getTweet: vi.fn(),
  searchTweets: vi.fn(),
  getUserByUsername: vi.fn(),
}));

// Mock Escrow service
vi.mock('../services/escrow', () => ({
  getEscrowInfo: vi.fn().mockResolvedValue({ pda: 'mock-escrow-pda-address' }),
  releaseEscrow: vi.fn().mockResolvedValue({ escrowPda: 'mock-pda', treasuryPda: 'mock-treasury' }),
  refundEscrow: vi.fn().mockResolvedValue({ escrowPda: 'mock-pda', treasuryPda: 'mock-treasury' }),
}));
