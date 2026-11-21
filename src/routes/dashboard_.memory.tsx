import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

export const Route = createFileRoute("/dashboard/memory")({ component: MemoryPage });

type MemoryTab = "facts" | "past";
type MemoryFact = {
  id: string;
  type: string;
  fact_key: string;
  content: string;
  confidence: number;
  pinned: boolean;
  source_exchange_id: string | null;
  created_at: string;
  updated_at: string;
};
type MemoryExchange = {
  id: string;
  chat_id: number;
  summary: string;
  user_text: string;
  assistant_text: string;
  topics: string[];
  entities: string[];
  pinned: boolean;
  recall_count: number;
  created_at: string;
  website_id: string | null;
};
type MemorySettings = { enabled: boolean; retention_days: number | null };

function MemoryPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [tab, setTab] = useState<MemoryTab>("facts");
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [exchanges, setExchanges] = useState<MemoryExchange[]>([]);
  const [settings, setSettings] = useState<MemorySettings>({ enabled: true, retention_days: null });
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Sign in to manage Misma Memory.");
      const userId = auth.data.user.id;
      const [settingsResult, factsResult, exchangesResult] = await Promise.all([
        supabase.from("memory_settings").select("enabled,retention_days").eq("user_id", userId).maybeSingle(),
        supabase.from("memory_facts").select("id,type,fact_key,content,confidence,pinned,source_exchange_id,created_at,updated_at")
          .eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(300),
        supabase.from("memory_exchanges").select("id,chat_id,summary,user_text,assistant_text,topics,entities,pinned,recall_count,created_at,website_id")
          .eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(300),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (factsResult.error) throw factsResult.error;
      if (exchangesResult.error) throw exchangesResult.error;
      setSettings({
        enabled: settingsResult.data?.enabled !== false,
        retention_days: settingsResult.data?.retention_days ?? null,
      });
      setFacts((factsResult.data || []) as MemoryFact[]);
      setExchanges((exchangesResult.data || []) as MemoryExchange[]);
      setDrafts(Object.fromEntries((factsResult.data || []).map((item: any) => [item.id, item.content])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your memories.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const visibleFacts = useMemo(() => facts.filter((item) =>
    !search.trim() || (item.content + " " + item.type + " " + item.fact_key).toLowerCase().includes(search.trim().toLowerCase())
  ), [facts, search]);
  const visibleExchanges = useMemo(() => exchanges.filter((item) =>
    !search.trim() || (item.summary + " " + item.user_text + " " + (item.topics || []).join(" ") + " " + (item.entities || []).join(" "))
      .toLowerCase().includes(search.trim().toLowerCase())
  ), [exchanges, search]);

  async function saveSettings(next: MemorySettings) {
    setBusy("settings");
    setError("");
    setNotice("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired.");
      const { error: saveError } = await supabase.from("memory_settings").upsert({
        user_id: auth.data.user.id,
        enabled: next.enabled,
        retention_days: next.retention_days,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (saveError) throw saveError;
      setSettings(next);
      setNotice("Memory settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save memory settings.");
    } finally { setBusy(""); }
  }

  async function saveFact(item: MemoryFact) {
    const content = (drafts[item.id] || "").trim();
    if (!content || content.length > 1200) { setError("Memory text must contain 1–1,200 characters."); return; }
    setBusy(item.id);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await supabase.from("memory_facts").update({
        content,
        embedding: null,
        embedding_model: null,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      if (updateError) throw updateError;
      setEditingId("");
      setNotice("Memory updated. Keyword recall remains available while its embedding is refreshed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this memory.");
    } finally { setBusy(""); }
  }

  async function addFact() {
    const content = newFact.trim();
    if (content.length < 4 || content.length > 1200) { setError("Enter a memory between 4 and 1,200 characters."); return; }
    setBusy("new-fact");
    setError("");
    setNotice("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired.");
      const key = "manual_" + crypto.randomUUID().replace(/-/g, "");
      const { error: insertError } = await supabase.from("memory_facts").insert({
        user_id: auth.data.user.id,
        type: newType,
        fact_key: key,
        content,
        confidence: 1,
        pinned: true,
      });
      if (insertError) throw insertError;
      setNewFact("");
      setNotice("Memory added.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this memory.");
    } finally { setBusy(""); }
  }

  async function togglePin(kind: MemoryTab, id: string, pinned: boolean) {
    setBusy(id);
    setError("");
    try {
      const table = kind === "facts" ? "memory_facts" : "memory_exchanges";
      const { error: updateError } = await supabase.from(table).update({ pinned: !pinned }).eq("id", id);
      if (updateError) throw updateError;
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the pin.");
    } finally { setBusy(""); }
  }

  async function deleteFact(item: MemoryFact) {
    if (!window.confirm("Delete this saved fact and its embedding? Misma will stop recalling it.")) return;
    setBusy(item.id);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("memory_facts").delete().eq("fact_key", item.fact_key);
      if (deleteError) throw deleteError;
      setNotice("Memory deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this memory.");
    } finally { setBusy(""); }
  }

  async function deleteExchange(item: MemoryExchange) {
    if (!window.confirm("Delete this past conversation memory and all facts distilled from it? The original chat will remain in Recents.")) return;
    setBusy(item.id);
    setError("");
    try {
      const { data: sourceFacts, error: sourceFactsError } = await supabase.from("memory_facts")
        .select("fact_key").eq("source_exchange_id", item.id);
      if (sourceFactsError) throw sourceFactsError;
      const factKeys = [...new Set((sourceFacts || []).map((fact: any) => String(fact.fact_key)))];
      for (const factKey of factKeys) {
        const { error: factsError } = await supabase.from("memory_facts").delete().eq("fact_key", factKey);
        if (factsError) throw factsError;
      }
      const { error: exchangeError } = await supabase.from("memory_exchanges").delete().eq("id", item.id);
      if (exchangeError) throw exchangeError;
      setNotice("Past conversation memory deleted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this conversation memory.");
    } finally { setBusy(""); }
  }

  async function openOriginalChat(chatId: number) {
    try {
      localStorage.setItem("misma_dashboard_view_v1", JSON.stringify({ activeTab: "workspace", conversationId: chatId }));
    } catch { /* Continue to the dashboard even when storage is unavailable. */ }
    window.location.assign("/dashboard");
  }

  function exportMemory() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      facts,
      pastConversations: exchanges,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "misma-memory-export.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function resetMemory() {
    if (!window.confirm("Reset all Misma Memory? This permanently deletes saved facts, past conversation summaries and their embeddings. Your original chats remain unchanged.")) return;
    setBusy("reset");
    setError("");
    setNotice("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error("Your session has expired.");
      const userId = auth.data.user.id;
      const legacyResult = await supabase.from("user_memories").delete().eq("user_id", userId);
      if (legacyResult.error) throw legacyResult.error;
      const factsResult = await supabase.from("memory_facts").delete().eq("user_id", userId);
      if (factsResult.error) throw factsResult.error;
      const exchangesResult = await supabase.from("memory_exchanges").delete().eq("user_id", userId);
      if (exchangesResult.error) throw exchangesResult.error;
      const cacheResult = await supabase.from("memory_embedding_cache").delete().eq("user_id", userId);
      if (cacheResult.error) throw cacheResult.error;
      await supabase.from("memory_backfill_jobs").delete().eq("user_id", userId);
      setNotice("All saved memory has been reset.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset memory.");
    } finally { setBusy(""); }
  }


  return (
    <main className="misma-marketplace-page misma-memory-page">
      <div className="misma-marketplace-shell misma-memory-shell">
        <button type="button" className="misma-page-back-button" aria-label="Go to previous page" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/dashboard"); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6M9 12h12" /></svg></button>
        <header className="misma-plugin-directory-header">
          <div className="misma-plugin-header-title">
            <div>
              <span className="misma-marketplace-eyebrow">Your account context</span>
              <h1>Misma Memory</h1>
            </div>
          </div>
          <button type="button" className="misma-ui-button is-secondary" onClick={exportMemory}>Export</button>
        </header>

        <section className="misma-glass-card misma-memory-settings">
          <div>
            <strong>Generate memory from chats</strong>
          </div>
          <label className="misma-memory-toggle">
            <input type="checkbox" checked={settings.enabled} disabled={busy === "settings"} onChange={(event) => void saveSettings({ ...settings, enabled: event.target.checked })} />
            <span>{settings.enabled ? "On" : "Off"}</span>
          </label>
          <label className="misma-memory-retention">
            <span>Retention</span>
            <select value={settings.retention_days == null ? "all" : String(settings.retention_days)} disabled={busy === "settings"} onChange={(event) => {
              const value = event.target.value === "all" ? null : Number(event.target.value);
              void saveSettings({ ...settings, retention_days: value });
            }}>
              <option value="all">Keep until I delete</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
        </section>


        {notice && <p className="misma-plugin-feedback" role="status">{notice}</p>}
        {error && <p className="misma-plugin-feedback is-error" role="alert">{error}</p>}

        <div className="misma-memory-toolbar">
          <div className="misma-memory-tabs" role="tablist" aria-label="Memory views">
            <button type="button" role="tab" aria-selected={tab === "facts"} className={tab === "facts" ? "is-active" : ""} onClick={() => setTab("facts")}>Facts <span>{facts.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "past"} className={tab === "past" ? "is-active" : ""} onClick={() => setTab("past")}>Past conversations <span>{exchanges.length}</span></button>
          </div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search memory…" aria-label="Search memory" />
        </div>

        {loading ? <div className="misma-marketplace-skeleton">Loading your memory…</div> : tab === "facts" ? (
          <section className="misma-memory-list">
            {visibleFacts.length ? visibleFacts.map((item) => (
              <article className="misma-glass-card misma-memory-card" key={item.id}>
                <div className="misma-memory-card-heading"><span>{item.type}</span><small>Updated {new Date(item.updated_at).toLocaleDateString()}</small></div>
                {editingId === item.id ? (
                  <textarea value={drafts[item.id] ?? item.content} maxLength={1200} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} aria-label="Edit memory fact" />
                ) : <p>{item.content}</p>}
                <div className="misma-memory-card-actions">
                  <span>{Math.round(Number(item.confidence || 0) * 100)}% confidence</span>
                  <div>
                    <button type="button" onClick={() => void togglePin("facts", item.id, item.pinned)} disabled={busy === item.id}>{item.pinned ? "Unpin" : "Pin"}</button>
                    {editingId === item.id ? <>
                      <button type="button" onClick={() => { setEditingId(""); setDrafts((current) => ({ ...current, [item.id]: item.content })); }}>Cancel</button>
                      <button type="button" className="misma-ui-button is-primary" disabled={busy === item.id} onClick={() => void saveFact(item)}>{busy === item.id ? "Saving…" : "Save"}</button>
                    </> : <button type="button" onClick={() => setEditingId(item.id)}>Edit</button>}
                    <button type="button" className="is-danger" disabled={busy === item.id} onClick={() => void deleteFact(item)}>Delete</button>
                  </div>
                </div>
              </article>
            )) : <div className="misma-marketplace-empty">No saved facts match this search.</div>}
          </section>
        ) : (
          <section className="misma-memory-list">
            {visibleExchanges.length ? visibleExchanges.map((item) => (
              <article className="misma-glass-card misma-memory-exchange" key={item.id}>
                <div className="misma-memory-card-heading"><span>{new Date(item.created_at).toLocaleString()}</span><small>{item.recall_count} recalls</small></div>
                <p>{item.summary}</p>
                <div className="misma-memory-tags">{[...(item.topics || []), ...(item.entities || [])].slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
                <details>
                  <summary>View original exchange</summary>
                  <div className="misma-memory-exchange-original"><strong>You</strong><p>{item.user_text}</p><strong>Misma</strong><p>{item.assistant_text}</p></div>
                </details>
                <div className="misma-memory-card-actions">
                  <span>Exchange {item.id.slice(0, 8)}</span>
                  <div>
                    <button type="button" onClick={() => void togglePin("past", item.id, item.pinned)} disabled={busy === item.id}>{item.pinned ? "Unpin" : "Pin"}</button>
                    <button type="button" onClick={() => void openOriginalChat(item.chat_id)}>Open original chat</button>
                    <button type="button" className="is-danger" disabled={busy === item.id} onClick={() => void deleteExchange(item)}>Delete</button>
                  </div>
                </div>
              </article>
            )) : <div className="misma-marketplace-empty">No past conversations match this search.</div>}
          </section>
        )}

        <div className="misma-memory-danger-zone">
          <div><strong>Reset all memory</strong><p>Permanently delete all saved facts, conversation summaries and embeddings. Original chats are not deleted.</p></div>
          <button type="button" className="misma-ui-button is-destructive" disabled={busy === "reset"} onClick={() => void resetMemory()}>{busy === "reset" ? "Resetting…" : "Reset all memory"}</button>
        </div>
      </div>
    </main>
  );
}
