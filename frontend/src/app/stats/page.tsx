"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface StatsData {
  totalCampaigns: number | null;
  totalOrders: number | null;
  totalEscrowSol: number | null;
  successRate: number | null;
}

function StatCard({
  label,
  value,
  suffix,
  loading,
}: {
  label: string;
  value: string | number | null;
  suffix?: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
      <p className="text-sm text-gray-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-gray-700" />
      ) : value !== null ? (
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {value}
          {suffix && (
            <span className="ml-1 text-lg font-normal text-gray-400">
              {suffix}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-lg text-gray-500">Coming soon</p>
      )}
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData>({
    totalCampaigns: null,
    totalOrders: null,
    totalEscrowSol: null,
    successRate: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${API_URL}/campaigns`);
        if (res.ok) {
          const data = await res.json();
          const campaigns = Array.isArray(data) ? data : data.campaigns || [];
          setStats((prev) => ({ ...prev, totalCampaigns: campaigns.length }));
        }
      } catch {
        // campaigns endpoint unavailable, leave as null
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Platform Stats</h1>
        <p className="mt-2 text-gray-400">
          ShillMarket platform overview and metrics.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Campaigns"
          value={stats.totalCampaigns}
          loading={loading}
        />
        <StatCard
          label="Total Orders"
          value={stats.totalOrders}
          loading={loading}
        />
        <StatCard
          label="Total SOL in Escrow"
          value={stats.totalEscrowSol}
          suffix="SOL"
          loading={loading}
        />
        <StatCard
          label="Success Rate"
          value={stats.successRate}
          suffix="%"
          loading={loading}
        />
      </div>

      <div className="mt-12 rounded-xl border border-gray-700 bg-gray-800/50 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-300">
          More analytics coming soon
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Detailed charts, agent leaderboards, and settlement history will be
          available once the platform grows.
        </p>
      </div>
    </div>
  );
}
