-- Reverses 015_caches.sql. Dropping a cache loses nothing but the warm-up:
-- every entry is derivable again from the corpus and the providers.

revoke all on answer_cache, embedding_cache, audio_cache from clovbot_app;

drop table if exists answer_cache;
drop table if exists embedding_cache;
drop table if exists audio_cache;
