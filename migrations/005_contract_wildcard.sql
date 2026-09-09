-- The formulary and corporate pages answer under every contract, so they carry
-- '*' in contract_id as well as plan_id. Without it a second contract loses both.
-- Signature and return columns are unchanged, so no client changes.

create or replace function search_hybrid(
  query_embedding vector(1536),
  query_text      text,
  p_contract_id   text,
  p_plan_id       text,
  p_plan_year     integer,
  p_limit         integer default 10,
  p_k             integer default 60,
  p_mode          text    default 'hybrid'
)
returns table (
  id text, document_id text, kind text, contract_id text, plan_id text,
  plan_year integer, section text, content text, context_prefix text, score double precision
)
language sql stable
as $$
  with scoped as (
    select c.* from chunks c
     where (c.contract_id = p_contract_id or c.contract_id = '*')
       and c.plan_year   = p_plan_year
       and (c.plan_id = p_plan_id or c.plan_id = '*')
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
             order by ts_rank_cd(s.search_vector, websearch_to_tsquery('english', query_text)) desc, s.id
           ) as rank
      from scoped s
     where p_mode in ('hybrid', 'lexical')
       and s.search_vector @@ websearch_to_tsquery('english', query_text)
     order by ts_rank_cd(s.search_vector, websearch_to_tsquery('english', query_text)) desc, s.id
     limit p_limit * 4
  ),
  fused as (
    select coalesce(d.id, l.id) as id,
           coalesce(1.0 / (p_k + d.rank), 0) + coalesce(1.0 / (p_k + l.rank), 0) as score
      from dense d
      full outer join lexical l on l.id = d.id
  )
  select s.id, s.document_id, s.kind, s.contract_id, s.plan_id, s.plan_year,
         s.section, s.content, s.context_prefix, f.score
    from fused f
    join scoped s on s.id = f.id
   order by f.score desc, s.id
   limit p_limit;
$$;
