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
) {
  if (!supabase) return null;

  const { data: session, error: sessionError } = await supabase
    .from("game_sessions")
    .insert({
      wallet_address: walletAddress,
      track_id: trackId,
      coins_collected: coinsCollected,
      finish_position: finishPosition,
      total_cars: totalCars,
      best_lap_ms: bestLapMs,
    })
    .select()
    .single();

  if (sessionError) {
    console.error("Failed to save game session:", sessionError);
    return null;
  }

  const { error: playerError } = await supabase.rpc("upsert_player_stats", {
    p_wallet: walletAddress,
    p_coins: coinsCollected,
    p_position: finishPosition,
  });

  if (playerError) {
    console.error("Failed to update player stats:", playerError);
  }

  return session;
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
