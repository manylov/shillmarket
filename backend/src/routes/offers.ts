import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getEscrowInfo } from '../services/escrow';

const router = Router();

const SubmitOfferSchema = z.object({
  draftText: z.string().min(1),
  price: z.number().positive(),
});

const RejectOfferSchema = z.object({
  feedback: z.string().optional(),
});

// POST /campaigns/:campaignId/offers — Submit offer (EXECUTOR only)
router.post('/campaigns/:campaignId/offers', authMiddleware, requireRole('EXECUTOR'), async (req, res) => {
  try {
    if (!req.agent!.twitterVerified) {
      res.status(403).json({ error: 'Twitter account must be verified first' });
      return;
    }
    const campaignId = req.params.campaignId as string;
    const data = SubmitOfferSchema.parse(req.body);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'ACTIVE') {
      res.status(404).json({ error: 'Campaign not found or not active' });
      return;
    }
    if (BigInt(data.price) > campaign.maxPrice) {
      res.status(400).json({ error: 'Price exceeds campaign max price' });
      return;
    }
    const offer = await prisma.offer.create({
      data: {
        campaignId,
        executorId: req.agent!.id,
        draftText: data.draftText,
        price: BigInt(data.price),
      },
    });
    res.status(201).json({ ...offer, price: offer.price.toString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    console.error('Submit offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /campaigns/:campaignId/offers — List offers for a campaign
router.get('/campaigns/:campaignId/offers', authMiddleware, async (req, res) => {
  const campaignId = req.params.campaignId as string;
  const offers = await prisma.offer.findMany({
    where: { campaignId },
    include: { executor: { select: { id: true, twitterUsername: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(offers.map(o => ({ ...o, price: o.price.toString() })));
});

// POST /offers/:id/accept — Accept offer, create order (CLIENT only)
router.post('/offers/:id/accept', authMiddleware, requireRole('CLIENT'), async (req, res) => {
  try {
    const offerId = req.params.id as string;
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { campaign: true },
    });
    if (!offer || offer.status !== 'PENDING') {
      res.status(404).json({ error: 'Offer not found or not pending' });
      return;
    }
    if (offer.campaign.clientId !== req.agent!.id) {
      res.status(403).json({ error: 'Not your campaign' });
      return;
    }

    // Generate sequential on-chain order ID
    const lastOrder = await prisma.order.findFirst({ orderBy: { orderId: 'desc' } });
    const nextOrderId = (lastOrder?.orderId ?? 0n) + 1n;

    const escrowInfo = await getEscrowInfo(nextOrderId);

    // Create order and update offer in a transaction
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          campaignId: offer.campaignId,
          offerId: offer.id,
          clientId: req.agent!.id,
          executorId: offer.executorId,
          orderId: nextOrderId,
          amount: offer.price,
          status: 'ACCEPTED',
          escrowPda: escrowInfo.pda,
        },
      }),
      prisma.offer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.campaign.update({
        where: { id: offer.campaignId },
        data: { filled: { increment: 1 } },
      }),
    ]);

    res.status(201).json({
      ...order,
      orderId: order.orderId.toString(),
      amount: order.amount.toString(),
    });
  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /offers/:id/reject — Reject offer (CLIENT only)
router.post('/offers/:id/reject', authMiddleware, requireRole('CLIENT'), async (req, res) => {
  try {
    const offerId = req.params.id as string;
    const data = RejectOfferSchema.parse(req.body);
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { campaign: true },
    });
    if (!offer || offer.status !== 'PENDING') {
      res.status(404).json({ error: 'Offer not found or not pending' });
      return;
    }
    if (offer.campaign.clientId !== req.agent!.id) {
      res.status(403).json({ error: 'Not your campaign' });
      return;
    }
    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: 'REJECTED', feedback: data.feedback },
    });
    res.json({ ...updated, price: updated.price.toString() });
  } catch (error) {
    console.error('Reject offer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
