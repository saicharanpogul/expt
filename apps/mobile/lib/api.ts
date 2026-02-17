/**
 * Indexer API client for the mobile app.
 *
 * Fetches data from the Expt indexer REST API.
 * Falls back to a configurable URL.
 */

const API_BASE = process.env.EXPO_PUBLIC_INDEXER_URL || "http://localhost:4000";

export interface Experiment {
  address: string;
  builder_wallet: string;
  name: string;
  uri: string;
  mint: string;
  status: number;
  milestone_count: number;
  presale_minimum_cap: string;
  veto_threshold_bps: number;
  challenge_window: string;
  total_treasury_received: string;
  total_claimed_by_builder: string;
  pool_launched: boolean;
  damm_pool: string | null;
  total_supply: string;
  created_at: string;
  milestones: Milestone[];
}

export interface Milestone {
  index: number;
  description: string;
  unlock_percent: number;
  deliverable_type: number;
  deadline: string;
  status: number;
  deliverable: string | null;
  submitted_at: string | null;
  total_veto_stake: string;
}

export interface Builder {
  address: string;
  wallet: string;
  x_username: string;
  github: string | null;
  telegram: string | null;
  active_experiment: string | null;
  experiment_count: number;
  experiments?: Experiment[];
}

export interface AnalyticsData {
  totalExperiments: number;
  uniqueBuilders: number;
  totalTreasuryLamports: string;
  totalClaimedLamports: string;
  statusCounts: Record<number, number>;
  milestones: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    submitted: number;
    challenged: number;
  };
  totalVetoStakeLamports: string;
}

// ── Status helpers ──────────────────────────────────────────────

const STATUS_LABELS: Record<number, string> = {
  0: "Created",
  1: "Presale Active",
  2: "Active",
  3: "Completed",
  4: "Presale Failed",
  5: "Failed",
};

const MILESTONE_STATUS_LABELS: Record<number, string> = {
  0: "Pending",
  1: "Submitted",
  3: "Challenged",
  4: "Passed",
  5: "Failed",
};

export function statusLabel(status: number): string {
  return STATUS_LABELS[status] || `Unknown (${status})`;
}

export function milestoneStatusLabel(status: number): string {
  return MILESTONE_STATUS_LABELS[status] || `Unknown (${status})`;
}

export function lamportsToSol(lamports: string | number): number {
  return Number(BigInt(lamports)) / 1_000_000_000;
}

// ── API calls ───────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function fetchExperiments(
  status?: number,
  limit = 50,
  offset = 0
): Promise<Experiment[]> {
  const params = new URLSearchParams();
  if (status !== undefined) params.set("status", String(status));
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetch(`${API_BASE}/api/experiments?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchExperiment(
  address: string
): Promise<Experiment | null> {
  try {
    return await apiFetch<Experiment>(`/api/experiments/${address}`);
  } catch {
    return null;
  }
}

export async function fetchBuilder(
  wallet: string
): Promise<Builder | null> {
  try {
    return await apiFetch<Builder>(`/api/builders/${wallet}`);
  } catch {
    return null;
  }
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>("/api/analytics");
}
