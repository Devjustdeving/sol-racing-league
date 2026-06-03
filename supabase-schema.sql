-- SOL Racing League Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Players table
create table if not exists players (
  wallet_address text primary key,
  display_name text,
  total_coins bigint not null default 0,
  games_played integer not null default 0,
  best_position integer not null default 99,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Game sessions table
create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references players(wallet_address),
  track_id text not null,
  coins_collected integer not null default 0,
  finish_position integer not null,
  total_cars integer not null default 6,
  best_lap_ms integer,
  created_at timestamptz not null default now()
);

-- Index for leaderboard queries
create index if not exists idx_players_total_coins on players(total_coins desc);
create index if not exists idx_sessions_wallet on game_sessions(wallet_address);

-- RPC function to upsert player stats after each race
create or replace function upsert_player_stats(
  p_wallet text,
  p_coins integer,
  p_position integer
) returns void as $$
begin
  insert into players (wallet_address, total_coins, games_played, best_position)
  values (p_wallet, p_coins, 1, p_position)
  on conflict (wallet_address) do update set
    total_coins = players.total_coins + p_coins,
    games_played = players.games_played + 1,
    best_position = least(players.best_position, p_position),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Enable Row Level Security
alter table players enable row level security;
alter table game_sessions enable row level security;

-- Allow anyone to read (public leaderboard)
create policy "Public read players" on players for select using (true);
create policy "Public read sessions" on game_sessions for select using (true);

-- Allow inserts from anon key (the webapp)
create policy "Anon insert sessions" on game_sessions for insert with check (true);
create policy "Anon insert players" on players for insert with check (true);
create policy "Anon update players" on players for update using (true);
