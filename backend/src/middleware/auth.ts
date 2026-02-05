import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AgentRole } from '@prisma/client';

// Extend Express Request to include agent
declare global {
  namespace Express {
    interface Request {
      agent?: {
        id: string;
        role: AgentRole;
        walletAddress: string | null;
        twitterUserId: string | null;
        twitterVerified: boolean;
      };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  const agent = await prisma.agent.findUnique({
    where: { apiKey },
    select: {
      id: true,
      role: true,
      walletAddress: true,
      twitterUserId: true,
      twitterVerified: true,
    },
  });

  if (!agent) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.agent = agent;
  next();
}

export function requireRole(...roles: AgentRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.agent) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.agent.role)) {
      res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
