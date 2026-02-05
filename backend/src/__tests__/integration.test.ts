import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../lib/prisma';
import { getEscrowInfo } from '../services/escrow';
import { verifyOrderQueue } from '../lib/queue';
import app from '../index';

// ---- Test data factories ----

function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-client-1',
    apiKey: 'client-api-key',
    role: 'CLIENT' as const,
    walletAddress: 'wallet-client',
    twitterUserId: null,
    twitterUsername: null,
    twitterVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCampaign(overrides: Record<string, any> = {}) {
  return {
    id: 'campaign-1',
    clientId: 'agent-client-1',
    brief: 'Promote our token launch',
    requiredLinks: ['https://example.com/token'],
    disclosureText: '#ad',
    maxPrice: BigInt(1_000_000),
    quantity: 5,
    filled: 0,
    status: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOffer(overrides: Record<string, any> = {}) {
  return {
    id: 'offer-1',
    campaignId: 'campaign-1',
    executorId: 'agent-exec-1',
    draftText: 'Check out this amazing token! https://example.com/token #ad',
    price: BigInt(500_000),
    status: 'PENDING' as const,
    feedback: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'order-1',
    campaignId: 'campaign-1',
    offerId: 'offer-1',
    clientId: 'agent-client-1',
    executorId: 'agent-exec-1',
    orderId: BigInt(1),
    amount: BigInt(500_000),
    feeBps: 300,
    status: 'ACCEPTED' as const,
    escrowPda: 'mock-escrow-pda-address',
    escrowStatus: null,
    escrowTxSignature: null,
    releaseTxSignature: null,
    refundTxSignature: null,
    tweetId: null,
    tweetUrl: null,
    postedAt: null,
    retentionWindow: 300,
    verifyAt: null,
    verifiedAt: null,
    verifyResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper: mock authMiddleware to authenticate as a given agent
function mockAuthForAgent(agentData: Record<string, any>) {
  vi.mocked(prisma.agent.findUnique).mockImplementation(((args: any) => {
    if (args?.where?.apiKey) {
      return Promise.resolve({
        id: agentData.id,
        role: agentData.role,
        walletAddress: agentData.walletAddress,
        twitterUserId: agentData.twitterUserId,
        twitterVerified: agentData.twitterVerified,
      });
    }
    if (args?.where?.id) {
      return Promise.resolve(agentData);
    }
    return Promise.resolve(null);
  }) as any);
}

// ---- Integration: Full Happy Path ----

describe('Full happy path integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Step 1: Register a CLIENT agent', async () => {
    const clientAgent = makeAgent();
    vi.mocked(prisma.agent.create).mockResolvedValue(clientAgent as any);

    const res = await request(app)
      .post('/auth/register')
      .send({ role: 'CLIENT', walletAddress: 'wallet-client' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('CLIENT');
    expect(res.body).toHaveProperty('apiKey');
    expect(res.body).toHaveProperty('id');
  });

  it('Step 2: Register an EXECUTOR agent', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      apiKey: 'exec-api-key',
      role: 'EXECUTOR',
      twitterVerified: true,
      twitterUserId: 'tw-123',
      twitterUsername: 'shillbot',
    });
    vi.mocked(prisma.agent.create).mockResolvedValue(execAgent as any);

    const res = await request(app)
      .post('/auth/register')
      .send({ role: 'EXECUTOR' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('EXECUTOR');
  });

  it('Step 3: CLIENT creates a campaign', async () => {
    const clientAgent = makeAgent();
    mockAuthForAgent(clientAgent);

    const campaign = makeCampaign();
    vi.mocked(prisma.campaign.create).mockResolvedValue(campaign as any);

    const res = await request(app)
      .post('/campaigns')
      .set('x-api-key', 'client-api-key')
      .send({
        brief: 'Promote our token launch',
        requiredLinks: ['https://example.com/token'],
        disclosureText: '#ad',
        maxPrice: 1_000_000,
        quantity: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'campaign-1');
    expect(res.body.maxPrice).toBe('1000000');
    expect(prisma.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'agent-client-1',
        brief: 'Promote our token launch',
        requiredLinks: ['https://example.com/token'],
        disclosureText: '#ad',
        maxPrice: BigInt(1_000_000),
        quantity: 5,
      }),
    });
  });

  it('Step 4: EXECUTOR submits an offer for the campaign', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      apiKey: 'exec-api-key',
      role: 'EXECUTOR',
      twitterVerified: true,
      twitterUserId: 'tw-123',
    });
    mockAuthForAgent(execAgent);

    const campaign = makeCampaign();
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as any);

    const offer = makeOffer();
    vi.mocked(prisma.offer.create).mockResolvedValue(offer as any);

    const res = await request(app)
      .post('/campaigns/campaign-1/offers')
      .set('x-api-key', 'exec-api-key')
      .send({
        draftText: 'Check out this amazing token! https://example.com/token #ad',
        price: 500_000,
      });

    expect(res.status).toBe(201);
    expect(res.body.price).toBe('500000');
    expect(res.body.campaignId).toBe('campaign-1');
  });

  it('Step 5: CLIENT accepts the offer (creates an order)', async () => {
    const clientAgent = makeAgent();
    mockAuthForAgent(clientAgent);

    const campaign = makeCampaign();
    const offer = makeOffer({ campaign });
    vi.mocked(prisma.offer.findUnique).mockResolvedValue(offer as any);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null); // no previous orders

    const order = makeOrder();
    vi.mocked(prisma.$transaction).mockResolvedValue([order] as any);

    const res = await request(app)
      .post('/offers/offer-1/accept')
      .set('x-api-key', 'client-api-key');

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBe('1');
    expect(res.body.amount).toBe('500000');
    expect(res.body.escrowPda).toBe('mock-escrow-pda-address');
    expect(getEscrowInfo).toHaveBeenCalledWith(1n);
  });

  it('Step 6: EXECUTOR submits tweet proof', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      apiKey: 'exec-api-key',
      role: 'EXECUTOR',
      twitterVerified: true,
      twitterUserId: 'tw-123',
    });
    mockAuthForAgent(execAgent);

    const order = makeOrder({ status: 'ESCROW_FUNDED' });
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as any);

    const updatedOrder = makeOrder({
      status: 'POSTED',
      tweetId: '1234567890',
      tweetUrl: 'https://twitter.com/shillbot/status/1234567890',
      postedAt: new Date(),
    });
    vi.mocked(prisma.order.update).mockResolvedValue(updatedOrder as any);

    const res = await request(app)
      .post('/orders/order-1/proof')
      .set('x-api-key', 'exec-api-key')
      .send({
        tweetId: '1234567890',
        tweetUrl: 'https://twitter.com/shillbot/status/1234567890',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('POSTED');
    expect(res.body.tweetId).toBe('1234567890');

    // Verify BullMQ job was scheduled
    expect(verifyOrderQueue.add).toHaveBeenCalledWith(
      'verify',
      { orderId: 'order-1' },
      { delay: 300 * 1000 },
    );
  });
});

