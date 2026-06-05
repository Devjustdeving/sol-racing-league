import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getLeaderboard, type PlayerRow } from "@/lib/supabase";
import { useWallet } from "@/lib/wallet-context";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — SOL RACING LEAGUE" },
      { name: "description", content: "Top players earning SRL tokens." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { address } = useWallet();

  useEffect(() => {
    getLeaderboard(50)
      .then((data) => {
        setPlayers(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(155,89,255,0.2),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(30,108,255,0.15),transparent_55%)]" />

      <div className="relative max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm hover:bg-white/10 transition-colors"
          >
            Back
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Leaderboard</h1>
          <div className="w-16" />
        </div>

        <div className="bg-[#9b59ff]/10 border border-[#9b59ff]/30 rounded-xl p-4 mb-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-70 mb-1">SRL Token Airdrop</div>
          <div className="text-sm">
            Collect coins to earn points. Top players will receive $SRL tokens when the token launches.
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 opacity-60">Loading leaderboard...</div>
        ) : players.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-lg font-bold mb-2">No players yet</div>
            <div className="text-sm opacity-60 mb-4">
              Connect your wallet and race to be the first on the leaderboard!
            </div>
            <Link
              to="/"
              className="inline-block bg-amber-400 text-black rounded-xl py-3 px-6 font-bold"
            >
              Start Racing
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {players.map((p, i) => {
              const isMe = address && p.wallet_address === address;
              return (
                <div
                  key={p.wallet_address}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    isMe
                      ? "bg-[#9b59ff]/20 border border-[#9b59ff]/40"
                      : "bg-white/5 border border-white/5"
                  }`}
                >
                  <span className="w-8 text-center font-bold tabular-nums text-amber-400">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">
                      {p.display_name || `${p.wallet_address.slice(0, 6)}...${p.wallet_address.slice(-4)}`}
                    </div>
                    <div className="text-[10px] opacity-50">
                      {p.games_played} races · Best P{p.best_position}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#9b59ff] tabular-nums">{p.total_coins.toLocaleString()}</div>
                    <div className="text-[9px] opacity-50">SRL pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
