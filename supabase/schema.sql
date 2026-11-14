create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'merchant')),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text,
  status text not null default 'active' check (status in ('active', 'pending', 'blocked')),
  store_name text,
  alias text,
  cvu text,
  wallet_provider text,
  wallet_holder text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_lines (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  credit_limit numeric(14, 2) not null default 0 check (credit_limit >= 0),
  current_balance numeric(14, 2) not null default 0 check (current_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_lines_distinct_users check (merchant_id <> customer_id),
  constraint credit_lines_unique_pair unique (merchant_id, customer_id)
);

create table if not exists public.qr_intents (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  description text not null default 'Compra en el comercio' check (char_length(description) <= 160),
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  credit_line_id uuid not null references public.credit_lines (id) on delete cascade,
  qr_intent_id uuid references public.qr_intents (id) on delete set null,
  type text not null check (type in ('purchase', 'payment_notice', 'payment')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null check (char_length(description) <= 160),
  source_wallet text,
  source_holder text,
  operation_reference text,
  receipt_path text,
  review_deadline timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.profiles add column if not exists wallet_provider text;
alter table public.profiles add column if not exists wallet_holder text;
alter table public.transactions add column if not exists source_wallet text;
alter table public.transactions add column if not exists source_holder text;
alter table public.transactions add column if not exists operation_reference text;
alter table public.transactions add column if not exists receipt_path text;
alter table public.transactions add column if not exists review_deadline timestamptz;
alter table public.transactions add column if not exists rejection_reason text;

alter table public.profiles drop constraint if exists profiles_wallet_provider_check;
alter table public.profiles add constraint profiles_wallet_provider_check
  check (wallet_provider is null or wallet_provider in (
    'Mercado Pago', 'Naranja X', 'Ualá', 'Personal Pay', 'Modo',
    'Banco Nación', 'Bancor', 'Santander', 'Galicia', 'BBVA', 'Otro'
  ));
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'expired'));

update public.transactions
set status = 'expired',
    rejection_reason = 'Aviso anterior sin comprobante obligatorio'
where type = 'payment_notice'
  and status = 'pending'
  and (receipt_path is null or review_deadline is null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, full_name, store_name, alias, cvu)
  values (
    new.id,
    case
      when new.raw_user_meta_data ->> 'role' in ('customer', 'merchant')
        then new.raw_user_meta_data ->> 'role'
      else 'customer'
    end,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'Cliente'), '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'store_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'alias'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'cvu'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_credifi on auth.users;
create trigger on_auth_user_created_credifi
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

create index if not exists credit_lines_merchant_idx on public.credit_lines (merchant_id);
create index if not exists credit_lines_customer_idx on public.credit_lines (customer_id);
create index if not exists qr_intents_parties_expiry_idx on public.qr_intents (merchant_id, customer_id, expires_at);
create index if not exists transactions_parties_created_idx on public.transactions (merchant_id, customer_id, created_at desc);
create index if not exists transactions_pending_payments_idx on public.transactions (merchant_id, status) where type = 'payment_notice' and status = 'pending';
create unique index if not exists transactions_receipt_path_unique_idx on public.transactions (receipt_path) where receipt_path is not null;

alter table public.profiles enable row level security;
alter table public.credit_lines enable row level security;
alter table public.qr_intents enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Profiles visible to account owner and linked counterparties" on public.profiles;
create policy "Profiles visible to account owner and linked counterparties"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.credit_lines cl
      where (cl.merchant_id = profiles.id and cl.customer_id = (select auth.uid()))
         or (cl.customer_id = profiles.id and cl.merchant_id = (select auth.uid()))
    )
  );

drop policy if exists "Customers can create their own profile" on public.profiles;
create policy "Customers can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'customer');

drop policy if exists "Users can view their credit lines" on public.credit_lines;
create policy "Users can view their credit lines"
  on public.credit_lines for select to authenticated
  using ((select auth.uid()) in (merchant_id, customer_id));

drop policy if exists "Parties can view QR intents" on public.qr_intents;
create policy "Parties can view QR intents"
  on public.qr_intents for select to authenticated
  using ((select auth.uid()) in (merchant_id, customer_id));

drop policy if exists "Parties can view transactions" on public.transactions;
create policy "Parties can view transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) in (merchant_id, customer_id));

