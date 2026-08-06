-- Baixo K - schema inicial para Supabase
-- Este arquivo nao inclui nenhuma chave secreta nem altera o codigo da app.
-- Ele cria as tabelas que espelham o estado atual do sistema e um seed basico.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(10,2) not null default 0,
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  image text not null default '',
  badge text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null default 'novo' check (
    status in ('novo', 'preparo', 'pronto', 'entregue', 'cancelado')
  ),
  customer text not null default '',
  phone text not null default '',
  place text not null default '',
  payment text not null default '',
  channel text not null default '',
  fulfillment text not null default '',
  subtotal numeric(10,2) not null default 0,
  coupon text not null default '',
  discount numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  delivery_km numeric(10,1),
  delivery_zone text not null default '',
  total numeric(10,2) not null default 0,
  printed boolean not null default false,
  stock_deducted boolean not null default false,
  items jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.tables (
  n integer primary key,
  status text not null default 'livre' check (status in ('livre', 'aberta', 'conta')),
  opened_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.promos (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  price numeric(10,2) not null default 0 check (price >= 0),
  until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  code text primary key,
  kind text not null check (kind in ('pct', 'val')),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  min numeric(10,2) not null default 0 check (min >= 0),
  once boolean not null default false,
  until timestamptz,
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery (
  id integer primary key default 1 check (id = 1),
  endereco text not null default '',
  lng double precision,
  lat double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id bigserial primary key,
  delivery_id integer not null default 1 references public.delivery(id) on delete cascade,
  km numeric(10,2) not null check (km > 0),
  fee numeric(10,2) not null default 0 check (fee >= 0),
  min numeric(10,2) not null default 0 check (min >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_zones_unique_km unique (delivery_id, km)
);

create table if not exists public.app_state (
  id integer primary key default 1 check (id = 1),
  rev bigint not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_products_category on public.products (category);
create index if not exists idx_products_active on public.products (active);
create index if not exists idx_promos_product_id on public.promos (product_id);
create index if not exists idx_coupons_active on public.coupons (active);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_tables_updated_at on public.tables;
create trigger trg_tables_updated_at
before update on public.tables
for each row execute function public.set_updated_at();

drop trigger if exists trg_promos_updated_at on public.promos;
create trigger trg_promos_updated_at
before update on public.promos
for each row execute function public.set_updated_at();

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();

drop trigger if exists trg_delivery_updated_at on public.delivery;
create trigger trg_delivery_updated_at
before update on public.delivery
for each row execute function public.set_updated_at();

drop trigger if exists trg_delivery_zones_updated_at on public.delivery_zones;
create trigger trg_delivery_zones_updated_at
before update on public.delivery_zones
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.tables enable row level security;
alter table public.promos enable row level security;
alter table public.coupons enable row level security;
alter table public.delivery enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.app_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'public read products'
  ) then
    create policy "public read products"
      on public.products
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'promos' and policyname = 'public read promos'
  ) then
    create policy "public read promos"
      on public.promos
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coupons' and policyname = 'public read coupons'
  ) then
    create policy "public read coupons"
      on public.coupons
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery' and policyname = 'public read delivery'
  ) then
    create policy "public read delivery"
      on public.delivery
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'delivery_zones' and policyname = 'public read delivery zones'
  ) then
    create policy "public read delivery zones"
      on public.delivery_zones
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tables' and policyname = 'public read tables'
  ) then
    create policy "public read tables"
      on public.tables
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'public read own orders'
  ) then
    create policy "public read own orders"
      on public.orders
      for select
      using (false);
  end if;
end
$$;

insert into public.products (id, name, category, price, stock, min_stock, active, image, badge, description) values
  ('pizza-calabresa', 'Pizza Calabresa', 'pizzas', 39.90, 18, 4, true, '', 'Pizza', 'Mussarela, calabresa, cebola e oregano.'),
  ('pizza-frango', 'Pizza Frango Catupiry', 'pizzas', 44.90, 14, 4, true, '', 'Pizza', 'Frango temperado, catupiry e mussarela.'),
  ('pizza-baixo-k', 'Pizza Baixo K', 'pizzas', 49.90, 10, 3, true, '', 'Mais pedida', 'Massa da casa, mix de queijos, bacon e finalizacao especial.'),
  ('burguer-classico', 'Burguer Classico', 'burgues', 22.90, 30, 6, true, '', 'Burguer', 'Pao brioche, carne, queijo, salada e molho da casa.'),
  ('burguer-bacon', 'Burguer Bacon', 'burgues', 27.90, 24, 6, true, '', 'Bacon', 'Carne, cheddar, bacon crocante e cebola caramelizada.'),
  ('burguer-duplo', 'Burguer Duplo K', 'burgues', 34.90, 16, 4, true, '', 'Duplo', 'Duas carnes, queijo duplo, bacon e molho especial.'),
  ('massa-bolonhesa', 'Massa Bolonhesa', 'massas', 31.90, 12, 3, true, '', 'Massa', 'Massa ao molho bolonhesa com parmesao.'),
  ('massa-alfredo', 'Massa Alfredo', 'massas', 33.90, 12, 3, true, '', 'Cremosa', 'Molho branco cremoso, frango e toque de ervas.'),
  ('batata-k', 'Batata Baixo K', 'porcoes', 24.90, 20, 5, true, '', 'Porcao', 'Batata frita com cheddar, bacon e molho da casa.'),
  ('refri-lata', 'Refrigerante Lata', 'drinks', 7.90, 48, 12, true, '', 'Gelado', 'Lata 350ml gelada.'),
  ('refri-2l', 'Refrigerante 2L', 'drinks', 14.90, 18, 6, true, '', '2 litros', 'Garrafa 2L gelada.'),
  ('drink-limao', 'Drink Limao', 'drinks', 16.90, 22, 5, true, '', 'Drink', 'Drink refrescante de limao para acompanhar o pedido.'),
  ('drink-maracuja', 'Drink Maracuja', 'drinks', 18.90, 18, 5, true, '', 'Assinatura', 'Maracuja, gelo e finalizacao da casa.')
on conflict (id) do nothing;

insert into public.tables (n, status, opened_at, items)
select gs.n, 'livre', null, '[]'::jsonb
from generate_series(1, 8) as gs(n)
on conflict (n) do nothing;

insert into public.delivery (id, endereco, lng, lat)
values (1, 'Rua Sacadura Cabral 10, Rio de Janeiro', -43.1875, -22.8975)
on conflict (id) do update
set endereco = excluded.endereco,
    lng = excluded.lng,
    lat = excluded.lat;

insert into public.delivery_zones (delivery_id, km, fee, min)
values
  (1, 2, 5, 25),
  (1, 6, 9, 40),
  (1, 12, 15, 60)
on conflict (delivery_id, km) do nothing;

commit;
