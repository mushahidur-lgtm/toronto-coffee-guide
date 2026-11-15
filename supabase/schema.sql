-- ---------------------------------------------------------------------------
-- Toronto Coffee Guide — PostgreSQL / Supabase schema
-- Run in the Supabase SQL editor (or psql) once, then `npm run db:seed`.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() is STABLE, which generated columns don't allow; wrap it so "bánh mì" indexes as "banh mi".
create or replace function public.immutable_unaccent(text)
  returns text language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create or replace function public.immutable_array_to_string(text[], text)
  returns text language sql immutable parallel safe
  as $$ select coalesce(array_to_string($1, $2), '') $$;

create table if not exists public.cafes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  description         text,
  address             text,
  neighbourhood       text not null,
  latitude            double precision,
  longitude           double precision,
  website_url         text,
  google_maps_url     text,
  google_place_id     text unique,          -- the only Google field stored permanently (allowed by Google's terms)
  phone               text,
  instagram_url       text,
  image_url           text,                 -- own/licensed photo of THIS cafe only
  image_credit        text,
  specialty_drinks    text[] not null default '{}',
  food_offerings      text[] not null default '{}',
  cuisine_types       text[] not null default '{}',
  cafe_categories     text[] not null default '{}',
  tags                text[] not null default '{}',
  opening_hours       text[],               -- editorial, manually verified hours ("Monday: 8:00 AM – 6:00 PM"); null = unknown
  featured            boolean not null default false,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'closed')),
  source              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Weighted full-text document: name (A) > categories/cuisine/neighbourhood (B) > drinks/food/tags (C) > description/address (D)
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(name, ''))), 'A') ||
    setweight(to_tsvector('english', immutable_unaccent(
      immutable_array_to_string(cafe_categories, ' ') || ' ' || immutable_array_to_string(cuisine_types, ' ') || ' ' || coalesce(neighbourhood, '')
    )), 'B') ||
    setweight(to_tsvector('english', immutable_unaccent(
      immutable_array_to_string(specialty_drinks, ' ') || ' ' || immutable_array_to_string(food_offerings, ' ') || ' ' || immutable_array_to_string(tags, ' ')
    )), 'C') ||
    setweight(to_tsvector('english', immutable_unaccent(coalesce(description, '') || ' ' || coalesce(address, ''))), 'D')
  ) stored
);

create index if not exists cafes_search_idx        on public.cafes using gin (search_vector);
create index if not exists cafes_name_trgm_idx     on public.cafes using gin (name gin_trgm_ops);
create index if not exists cafes_neighbourhood_idx on public.cafes (neighbourhood);
create index if not exists cafes_categories_idx    on public.cafes using gin (cafe_categories);
create index if not exists cafes_drinks_idx        on public.cafes using gin (specialty_drinks);
create index if not exists cafes_food_idx          on public.cafes using gin (food_offerings);
create index if not exists cafes_cuisine_idx       on public.cafes using gin (cuisine_types);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists cafes_touch on public.cafes;
create trigger cafes_touch before update on public.cafes for each row execute function public.touch_updated_at();

-- Server-side search for large datasets (500+ cafes). Prefix matching on each word ("matc" → matcha),
-- plus trigram fallback on names for typos.
--   select * from search_cafes('vietnamese coffee');
create or replace function public.search_cafes(q text, max_results int default 50)
returns setof public.cafes language sql stable as $$
  with terms as (
    select string_agg(t || ':*', ' & ') as tsq
    from regexp_split_to_table(lower(immutable_unaccent(trim(q))), '[^a-z0-9]+') t
    where t <> ''
  )
  select c.*
  from public.cafes c, terms
  where c.verification_status <> 'closed'
    and (
      (terms.tsq is not null and c.search_vector @@ to_tsquery('english', terms.tsq))
      or similarity(c.name, q) > 0.3
    )
  order by ts_rank(c.search_vector, to_tsquery('english', coalesce(terms.tsq, ''))) desc, similarity(c.name, q) desc, c.name
  limit max_results
$$;

-- Row-level security: public read, writes only with the service-role key (scripts / admin).
alter table public.cafes enable row level security;
drop policy if exists "Public read" on public.cafes;
create policy "Public read" on public.cafes for select using (true);
