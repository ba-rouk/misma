(() => {
  const script = document.currentScript;
  if (!script || script.dataset.mismaLoaded === "true") return;
  script.dataset.mismaLoaded = "true";
  const siteKey = script.dataset.mismaKey || script.getAttribute("data-misma-key") || "";
  const endpoint = script.dataset.endpoint || script.getAttribute("data-endpoint") || "";
  const apiKey = script.dataset.apikey || script.getAttribute("data-apikey") || "";
  if (!siteKey || !endpoint || !apiKey) {
    console.warn("[Misma] Widget configuration is incomplete.");
    return;
  }
  const storageKey = "misma_visitor_" + siteKey;
  let sessionId = "";
  try {
    sessionId = localStorage.getItem(storageKey) || "";
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(storageKey, sessionId);
    }
  } catch { sessionId = crypto.randomUUID(); }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.zIndex = "2147483000";
  host.style.right = "20px";
  host.style.bottom = "20px";
  host.style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";
  document.body.appendChild(host);
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box} .launcher{width:58px;height:58px;border:0;border-radius:50%;background:#111827;color:#fff;box-shadow:0 10px 34px #0005;display:grid;place-items:center;cursor:pointer;font-size:24px}
    .launcher:hover{transform:translateY(-2px)} .panel{position:absolute;right:0;bottom:72px;width:min(370px,calc(100vw - 28px));height:min(590px,calc(100dvh - 110px));background:#fff;color:#172033;border:1px solid #dfe5ee;border-radius:18px;box-shadow:0 18px 60px #0b142b30;overflow:hidden;display:none;flex-direction:column}
    .panel.open{display:flex}.header{display:flex;align-items:center;gap:10px;padding:14px 15px;background:#101827;color:#fff}.brand{width:34px;height:34px;border-radius:11px;background:#fff;color:#111827;display:grid;place-items:center;font-weight:800}
    .heading{flex:1;min-width:0}.heading strong{display:block;font-size:14px}.heading small{display:block;color:#aab7ca;font-size:11px;margin-top:3px}
    .human,.close{width:34px;height:34px;border:1px solid #526176;border-radius:10px;background:#202d40;color:#fff;display:grid;place-items:center;cursor:pointer}.human svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .messages{flex:1;overflow:auto;padding:14px;background:#f6f8fb;display:flex;flex-direction:column;gap:10px}.msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.msg.user{align-self:flex-end;background:#dceafe;color:#12243e;border-bottom-right-radius:4px}.msg.ai{align-self:flex-start;background:#fff;border:1px solid #e4e9f0;color:#1d2939;border-bottom-left-radius:4px}.msg.system{align-self:center;background:#fff4dd;color:#714b12;font-size:12px}
    .empty{margin:auto;text-align:center;color:#627086;font-size:13px;padding:18px}.typing{color:#6a7688;font-size:12px;padding:4px 2px}
    .composer{display:flex;gap:8px;padding:11px;border-top:1px solid #e6eaf0;background:#fff}.composer input{min-width:0;flex:1;height:42px;border:1px solid #d8dee8;border-radius:12px;padding:0 12px;font:inherit;font-size:13px;outline:none}.composer input:focus{border-color:#648ed0}.send{width:42px;height:42px;border:0;border-radius:12px;background:#182438;color:#fff;font-size:20px;cursor:pointer}.send:disabled{opacity:.4;cursor:not-allowed}
    .handoff{display:none;padding:13px;border-top:1px solid #e4e9f0;background:#fff}.handoff.open{display:block}.handoff h3{font-size:13px;margin:0 0 9px}.handoff input,.handoff textarea{width:100%;margin:0 0 8px;padding:9px 10px;border:1px solid #d8dee8;border-radius:9px;font:inherit;font-size:12px}.handoff textarea{resize:vertical;min-height:54px}.handoff button{width:100%;height:38px;border:0;border-radius:9px;background:#182438;color:#fff;font-weight:650;cursor:pointer}.handoff button:disabled{opacity:.5}.foot{font-size:10px;color:#98a2b3;text-align:center;padding:5px;background:#fff}
    @media(max-width:480px){:host{font-size:16px}.panel{right:-7px;bottom:70px;width:calc(100vw - 20px);height:min(72dvh,620px)}}
  `;
  root.appendChild(style);
  const panel = document.createElement("section"); panel.className = "panel"; panel.setAttribute("aria-label", "Chat with this business");
  panel.innerHTML = `
    <header class="header"><span class="brand">M</span><span class="heading"><strong>Chat with us</strong><small>Powered by Misma</small></span>
      <button class="human" type="button" aria-label="Request a human" title="Request a human">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
      </button><button class="close" type="button" aria-label="Close chat">×</button>
    </header>
    <div class="messages" aria-live="polite"><div class="empty">Hello! How can we help you today?</div></div>
    <form class="composer"><input maxlength="3000" placeholder="Write a message…" aria-label="Write a message" autocomplete="off"/><button class="send" type="submit" aria-label="Send message">↑</button></form>
    <form class="handoff"><h3>Request a human</h3><input name="name" maxlength="120" placeholder="Your name (optional)"/><input name="email" type="email" maxlength="254" placeholder="Email (optional)"/><textarea name="reason" maxlength="500" placeholder="How can our team help? (optional)"></textarea><button type="submit">Send request</button></form>
    <div class="foot">Your conversation is saved securely for this business.</div>`;
  root.appendChild(panel);
  const launcher = document.createElement("button"); launcher.className = "launcher"; launcher.type = "button"; launcher.setAttribute("aria-label","Open chat"); launcher.textContent = "✦"; root.appendChild(launcher);
  const messagesEl = panel.querySelector(".messages");
  const composer = panel.querySelector(".composer");
  const input = composer.querySelector("input");
  const sendButton = composer.querySelector("button");
  const handoff = panel.querySelector(".handoff");
  const humanButton = panel.querySelector(".human");
  let busy = false;
  let loaded = false;
  let history = [];
  const addMessage = (role, text) => {
    const empty = messagesEl.querySelector(".empty"); if (empty) empty.remove();
    const node = document.createElement("div"); node.className = "msg " + (role === "customer" ? "user" : role === "ai" ? "ai" : "system");
    node.textContent = text; messagesEl.appendChild(node); messagesEl.scrollTop = messagesEl.scrollHeight;
  };
  const call = async (action, values = {}) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ siteKey, sessionId, action, ...values }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not reach the business right now.");
    return data;
  };
  const loadHistory = async () => {
    if (loaded) return;
    try {
      const data = await call("history");
      messagesEl.innerHTML = "";
      (data.messages || []).forEach((message) => addMessage(message.role, message.text));
      if (!data.messages?.length) messagesEl.innerHTML = '<div class="empty">Hello! How can we help you today?</div>';
      loaded = true;
    } catch { /* A first-time session may not have a conversation yet. */ }
  };
  launcher.addEventListener("click", () => {
    const opening = !panel.classList.contains("open");
    panel.classList.toggle("open", opening);
    launcher.textContent = opening ? "×" : "✦";
    if (opening) { void loadHistory(); input.focus(); }
  });
  panel.querySelector(".close").addEventListener("click", () => { panel.classList.remove("open"); launcher.textContent = "✦"; });
  humanButton.addEventListener("click", () => { handoff.classList.toggle("open"); if (handoff.classList.contains("open")) handoff.querySelector('input[name="name"]').focus(); });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim(); if (!text || busy) return;
    input.value = ""; busy = true; sendButton.disabled = true;
    addMessage("customer", text); addMessage("system", "Misma is replying…");
    const status = messagesEl.lastElementChild;
    try {
      const data = await call("chat", { message: text, history });
      status.remove(); addMessage("ai", data.answer);
      history = [...history, { role: "user", text }, { role: "ai", text: data.answer }].slice(-8);
      loaded = true;
    } catch (error) { status.remove(); addMessage("system", error.message || "Please try again."); }
    finally { busy = false; sendButton.disabled = false; input.focus(); }
  });
  handoff.addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return;
    const values = Object.fromEntries(new FormData(handoff).entries());
    const submit = handoff.querySelector("button"); submit.disabled = true; busy = true;
    try {
      const data = await call("human", { name: values.name, email: values.email, reason: values.reason });
      handoff.classList.remove("open"); handoff.reset(); addMessage("system", data.message || "Your request has been sent.");
    } catch (error) { addMessage("system", error.message || "Could not send the request."); }
    finally { busy = false; submit.disabled = false; }
  });
  const resize = () => { host.style.right = window.innerWidth < 480 ? "10px" : "20px"; host.style.bottom = "20px"; };
  window.addEventListener("resize", resize);
  console.info("[Misma] Website assistant installed for", location.hostname);
})();
