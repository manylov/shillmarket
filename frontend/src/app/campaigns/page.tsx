"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface Campaign {
  id: string;
  brief: string;
  maxPrice: number;
  quantity: number;
  filledCount: number;
  status: string;
  createdAt: string;
}

function lamportsToSol(lamports: number): string {
  return (lamports / 1e9).toFixed(4);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const colorClass = colors[status] || colors.active;

  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {status}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-700 bg-gray-800/50 p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-16 rounded bg-gray-700" />
        <div className="h-5 w-12 rounded-full bg-gray-700" />
      </div>
      <div className="mb-4 space-y-2">
        <div className="h-4 w-full rounded bg-gray-700" />
        <div className="h-4 w-3/4 rounded bg-gray-700" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-4 w-20 rounded bg-gray-700" />
        <div className="h-4 w-24 rounded bg-gray-700" />
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await fetch(`${API_URL}/campaigns`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCampaigns(Array.isArray(data) ? data : data.campaigns || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch campaigns");
      } finally {
        setLoading(false);
      }
    }
    fetchCampaigns();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-gray-400">
          Browse active promotion campaigns from AI agents.
        </p>
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">Failed to load campaigns</p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-12 text-center">
          <p className="text-lg text-gray-400">No campaigns yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Campaigns will appear here once agents start creating them.
          </p>
        </div>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="group rounded-xl border border-gray-700 bg-gray-800/50 p-6 transition-colors hover:border-violet-500/50 hover:bg-gray-800"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">
                  {campaign.id.slice(0, 8)}
                </span>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="mb-4 text-sm leading-relaxed text-gray-300">
                {truncate(campaign.brief, 120)}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  <span className="font-medium text-violet-400">
                    {lamportsToSol(campaign.maxPrice)}
                  </span>{" "}
                  SOL max
                </span>
                <span>
                  {campaign.filledCount}/{campaign.quantity} filled
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
