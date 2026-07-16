import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  AreaChart, Area,
} from "recharts";
import { api } from "../lib/api";
import { useSocket } from "../hooks/useSocket";
import LiveCounter from "../components/LiveCounter";
import OfflineBanner from "../components/OfflineBanner";
import { useToast } from "../components/Toast";

interface Stats {
  byCategory: { category: string; count: number }[];
  byStatus: { status: string; count: number }[];
  avgResponseMinutes: number;
  totalRequests: number;
}

interface ActivityBucket {
  t: number;
  total: number;
  broadcasts: number;
  requests: number;
  connects: number;
}

const STATUS_COLORS: Record<string, string> = {
  new: "#ef4444",
  acknowledged: "#f59e0b",
  resolved: "#10b981",
};

const TOOLTIP_STYLE = {
  background: "#1c2029",
  border: "none",
  borderRadius: 12,
  fontSize: 12,
} as const;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl2 bg-surface p-4"
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-600">{sub}</p>}
    </motion.div>
  );
}

function hhmm(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Recharts renders an empty dataset as a silent blank box — a heading with a void
// under it, which reads as "the dashboard is broken" rather than "nothing yet".
// Every chart below gets a real empty state instead.
function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-52 flex-col items-center justify-center gap-1 text-center">
      <div className="text-2xl opacity-40">📊</div>
      <p className="text-xs text-zinc-600">{children}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, deviceCount, connected } = useSocket();
  const toast = useToast();
  // Tracks whether we've already surfaced the current outage, so a downed server
  // doesn't machine-gun a toast on every socket tick.
  const notifiedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.getRequestStats(), api.getActivity()]);
      setStats(s);
      setActivity(a.buckets);
      setError(null);
      notifiedRef.current = false;
    } catch (e: any) {
      // Previously this failure was swallowed silently and the dashboard just sat
      // on stale numbers with no indication anything was wrong — the worst kind of
      // bug on a screen people are reading during a demo. Surface it.
      const msg = e?.message || "Couldn't refresh the dashboard.";
      setError(msg);
      if (!notifiedRef.current) {
        toast(msg, "error");
        notifiedRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    socket.on("request:new", refresh);
    socket.on("request:update", refresh);
    socket.on("broadcast:new", refresh);
    return () => {
      socket.off("request:new", refresh);
      socket.off("request:update", refresh);
      socket.off("broadcast:new", refresh);
    };
  }, [socket, refresh]);

  const openNow = stats
    ? (stats.byStatus.find((s) => s.status === "new")?.count || 0) +
      (stats.byStatus.find((s) => s.status === "acknowledged")?.count || 0)
    : "—";

  return (
    <div className="min-h-screen bg-base pb-24">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-base/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">Live Dashboard</h1>
        <LiveCounter count={deviceCount} connected={connected} />
      </header>

      <OfflineBanner connected={connected} />

      {/* Stale-data warning: the numbers below are real but frozen. */}
      {error && stats && (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-300">
          Showing last known numbers — couldn't reach the server to refresh.
        </div>
      )}

      <div className="space-y-5 px-4 py-4">
        {loading && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[86px] animate-pulse rounded-xl2 bg-surface" />
              ))}
            </div>
            <div className="h-32 animate-pulse rounded-xl2 bg-surface" />
            <div className="h-64 animate-pulse rounded-xl2 bg-surface" />
          </div>
        )}

        {/* Hard error with nothing cached to fall back on — never a blank screen. */}
        {!loading && error && !stats && (
          <div className="mt-10 text-center text-zinc-500">
            <div className="mb-2 text-3xl">📡</div>
            <p className="mb-1 font-medium text-zinc-400">Dashboard unavailable</p>
            <p className="mb-4 text-xs">{error}</p>
            <button
              onClick={() => { setLoading(true); refresh(); }}
              className="rounded-xl2 bg-accent px-4 py-2 text-sm font-semibold text-base"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Devices connected" value={deviceCount} sub="right now" />
              <StatCard label="Total requests" value={stats.totalRequests} />
              <StatCard
                label="Avg response time"
                value={`${stats.avgResponseMinutes}m`}
                sub="request → resolved"
              />
              <StatCard label="Open right now" value={openNow} />
            </div>

            {/* Reads the activity_log table — the self-hosted stand-in for an
                analytics SDK, which would need internet and is off the table. */}
            <div className="rounded-xl2 bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-zinc-300">Activity</h3>
                <span className="text-[11px] text-zinc-500">last hour</span>
              </div>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activity} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="t" hide />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(t) => hhmm(Number(t))}
                      formatter={(v: number) => [v, "events"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      fill="url(#activityFill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                <span>{activity.length ? hhmm(activity[0].t) : ""}</span>
                <span>now</span>
              </div>
            </div>

            <div className="rounded-xl2 bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-300">Requests by category</h3>
              {stats.byCategory.length === 0 ? (
                <ChartEmpty>No requests yet — this fills in as they come in.</ChartEmpty>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.byCategory} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="category"
                        type="category"
                        width={70}
                        tick={{ fill: "#a1a1aa", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="#22d3ee" radius={[0, 8, 8, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl2 bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-300">Requests by status</h3>
              {stats.byStatus.length === 0 ? (
                <ChartEmpty>Nothing on the board yet.</ChartEmpty>
              ) : (
                <>
                  <div className="flex h-52 items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.byStatus}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                        >
                          {stats.byStatus.map((entry) => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#666"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex justify-center gap-4 text-xs">
                    {stats.byStatus.map((s) => (
                      <span key={s.status} className="flex items-center gap-1.5 capitalize text-zinc-400">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: STATUS_COLORS[s.status] || "#666" }}
                        />
                        {s.status} ({s.count})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
