-- SOL Racing League Database Schema (COMPLETE - run this once)
-- Run in Supabase SQL Editor: Dashboard > SQL Editor > New query > Paste all > Run

-- 1. Players table
create table players (
  wallet_address text primary key,
  display_name text,
  total_coins bigint not null default 0,
  games_played integer not null default 0,
  best_position integer not null default 99,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Game sessions table
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references players(wallet_address),
  track_id text not null,
  coins_collected integer not null default 0,
  finish_position integer not null,
  total_cars integer not null default 6,
  best_lap_ms integer,
  created_at timestamptz not null default now()
);

-- 3. Indexes
create index idx_players_total_coins on players(total_coins desc);
create index idx_sessions_wallet on game_sessions(wallet_address);
create index idx_sessions_created on game_sessions(created_at desc);

-- 4. Combined save function (handles both player + session in one call)
create or replace function save_race_result(
  p_wallet text,
  p_track text,
  p_coins integer,
  p_position integer,
  p_total_cars integer,
  p_best_lap integer default null
) returns void as $$
begin
  insert into players (wallet_address, total_coins, games_played, best_position)
  values (p_wallet, p_coins, 1, p_position)
  on conflict (wallet_address) do update set
    total_coins = players.total_coins + p_coins,
    games_played = players.games_played + 1,
    best_position = least(players.best_position, p_position),
    updated_at = now();

  insert into game_sessions (wallet_address, track_id, coins_collected, finish_position, total_cars, best_lap_ms)
  values (p_wallet, p_track, p_coins, p_position, p_total_cars, p_best_lap);
end;
$$ language plpgsql security definer;

-- 5. Legacy function (fallback)
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

-- 6. Row Level Security
alter table players enable row level security;
alter table game_sessions enable row level security;

-- 7. Policies - allow public read and anon write
create policy "Anyone can read players" on players for select using (true);
create policy "Anyone can read sessions" on game_sessions for select using (true);
create policy "Anyone can insert players" on players for insert with check (true);
create policy "Anyone can update players" on players for update using (true);
create policy "Anyone can insert sessions" on game_sessions for insert with check (true);

-- Done! You should see "Success. No rows returned."