// ---- Edge cases / error paths ----

describe('Campaign creation validations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for missing required fields', async () => {
    const clientAgent = makeAgent();
    mockAuthForAgent(clientAgent);

    const res = await request(app)
      .post('/campaigns')
      .set('x-api-key', 'client-api-key')
      .send({ brief: 'Test' }); // missing requiredLinks, disclosureText, maxPrice

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid input');
  });

  it('returns 403 when EXECUTOR tries to create campaign', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
    });
    mockAuthForAgent(execAgent);

    const res = await request(app)
      .post('/campaigns')
      .set('x-api-key', 'exec-api-key')
      .send({
        brief: 'Test',
        requiredLinks: ['https://example.com'],
        disclosureText: '#ad',
        maxPrice: 1000,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requires role');
  });
});

describe('Offer submission validations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when executor is not twitter-verified', async () => {
    const unverifiedExec = makeAgent({
      id: 'agent-exec-2',
      role: 'EXECUTOR',
      twitterVerified: false,
    });
    mockAuthForAgent(unverifiedExec);

    const res = await request(app)
      .post('/campaigns/campaign-1/offers')
      .set('x-api-key', 'exec-api-key')
      .send({ draftText: 'Test tweet', price: 500 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Twitter account must be verified');
  });

  it('returns 400 when offer price exceeds campaign max price', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(execAgent);

    const campaign = makeCampaign({ maxPrice: BigInt(100) });
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as any);

    const res = await request(app)
      .post('/campaigns/campaign-1/offers')
      .set('x-api-key', 'exec-api-key')
      .send({ draftText: 'Test tweet', price: 200 }); // exceeds maxPrice of 100

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Price exceeds');
  });

  it('returns 404 when campaign does not exist', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(execAgent);

    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/campaigns/nonexistent/offers')
      .set('x-api-key', 'exec-api-key')
      .send({ draftText: 'Test tweet', price: 500 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });
});

