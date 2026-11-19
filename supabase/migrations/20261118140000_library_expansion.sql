-- LazyChef · Our own recipes in the shared library, with photo credits.
--
-- recipe_source 'lazychef': recipes LazyChef wrote for the shared library (everyday American
-- and Chinese home cooking), imported by scripts/import-lazychef-library.mjs with the server's
-- secret key. Like TheMealDB rows they have no household and a stable source_id (a slug such
-- as "us-baked-mac-and-cheese"), so re-running the import updates them in place.
--
-- Photo credit columns: a library photo is either a freely licensed photo (Wikimedia Commons:
-- CC0, public domain, CC BY, CC BY-SA), which the apps credit with the author, license and a
-- link wherever it shows, or an AI-generated image, labelled as such.
--
-- library-photos (Storage): a public bucket for those photos, resized and copied in by the
-- import script. Anyone can read them by URL; there are no policies for signed-in users, so
-- only the secret key can write.

-- ── recipe_source ───────────────────────────────────────────────────────────

alter type public.recipe_source add value if not exists 'lazychef';

-- Compared as text: a new enum value can't be used in the transaction that adds it.
alter table public.recipes drop constraint recipes_source_owner;
alter table public.recipes add constraint recipes_source_owner check (
  (source::text in ('themealdb', 'lazychef') and household_id is null and source_id is not null)
  or (source::text = 'user' and household_id is not null)
);

-- ── Photo credits ───────────────────────────────────────────────────────────

alter table public.recipes
  add column image_author text check (image_author is null or char_length(image_author) between 1 and 200),
  add column image_license text check (image_license is null or char_length(image_license) between 1 and 60),
  add column image_license_url text check (
    image_license_url is null or (char_length(image_license_url) <= 500 and image_license_url ~* '^https://')
  ),
  add column image_source_url text check (
    image_source_url is null or (char_length(image_source_url) <= 500 and image_source_url ~* '^https://')
  ),
  add column image_ai_generated boolean not null default false;

-- ── library-photos (Storage) ────────────────────────────────────────────────

-- Public read by URL, 2 MB, JPEG or WebP. No storage.objects policies: only the secret key writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-photos', 'library-photos', true, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
