# Secure Admin Portal Setup

The admin portal uses Supabase Auth and a Supabase table. Do not put the admin email or password in GitHub.

## 1. Create the database table

Create a Supabase project, open SQL Editor, and run:

```sql
create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('job', 'accommodation', 'news', 'confession', 'resource', 'contact')),
  title text not null,
  submitted_at text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  flagged boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "Anyone can create pending posts" on public.posts;
drop policy if exists "Anyone can read approved posts" on public.posts;
drop policy if exists "Authenticated staff can read all posts" on public.posts;
drop policy if exists "Authenticated staff can update review status" on public.posts;

create policy "Anyone can create pending posts"
on public.posts
for insert
to anon, authenticated
with check (status = 'pending');

create policy "Anyone can read approved posts"
on public.posts
for select
to anon, authenticated
using (status = 'approved');

create policy "Authenticated staff can read all posts"
on public.posts
for select
to authenticated
using (true);

create policy "Authenticated staff can update review status"
on public.posts
for update
to authenticated
using (true)
with check (status in ('pending', 'approved', 'rejected'));
```

## 2. Create the admin login

In Supabase, go to Authentication > Users and create your admin user with an email and password. This password stays in Supabase and is not committed to GitHub.

## 3. Add GitHub repository variables

In GitHub, open Settings > Secrets and variables > Actions > Variables and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Find both values in Supabase under Project Settings > API. The anon key is public by design; never use the service role key in this website.

## 4. Open the portal

After GitHub Pages deploys, open:

`https://ottawaconfession.ca/#admin`

The fixed Staff button on the site opens the same portal on desktop and mobile.