drop policy if exists "Customers can upload their own payment receipts" on storage.objects;
create policy "Customers can upload their own payment receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'customer' and status = 'active'
    )
  );

drop policy if exists "Parties can view linked payment receipts" on storage.objects;
create policy "Parties can view linked payment receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.transactions t
        where t.receipt_path = storage.objects.name
          and (select auth.uid()) in (t.merchant_id, t.customer_id)
      )
    )
  );

drop policy if exists "Customers can remove unlinked payment receipts" on storage.objects;
create policy "Customers can remove unlinked payment receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.transactions t
      where t.receipt_path = storage.objects.name
    )
  );

create or replace function public.create_qr_intent(
  p_customer_id uuid,
  p_amount numeric,
  p_description text default 'Compra en el comercio'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_line public.credit_lines%rowtype;
  v_intent_id uuid;
begin
  if v_merchant_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'Se requiere una sesión de comercio y un monto positivo';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_merchant_id and role = 'merchant' and status = 'active'
  ) or not exists (
    select 1 from public.profiles
    where id = p_customer_id and role = 'customer' and status = 'active'
  ) then
    raise exception 'El comercio o el cliente no está activo';
  end if;

  select * into v_line
  from public.credit_lines
  where merchant_id = v_merchant_id and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'No existe una línea de crédito para este cliente';
  end if;
  if p_amount > v_line.credit_limit - v_line.current_balance then
    raise exception 'El monto supera el crédito disponible';
  end if;

  insert into public.qr_intents (merchant_id, customer_id, amount, description, expires_at)
  values (
    v_merchant_id,
    p_customer_id,
    p_amount,
    coalesce(nullif(left(trim(p_description), 160), ''), 'Compra en el comercio'),
    now() + interval '5 minutes'
  )
  returning id into v_intent_id;
  return v_intent_id;
end;
$$;

