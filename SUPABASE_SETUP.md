# Supabase Setup

This project uses Supabase for the public submission queue and the secure admin review portal.

The frontend expects these build-time environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the Supabase project base URL, for example `https://your-project-ref.supabase.co`. Do not use the `/rest/v1/` URL in `VITE_SUPABASE_URL`.

The anon key is public by design. Never put the Supabase `service_role` key in this website, GitHub Pages, or any frontend code.

## What The App Uses

Current app code reads and writes one table:

- `public.posts`

The app supports these post types:

- `job`
- `accommodation`
- `news`
- `confession`
- `resource`
- `contact`

Public visitors can create pending posts. Public visitors can only read approved posts. Admin users can read all posts and approve or reject them after signing in with Supabase Auth.

No Supabase Storage bucket is required by the current app code.

## SQL Setup

Open Supabase > SQL Editor and run this whole script.

```sql
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

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

create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_type_idx on public.posts(type);
create index if not exists posts_created_at_idx on public.posts(created_at desc);

alter table public.admin_users enable row level security;
alter table public.posts enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
drop policy if exists "Anyone can create pending posts" on public.posts;
drop policy if exists "Anyone can read approved posts" on public.posts;
drop policy if exists "Admins can read all posts" on public.posts;
drop policy if exists "Admins can update review status" on public.posts;
drop policy if exists "Admins can delete posts" on public.posts;

create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

create policy "Anyone can create pending posts"
on public.posts
for insert
to anon, authenticated
with check (
  status = 'pending'
  and type in ('job', 'accommodation', 'news', 'confession', 'resource', 'contact')
);

create policy "Anyone can read approved posts"
on public.posts
for select
to anon, authenticated
using (status = 'approved');

create policy "Admins can read all posts"
on public.posts
for select
to authenticated
using (public.is_admin());

create policy "Admins can update review status"
on public.posts
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin()
  and status in ('pending', 'approved', 'rejected')
);

create policy "Admins can delete posts"
on public.posts
for delete
to authenticated
using (public.is_admin());
```

## Create The Admin User

1. In Supabase, open Authentication > Users.
2. Click Add user > Create new user.
3. Enter the admin email and a strong unique password.
4. Open the new user and copy the user UUID.
5. Go back to SQL Editor and run this, replacing the values:

```sql
insert into public.admin_users (user_id, email)
values ('PASTE-AUTH-USER-UUID-HERE', 'admin@example.com')
on conflict (user_id) do update
set email = excluded.email;
```

The admin email and password stay in Supabase Auth. They are not stored in GitHub and are not stored in the React app.

Recommended Auth settings:

- Use a strong unique admin password.
- Keep the admin account limited to trusted staff only.
- Disable public sign-ups unless you intentionally add user accounts later.
- If your Supabase plan supports extra identity protections, enable them for the admin account.
- The website keeps the admin token in memory only and signs out after 20 minutes of inactivity.

## GitHub Pages Environment

The deploy workflow must provide these values during `npm run build`:

```yaml
env:
  VITE_SUPABASE_URL: https://your-project-ref.supabase.co
  VITE_SUPABASE_ANON_KEY: your-anon-public-key
```

You can either keep them directly in `.github/workflows/deploy-pages.yml` or store them as GitHub Actions variables named:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If you use GitHub Actions variables, the workflow values should be:

```yaml
env:
  VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

## Local Development

For local testing, create a `.env.local` file:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Do not commit `.env.local`.

## Admin Portal

After deployment, open:

```text
https://ottawaconfession.ca/#admin
```

The fixed Staff button opens the same portal on desktop and mobile.

If login works but the dashboard cannot load posts, confirm:

- the SQL script ran successfully;
- the Auth user UUID was inserted into `public.admin_users`;
- `VITE_SUPABASE_URL` is the base project URL, not the `/rest/v1/` URL;
- `VITE_SUPABASE_ANON_KEY` is the anon public key, not the service role key.
