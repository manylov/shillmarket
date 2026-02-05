import { Job } from 'bullmq';
import prisma from '../lib/prisma';
import { getTweet } from '../services/twitter';
import { releaseEscrow, refundEscrow } from '../services/escrow';

interface VerifyOrderData {
  orderId: string;
}

export async function processVerifyOrder(job: Job<VerifyOrderData>) {
  const { orderId } = job.data;
  console.log(`[verify] Processing order ${orderId}`);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      campaign: true,
      executor: true,
    },
  });

  if (!order || order.status !== 'POSTED') {
    console.log(`[verify] Order ${orderId} skipped: status=${order?.status}`);
    return;
  }

  const verifyResult: Record<string, any> = {
    checks: {},
    passed: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Check tweet exists
    const tweetResponse = await getTweet(order.tweetId!);
    const tweets = tweetResponse?.data?.tweets || tweetResponse?.tweets || [];
    const tweet = tweets[0];

    if (!tweet) {
      verifyResult.checks.exists = false;
      verifyResult.reason = 'Tweet not found';
      await failOrder(order.id, verifyResult, order.orderId);
      return;
    }
    verifyResult.checks.exists = true;

    // 2. Check author matches verified account
    const authorId = tweet.author?.id || tweet.author_id;
    if (authorId !== order.executor.twitterUserId) {
      verifyResult.checks.author = false;
      verifyResult.reason = 'Author mismatch';
      await failOrder(order.id, verifyResult, order.orderId);
      return;
    }
    verifyResult.checks.author = true;

    // 3. Check required links
    const tweetText = tweet.text || '';
    const allLinksPresent = order.campaign.requiredLinks.every(
      (link: string) => tweetText.includes(link)
    );
    verifyResult.checks.requiredLinks = allLinksPresent;
    if (!allLinksPresent) {
      verifyResult.reason = 'Missing required links';
      await failOrder(order.id, verifyResult, order.orderId);
      return;
    }

    // 4. Check disclosure text
    const hasDisclosure = tweetText.includes(order.campaign.disclosureText);
    verifyResult.checks.disclosure = hasDisclosure;
    if (!hasDisclosure) {
      verifyResult.reason = 'Missing disclosure text';
      await failOrder(order.id, verifyResult, order.orderId);
      return;
    }

    // All checks passed — release escrow
    verifyResult.passed = true;
    await releaseEscrow(order.orderId);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        escrowStatus: 'RELEASED',
        verifiedAt: new Date(),
        verifyResult,
      },
    });

    console.log(`[verify] Order ${orderId} PASSED — escrow released`);
  } catch (error) {
    console.error(`[verify] Error verifying order ${orderId}:`, error);
    verifyResult.reason = 'Verification error';
    verifyResult.error = String(error);
    // On error, don't change status — will be retried
    throw error;
  }
}

async function failOrder(orderId: string, verifyResult: Record<string, any>, onChainOrderId: bigint) {
  await refundEscrow(onChainOrderId);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'FAILED',
      escrowStatus: 'REFUNDED',
      verifiedAt: new Date(),
      verifyResult,
    },
  });
  console.log(`[verify] Order ${orderId} FAILED — ${verifyResult.reason}`);
}