describe('Offer accept validations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when offer does not exist', async () => {
    const clientAgent = makeAgent();
    mockAuthForAgent(clientAgent);

    vi.mocked(prisma.offer.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/offers/nonexistent/accept')
      .set('x-api-key', 'client-api-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 403 when another client tries to accept', async () => {
    const otherClient = makeAgent({ id: 'other-client' });
    mockAuthForAgent(otherClient);

    const campaign = makeCampaign({ clientId: 'agent-client-1' }); // different client
    const offer = makeOffer({ campaign });
    vi.mocked(prisma.offer.findUnique).mockResolvedValue(offer as any);

    const res = await request(app)
      .post('/offers/offer-1/accept')
      .set('x-api-key', 'client-api-key');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not your campaign');
  });
});

describe('Order proof submission validations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when order does not exist', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(execAgent);

    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/orders/nonexistent/proof')
      .set('x-api-key', 'exec-api-key')
      .send({
        tweetId: '123',
        tweetUrl: 'https://twitter.com/user/status/123',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 403 when wrong executor submits proof', async () => {
    const wrongExec = makeAgent({
      id: 'wrong-exec',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(wrongExec);

    const order = makeOrder({ executorId: 'agent-exec-1' }); // different executor
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as any);

    const res = await request(app)
      .post('/orders/order-1/proof')
      .set('x-api-key', 'exec-api-key')
      .send({
        tweetId: '123',
        tweetUrl: 'https://twitter.com/user/status/123',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not your order');
  });

  it('returns 400 when order is in wrong status for proof', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(execAgent);

    const order = makeOrder({ status: 'POSTED' }); // already posted
    vi.mocked(prisma.order.findUnique).mockResolvedValue(order as any);

    const res = await request(app)
      .post('/orders/order-1/proof')
      .set('x-api-key', 'exec-api-key')
      .send({
        tweetId: '123',
        tweetUrl: 'https://twitter.com/user/status/123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot submit proof');
  });

  it('returns 400 for invalid proof data', async () => {
    const execAgent = makeAgent({
      id: 'agent-exec-1',
      role: 'EXECUTOR',
      twitterVerified: true,
    });
    mockAuthForAgent(execAgent);

    const res = await request(app)
      .post('/orders/order-1/proof')
      .set('x-api-key', 'exec-api-key')
      .send({ tweetId: '' }); // missing tweetUrl, empty tweetId

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid input');
  });
});

describe('GET /campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active campaigns without auth', async () => {
    const campaigns = [
      makeCampaign({ id: 'c1' }),
      makeCampaign({ id: 'c2' }),
    ];
    vi.mocked(prisma.campaign.findMany).mockResolvedValue(campaigns as any);

    const res = await request(app).get('/campaigns');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // maxPrice should be stringified
    expect(typeof res.body[0].maxPrice).toBe('string');
  });
});

describe('GET /orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists orders for authenticated CLIENT', async () => {
    const clientAgent = makeAgent();
    mockAuthForAgent(clientAgent);

    const orders = [makeOrder()];
    vi.mocked(prisma.order.findMany).mockResolvedValue(orders as any);

    const res = await request(app)
      .get('/orders')
      .set('x-api-key', 'client-api-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].orderId).toBe('1');
    expect(res.body[0].amount).toBe('500000');
  });
});

describe('Health check', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'shillmarket-backend' });
  });
});