create or replace function public.approve_qr_intent(p_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := auth.uid();
  v_intent public.qr_intents%rowtype;
  v_line public.credit_lines%rowtype;
  v_transaction_id uuid;
begin
  if v_customer_id is null then
    raise exception 'Se requiere iniciar sesión';
  end if;

  select * into v_intent from public.qr_intents where id = p_intent_id for update;
  if not found or v_intent.customer_id <> v_customer_id then
    raise exception 'QR no encontrado para este cliente';
  end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    raise exception 'El QR venció o ya fue utilizado';
  end if;
  if not exists (select 1 from public.profiles where id = v_customer_id and role = 'customer' and status = 'active') then
    raise exception 'La cuenta del cliente no está activa';
  end if;

  select * into v_line
  from public.credit_lines
  where merchant_id = v_intent.merchant_id and customer_id = v_customer_id
  for update;
  if not found or v_intent.amount > v_line.credit_limit - v_line.current_balance then
    raise exception 'El monto supera el crédito disponible';
  end if;

  update public.credit_lines
  set current_balance = current_balance + v_intent.amount, updated_at = now()
  where id = v_line.id;
  update public.qr_intents
  set status = 'approved', confirmed_at = now()
  where id = v_intent.id;
  insert into public.transactions (merchant_id, customer_id, credit_line_id, qr_intent_id, type, status, amount, description, confirmed_at)
  values (v_intent.merchant_id, v_customer_id, v_line.id, v_intent.id, 'purchase', 'confirmed', v_intent.amount, v_intent.description, now())
  returning id into v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.set_credit_limit(p_credit_line_id uuid, p_new_limit numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_new_limit is null or p_new_limit < 0 then
    raise exception 'Se requiere un límite no negativo y una sesión válida';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'merchant' and status = 'active') then
    raise exception 'Solo un comercio activo puede modificar límites';
  end if;
  update public.credit_lines
  set credit_limit = p_new_limit, updated_at = now()
  where id = p_credit_line_id and merchant_id = auth.uid();
  if not found then
    raise exception 'Línea de crédito no encontrada para este comercio';
  end if;
end;
$$;

drop function if exists public.notify_payment(uuid, numeric);

create or replace function public.update_payment_profile(
  p_wallet_provider text,
  p_wallet_holder text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'customer' and status = 'active'
  ) then
    raise exception 'Solo un cliente activo puede actualizar su perfil de pago';
  end if;
  if p_wallet_provider is null or p_wallet_provider not in (
    'Mercado Pago', 'Naranja X', 'Ualá', 'Personal Pay', 'Modo',
    'Banco Nación', 'Bancor', 'Santander', 'Galicia', 'BBVA', 'Otro'
  ) then
    raise exception 'Elegí una billetera o banco válido';
  end if;
  if p_wallet_holder is null or char_length(trim(p_wallet_holder)) < 2 or char_length(trim(p_wallet_holder)) > 120 then
    raise exception 'Ingresá el nombre del titular o alias de origen';
  end if;

  update public.profiles
  set wallet_provider = p_wallet_provider,
      wallet_holder = trim(p_wallet_holder)
  where id = auth.uid();
end;
$$;

create or replace function public.notify_payment(
  p_credit_line_id uuid,
  p_amount numeric,
  p_receipt_path text,
  p_operation_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := auth.uid();
  v_line public.credit_lines%rowtype;
  v_profile public.profiles%rowtype;
  v_amount numeric(14, 2);
  v_transaction_id uuid;
begin
  if v_customer_id is null then
    raise exception 'Se requiere iniciar sesión';
  end if;
  select * into v_line from public.credit_lines
  where id = p_credit_line_id and customer_id = v_customer_id;
  if not found then
    raise exception 'Línea de crédito no encontrada para este cliente';
  end if;
  select * into v_profile from public.profiles where id = v_customer_id;
  if v_profile.status <> 'active' or v_profile.wallet_provider is null or v_profile.wallet_holder is null then
    raise exception 'Completá tu perfil de pago antes de avisar una transferencia';
  end if;
  if p_receipt_path is null or split_part(p_receipt_path, '/', 1) <> v_customer_id::text then
    raise exception 'El comprobante no corresponde a esta cuenta';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'payment-receipts' and name = p_receipt_path
  ) then
    raise exception 'No encontramos el comprobante adjunto';
  end if;
  if p_operation_reference is not null and char_length(trim(p_operation_reference)) > 100 then
    raise exception 'El número de operación no puede superar los 100 caracteres';
  end if;
  update public.transactions
  set status = 'expired', rejection_reason = 'Plazo de verificación vencido'
  where credit_line_id = v_line.id
    and type = 'payment_notice'
    and status = 'pending'
    and (review_deadline is null or review_deadline <= now());
  select * into v_line from public.credit_lines
  where id = p_credit_line_id and customer_id = v_customer_id
  for update;
  if not found then
    raise exception 'Línea de crédito no encontrada para este cliente';
  end if;
  v_amount := coalesce(p_amount, v_line.current_balance);
  if v_amount <= 0 or v_amount > v_line.current_balance then
    raise exception 'El monto informado debe ser positivo y no superar la deuda';
  end if;
  if exists (
    select 1 from public.transactions
    where credit_line_id = v_line.id and type = 'payment_notice' and status = 'pending'
  ) then
    raise exception 'Ya existe un aviso de pago pendiente';
  end if;
  insert into public.transactions (
    merchant_id, customer_id, credit_line_id, type, status, amount, description,
    source_wallet, source_holder, operation_reference, receipt_path, review_deadline
  )
  values (
    v_line.merchant_id, v_customer_id, v_line.id, 'payment_notice', 'pending', v_amount,
    'Aviso de transferencia', v_profile.wallet_provider, v_profile.wallet_holder,
    nullif(trim(p_operation_reference), ''), p_receipt_path, now() + interval '24 hours'
  )
  returning id into v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.confirm_payment_received(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_payment public.transactions%rowtype;
  v_line public.credit_lines%rowtype;
begin
  if v_merchant_id is null then
    raise exception 'Se requiere iniciar sesión';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_merchant_id and role = 'merchant' and status = 'active'
  ) then
    raise exception 'Solo un comercio activo puede confirmar pagos';
  end if;
  select * into v_payment from public.transactions
  where id = p_transaction_id and merchant_id = v_merchant_id
  for update;
  if not found or v_payment.type <> 'payment_notice' or v_payment.status <> 'pending' then
    raise exception 'Aviso de pago pendiente no encontrado';
  end if;
  if v_payment.review_deadline is null or v_payment.review_deadline <= now() then
    raise exception 'El plazo de 24 horas para verificar este pago venció';
  end if;
  if v_payment.receipt_path is null then
    raise exception 'Este aviso no tiene un comprobante adjunto';
  end if;
  select * into v_line from public.credit_lines where id = v_payment.credit_line_id for update;
  if not found or v_payment.amount > v_line.current_balance then
    raise exception 'El monto del aviso supera la deuda actual';
  end if;
  update public.credit_lines
  set current_balance = current_balance - v_payment.amount, updated_at = now()
  where id = v_line.id;
  update public.transactions
  set type = 'payment', status = 'confirmed', description = 'Pago recibido · Transferencia', confirmed_at = now()
  where id = v_payment.id;
end;
$$;

create or replace function public.reject_payment_received(
  p_transaction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'merchant' and status = 'active'
  ) then
    raise exception 'Solo un comercio activo puede rechazar pagos';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(trim(p_reason)) > 160 then
    raise exception 'Ingresá un motivo de rechazo de entre 3 y 160 caracteres';
  end if;
  select * into v_payment from public.transactions
  where id = p_transaction_id and merchant_id = auth.uid()
  for update;
  if not found or v_payment.type <> 'payment_notice' or v_payment.status <> 'pending' then
    raise exception 'Aviso de pago pendiente no encontrado';
  end if;
  if v_payment.review_deadline is null or v_payment.review_deadline <= now() then
    raise exception 'El plazo de 24 horas para verificar este pago venció';
  end if;

  update public.transactions
  set status = 'rejected', rejection_reason = trim(p_reason)
  where id = v_payment.id;
end;
$$;

create or replace function public.link_customer(
  p_customer_email text,
  p_credit_limit numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_customer_id uuid;
  v_credit_line_id uuid;
begin
  if v_merchant_id is null or p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'Se requiere una sesión de comercio y un límite no negativo';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_merchant_id and role = 'merchant' and status = 'active'
  ) then
    raise exception 'Solo un comercio activo puede vincular clientes';
  end if;
  if p_customer_email is null or trim(p_customer_email) = '' then
    raise exception 'Ingresá el email de una cuenta cliente';
  end if;

  select u.id into v_customer_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_customer_email))
    and u.email_confirmed_at is not null
    and p.role = 'customer'
    and p.status = 'active';
  if not found then
    raise exception 'No encontramos una cuenta de cliente activa con ese email';
  end if;
  if v_customer_id = v_merchant_id then
    raise exception 'No podés vincular tu propia cuenta';
  end if;

  insert into public.credit_lines (merchant_id, customer_id, credit_limit)
  values (v_merchant_id, v_customer_id, p_credit_limit)
  on conflict (merchant_id, customer_id) do nothing
  returning id into v_credit_line_id;

  if v_credit_line_id is null then
    select id into v_credit_line_id from public.credit_lines
    where merchant_id = v_merchant_id and customer_id = v_customer_id;
  end if;
  return v_credit_line_id;
