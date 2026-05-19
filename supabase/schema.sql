create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  generation_limit integer not null default 3,
  generations_used integer not null default 0,
  stripe_customer_id text,
  last_payment_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template text,
  research_title text,
  research_type text,
  output text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.generations enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can read own generations" on public.generations;
create policy "Users can read own generations" on public.generations for select using (auth.uid() = user_id);
