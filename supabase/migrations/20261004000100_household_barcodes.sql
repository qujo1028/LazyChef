-- LazyChef · Phase 7: barcode scanning.
--
-- household_barcodes: what a household calls a scanned product. The first scan
-- is looked up in Open Food Facts; whatever name the household ends up adding
-- is remembered here, so the next scan of that code is instant and already
-- named the household's way ("eggs", not "Kirkland Signature Large Brown Eggs").

create table public.household_barcodes (
  household_id uuid not null references public.households (id) on delete cascade,
  -- UPC-A / EAN-13 / EAN-8 / UPC-E digits (GTIN-14 allowed), normalized by the app.
  code text not null check (code ~ '^[0-9]{8,14}$'),
  name text not null check (char_length(name) between 1 and 80),
  -- One package: 24 (count), 1 (gal). null = no particular amount.
  quantity numeric check (quantity is null or (quantity > 0 and quantity <= 1000000)),
  unit text not null default 'count' check (char_length(unit) between 1 and 24),
  saved_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, code)
);

create index household_barcodes_saved_by_idx on public.household_barcodes (saved_by);

-- Who saved it and when come from the session and the server's clock.
create function private.stamp_household_barcode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.saved_by := coalesce((select auth.uid()), new.saved_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger stamp_household_barcode
  before insert or update on public.household_barcodes
  for each row execute function private.stamp_household_barcode();

alter table public.household_barcodes enable row level security;

create policy "Members see their household's barcodes"
  on public.household_barcodes for select to authenticated
  using (private.is_member(household_id));

create policy "Members add their household's barcodes"
  on public.household_barcodes for insert to authenticated
  with check (private.is_member(household_id));

create policy "Members update their household's barcodes"
  on public.household_barcodes for update to authenticated
  using (private.is_member(household_id))
  with check (private.is_member(household_id));

create policy "Members remove their household's barcodes"
  on public.household_barcodes for delete to authenticated
  using (private.is_member(household_id));

revoke all on table public.household_barcodes from anon, authenticated;
grant select, delete on table public.household_barcodes to authenticated;
grant insert (household_id, code, name, quantity, unit) on table public.household_barcodes to authenticated;
grant update (name, quantity, unit) on table public.household_barcodes to authenticated;
