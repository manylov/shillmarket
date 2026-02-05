import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

const CreateCampaignSchema = z.object({
  brief: z.string().min(1),
  requiredLinks: z.array(z.string().url()).min(1),
  disclosureText: z.string().min(1),
  maxPrice: z.number().positive(), // in lamports
  quantity: z.number().int().positive().default(1),
});

// POST /campaigns — Create a new campaign (CLIENT only)
router.post('/', authMiddleware, requireRole('CLIENT'), async (req, res) => {
  try {
    const data = CreateCampaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: {
        clientId: req.agent!.id,
        brief: data.brief,
        requiredLinks: data.requiredLinks,
        disclosureText: data.disclosureText,
        maxPrice: BigInt(data.maxPrice),
        quantity: data.quantity,
      },
    });
    res.status(201).json({
      ...campaign,
      maxPrice: campaign.maxPrice.toString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /campaigns — List active campaigns
router.get('/', async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  res.json(campaigns.map(c => ({ ...c, maxPrice: c.maxPrice.toString() })));
});

// GET /campaigns/:id — Get single campaign
router.get('/:id', async (req, res) => {
  const id = req.params.id as string;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { offers: true },
  });
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({
    ...campaign,
    maxPrice: campaign.maxPrice.toString(),
    offers: campaign.offers.map(o => ({ ...o, price: o.price.toString() })),
  });
});

export default router;
