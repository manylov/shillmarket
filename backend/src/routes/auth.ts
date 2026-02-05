import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { searchTweets, getUserByUsername } from '../services/twitter';

const router = Router();

const RegisterSchema = z.object({
  role: z.enum(['CLIENT', 'EXECUTOR']),
  walletAddress: z.string().optional(),
});

// POST /auth/register — Create new agent, return API key
router.post('/register', async (req, res) => {
  try {
    const data = RegisterSchema.parse(req.body);
    const apiKey = crypto.randomBytes(32).toString('hex');

    const agent = await prisma.agent.create({
      data: {
        apiKey,
        role: data.role,
        walletAddress: data.walletAddress || null,
      },
    });

    res.status(201).json({
      id: agent.id,
      apiKey,
      role: agent.role,
      walletAddress: agent.walletAddress,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/me — Get current agent info
router.get('/me', authMiddleware, async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.agent!.id },
  });
  res.json(agent);
});

// POST /auth/verify-twitter/start — Start Twitter verification (EXECUTOR only)
router.post('/verify-twitter/start', authMiddleware, requireRole('EXECUTOR'), async (req, res) => {
  const code = crypto.randomBytes(4).toString('hex');
  // Store code temporarily (in production, use Redis with TTL)
  await prisma.agent.update({
    where: { id: req.agent!.id },
    data: { twitterUsername: code }, // temporarily store code in twitterUsername field
  });
  res.json({
    code,
    instruction: `Post a tweet containing this code: ${code} — then call POST /auth/verify-twitter/confirm with your twitterUsername`,
  });
});

const VerifyTwitterSchema = z.object({
  twitterUsername: z.string().min(1),
});

// POST /auth/verify-twitter/confirm — Confirm Twitter verification
router.post('/verify-twitter/confirm', authMiddleware, requireRole('EXECUTOR'), async (req, res) => {
  try {
    const data = VerifyTwitterSchema.parse(req.body);
    const agent = await prisma.agent.findUnique({ where: { id: req.agent!.id } });
    if (!agent || !agent.twitterUsername) {
      res.status(400).json({ error: 'Start verification first' });
      return;
    }
    const code = agent.twitterUsername; // the stored verification code

    // Get user info
    const userInfo = await getUserByUsername(data.twitterUsername);
    const userId = userInfo?.data?.id || userInfo?.id;
    if (!userId) {
      res.status(400).json({ error: 'Twitter user not found' });
      return;
    }

    // Search for tweet with code from this user
    const searchResult = await searchTweets(`from:${data.twitterUsername} ${code}`);
    const tweets = searchResult?.data?.tweets || searchResult?.tweets || [];

    if (tweets.length === 0) {
      res.status(400).json({ error: 'Verification tweet not found. Make sure you posted a tweet containing the code.' });
      return;
    }

    // Verified — update agent
    await prisma.agent.update({
      where: { id: req.agent!.id },
      data: {
        twitterUserId: userId,
        twitterUsername: data.twitterUsername,
        twitterVerified: true,
      },
    });

    res.json({ verified: true, twitterUsername: data.twitterUsername, twitterUserId: userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    console.error('Twitter verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
