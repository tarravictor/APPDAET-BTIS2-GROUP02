create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  type text not null default 'Task',
  priority text not null default 'Medium',
  status text not null default 'todo' check (status in ('todo', 'progress', 'review', 'done')),
  assignee text not null default 'VT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "allow all access" on public.tasks;
create policy "allow all access" on public.tasks
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  initials text unique not null,
  name text not null,
  role text not null default '',
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;

drop policy if exists "allow all access team members" on public.team_members;
create policy "allow all access team members" on public.team_members
  for all
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table public.team_members;
  end if;
end $$;

insert into public.team_members (initials, name, role) values
  ('VT', 'Victor', 'Project Manager'),
  ('EM', 'Ethan M', 'Developer'),
  ('EJ', 'Ethan J', 'Designer'),
  ('RN', 'Rain', 'QA / Reviewer'),
  ('JO', 'Joaquin', 'Developer')
on conflict (initials) do nothing;