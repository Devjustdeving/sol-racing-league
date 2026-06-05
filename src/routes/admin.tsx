import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SOL RACING LEAGUE" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

interface WeeklyPlayer {
  wallet_address: string;
  weekly_coins: number;
  games_played: number;
  best_position: number;
}

interface AllTimePlayer {
  wallet_address: string;
  display_name: string | null;
  total_coins: number;
  games_played: number;
  best_position: number;
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "srl-admin-2024";

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"weekly" | "alltime">("weekly");
  const [weeklyPlayers, setWeeklyPlayers] = useState<WeeklyPlayer[]>([]);
  const [allTimePlayers, setAllTimePlayers] = useState<AllTimePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekRange = (offset: number) => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) - offset * 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);
    return { start: monday.toISOString(), end: sunday.toISOString(), label: monday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " - " + new Date(sunday.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  };

  const weekRange = getWeekRange(weekOffset);

  const login = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
      setError("");
    } else {
      setError("Wrong password");
    }
  };

  const fetchWeekly = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { count } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true });
      setTotalSessions(count ?? 0);

      const { data, error } = await supabase
        .from("game_sessions")
        .select("wallet_address, coins_collected, finish_position, created_at")
        .gte("created_at", weekRange.start)
        .lt("created_at", weekRange.end);

      if (error || !data) {
        console.error("Weekly query error:", error);
        setLoading(false);
        return;
      }

      const map = new Map<string, WeeklyPlayer>();
      for (const row of data) {
        const existing = map.get(row.wallet_address);
        if (existing) {
          existing.weekly_coins += row.coins_collected;
          existing.games_played += 1;
          existing.best_position = Math.min(existing.best_position, row.finish_position);
        } else {
          map.set(row.wallet_address, {
            wallet_address: row.wallet_address,
            weekly_coins: row.coins_collected,
            games_played: 1,
            best_position: row.finish_position,
          });
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => b.weekly_coins - a.weekly_coins);
      setWeeklyPlayers(sorted);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [weekRange.start, weekRange.end]);

  const fetchAllTime = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("players")
        .select("wallet_address, display_name, total_coins, games_played, best_position")
        .order("total_coins", { ascending: false })
        .limit(100);

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }
      setAllTimePlayers(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (tab === "weekly") fetchWeekly();
    else fetchAllTime();
  }, [authed, tab, fetchWeekly, fetchAllTime]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAllAddresses = (players: { wallet_address: string }[]) => {
    const text = players.map((p) => p.wallet_address).join("\n");
    navigator.clipboard.writeText(text);
    setCopied("all");
    setTimeout(() => setCopied(null), 1500);
  };

  if (!authed) {
    return (
      <main className="min-h-dvh bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-sm w-full">
          <h1 className="text-2xl font-black mb-6 text-center">Admin Login</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Enter admin password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#9b59ff]"
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          <button
            onClick={login}
            className="w-full mt-4 bg-[#9b59ff] rounded-lg py-3 font-bold"
          >
            Login
          </button>
        </div>
      </main>
    );
  }


  return (
    <main className="min-h-dvh bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black">Admin Panel</h1>
          <button
            onClick={() => setAuthed(false)}
            className="text-sm opacity-60 hover:opacity-100"
          >
            Logout
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("weekly")}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === "weekly" ? "bg-[#9b59ff]" : "bg-white/5"}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setTab("alltime")}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${tab === "alltime" ? "bg-[#9b59ff]" : "bg-white/5"}`}
          >
            All Time
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 opacity-60">Loading...</div>
        ) : tab === "weekly" ? (
          <>
            {/* Week picker */}
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-3">
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="text-sm px-2 py-1 rounded hover:bg-white/10"
              >
                ← Prev
              </button>
              <div className="text-sm font-bold">{weekRange.label}{weekOffset === 0 ? " (current)" : ""}</div>
              <button
                onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
                disabled={weekOffset === 0}
                className="text-sm px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
            {totalSessions !== null && (
              <div className="text-[10px] opacity-40 mb-2 text-center">
                Total sessions in DB: {totalSessions}
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm opacity-60">{weeklyPlayers.length} players this week</div>
              {weeklyPlayers.length > 0 && (
                <button
                  onClick={() => copyAllAddresses(weeklyPlayers)}
                  className="text-xs bg-white/5 border border-white/10 rounded px-3 py-1.5 hover:bg-white/10"
                >
                  {copied === "all" ? "Copied!" : "Copy all addresses"}
                </button>
              )}
            </div>
            {weeklyPlayers.length === 0 ? (
              <div className="text-center py-12">
                <div className="opacity-60 mb-2">No races this week yet</div>
                {totalSessions === 0 && (
                  <div className="text-xs text-amber-400">Game sessions are not being saved. Make sure you connect a wallet before racing on solracingleague.com</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {weeklyPlayers.map((p, i) => (
                  <div key={p.wallet_address} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm">
                    <span className="w-8 text-center font-bold text-amber-400">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => copyAddress(p.wallet_address)}
                        className="font-mono text-xs hover:text-[#9b59ff] transition-colors truncate block w-full text-left"
                        title="Click to copy"
                      >
                        {copied === p.wallet_address ? "Copied!" : p.wallet_address}
                      </button>
                      <div className="text-[10px] opacity-50">{p.games_played} races - Best P{p.best_position}</div>
                    </div>
                    <div className="text-right font-bold text-[#9b59ff]">{p.weekly_coins.toLocaleString()} pts</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm opacity-60">{allTimePlayers.length} total players</div>
              {allTimePlayers.length > 0 && (
                <button
                  onClick={() => copyAllAddresses(allTimePlayers)}
                  className="text-xs bg-white/5 border border-white/10 rounded px-3 py-1.5 hover:bg-white/10"
                >
                  {copied === "all" ? "Copied!" : "Copy all addresses"}
                </button>
              )}
            </div>
            {allTimePlayers.length === 0 ? (
              <div className="text-center py-12 opacity-60">No players yet</div>
            ) : (
              <div className="space-y-2">
                {allTimePlayers.map((p, i) => (
                  <div key={p.wallet_address} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm">
                    <span className="w-8 text-center font-bold text-amber-400">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => copyAddress(p.wallet_address)}
                        className="font-mono text-xs hover:text-[#9b59ff] transition-colors truncate block w-full text-left"
                        title="Click to copy"
                      >
                        {copied === p.wallet_address ? "Copied!" : p.wallet_address}
                      </button>
                      <div className="text-[10px] opacity-50">{p.games_played} races - Best P{p.best_position}</div>
                    </div>
                    <div className="text-right font-bold text-[#9b59ff]">{p.total_coins.toLocaleString()} pts</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
