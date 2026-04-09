create table if not exists public.games (
  id text primary key,
  board jsonb not null default '[null,null,null,null,null,null,null,null,null]'::jsonb,
  turn text not null default 'X' check (turn in ('X', 'O')),
  winner text null check (winner in ('X', 'O', 'draw')),
  x_player_id text null,
  o_player_id text null,
  created_at timestamptz not null default now()
);

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
