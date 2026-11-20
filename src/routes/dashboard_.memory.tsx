import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

export const Route = createFileRoute("/dashboard/memory")({ component: MemoryPage });

type MemoryCategory = "preference" | "infrastructure" | "workspace" | "technology" | "workflow";
type Memory = { id: string; memory_key: string; category: MemoryCategory; content: string; updated_at: string; confidence: number };
const categories: MemoryCategory[] = ["preference", "infrastructure", "workspace", "technology", "workflow"];

function MemoryPage() {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("preference");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in to manage Misma Memory.");
      const { data, error: loadError } = await supabase.from("user_memories")
        .select("id,memory_key,category,content,updated_at,confidence")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(200);
      if (loadError) throw loadError;
      const rows = (data || []) as Memory[];
      setItems(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.content])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your memories.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function save(item: Memory) {
    const content = (drafts[item.id] || "").trim();
    if (!content || content.length > 700) { setError("Memory text must contain 1–700 characters."); return; }
    setSavingId(item.id); setError(""); setNotice("");
    try {
      const { error: updateError } = await supabase.from("user_memories")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (updateError) throw updateError;
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, content } : row));
      setNotice("Memory updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this memory.");
    } finally { setSavingId(""); }
  }

  async function remove(item: Memory) {
    if (!window.confirm("Delete this memory? Misma will no longer use it in future chats.")) return;
    setSavingId(item.id); setError(""); setNotice("");
    try {
      const { error: deleteError } = await supabase.from("user_memories").delete().eq("id", item.id);
      if (deleteError) throw deleteError;
      setItems((current) => current.filter((row) => row.id !== item.id));
      setNotice("Memory deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this memory.");
    } finally { setSavingId(""); }
  }

  async function addMemory() {
    const content = newContent.trim();
    if (content.length < 4 || content.length > 700) { setError("Enter a memory between 4 and 700 characters."); return; }
    setSavingId("new"); setError(""); setNotice("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session has expired. Sign in again.");
      const key = "manual." + crypto.randomUUID();
      const { error: insertError } = await supabase.from("user_memories").insert({
        user_id: user.id, memory_key: key, category: newCategory, content,
        metadata: { source: "user_created" }, confidence: 1,
      });
      if (insertError) throw insertError;
      setNewContent("");
      setNotice("Memory added.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this memory.");
    } finally { setSavingId(""); }
  }

  return (
    <main className="misma-marketplace-page">
      <div className="misma-marketplace-shell">
        <a className="misma-marketplace-back" href="/dashboard">← Back to Misma</a>
        <header className="misma-marketplace-header">
          <div><span className="misma-marketplace-eyebrow">Your account context</span><h1>Misma Memory</h1><p>Misma Brain keeps useful preferences and project setup facts across your chats. You control what is saved.</p></div>
        </header>
        {notice && <p className="misma-marketplace-feedback is-success" role="status">{notice}</p>}
        {error && <p className="misma-marketplace-feedback is-error" role="alert">{error}</p>}
        <section className="misma-memory-add">
          <div><h2>Add a memory</h2><p>Save a project detail or preference Misma should remember in future conversations.</p></div>
          <div className="misma-memory-add-controls">
            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as MemoryCategory)} aria-label="Memory category">
              {categories.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
            </select>
            <textarea value={newContent} onChange={(event) => setNewContent(event.target.value)} maxLength={700} placeholder="Example: My Misma production workspace uses the ba-rouk/misma repository and deploys to Render." />
            <button type="button" className="misma-plugin-primary" disabled={savingId === "new"} onClick={() => void addMemory()}>{savingId === "new" ? "Saving…" : "Save memory"}</button>
          </div>
        </section>
        <section className="misma-memory-list">
          <div className="misma-marketplace-section-heading"><div><h2>What Misma remembers</h2><p>These facts may be included in future chat context for your account.</p></div><span>{items.length} memories</span></div>
          {loading ? <div className="misma-marketplace-skeleton">Loading your memory…</div> : items.length ? items.map((item) => (
            <article className="misma-memory-card" key={item.id}>
              <div className="misma-memory-card-heading"><span>{item.category}</span><small>Updated {new Date(item.updated_at).toLocaleDateString()}</small></div>
              <textarea value={drafts[item.id] ?? item.content} maxLength={700} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} aria-label="Edit memory" />
              <div className="misma-memory-card-actions">
                <span>{Math.round(Number(item.confidence || 0) * 100)}% confidence</span>
                <div><button type="button" onClick={() => setDrafts((current) => ({ ...current, [item.id]: item.content }))}>Reset</button><button type="button" className="misma-plugin-primary" disabled={savingId === item.id} onClick={() => void save(item)}>{savingId === item.id ? "Saving…" : "Save"}</button><button type="button" className="misma-plugin-danger" disabled={savingId === item.id} onClick={() => void remove(item)}>Delete</button></div>
              </div>
            </article>
          )) : <div className="misma-marketplace-empty">Misma has not saved any account memories yet. As you work, confirmed project facts and preferences can appear here.</div>}
        </section>
      </div>
    </main>
  );
}
