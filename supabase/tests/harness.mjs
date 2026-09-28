// Runs supabase/migrations against PGlite (in-process Postgres) with small
// stand-ins for the parts of Supabase they touch: roles, auth.users/auth.uid(),
// realtime.messages/topic()/broadcast_changes(). No Docker needed.
//
// These stand-ins mimic Supabase closely enough to test SQL and RLS logic;
// the real check is still applying migrations to the hosted project.
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dirname, "..", "migrations")

const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema extensions;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema realtime;
  grant usage on schema realtime to authenticated;
  create table realtime.messages (
    id bigserial primary key, topic text, extension text, event text, payload jsonb, private boolean
  );
  alter table realtime.messages enable row level security;
  grant select on realtime.messages to authenticated;
  create function realtime.topic() returns text language sql stable as $$
    select current_setting('realtime.topic', true)
  $$;
  create function realtime.broadcast_changes(
    topic_name text, event_name text, operation text, table_name text, table_schema text,
    new record, old record, level text default 'ROW'
  ) returns void language plpgsql security definer as $$
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (topic_name, 'broadcast', event_name,
      jsonb_build_object('table', table_name, 'operation', operation,
        'record', to_jsonb(new), 'old_record', to_jsonb(old)), true);
  end $$;
`

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STANDINS)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"))
  }

  /** Run SQL as the database owner (bypasses RLS). */
  const q = async (sql, params) => (await db.query(sql, params)).rows

  /** Run fn as a signed-in user (or anon when user is null), optionally on a realtime topic. */
  async function as(user, fn, { topic = "" } = {}) {
    await db.query(
      "select set_config('request.jwt.claim.sub', $1, false), set_config('realtime.topic', $2, false)",
      [user ?? "", topic],
    )
    await db.exec(user ? "set role authenticated" : "set role anon")
    try {
      return await fn()
    } finally {
      await db.exec("reset role")
    }
  }

  async function createUser(email, metadata = {}) {
    const [row] = await q("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [
      email,
      metadata,
    ])
    return row.id
  }

  return { db, q, as, createUser }
}

/** Assert that a query fails with a message matching `pattern`. */
export async function assertRejects(fn, pattern) {
  await assert.rejects(fn, (error) => {
    assert.match(error.message, pattern)
    return true
  })
}
