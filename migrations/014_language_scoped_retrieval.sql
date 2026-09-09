-- Spanish documents alongside the English ones, scoped by language before
-- ranking rather than filtered after it. FR-P3-31, FR-P3-32, FR-P3-33.
--
-- Two changes that have to happen together. Chunks gain a language, and the
-- lexical half stems in that language: running Spanish text through the English
-- configuration strips English stopwords, stems nothing, and quietly makes the
-- lexical half of hybrid retrieval useless on half the corpus.
--
-- The configuration is chosen per row by a case over constants. Casting the
-- column itself, `language::regconfig`, is a catalog lookup and therefore only
-- stable, which a generated column will not accept.

alter table chunks add column if not exists language text not null default 'english';

alter table chunks drop constraint if exists chunks_language_check;
alter table chunks add constraint chunks_language_check
  check (language in ('english', 'spanish'));

alter table chunks drop column if exists search_vector;
alter table chunks add column search_vector tsvector
  generated always as (
    case language
      when 'spanish'
        then to_tsvector('spanish'::regconfig,
               coalesce(context_prefix, '') || ' ' || coalesce(content, ''))
      else to_tsvector('english'::regconfig,
             coalesce(context_prefix, '') || ' ' || coalesce(content, ''))
    end
  ) stored;

create index if not exists chunks_search_gin on chunks using gin (search_vector);
create index if not exists chunks_language on chunks (language, contract_id, plan_id, plan_year);

-- The old signature has to go rather than sit beside the new one: an eight
-- argument call would become ambiguous and fail at the call site.
drop function if exists search_hybrid(vector, text, text, text, integer, integer, integer, text);

create or replace function search_hybrid(
  query_embedding vector(1536),
  query_text      text,
  p_contract_id   text,
  p_plan_id       text,
  p_plan_year     integer,
  p_language      text    default 'english',
  p_limit         integer default 10,
  p_k             integer default 60,
  p_mode          text    default 'hybrid'
)
returns table (
  id text, document_id text, kind text, contract_id text, plan_id text,
  plan_year integer, section text, content text, context_prefix text,
  language text, score double precision
)
language sql stable
as $$
  with scoped as (
    select c.* from chunks c
     where (c.contract_id = p_contract_id or c.contract_id = '*')
       and c.plan_year   = p_plan_year
       and (c.plan_id = p_plan_id or c.plan_id = '*')
       -- FR-P3-33. Before ranking, like the plan scope, so a Spanish question
       -- cannot retrieve an English chunk however well it scores.
       and c.language = p_language
  ),
  dense as (
    select s.id, row_number() over (order by s.embedding <=> query_embedding, s.id) as rank
      from scoped s
     where p_mode in ('hybrid', 'dense')
     order by s.embedding <=> query_embedding, s.id
     limit p_limit * 4
  ),
  lexical as (
    select s.id,
           row_number() over (
             order by ts_rank_cd(
               s.search_vector, websearch_to_tsquery(p_language::regconfig, query_text)
             ) desc, s.id
           ) as rank
      from scoped s
     where p_mode in ('hybrid', 'lexical')
       and s.search_vector @@ websearch_to_tsquery(p_language::regconfig, query_text)
     order by ts_rank_cd(
       s.search_vector, websearch_to_tsquery(p_language::regconfig, query_text)
     ) desc, s.id
     limit p_limit * 4
  ),
  fused as (
    select coalesce(d.id, l.id) as id,
           coalesce(1.0 / (p_k + d.rank), 0) + coalesce(1.0 / (p_k + l.rank), 0) as score
      from dense d
      full outer join lexical l on l.id = d.id
  )
  select s.id, s.document_id, s.kind, s.contract_id, s.plan_id, s.plan_year,
         s.section, s.content, s.context_prefix, s.language, f.score
    from fused f
    join scoped s on s.id = f.id
   order by f.score desc, s.id
   limit p_limit;
$$;

-- The grant was on the old signature and does not follow the function.
grant execute on function
  search_hybrid(vector, text, text, text, integer, text, integer, integer, text) to clovbot_app;
