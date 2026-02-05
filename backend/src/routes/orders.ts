import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { verifyOrderQueue } from '../lib/queue';

const router = Router();

const SubmitProofSchema = z.object({
  tweetId: z.string().min(1),
  tweetUrl: z.string().url(),
});

// GET /orders/:id — Get order status
router.get('/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      campaign: true,
      offer: true,
    },
  });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  // Only client or executor can view
  if (order.clientId !== req.agent!.id && order.executorId !== req.agent!.id) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }
  res.json({
    ...order,
    orderId: order.orderId.toString(),
    amount: order.amount.toString(),
    campaign: { ...order.campaign, maxPrice: order.campaign.maxPrice.toString() },
    offer: { ...order.offer, price: order.offer.price.toString() },
  });
});

// POST /orders/:id/proof — Submit tweet proof (EXECUTOR only)
router.post('/:id/proof', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const data = SubmitProofSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.executorId !== req.agent!.id) {
      res.status(403).json({ error: 'Not your order' });
      return;
    }
    if (!['ACCEPTED', 'ESCROW_FUNDED'].includes(order.status)) {
      res.status(400).json({ error: `Cannot submit proof in status: ${order.status}` });
      return;
    }

    const now = new Date();
    const verifyAt = new Date(now.getTime() + order.retentionWindow * 1000);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        tweetId: data.tweetId,
        tweetUrl: data.tweetUrl,
        postedAt: now,
        verifyAt,
        status: 'POSTED',
      },
    });

    // Schedule verification job
    await verifyOrderQueue.add(
      'verify',
      { orderId: order.id },
      { delay: order.retentionWindow * 1000 }
    );

    res.json({
      ...updated,
      orderId: updated.orderId.toString(),
      amount: updated.amount.toString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.issues });
      return;
    }
    console.error('Submit proof error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /orders — List my orders
router.get('/', authMiddleware, async (req, res) => {
  const where = req.agent!.role === 'CLIENT'
    ? { clientId: req.agent!.id }
    : { executorId: req.agent!.id };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders.map(o => ({
    ...o,
    orderId: o.orderId.toString(),
    amount: o.amount.toString(),
  })));
});

export default router;
