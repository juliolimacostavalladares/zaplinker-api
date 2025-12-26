-- Função para verificar limites do usuário
create or replace function check_user_limits(user_uuid uuid)
returns table (
  current_links bigint,
  max_links integer,
  current_month_clicks bigint,
  max_clicks_per_month integer,
  can_create_link boolean
) as $$
begin
  return query
  select 
    (select count(*) from links where user_id = user_uuid) as current_links,
    coalesce(sp.max_links, 5) as max_links,
    (select coalesce(sum(clicks), 0) from links where user_id = user_uuid) as current_month_clicks,
    coalesce(sp.max_clicks_per_month, 1000) as max_clicks_per_month,
    (select count(*) from links where user_id = user_uuid) < coalesce(sp.max_links, 5) as can_create_link
  from users u
  left join subscription_plans sp on u.subscription_plan_id = sp.id
  where u.id = user_uuid;
end;
$$ language plpgsql;
