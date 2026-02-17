-- ============================================================
-- Expt Indexer — Supabase Schema
-- Run this in Supabase SQL Editor to create the tables.
-- ============================================================

-- Builders
create table if not exists builders (
  id                uuid primary key default gen_random_uuid(),
  address           text unique not null,
  wallet            text unique not null,
  x_username        text not null,
  github            text,
  telegram          text,
  active_experiment text,
  experiment_count  int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Experiments
create table if not exists experiments (
  id                        uuid primary key default gen_random_uuid(),
  address                   text unique not null,
  builder_wallet            text not null references builders(wallet),
  name                      text not null,
  uri                       text not null default '',
  mint                      text not null,
  status                    int default 0,
  milestone_count           int not null,
  presale_minimum_cap       bigint not null,
  veto_threshold_bps        int not null,
  challenge_window          bigint not null,
  total_treasury_received   bigint default 0,
  total_claimed_by_builder  bigint default 0,
  pool_launched             boolean default false,
  damm_pool                 text,
  total_supply              bigint default 0,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- Milestones
create table if not exists milestones (
  id                uuid primary key default gen_random_uuid(),
  experiment_addr   text not null references experiments(address),
  index             int not null,
  description       text not null,
  unlock_percent    int not null,
  deliverable_type  int not null,
  deadline          timestamptz not null,
  status            int default 0,
  deliverable       text,
  submitted_at      timestamptz,
  total_veto_stake  bigint default 0,
  unique (experiment_addr, index)
);

-- Event log (immutable timeline)
create table if not exists experiment_events (
  id                uuid primary key default gen_random_uuid(),
  experiment_addr   text not null references experiments(address),
  event_type        text not null,
  tx_signature      text not null,
  slot              bigint not null,
  block_time        timestamptz not null,
  data              jsonb not null,
  created_at        timestamptz default now()
);

-- Indexes
create index if not exists idx_events_experiment on experiment_events(experiment_addr, event_type);
create index if not exists idx_events_time on experiment_events(block_time);
create index if not exists idx_experiments_status on experiments(status);
create index if not exists idx_experiments_builder on experiments(builder_wallet);

-- Row-Level Security (enable for production)
-- alter table builders enable row level security;
-- alter table experiments enable row level security;
-- alter table milestones enable row level security;
-- alter table experiment_events enable row level security;

-- Read-only policies (uncomment for production)
-- create policy "Public read" on builders for select using (true);
-- create policy "Public read" on experiments for select using (true);
-- create policy "Public read" on milestones for select using (true);
-- create policy "Public read" on experiment_events for select using (true);
