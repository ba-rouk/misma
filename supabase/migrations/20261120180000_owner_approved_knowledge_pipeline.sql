begin;

-- Older versions of the importer marked extracted website/file knowledge as
-- approved immediately. Move those machine-generated records into the owner
-- review queue so customer answers are only published after an explicit review.
update public.knowledge_entries
set approved = false
where approved = true
  and source_type in ('website', 'file_upload');

create index if not exists knowledge_entries_pending_review_idx
  on public.knowledge_entries (workspace_id, created_at desc)
  where approved = false;

commit;
