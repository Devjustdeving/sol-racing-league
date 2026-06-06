import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface PlayerRow {
  wallet_address: string;
  display_name: string | null;
  total_coins: number;
  games_played: number;
  best_position: number;
  created_at: string;
  updated_at: string;
}

export interface GameSessionRow {
  id: string;
  wallet_address: string;
  track_id: string;
  coins_collected: number;
  finish_position: number;
  total_cars: number;
  best_lap_ms: number | null;
  created_at: string;
}

export async function saveGameSession(
  walletAddress: string,
  trackId: string,
  coinsCollected: number,
  finishPosition: number,
  totalCars: number,
  bestLapMs: number | null,
): Promise<{ ok: true } | { ok: false; error: string } | null> {
  if (!supabase) return null;

  const params = {
    p_wallet: String(walletAddress),
    p_track: String(trackId),
    p_coins: parseInt(String(coinsCollected), 10) || 0,
    p_position: parseInt(String(finishPosition), 10) || 1,
    p_total_cars: parseInt(String(totalCars), 10) || 6,
    p_best_lap: bestLapMs != null ? parseInt(String(Math.round(bestLapMs * 1000)), 10) : null,
  };

  try {
    const { error } = await supabase.rpc("save_race_result", params);

    if (error) {
      const errMsg = `${error.code}: ${error.message}`;
      console.error("save_race_result RPC failed:", error, "params:", params);
      await supabase.rpc("upsert_player_stats", {
        p_wallet: params.p_wallet,
        p_coins: params.p_coins,
        p_position: params.p_position,
      });
      return { ok: false, error: errMsg };
    }

    return { ok: true };
  } catch (e) {
    console.error("saveGameSession error:", e);
    return { ok: false, error: String(e) };
  }
}

export async function getLeaderboard(limit = 50) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("players")
    .select("wallet_address, display_name, total_coins, games_played, best_position")
    .order("total_coins", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch leaderboard:", error);
    return [];
  }

  return data as PlayerRow[];
}

export async function getPlayerStats(walletAddress: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("wallet_address", walletAddress)
    .single();

  if (error) return null;
  return data as PlayerRow;
}