end;
$$;

revoke all on function public.create_qr_intent(uuid, numeric, text) from public;
revoke all on function public.approve_qr_intent(uuid) from public;
revoke all on function public.set_credit_limit(uuid, numeric) from public;
revoke all on function public.update_payment_profile(text, text) from public;
revoke all on function public.notify_payment(uuid, numeric, text, text) from public;
revoke all on function public.confirm_payment_received(uuid) from public;
revoke all on function public.reject_payment_received(uuid, text) from public;
revoke all on function public.link_customer(text, numeric) from public;
grant execute on function public.create_qr_intent(uuid, numeric, text) to authenticated;
grant execute on function public.approve_qr_intent(uuid) to authenticated;
grant execute on function public.set_credit_limit(uuid, numeric) to authenticated;
grant execute on function public.update_payment_profile(text, text) to authenticated;
grant execute on function public.notify_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.confirm_payment_received(uuid) to authenticated;
grant execute on function public.reject_payment_received(uuid, text) to authenticated;
grant execute on function public.link_customer(text, numeric) to authenticated;

grant select on public.profiles, public.credit_lines, public.qr_intents, public.transactions to authenticated;
grant insert on public.profiles to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'No existe la publicación supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credit_lines'
  ) then
    execute 'alter publication supabase_realtime add table public.credit_lines';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qr_intents'
  ) then
    execute 'alter publication supabase_realtime add table public.qr_intents';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.transactions';
  end if;
end;
$$;
