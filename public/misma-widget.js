(function () {
  "use strict";
  var currentScript = document.currentScript;
  var siteKey = currentScript && currentScript.dataset ? currentScript.dataset.site : "";
  if (!siteKey || document.getElementById("misma-website-widget-root")) return;

  var endpoint = "https://grlrrmebnthxguluybgb.supabase.co/functions/v1/misma-widget";
  var storageKey = "misma_widget_" + siteKey;
  var visitorId;
  var conversationId = null;
  var isOpen = false;
  var isSending = false;
  var isHandoff = false;
  var messages = [];
  try {
    visitorId = localStorage.getItem(storageKey + "_visitor");
    if (!visitorId) {
      visitorId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 3 | 8)).toString(16);
          });
      localStorage.setItem(storageKey + "_visitor", visitorId);
    }
    conversationId = Number(localStorage.getItem(storageKey + "_conversation")) || null;
  } catch (_) {
    visitorId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  var host = document.createElement("div");
  host.id = "misma-website-widget-root";
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .launcher { position:fixed; right:22px; bottom:22px; z-index:2147483000; border:0; border-radius:999px; padding:13px 18px; display:flex; align-items:center; gap:10px; background:#111827; color:#fff; box-shadow:0 10px 32px rgba(0,0,0,.28); font:600 14px/1.2 system-ui,sans-serif; cursor:pointer; }
    .launcher-mark { width:27px;height:27px;border-radius:9px;background:#fff;color:#111827;display:grid;place-items:center;font:800 15px/1 system-ui,sans-serif; }
    .panel { position:fixed; right:22px; bottom:82px; z-index:2147483000; width:min(370px,calc(100vw - 28px)); height:min(590px,calc(100dvh - 112px)); min-height:380px; border:1px solid #dbe2ea; border-radius:18px; overflow:hidden; background:#fff; color:#172033; box-shadow:0 22px 70px rgba(15,23,42,.24); display:none; flex-direction:column; font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif; }
    .panel.open { display:flex; }
    .head { display:flex;align-items:center;gap:10px;padding:13px 14px;background:#111827;color:#fff; }
    .brand-mark { display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#fff;color:#111827;font:800 17px/1 system-ui,sans-serif; }
    .brand-copy { flex:1;min-width:0;display:flex;flex-direction:column; }
    .brand-copy strong {font-size:14px;font-weight:700;}
    .brand-copy small {font-size:11px;color:#cbd5e1;}
    .human { display:flex;align-items:center;gap:6px;border:1px solid #526174;background:#202d3e;color:#fff;border-radius:999px;padding:7px 9px;font:600 11px/1 system-ui,sans-serif;cursor:pointer;white-space:nowrap; }
    .human svg {width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
    .close {border:0;background:transparent;color:#dbe4ef;font-size:23px;line-height:1;cursor:pointer;padding:3px 1px;}
    .human-form {display:none;padding:12px;background:#f5f7fa;border-bottom:1px solid #e7ebf0;gap:7px;}
    .human-form.open {display:grid;}
    .human-form strong {font-size:12px;color:#26364a;}
    .human-form input {width:100%;border:1px solid #d4dce6;border-radius:9px;padding:9px 10px;background:#fff;color:#172033;font:13px system-ui,sans-serif;outline:none;}
    .human-form button {border:0;border-radius:9px;padding:9px 10px;background:#172338;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;}
    .stream {flex:1;min-height:0;overflow:auto;padding:15px 13px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;}
    .bubble {max-width:88%;padding:10px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5;}
    .bubble.ai {align-self:flex-start;background:#fff;border:1px solid #e4e9ef;color:#27354a;border-top-left-radius:4px;}
    .bubble.visitor {align-self:flex-end;background:#172338;color:#fff;border-top-right-radius:4px;}
    .bubble.note {align-self:center;max-width:100%;background:#edf3fa;color:#53657c;font-size:11px;text-align:center;}
    .composer {display:flex;align-items:center;gap:8px;padding:11px;border-top:1px solid #e7ebf0;background:#fff;}
    .composer input {flex:1;min-width:0;height:40px;border:1px solid #d6dde7;border-radius:999px;padding:0 13px;outline:none;color:#172033;background:#fff;font:13px system-ui,sans-serif;}
    .composer input:focus,.human-form input:focus {border-color:#6c91c8;box-shadow:0 0 0 3px rgba(84,132,196,.12);}
    .send {width:40px;height:40px;border:0;border-radius:50%;background:#172338;color:#fff;display:grid;place-items:center;cursor:pointer;}
    .send:disabled,.human-form button:disabled {opacity:.55;cursor:wait;}
    .send svg {width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
    .foot {padding:0 12px 9px;text-align:center;background:#fff;color:#8a96a6;font:10px system-ui,sans-serif;}
    @media(max-width:520px){.launcher{right:14px;bottom:14px;padding:11px 14px}.panel{right:8px;bottom:70px;width:calc(100vw - 16px);height:min(620px,calc(100dvh - 82px));min-height:340px;border-radius:16px}}
  `;
  root.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open Misma chat");
  launcher.innerHTML = '<span class="launcher-mark">M</span><span>Chat with us</span>';

  var panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "Misma customer support chat");
  panel.innerHTML = `
    <header class="head">
      <span class="brand-mark" aria-hidden="true">M</span>
      <span class="brand-copy"><strong>Misma</strong><small>Business assistant · Usually replies instantly</small></span>
      <button type="button" class="human" aria-label="Request a human agent" title="Request a human agent">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>
        <span>Human</span>
      </button>
      <button type="button" class="close" aria-label="Close chat">×</button>
    </header>
    <form class="human-form">
      <strong>Ask the team to join this conversation</strong>
      <input name="name" autocomplete="name" placeholder="Your name (optional)" maxlength="100">
      <input name="email" autocomplete="email" type="email" placeholder="Email (optional)" maxlength="254">
      <input name="phone" autocomplete="tel" placeholder="Phone (optional)" maxlength="40">
      <button type="submit">Request a human</button>
    </form>
    <div class="stream" aria-live="polite"></div>
    <form class="composer">
      <input name="message" autocomplete="off" placeholder="Message us…" maxlength="2000" aria-label="Your message">
      <button class="send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg></button>
    </form>
    <div class="foot">Powered by Misma</div>
  `;
  root.appendChild(launcher);
  root.appendChild(panel);

  var stream = panel.querySelector(".stream");
  var composer = panel.querySelector(".composer");
  var messageInput = composer.querySelector('input[name="message"]');
  var sendButton = composer.querySelector(".send");
  var humanButton = panel.querySelector(".human");
  var humanForm = panel.querySelector(".human-form");
  var launcherLabel = launcher.querySelector("span:last-child");

  function appendMessage(role, text) {
    var bubble = document.createElement("div");
    bubble.className = "bubble " + role;
    bubble.textContent = String(text || "");
    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
    return bubble;
  }

  function setOpen(value) {
    isOpen = value;
    panel.classList.toggle("open", value);
    launcherLabel.textContent = value ? "Close chat" : "Chat with us";
    if (value) {
      messageInput.focus({ preventScroll: true });
      if (!messages.length) appendMessage("ai", "Hello! How can I help you today?");
    }
  }

  async function sendRequest(action, extra) {
    var result = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({
        action: action,
        siteKey: siteKey,
        visitorId: visitorId,
        conversationId: conversationId
      }, extra || {}))
    });
    var payload = await result.json().catch(function () { return {}; });
    if (!result.ok) throw new Error(payload.error || "The chat service is temporarily unavailable.");
    if (payload.conversationId) {
      conversationId = Number(payload.conversationId);
      try { localStorage.setItem(storageKey + "_conversation", String(conversationId)); } catch (_) {}
    }
    return payload;
  }

  async function restoreHistory() {
    try {
      var greeting = await sendRequest("hello");
      if (greeting.greeting && !messages.length) {
        stream.textContent = "";
        appendMessage("ai", greeting.greeting);
      }
      if (conversationId) {
        var history = await sendRequest("history");
        if (Array.isArray(history.messages) && history.messages.length) {
          stream.textContent = "";
          messages = history.messages;
          messages.forEach(function (item) {
            appendMessage(item.role === "customer" ? "visitor" : item.role === "ai" ? "ai" : "note", item.text);
          });
          isHandoff = history.handoff === true;
          if (isHandoff) appendMessage("note", "A member of the team has been requested for this conversation.");
        }
      }
    } catch (error) {
      if (!messages.length) appendMessage("note", error.message || "Chat is temporarily unavailable.");
    }
  }

  launcher.addEventListener("click", function () { setOpen(!isOpen); });
  panel.querySelector(".close").addEventListener("click", function () { setOpen(false); });
  humanButton.addEventListener("click", function () {
    humanForm.classList.toggle("open");
    if (humanForm.classList.contains("open")) humanForm.querySelector('input[name="name"]').focus();
  });

  composer.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (isSending || isHandoff) return;
    var text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = "";
    appendMessage("visitor", text);
    messages.push({ role: "customer", text: text });
    isSending = true;
    sendButton.disabled = true;
    var typing = appendMessage("note", "Misma is thinking…");
    try {
      var result = await sendRequest("message", { message: text });
      typing.remove();
      isHandoff = result.handoff === true;
      appendMessage("ai", result.reply || "Your message has been received.");
      if (isHandoff) appendMessage("note", "This conversation is with the team now. You can keep sending messages here.");
    } catch (error) {
      typing.remove();
      appendMessage("note", error.message || "Could not send your message. Please try again.");
    } finally {
      isSending = false;
      sendButton.disabled = false;
      if (!isHandoff) messageInput.focus();
    }
  });

  humanForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (isSending) return;
    var formData = new FormData(humanForm);
    var details = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim()
    };
    var submit = humanForm.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      var result = await sendRequest("human_request", details);
      isHandoff = true;
      humanForm.classList.remove("open");
      appendMessage("note", result.message || "Your request has been sent. The team will follow up in this conversation.");
      messageInput.disabled = true;
      messageInput.placeholder = "A team member will follow up here";
      sendButton.disabled = true;
    } catch (error) {
      appendMessage("note", error.message || "Could not send your request. Please try again.");
    } finally {
      submit.disabled = false;
    }
  });

  restoreHistory();
})();
