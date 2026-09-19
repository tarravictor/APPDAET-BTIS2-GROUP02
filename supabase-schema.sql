create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  type text not null default 'Task',
  priority text not null default 'Medium',
  status text not null default 'todo' check (status in ('todo', 'progress', 'review', 'done')),
  assignee text not null default 'VT',
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "allow all access" on public.tasks
  for all
  using (true)
  with check (true);

alter publication supabase_realtime add table public.tasks;