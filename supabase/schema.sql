create table if not exists public.gift_records (
  id uuid primary key default gen_random_uuid(),
  guest text not null,
  type text not null,
  quantity integer not null check (quantity > 0),
  value numeric(12, 2) not null default 0 check (value >= 0),
  note text not null default '',
  has_quantity boolean not null default false,
  direction text not null default 'Gelen' check (direction in ('Gelen', 'Giden')),
  gift_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.gift_records
  add column if not exists has_quantity boolean not null default false;

alter table public.gift_records
  add column if not exists direction text not null default 'Gelen';

alter table public.gift_records
  add column if not exists gift_date date not null default current_date;

alter table public.gift_records
  drop constraint if exists gift_records_direction_check;
alter table public.gift_records
  add constraint gift_records_direction_check check (direction in ('Gelen', 'Giden'));

alter table public.gift_records
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.gift_records
  alter column user_id set default auth.uid();

-- Last-write-wins senkronizasyonu icin.
alter table public.gift_records
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_gift_records_updated_at on public.gift_records;
create trigger set_gift_records_updated_at
before update on public.gift_records
for each row
execute function public.set_updated_at();

alter table public.gift_records enable row level security;

drop policy if exists "Anyone can read gift records" on public.gift_records;
drop policy if exists "Anyone can add gift records" on public.gift_records;
drop policy if exists "Anyone can update gift records" on public.gift_records;
drop policy if exists "Anyone can delete gift records" on public.gift_records;
drop policy if exists "Users can read own gift records" on public.gift_records;
drop policy if exists "Users can add own gift records" on public.gift_records;
drop policy if exists "Users can update own gift records" on public.gift_records;
drop policy if exists "Users can delete own gift records" on public.gift_records;
drop policy if exists "Recipients can read shared gift records" on public.gift_records;

-- Kullaniciya ozel: herkes sadece kendi user_id'sine ait kayitlari gorup degistirebilir.
create policy "Users can read own gift records"
on public.gift_records for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can add own gift records"
on public.gift_records for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own gift records"
on public.gift_records for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own gift records"
on public.gift_records for delete
to authenticated
using (auth.uid() = user_id);

-- ============================================================
-- Paylasim (readonly sharing)
-- ============================================================

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  unique (owner_id, recipient_id)
);

alter table public.shares enable row level security;

drop policy if exists "Owners can view their own shares" on public.shares;
drop policy if exists "Recipients can view shares sent to them" on public.shares;
drop policy if exists "Owners can create shares" on public.shares;
drop policy if exists "Recipients can respond to their shares" on public.shares;
drop policy if exists "Owners can delete their shares" on public.shares;

create policy "Owners can view their own shares"
on public.shares for select
to authenticated
using (auth.uid() = owner_id);

create policy "Recipients can view shares sent to them"
on public.shares for select
to authenticated
using (auth.uid() = recipient_id);

create policy "Owners can create shares"
on public.shares for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Recipients can respond to their shares"
on public.shares for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

create policy "Owners can delete their shares"
on public.shares for delete
to authenticated
using (auth.uid() = owner_id);

-- E-posta ile davet: auth.users tablosu clienttan sorgulanamadigi icin,
-- e-postayi kullanici id'sine cevirmek icin security definer fonksiyon kullaniliyor.
create or replace function public.create_share(recipient_email text)
returns public.shares
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_recipient_id uuid;
  result public.shares;
begin
  select id into resolved_recipient_id
  from auth.users
  where email = recipient_email
  limit 1;

  if resolved_recipient_id is null then
    raise exception 'Bu e-posta ile kayıtlı bir kullanıcı bulunamadı.';
  end if;

  if resolved_recipient_id = auth.uid() then
    raise exception 'Kendinizle paylaşım yapamazsınız.';
  end if;

  insert into public.shares (owner_id, recipient_id, recipient_email, status)
  values (auth.uid(), resolved_recipient_id, recipient_email, 'pending')
  on conflict (owner_id, recipient_id)
  do update set status = 'pending', responded_at = null, created_at = timezone('utc', now())
  returning * into result;

  return result;
end;
$$;

grant execute on function public.create_share(text) to authenticated;

-- Gelen davetleri, gonderenin e-posta ve isim bilgisiyle birlikte listelemek icin.
drop function if exists public.get_incoming_shares();
create function public.get_incoming_shares()
returns table (
  id uuid,
  owner_id uuid,
  owner_email text,
  owner_name text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.owner_id,
    u.email::text as owner_email,
    (u.raw_user_meta_data->>'name')::text as owner_name,
    s.status,
    s.created_at
  from public.shares s
  join auth.users u on u.id = s.owner_id
  where s.recipient_id = auth.uid()
  order by s.created_at desc;
$$;

grant execute on function public.get_incoming_shares() to authenticated;

-- Kabul edilmis paylasimlarda, alicinin sahibin kayitlarini (readonly) gorebilmesi icin.
drop policy if exists "Recipients can read shared gift records" on public.gift_records;
create policy "Recipients can read shared gift records"
on public.gift_records for select
to authenticated
using (
  exists (
    select 1 from public.shares
    where shares.owner_id = gift_records.user_id
      and shares.recipient_id = auth.uid()
      and shares.status = 'accepted'
  )
);

-- ============================================================
-- Hesap silme (store politikalari geregi zorunlu)
-- ============================================================

-- auth.users satirini silmek, gift_records.user_id ve shares.owner_id/recipient_id
-- uzerindeki "on delete cascade" foreign key'ler sayesinde kullanicinin tum
-- kayitlarini ve paylasimlarini da otomatik siler.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;

-- ============================================================
-- Etkinlikler (dugun, sunnet, nisan gibi ayri kayit gruplari)
-- ============================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.events
  alter column user_id set default auth.uid();

alter table public.events enable row level security;

drop policy if exists "Users can read own events" on public.events;
drop policy if exists "Users can add own events" on public.events;
drop policy if exists "Users can update own events" on public.events;
drop policy if exists "Users can delete own events" on public.events;

create policy "Users can read own events"
on public.events for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can add own events"
on public.events for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own events"
on public.events for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own events"
on public.events for delete
to authenticated
using (auth.uid() = user_id);

alter table public.gift_records
  add column if not exists event_id uuid references public.events (id) on delete cascade;

-- Mevcut kayitlari (event_id bos olanlari) her kullanici icin olusturulan
-- birer "Genel" etkinlige atar. Tekrar calistirildiginda zaten atanmis
-- kayitlar icin hicbir sey yapmaz (idempotent).
do $$
declare
  r record;
  new_event_id uuid;
begin
  for r in
    select distinct user_id from public.gift_records where event_id is null and user_id is not null
  loop
    insert into public.events (name, user_id) values ('Genel', r.user_id)
    returning id into new_event_id;

    update public.gift_records
    set event_id = new_event_id
    where user_id = r.user_id and event_id is null;
  end loop;
end $$;