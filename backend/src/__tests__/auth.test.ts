import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import app from '../index';

// ---- Helpers ----

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
  };
  return res;
}

// ---- Auth Middleware Tests ----

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no API key is provided', async () => {
    const req = mockReq({ headers: {} });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: 'Missing API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is invalid', async () => {
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(null);

    const req = mockReq({ headers: { 'x-api-key': 'bad-key' } });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(prisma.agent.findUnique).toHaveBeenCalledWith({
      where: { apiKey: 'bad-key' },
      select: {
        id: true,
        role: true,
        walletAddress: true,
        twitterUserId: true,
        twitterVerified: true,
      },
    });
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.agent and calls next when API key is valid', async () => {
    const mockAgent = {
      id: 'agent-1',
      role: 'CLIENT' as const,
      walletAddress: 'wallet-123',
      twitterUserId: null,
      twitterVerified: false,
    };
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(mockAgent as any);

    const req = mockReq({ headers: { 'x-api-key': 'valid-key' } });
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(req.agent).toEqual(mockAgent);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ---- requireRole Tests ----

describe('requireRole', () => {
  it('returns 401 when req.agent is not set', () => {
    const middleware = requireRole('CLIENT');
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: 'Not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when agent has wrong role', () => {
    const middleware = requireRole('CLIENT');
    const req = mockReq();
    (req as any).agent = { id: 'a1', role: 'EXECUTOR' };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res._status).toBe(403);
    expect(res._json).toEqual({ error: 'Requires role: CLIENT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when agent has the required role', () => {
    const middleware = requireRole('EXECUTOR');
    const req = mockReq();
    (req as any).agent = { id: 'a1', role: 'EXECUTOR' };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('accepts multiple roles', () => {
    const middleware = requireRole('CLIENT', 'EXECUTOR');
    const req = mockReq();
    (req as any).agent = { id: 'a1', role: 'EXECUTOR' };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ---- Auth Routes Tests (via supertest) ----

describe('POST /auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a CLIENT agent and returns API key', async () => {
    vi.mocked(prisma.agent.create).mockResolvedValue({
      id: 'new-agent-id',
      apiKey: 'generated-key',
      role: 'CLIENT',
      walletAddress: 'wallet-abc',
      twitterUserId: null,
      twitterUsername: null,
      twitterVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ role: 'CLIENT', walletAddress: 'wallet-abc' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'new-agent-id');
    expect(res.body).toHaveProperty('apiKey');
    expect(res.body).toHaveProperty('role', 'CLIENT');
    expect(res.body).toHaveProperty('walletAddress', 'wallet-abc');
    expect(prisma.agent.create).toHaveBeenCalledOnce();
  });

  it('creates an EXECUTOR agent without wallet', async () => {
    vi.mocked(prisma.agent.create).mockResolvedValue({
      id: 'exec-id',
      apiKey: 'exec-key',
      role: 'EXECUTOR',
      walletAddress: null,
      twitterUserId: null,
      twitterUsername: null,
      twitterVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ role: 'EXECUTOR' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('role', 'EXECUTOR');
    expect(res.body.walletAddress).toBeNull();
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid input');
  });

  it('returns 400 for missing role', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid input');
  });
});

describe('GET /auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing API key' });
  });

  it('returns 401 with invalid API key', async () => {
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .get('/auth/me')
      .set('x-api-key', 'invalid');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid API key' });
  });

  it('returns agent info with valid API key', async () => {
    const agentData = {
      id: 'agent-1',
      apiKey: 'valid-key',
      role: 'CLIENT' as const,
      walletAddress: 'wallet-123',
      twitterUserId: null,
      twitterUsername: null,
      twitterVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // First call from authMiddleware (select subset), second from route handler (full)
    vi.mocked(prisma.agent.findUnique)
      .mockResolvedValueOnce({
        id: agentData.id,
        role: agentData.role,
        walletAddress: agentData.walletAddress,
        twitterUserId: null,
        twitterVerified: false,
      } as any)
      .mockResolvedValueOnce(agentData as any);

    const res = await request(app)
      .get('/auth/me')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'agent-1');
    expect(res.body).toHaveProperty('role', 'CLIENT');
  });
});
