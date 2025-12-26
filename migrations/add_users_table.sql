-- Criar tabela users
create table public.users (
  id uuid not null default extensions.uuid_generate_v4(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  subscription_plan_id uuid null,
  subscription_status text null default 'active' check (subscription_status in ('active', 'expired', 'cancelled')),
  subscription_expires_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint users_pkey primary key (id)
) tablespace pg_default;

-- Criar tabela subscription_plans
create table public.subscription_plans (
  id uuid not null default extensions.uuid_generate_v4(),
  name text not null,
  price numeric(10,2) not null,
  max_links integer not null,
  max_clicks_per_month integer not null,
  features jsonb null default '{}',
  created_at timestamp with time zone null default now(),
  constraint subscription_plans_pkey primary key (id)
) tablespace pg_default;

-- Adicionar foreign key de users para subscription_plans
alter table public.users 
add constraint users_subscription_plan_id_fkey 
foreign key (subscription_plan_id) references subscription_plans (id);

-- Adicionar user_id às tabelas existentes
alter table public.links add column user_id uuid null;
alter table public.links 
add constraint links_user_id_fkey 
foreign key (user_id) references users (id) on delete cascade;

-- Inserir plano básico padrão
insert into public.subscription_plans (name, price, max_links, max_clicks_per_month, features)
values ('Básico', 0.00, 5, 1000, '{"analytics": false, "custom_domain": false}');