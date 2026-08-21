create table if not exists public.gift_records (
  id uuid primary key default gen_random_uuid(),
  guest text not null,
  type text not null,
  quantity integer not null check (quantity > 0),
  value numeric(12, 2) not null default 0 check (value >= 0),
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.gift_records enable row level security;

create policy "Anyone can read gift records"
on public.gift_records for select
to anon, authenticated
using (true);

create policy "Anyone can add gift records"
on public.gift_records for insert
to anon, authenticated
with check (true);

create policy "Anyone can delete gift records"
on public.gift_records for delete
to anon, authenticated
using (true);
