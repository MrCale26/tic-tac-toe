create table if not exists public.games (
  id text primary key,
  board jsonb not null default '[null,null,null,null,null,null,null,null,null]'::jsonb,
  turn text not null default 'X' check (turn in ('X', 'O')),
  winner text null check (winner in ('X', 'O', 'draw')),
  host_player_id text null,
  guest_player_id text null,
  host_name text not null default '',
  guest_name text not null default '',
  host_symbol text not null default 'X' check (host_symbol in ('X', 'O')),
  starting_turn text not null default 'X' check (starting_turn in ('X', 'O')),
  created_at timestamptz not null default now()
);

alter table public.games
  add column if not exists host_player_id text,
  add column if not exists guest_player_id text,
  add column if not exists host_name text not null default '',
  add column if not exists guest_name text not null default '',
  add column if not exists host_symbol text not null default 'X',
  add column if not exists starting_turn text not null default 'X';

update public.games
set
  host_player_id = coalesce(host_player_id, x_player_id),
  guest_player_id = coalesce(guest_player_id, o_player_id),
  host_symbol = coalesce(host_symbol, 'X'),
  starting_turn = coalesce(starting_turn, 'X')
where true;

alter table public.games drop column if exists x_player_id;
alter table public.games drop column if exists o_player_id;

alter table public.games drop constraint if exists games_host_symbol_check;
alter table public.games add constraint games_host_symbol_check check (host_symbol in ('X', 'O'));

alter table public.games drop constraint if exists games_starting_turn_check;
alter table public.games add constraint games_starting_turn_check check (starting_turn in ('X', 'O'));

alter table public.games enable row level security;

do $$
begin
  create policy "Anyone can read games"
    on public.games
    for select
    to anon, authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Anyone can create games"
    on public.games
    for insert
    to anon, authenticated
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Anyone can update games"
    on public.games
    for update
    to anon, authenticated
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

alter table public.games replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
end $$;
