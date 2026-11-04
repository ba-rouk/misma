(() => {
  const script = document.currentScript;
  if (!script || script.dataset.mismaLoaded === "true") return;
  script.dataset.mismaLoaded = "true";

  const websiteKey = script.dataset.websiteKey || "";
  const endpoint = script.dataset.endpoint || "";
  const apiKey = script.dataset.apiKey || "";
  if (!websiteKey || !endpoint || !apiKey) {
    console.warn("[Misma] Widget setup is incomplete. Check the installation snippet.");
    return;
  }

  const host = document.createElement("div");
  host.setAttribute("data-misma-widget", "");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .launcher { position: fixed; right: 22px; bottom: 22px; z-index: 2147483000; border: 0; border-radius: 999px; min-width: 58px; height: 58px; padding: 0 20px; display:flex; align-items:center; justify-content:center; gap:10px; background:#111827; color:#fff; box-shadow:0 12px 40px #0003; cursor:pointer; font-family:inherit; font-size:14px; font-weight:600; line-height:1; }
    .brandmark { width:24px; height:24px; display:grid; place-items:center; border:1.5px solid #fff; border-radius:8px; font-size:16px; line-height:1; }
    .panel { position:fixed; right:22px; bottom:92px; z-index:2147483000; width:min(380px,calc(100vw - 28px)); height:min(580px,calc(100dvh - 120px)); display:none; overflow:hidden; border:1px solid #dbe2ea; border-radius:18px; background:#fff; box-shadow:0 24px 75px #0b142433; color:#182230; }
    .panel.open { display:flex; flex-direction:column; }
    .head { display:flex; align-items:center; gap:10px; padding:13px 14px; background:#111827; color:#fff; }
    .head-brand { width:34px;height:34px;border:1px solid #536174;border-radius:11px;display:grid;place-items:center;font-weight:700; }
    .head-copy { flex:1; min-width:0; }
    .head-copy b { display:block; font-size:14px; line-height:1.3; }
    .head-copy small { display:block; margin-top:2px; color:#c2ccd8; font-size:11px; }
    .head button { width:34px;height:34px;border:1px solid #465366;border-radius:10px;background:#202a39;color:#fff;display:grid;place-items:center;cursor:pointer; }
    .head button svg { width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round; }
    .messages { flex:1; min-height:0; overflow:auto; padding:15px; display:flex; flex-direction:column; gap:10px; background:#f7f9fc; }
    .bubble { max-width:88%; padding:10px 12px; border-radius:14px; font-size:13px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
    .bubble.ai { align-self:flex-start; background:#fff; border:1px solid #e5eaf0; color:#202c3a; border-top-left-radius:4px; }
    .bubble.visitor { align-self:flex-end; background:#1c2939; color:#fff; border-top-right-radius:4px; }
    .status { padding:7px 12px; font-size:11px; color:#6a7888; text-align:center; }
    .composer { display:flex; align-items:flex-end; gap:8px; padding:11px; border-top:1px solid #e7ebf1; background:#fff; }
    .composer textarea { flex:1; min-width:0; max-height:110px; min-height:40px; padding:10px 11px; border:1px solid #d9e0e8; border-radius:12px; outline:none; resize:none; font-family:inherit; font-size:13px; font-weight:400; line-height:1.45; color:#182230; background:#fff; }
    .composer textarea:focus { border-color:#7188a8; box-shadow:0 0 0 3px #7188a81c; }
    .send { width:40px;height:40px;flex:none;border:0;border-radius:12px;background:#172435;color:#fff;display:grid;place-items:center;cursor:pointer;font-size:18px; }
    .send:disabled { opacity:.45;cursor:wait; }
    .handoff { display:none; flex-direction:column; gap:10px; padding:16px; background:#fff; }
    .handoff.open { display:flex; }
    .handoff h3 { margin:0; font-size:16px; }
    .handoff p { margin:0; color:#68778a; font-size:12px; line-height:1.5; }
    .handoff input,.handoff textarea { width:100%; padding:10px 11px; border:1px solid #dce3eb; border-radius:10px; background:#fff; color:#172233; font-family:inherit; font-size:13px; font-weight:400; line-height:1.4; }
    .handoff textarea { min-height:72px; resize:vertical; }
    .handoff-actions { display:flex; gap:8px; justify-content:flex-end; }
    .handoff-actions button { border:1px solid #d6dde6; border-radius:9px; background:#fff; color:#243246; padding:9px 12px; font-size:12px; cursor:pointer; }
    .handoff-actions .primary { border-color:#172435; background:#172435; color:#fff; }
    @media(max-width:520px) { .launcher { right:14px; bottom:14px; } .panel { right:10px; bottom:82px; width:calc(100vw - 20px); height:min(620px,calc(100dvh - 100px)); } }
  `;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = `
    <button class="launcher" type="button" aria-label="Open chat with Misma"><span class="brandmark">M</span><span>Chat with us</span></button>
    <section class="panel" aria-label="Misma customer support chat" aria-live="polite">
      <header class="head">
        <span class="head-brand">M</span>
        <span class="head-copy"><b>Chat with us</b><small>Powered by Misma</small></span>
        <button class="human" type="button" aria-label="Request a human" title="Request a human">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.2"/><path d="M5 21v-1.5a7 7 0 0 1 14 0V21"/></svg>
        </button>
        <button class="close" type="button" aria-label="Close chat">
          <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="messages"><div class="bubble ai">Hello! How can I help you today?</div></div>
      <div class="status" role="status"></div>
      <form class="composer"><textarea rows="1" aria-label="Your message" placeholder="Write a message…"></textarea><button class="send" type="submit" aria-label="Send message">↑</button></form>
      <form class="handoff">
        <h3>Talk to a person</h3>
        <p>Share your contact details so the team can follow up in this conversation.</p>
        <input name="visitorName" maxlength="120" placeholder="Your name" autocomplete="name"/>
        <input name="visitorEmail" type="email" maxlength="254" placeholder="Email address (optional)" autocomplete="email"/>
        <textarea name="requestNote" maxlength="1000" placeholder="What would you like help with?"></textarea>
        <div class="handoff-actions"><button class="cancel" type="button">Back to chat</button><button class="primary" type="submit">Request human support</button></div>
      </form>
    </section>
  `;
  shadow.appendChild(root);

  const $ = (selector) => root.querySelector(selector);
  const launcher = $(".launcher");
  const panel = $(".panel");
  const messages = $(".messages");
  const composer = $(".composer");
  const textarea = composer.querySelector("textarea");
  const sendButton = $(".send");
  const status = $(".status");
  const handoffForm = $(".handoff");
  let conversationId = null;
  let busy = false;
  let humanRequested = false;
  const storageKey = "misma_widget_session_" + websiteKey;
  let visitorSessionId = "";
  try {
    visitorSessionId = sessionStorage.getItem(storageKey) || "";
    if (!visitorSessionId) {
      visitorSessionId = crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
      sessionStorage.setItem(storageKey, visitorSessionId);
    }
  } catch {
    visitorSessionId = crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "");
  }

  const addMessage = (text, type) => {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + type;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  };
  const setStatus = (text) => { status.textContent = text || ""; };
  const setBusy = (value) => {
    busy = value;
    sendButton.disabled = value;
    textarea.disabled = value || humanRequested;
  };
  const request = async (body) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ ...body, websiteKey }),
    });
    let result = {};
    try { result = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(result.error || "Misma could not complete that request.");
    return result;
  };

  launcher.addEventListener("click", () => { panel.classList.add("open"); launcher.hidden = true; textarea.focus(); });
  $(".close").addEventListener("click", () => { panel.classList.remove("open"); launcher.hidden = false; });
  $(".human").addEventListener("click", () => {
    handoffForm.classList.add("open");
    composer.style.display = "none";
    setStatus("");
    handoffForm.querySelector("input").focus();
  });
  $(".cancel").addEventListener("click", () => {
    handoffForm.classList.remove("open");
    composer.style.display = "flex";
  });

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message || busy || humanRequested) return;
    textarea.value = "";
    addMessage(message, "visitor");
    setBusy(true);
    setStatus("Misma is replying…");
    try {
      const result = await request({ action: "widget-chat", message, visitorSessionId, conversationId });
      conversationId = result.conversationId || conversationId;
      if (result.aiMessage?.text) addMessage(result.aiMessage.text, "ai");
      setStatus("");
    } catch (error) {
      addMessage(error instanceof Error ? error.message : "Could not send your message. Please try again.", "ai");
      setStatus("Message not sent");
    } finally {
      setBusy(false);
      textarea.focus();
    }
  });

  handoffForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!conversationId || busy || humanRequested) {
      setStatus("Send a message first, then request a human.");
      return;
    }
    const formData = new FormData(handoffForm);
    const submit = handoffForm.querySelector(".primary");
    submit.disabled = true;
    setStatus("Sending your request…");
    try {
      const result = await request({
        action: "widget-handoff",
        conversationId,
        visitorName: String(formData.get("visitorName") || ""),
        visitorEmail: String(formData.get("visitorEmail") || ""),
        requestNote: String(formData.get("requestNote") || ""),
      });
      humanRequested = true;
      handoffForm.classList.remove("open");
      composer.style.display = "flex";
      textarea.disabled = true;
      sendButton.disabled = true;
      addMessage(result.message || "A team member has been notified.", "ai");
      setStatus("Human support requested");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send your request.");
    } finally {
      submit.disabled = false;
    }
  });
})();
