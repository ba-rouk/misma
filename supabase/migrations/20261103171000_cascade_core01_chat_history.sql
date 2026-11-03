begin;
alter table public.core_01_experiences
  drop constraint if exists core_01_experiences_source_conversation_id_fkey;
alter table public.core_01_experiences
  add constraint core_01_experiences_source_conversation_id_fkey
  foreign key (source_conversation_id)
  references public.conversations(id)
  on delete cascade;
commit;