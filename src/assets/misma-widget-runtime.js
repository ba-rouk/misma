(function () {
"use strict";
var tag=document.currentScript,key=tag&&tag.dataset.siteKey,api=tag&&tag.dataset.endpoint;
if(!key||!api){console.warn("[Misma] Missing site key or API endpoint.");return;}
function initWidget(){
var siteSessionKey=key+"_"+location.hostname.toLowerCase();
var store="misma_visitor_"+siteSessionKey,conversationStore="misma_conversation_"+siteSessionKey;
var visitor="",conversation=null;
try{visitor=sessionStorage.getItem(store)||crypto.randomUUID();sessionStorage.setItem(store,visitor);conversation=sessionStorage.getItem(conversationStore)||null;}
catch(error){visitor="v-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
var host=document.createElement("div");
host.style.cssText="position:fixed;left:20px;bottom:20px;z-index:2147483000";
document.body.appendChild(host);
var root=host.attachShadow?host.attachShadow({mode:"open"}):host;
root.innerHTML=[
"<style>",
":host{font-family:Inter,system-ui,sans-serif;color:#182232}",
".launch{min-height:58px;padding:0 18px 0 12px;display:inline-flex;align-items:center;justify-content:center;gap:10px;border:1px solid #ffffff25;border-radius:999px;background:#080b10;color:#fff;box-shadow:0 8px 28px #0003;cursor:pointer;font:600 14px Inter,system-ui,sans-serif}",
".launch-logo{display:block;width:30px;height:30px;flex:none}.launch-label{white-space:nowrap;font-size:14px;line-height:1}",
".panel{display:none;position:absolute;left:0;bottom:70px;width:min(380px,calc(100vw - 32px));height:min(570px,calc(100dvh - 110px));min-width:270px;min-height:350px;max-width:calc(100vw - 28px);max-height:calc(100dvh - 96px);box-sizing:border-box;background:#fff;border:1px solid #dce3ec;border-radius:19px;overflow:hidden;box-shadow:0 18px 55px #0f172a40;grid-template-rows:auto minmax(0,1fr) auto auto auto}",
".panel.open{display:grid}",
".top{display:flex;align-items:center;gap:7px;padding:12px;background:#111827;color:white;min-width:0}.brand{flex:1;min-width:0;overflow:hidden}.brand b,.brand small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand b{font-size:14px}.brand small{font-size:11px;color:#b6c1cf}.top button{width:34px;height:34px;flex:none;border:0;border-radius:9px;background:#ffffff1c;color:#fff;cursor:pointer;font:600 19px/1 system-ui}",
".top .social-link{box-sizing:border-box;width:34px;height:34px;display:grid;place-items:center;flex:none;border:0;border-radius:9px;background:#ffffff1c;color:#fff;text-decoration:none}.top .social-link[hidden]{display:none!important}.top .social-link svg{width:18px;height:18px;display:block;fill:currentColor;stroke:none}.top .social-link:hover,.top button:hover{background:#ffffff30}",
".messages{min-height:0;overflow:auto;padding:13px;background:#f8fafc;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}.bubble{max-width:88%;padding:10px 12px;border-radius:13px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.ai{align-self:flex-start;background:white;border:1px solid #e6ebf2;color:#1a2635}.user{align-self:flex-end;background:#172033;color:#fff}.err{align-self:flex-start;background:#fff0ef;color:#9c332c}.typing{color:#697789;display:flex;align-items:center;gap:5px;font-style:italic}.typing:after{content:'';width:5px;height:5px;border-radius:50%;background:#22c55e;animation:misma-dot .9s ease-in-out infinite alternate}@keyframes misma-dot{to{opacity:.2;transform:translateY(-3px)}}",
".composer-wrap{padding:10px 10px 8px;border-top:1px solid #e8edf3;background:#fff}.composer{display:flex;align-items:flex-end;gap:8px;margin:0;padding:7px 7px 7px 10px;min-width:0;border:1px solid #dce2eb;border-radius:15px;background:#f7f9fc;box-shadow:0 1px 2px #0f172a0c}.composer textarea{box-sizing:border-box;flex:1;min-width:0;min-height:36px;max-height:108px;resize:none;border:0;outline:0;padding:8px 3px;background:transparent;font:400 13px/1.45 Inter,system-ui,sans-serif;color:#172033}.composer-actions{display:flex;align-items:center;gap:5px;flex:none;padding-bottom:2px}.icon-btn{width:35px;height:35px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:#536274;cursor:pointer;padding:0}.icon-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.icon-btn.is-active{background:#e8f8ee;color:#16a34a}.send-btn{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:#22c55e;color:#fff;cursor:pointer;padding:0}.send-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.send-btn[disabled]{opacity:.5;cursor:not-allowed}",
".handoff{display:none;padding:12px;border-top:1px solid #e8edf3;background:#fff;gap:8px}.handoff.open{display:grid}.handoff b{font-size:13px}.handoff p{margin:0;font-size:11px;color:#657286;line-height:1.45}.handoff input,.handoff textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid #dce2eb;border-radius:10px;padding:10px;font-family:inherit;font-size:13px;line-height:1.4;color:#182232}.handoff button{border:0;border-radius:10px;background:#172033;color:#fff;padding:10px 13px;cursor:pointer}.status{padding:0 12px 7px;font-size:11px;color:#718096;background:#fff;min-height:0}.composer.recording textarea{display:none}.recording-waveform{display:none;flex:1;align-items:center;justify-content:center;min-width:0;height:42px;gap:3px;overflow:hidden}.composer.recording .recording-waveform{display:flex}.recording-waveform i{display:block;width:3px;height:8px;flex:none;border-radius:9px;background:#22c55e;animation:misma-recording-wave .72s ease-in-out infinite alternate}.recording-waveform i:nth-child(3n){animation-delay:-.38s}.recording-waveform i:nth-child(3n + 1){animation-delay:-.16s}.recording-waveform i:nth-child(4n){animation-duration:.92s}@keyframes misma-recording-wave{from{height:5px;opacity:.55}to{height:29px;opacity:1}}.mic.is-active{color:#16a34a;background:#e8f8ee;animation:misma-mic-pulse 1.3s ease-in-out infinite}@keyframes misma-mic-pulse{50%{box-shadow:0 0 0 5px #22c55e20}}.voice-view{display:none;position:absolute;inset:0;z-index:8;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:space-between;gap:10px;padding:12px;color:#f4f6fb;background:#0b0d12;border-radius:18px;overflow:hidden;font-family:Inter,system-ui,sans-serif}.voice-view.open{display:flex}.voice-top{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:34px;gap:8px;color:#f4f6fb;font-size:13px;font-weight:600}.voice-exit{width:34px;height:34px;display:grid;place-items:center;border:1px solid #ffffff2a;border-radius:50%;background:#ffffff0d;color:#fff;cursor:pointer;font-size:19px}.voice-content{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:0;gap:12px}.voice-mode-choice{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid #ffffff20;border-radius:999px;background:#ffffff0d}.voice-mode-choice button{min-height:36px;padding:8px 12px;border:0;border-radius:999px;background:transparent;color:#c5ceda;font:500 12px Inter,system-ui,sans-serif;cursor:pointer}.voice-mode-choice button.is-selected{background:#e8eef8;color:#0d1420;font-weight:700}.voice-orb{display:grid;place-items:center;width:clamp(112px,30vw,154px);height:clamp(112px,30vw,154px);flex:none;padding:0;border:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#e1edff,#8ab4ff 46%,#3b5bdb 100%);box-shadow:0 0 55px #6c97ff47,inset 0 0 25px #ffffff4d;cursor:pointer;transition:opacity .2s,filter .2s,transform .2s}.voice-orb span{width:30%;height:30%;border-radius:50%;background:#ffffff61;filter:blur(9px)}.voice-orb[data-state=starting],.voice-orb[data-state=thinking]{animation:misma-voice-think 1s ease-in-out infinite}.voice-orb[data-state=listening]{animation:misma-voice-breathe 1.6s ease-in-out infinite}.voice-orb[data-state=speaking]{animation:misma-voice-speak .7s ease-in-out infinite}.voice-orb[data-state=ready]{opacity:.78}.voice-orb[data-state=muted]{opacity:.3;filter:grayscale(1)}.voice-status{min-height:1.4em;margin:0;color:#cbd5e1;font-size:13px;text-align:center}.voice-controls{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;width:100%}.voice-control{min-width:78px;min-height:38px;padding:8px 13px;border:1px solid #ffffff40;border-radius:999px;background:transparent;color:#f4f6fb;font:500 12px Inter,system-ui,sans-serif;cursor:pointer}.voice-control[aria-pressed=true]{background:#ffffff20}.voice-control.is-stop{background:#303d50;border-color:#303d50}.voice-control.is-end{background:#d94c56;border-color:#d94c56}.voice-control[hidden]{display:none!important}@keyframes misma-voice-breathe{0%,100%{transform:scale(.96)}50%{transform:scale(1.06)}}@keyframes misma-voice-think{0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:.95;transform:scale(1)}}@keyframes misma-voice-speak{0%,100%{transform:scale(.98)}50%{transform:scale(1.12)}}",
"@media(max-width:520px){.launch{width:54px;height:54px;min-height:54px;padding:0;gap:0;border-radius:50%}.launch-label{display:none}.panel{left:0;right:auto;width:calc(100vw - 28px);max-width:calc(100vw - 28px);height:min(570px,calc(100dvh - 100px))}}",
"@media(prefers-reduced-motion:reduce){.launch,.typing:after{animation:none;transition:none}}",
"</style>",
"<button class='launch' aria-label='Open Misma chat' aria-expanded='false'><svg class='launch-logo' viewBox='0 0 100 100' fill='none' aria-hidden='true'><circle cx='50' cy='50' r='50' fill='#080b10'/><polyline points='17,48 32,63 56,36' stroke='#fff' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'/><polyline points='37,48 52,63 76,36' stroke='#fff' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'/></svg><span class='launch-label'>Ask Misma</span></button>",
"<section class='panel' aria-label='Misma customer chat'><header class='top'><div class='brand'><b>Misma</b><small>Business assistant</small></div>",
"<a class='social-link whatsapp-link' href='#' target='_blank' rel='noopener noreferrer' aria-label='Chat with this business on WhatsApp' title='Chat on WhatsApp' hidden><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.5 0 .15 5.35.15 11.93c0 2.1.55 4.15 1.6 5.96L.05 24l6.27-1.64a11.9 11.9 0 0 0 5.75 1.47h.01c6.58 0 11.93-5.35 11.93-11.93a11.86 11.86 0 0 0-3.49-8.42ZM12.08 21.8a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.72.98.99-3.63-.24-.37a9.88 9.88 0 0 1-1.52-5.26c0-5.46 4.44-9.9 9.9-9.9a9.83 9.83 0 0 1 7.01 2.91 9.84 9.84 0 0 1 2.9 7.01c0 5.46-4.44 9.9-9.9 9.9Zm5.43-7.41c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z'/></svg></a>",
"<a class='social-link instagram-link' href='#' target='_blank' rel='noopener noreferrer' aria-label='View this business on Instagram' title='Instagram' hidden><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm4.5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-3.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z'/></svg></a>",
"<button class='human' type='button' title='Request a human' aria-label='Request a human'><svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'><circle cx='12' cy='8' r='3.4'/><path d='M5 20a7 7 0 0 1 14 0M19 5v4m-2-2h4'/></svg></button>",
"<button class='close' type='button' aria-label='Close' title='Close'>×</button></header>",
"<div class='messages' aria-live='polite'><div class='bubble ai'>Hello! I am Misma. How can I help you today?</div></div>",
"<div class='handoff'><b>Speak with a person</b><p>Leave your details and the business team will follow up in this conversation.</p><input name='name' maxlength='120' placeholder='Your name' autocomplete='name'><input name='email' maxlength='240' type='email' placeholder='Email (optional)'><input name='phone' maxlength='80' placeholder='Phone (optional)'><textarea name='reason' maxlength='500' placeholder='What would you like help with?'></textarea><button class='handoff-submit' type='button'>Request a human</button></div>",
"<div class='composer-wrap'><form class='composer'><div class='recording-waveform' aria-label='Listening'><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><textarea name='message' maxlength='2000' placeholder='Message Misma…' aria-label='Message Misma' rows='1'></textarea><div class='composer-actions'>",
"<button class='icon-btn mic' type='button' aria-label='Start microphone dictation' title='Dictate message'><svg viewBox='0 0 24 24'><rect x='9' y='2.5' width='6' height='12' rx='3'/><path d='M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6'/></svg></button>",
"<button class='send-btn primary is-voice' type='button' aria-label='Start voice chat' title='Start voice chat'><svg viewBox='0 0 24 24'><rect x='3' y='9' width='3' height='6' rx='1.5'/><rect x='8' y='5' width='3' height='14' rx='1.5'/><rect x='13' y='7' width='3' height='10' rx='1.5'/><rect x='18' y='3' width='3' height='18' rx='1.5'/></svg></button>",
"</div></form></div>",
"<div class='status' role='status' aria-live='polite'></div><div class='voice-view' role='dialog' aria-modal='true' aria-label='Misma speech talk'><div class='voice-top'><span>Misma speech talk</span><button class='voice-exit' type='button' aria-label='Exit speech talk' title='Exit'>×</button></div><div class='voice-content'><div class='voice-mode-choice' role='group' aria-label='Voice conversation style'><button type='button' class='voice-mode is-selected' data-mode='hands-free' aria-pressed='true'>Hands-free</button><button type='button' class='voice-mode' data-mode='push-to-talk' aria-pressed='false'>Push to talk</button></div><button class='voice-orb' type='button' data-state='starting' aria-label='Voice conversation is connecting'><span aria-hidden='true'></span></button><p class='voice-status' aria-live='polite'>Connecting to your microphone…</p></div><div class='voice-controls'><button type='button' class='voice-control voice-mute' aria-pressed='false'>Mute</button><button type='button' class='voice-control voice-stop is-stop' hidden>Stop</button><button type='button' class='voice-control voice-end is-end'>End</button></div></div></section>"
].join("");

var $=function(selector){return root.querySelector(selector);};
var panel=$(".panel"),messages=$(".messages"),input=$(".composer textarea"),status=$(".status"),handoff=$(".handoff"),composer=$(".composer");
var micButton=$(".mic"),primaryButton=$(".primary"),whatsappLink=$(".whatsapp-link"),instagramLink=$(".instagram-link");
var voiceView=$(".voice-view"),voiceOrb=$(".voice-orb"),voiceStatus=$(".voice-status"),voiceMuteButton=$(".voice-mute"),voiceStopButton=$(".voice-stop"),voiceModeButtons=root.querySelectorAll(".voice-mode");
var busy=false,recognition=null,dictating=false,dictationSendAfterStop=false,voiceSession=false,voiceMuted=false,voiceModeChoice="hands-free",voiceState="idle",voiceRequestController=null,voiceSpeechCancel=null,finalTranscript="",interimTranscript="",typingBubble=null;
function setStatus(message){status.textContent=message||"";}
function bubble(text,kind){var node=document.createElement("div");node.className="bubble "+kind;node.textContent=text;messages.appendChild(node);messages.scrollTop=messages.scrollHeight;return node;}
function showTyping(){removeTyping();typingBubble=bubble("Misma is typing","ai typing");}
function removeTyping(){if(typingBubble&&typingBubble.parentNode)typingBubble.parentNode.removeChild(typingBubble);typingBubble=null;}
function resizeInput(){input.style.height="auto";input.style.height=Math.min(108,Math.max(36,input.scrollHeight))+"px";}
function updatePrimary(){
  var hasText=Boolean(input.value.trim());
  var canSend=dictating||hasText;
  primaryButton.classList.toggle("is-voice",!canSend&&!voiceSession);
  if(canSend){primaryButton.setAttribute("aria-label",dictating?"Stop recording and send transcript":"Send message");primaryButton.title=dictating?"Stop recording and send":"Send message";primaryButton.innerHTML="<svg viewBox='0 0 24 24'><path d='M12 19V5m-7 7 7-7 7 7'/></svg>";}
  else if(voiceSession){primaryButton.setAttribute("aria-label","End voice chat");primaryButton.title="End voice chat";primaryButton.innerHTML="<svg viewBox='0 0 24 24'><rect x='6' y='6' width='12' height='12' rx='2'/></svg>";}
  else{primaryButton.setAttribute("aria-label","Start voice chat");primaryButton.title="Start voice chat";primaryButton.innerHTML="<svg viewBox='0 0 24 24'><rect x='3' y='9' width='3' height='6' rx='1.5'/><rect x='8' y='5' width='3' height='14' rx='1.5'/><rect x='13' y='7' width='3' height='10' rx='1.5'/><rect x='18' y='3' width='3' height='18' rx='1.5'/></svg>";}
  primaryButton.disabled=busy&&!voiceSession;
}
function call(payload,signal){
  return fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({siteKey:key,visitorId:visitor,conversationId:conversation,pageUrl:location.href},payload)),signal:signal})
    .then(function(response){return response.json().then(function(data){if(!response.ok||data.error)throw Error(data.error||"Misma could not complete this request.");return data;});})
    .then(function(data){if(data.conversationId){conversation=data.conversationId;try{sessionStorage.setItem(conversationStore,String(conversation));}catch(error){}}
      if(data.visitorId){visitor=data.visitorId;try{sessionStorage.setItem(store,visitor);}catch(error){}}return data;});
}
function refreshHistory(){
  if(!conversation||busy)return Promise.resolve(null);
  return call({action:"history"}).then(function(data){
    if(Array.isArray(data.messages)){messages.innerHTML="";if(!data.messages.length)bubble("Hello! I am Misma. How can I help you today?","ai");
      else data.messages.forEach(function(item){var text=item.role==="human"?"Business team: "+item.text:item.text;bubble(text,item.role==="customer"?"user":"ai");});}
    if(data.conversationStatus==="Needs you")setStatus((data.messages||[]).some(function(item){return item.role==="human";})?"You are chatting with the business team.":"Your request is with the business team. A person will reply here.");
    return data;
  });
}
function recognitionConstructor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function stopRecognition(){if(!recognition)return;var current=recognition;recognition=null;current.onresult=null;current.onerror=null;current.onend=null;try{current.abort();}catch(error){}}
function setVoiceState(nextState,message){
  voiceState=nextState;
  voiceOrb.setAttribute("data-state",nextState);
  var labels={idle:"Voice mode ended",starting:"Connecting to your microphone…",ready:"Tap the orb to speak",listening:"Listening…",thinking:"Thinking…",speaking:"Speaking · tap Stop to interrupt",muted:"Microphone muted"};
  voiceStatus.textContent=message||labels[nextState]||"";
  voiceStopButton.hidden=nextState!=="thinking"&&nextState!=="speaking";
  voiceMuteButton.textContent=voiceMuted?"Unmute":"Mute";
  voiceMuteButton.setAttribute("aria-pressed",String(voiceMuted));
  voiceOrb.setAttribute("aria-label",voiceModeChoice==="push-to-talk"?(nextState==="listening"?"Finish speaking turn":"Start speaking turn"):(nextState==="speaking"||nextState==="thinking"?"Interrupt Misma and listen":"Voice conversation is active"));
}
function updateVoiceModeChoice(){
  voiceModeButtons.forEach(function(button){
    var selected=button.getAttribute("data-mode")===voiceModeChoice;
    button.classList.toggle("is-selected",selected);
    button.setAttribute("aria-pressed",String(selected));
  });
}
function listen(isVoiceChat){
  var Recognition=recognitionConstructor();
  if(!Recognition){
    var unsupportedMessage="Voice input is not supported in this browser. Open this website in the latest Chrome browser over HTTPS.";
    if(isVoiceChat){voiceSession=false;voiceView.classList.add("open");primaryButton.classList.remove("is-active");setVoiceState("idle",unsupportedMessage);updatePrimary();}
    else{dictating=false;composer.classList.remove("recording");micButton.classList.remove("is-active");updatePrimary();setStatus(unsupportedMessage);}
    return;
  }
  stopRecognition();
  if(isVoiceChat){finalTranscript="";interimTranscript="";setVoiceState("listening");}
  else{interimTranscript="";}
  var instance=new Recognition();recognition=instance;instance.lang=isVoiceChat?"en-US":(navigator.language||"en-US");instance.interimResults=true;instance.continuous=false;instance.maxAlternatives=1;
  instance.onresult=function(event){
    var finalText="",interim="";
    for(var index=event.resultIndex;index<event.results.length;index+=1){
      var result=event.results[index],spoken=result&&result[0]?String(result[0].transcript||"").trim():"";
      if(!spoken)continue;if(result.isFinal)finalText+=(finalText?" ":"")+spoken;else interim+=(interim?" ":"")+spoken;
    }
    if(finalText)finalTranscript=(finalTranscript+" "+finalText).trim();interimTranscript=interim;
    if(!isVoiceChat){input.value=[finalTranscript,interimTranscript].filter(Boolean).join(" ");resizeInput();updatePrimary();}
    else{setVoiceState("listening");}
    if(!isVoiceChat)setStatus("Listening · tap Send when you are finished.");
  };
  instance.onerror=function(event){
    var error=event&&event.error?event.error:"recognition";if(recognition===instance)recognition=null;
    if(error==="no-speech"&&((isVoiceChat&&voiceSession&&voiceModeChoice==="hands-free")||(!isVoiceChat&&dictating)))return;
    var errorMessage=error==="not-allowed"||error==="service-not-allowed"
      ?"Allow microphone access for this website in your browser settings, then tap the voice control to retry."
      :error==="audio-capture"
        ?"No microphone was found. Connect a microphone and try again."
        :error==="network"
          ?"The speech recognition service is unavailable. Check your internet connection and try again."
          :"Voice input stopped. Tap the microphone to try again.";
    if(isVoiceChat){
      voiceSession=false;voiceMuted=false;
      if(voiceSpeechCancel){voiceSpeechCancel();voiceSpeechCancel=null;}
      if(window.speechSynthesis)window.speechSynthesis.cancel();
      voiceView.classList.add("open");primaryButton.classList.remove("is-active");
      setVoiceState("idle",errorMessage);updatePrimary();
    }else{dictating=false;composer.classList.remove("recording");micButton.classList.remove("is-active");updatePrimary();setStatus(errorMessage);}
  };
  instance.onend=function(){
    if(recognition===instance)recognition=null;
    if(isVoiceChat){
      var spoken=[finalTranscript,interimTranscript].filter(Boolean).join(" ").trim();
      if(voiceSession&&spoken&&!busy){sendMessage(spoken,true);}
      else if(voiceSession&&!voiceMuted&&voiceModeChoice==="hands-free"&&!busy){window.setTimeout(function(){if(voiceSession&&!voiceMuted&&voiceModeChoice==="hands-free")listen(true);},220);}
      else if(voiceSession)setVoiceState(voiceMuted?"muted":"ready");
    }else{
      input.value=[finalTranscript,interimTranscript].filter(Boolean).join(" ");resizeInput();
      if(dictating){
        updatePrimary();
        window.setTimeout(function(){if(dictating&&!recognition)listen(false);},180);
      }else{
        composer.classList.remove("recording");micButton.classList.remove("is-active");updatePrimary();
        if(dictationSendAfterStop){
          dictationSendAfterStop=false;
          var transcript=input.value.trim();finalTranscript="";interimTranscript="";
          if(transcript)sendMessage(transcript,false);else setStatus("No speech was detected. Try again.");
        }else{setStatus("");}
      }
    }
  };
  try{instance.start();}
  catch(error){
    if(recognition===instance)recognition=null;
    var startMessage="Microphone could not start. Allow microphone access in your browser settings, then tap to retry.";
    if(isVoiceChat){voiceSession=false;voiceView.classList.add("open");primaryButton.classList.remove("is-active");setVoiceState("idle",startMessage);updatePrimary();}
    else{dictating=false;composer.classList.remove("recording");micButton.classList.remove("is-active");updatePrimary();setStatus(startMessage);}
  }
}
function speakAsWoman(text){
  var synth=window.speechSynthesis;
  if(!synth||typeof window.SpeechSynthesisUtterance==="undefined"){setVoiceState("ready","Speech playback is not supported by this browser.");return Promise.resolve(false);}
  var femalePattern=/female|woman|girl|zira|samantha|susan|karen|victoria|aria|jenny|libby|natasha|sara|tessa|google us english female|google uk english female/i;
  var malePattern=/(^|[^a-z])(male|man|boy)(?=$|[^a-z])|david|mark|guy|ryan|daniel|george|james|fred|thomas/i;
  function getFemaleVoice(){return synth.getVoices().filter(function(voice){var label=voice.name+" "+voice.voiceURI;return femalePattern.test(label)&&!malePattern.test(label)&&/^en(?:-|$)/i.test(String(voice.lang||""));})[0];}
  function waitForVoice(){var current=getFemaleVoice();if(current)return Promise.resolve(current);return new Promise(function(resolve){
    var finished=false;function done(){if(finished)return;finished=true;synth.removeEventListener("voiceschanged",done);resolve(getFemaleVoice());}
    synth.addEventListener("voiceschanged",done,{once:true});window.setTimeout(done,1200);
  });}
  var clean=String(text||"").replace(/https?:\/\/\S+/g," ").replace(/[*_~>|#]+/g," ").replace(/\s+/g," ").trim().slice(0,1600);
  if(!clean)return Promise.resolve(true);
  var parts=clean.match(/[^.!?]+[.!?]*\s*/g)||[clean];
  setVoiceState("speaking");
  return waitForVoice().then(function(womanVoice){
    if(!womanVoice){setVoiceState("ready","A female English speech voice is not installed on this device.");return false;}
    return new Promise(function(resolve){
      var index=0,finished=false;
      function finish(result){if(finished)return;finished=true;voiceSpeechCancel=null;resolve(result);}
      function next(){
        if(finished)return;
        if(index>=parts.length||!voiceSession){finish(true);return;}
        var utterance=new SpeechSynthesisUtterance(parts[index++].trim());utterance.lang=womanVoice.lang||"en-US";utterance.voice=womanVoice;utterance.pitch=1.04;utterance.rate=1;
        utterance.onend=next;utterance.onerror=next;synth.speak(utterance);
      }
      voiceSpeechCancel=function(){if(finished)return;synth.cancel();finish(false);};
      synth.cancel();next();
    });
  });
}
function sendMessage(rawText,speakReply){
  var text=String(rawText||"").trim();if(!text||busy)return Promise.resolve();busy=true;
  var controller=speakReply?new AbortController():null;
  if(controller)voiceRequestController=controller;
  if(!speakReply){input.value="";resizeInput();updatePrimary();stopDictation();}
  else{setVoiceState("thinking");}
  bubble(text,"user");showTyping();setStatus("");updatePrimary();
  return call({action:"chat",message:text,voice:speakReply===true},controller?controller.signal:undefined).then(function(data){
    removeTyping();var answer=data.answer||"I could not prepare a reply.";bubble(answer,"ai");
    if(data.handoffPending)setStatus("Your message has been sent to the business team.");
    if(speakReply&&voiceSession){return speakAsWoman(answer);}
    return null;
  }).catch(function(error){
    removeTyping();
    if(!(error&&error.name==="AbortError"))bubble(error.message||"Misma could not complete this request.","err");
  }).then(function(){
    if(voiceRequestController===controller)voiceRequestController=null;
    busy=false;updatePrimary();
    if(voiceSession&&speakReply){
      if(voiceMuted)setVoiceState("muted");
      else if(voiceModeChoice==="hands-free")listen(true);
      else setVoiceState("ready");
    }
  });
}
function stopDictation(){
  dictating=false;dictationSendAfterStop=false;composer.classList.remove("recording");micButton.classList.remove("is-active");stopRecognition();updatePrimary();
}
function finishDictationAndSend(){
  if(!dictating)return;
  dictating=false;dictationSendAfterStop=true;micButton.classList.remove("is-active");setStatus("Finishing recording…");updatePrimary();
  if(recognition){try{recognition.stop();}catch(error){dictationSendAfterStop=false;composer.classList.remove("recording");setStatus("Could not finish microphone input. Try again.");}}
  else{
    dictationSendAfterStop=false;composer.classList.remove("recording");
    var transcript=input.value.trim();finalTranscript="";interimTranscript="";
    if(transcript)sendMessage(transcript,false);else{updatePrimary();setStatus("No speech was detected. Try again.");}
  }
}
function stopVoiceSession(){
  voiceSession=false;voiceMuted=false;
  stopRecognition();
  if(voiceRequestController){voiceRequestController.abort();voiceRequestController=null;}
  if(voiceSpeechCancel){voiceSpeechCancel();voiceSpeechCancel=null;}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  voiceView.classList.remove("open");primaryButton.classList.remove("is-active");
  setVoiceState("idle");updatePrimary();
  if(!busy)setStatus("");
}
function startVoiceSession(){
  if(voiceSession){stopVoiceSession();return;}if(busy)return;
  voiceView.classList.add("open");
  if(!recognitionConstructor()){
    primaryButton.classList.remove("is-active");
    setVoiceState("idle","Speech talk is not supported in this browser. Open this website in the latest Chrome browser over HTTPS.");
    return;
  }
  voiceSession=true;voiceMuted=false;voiceModeChoice="hands-free";updateVoiceModeChoice();setVoiceState("starting");primaryButton.classList.add("is-active");
  // Start recognition directly from the user's click so the browser can show its
  // native microphone permission prompt without an asynchronous permission preflight.
  if(voiceModeChoice==="hands-free")listen(true);else setVoiceState("ready");
}
function interruptVoice(){
  if(!voiceSession)return;
  if(voiceRequestController){voiceRequestController.abort();voiceRequestController=null;}
  if(voiceSpeechCancel){voiceSpeechCancel();voiceSpeechCancel=null;}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  stopRecognition();
  if(voiceMuted)setVoiceState("muted");
  else setVoiceState("ready");
}
function changeVoiceMode(nextMode){
  if(nextMode!=="hands-free"&&nextMode!=="push-to-talk")return;
  if(voiceModeChoice===nextMode)return;
  voiceModeChoice=nextMode;updateVoiceModeChoice();
  if(!voiceSession||voiceState==="thinking"||voiceState==="speaking")return;
  stopRecognition();
  if(voiceMuted)setVoiceState("muted");
  else if(voiceModeChoice==="hands-free")listen(true);
  else setVoiceState("ready");
}


$(".launch").addEventListener("click",function(){
  var opened=panel.classList.toggle("open");$(".launch").setAttribute("aria-expanded",String(opened));
  if(opened){input.focus();call({action:"heartbeat"}).catch(function(error){setStatus(error.message);});refreshHistory().catch(function(error){setStatus(error.message);});}
});
$(".close").addEventListener("click",function(){panel.classList.remove("open");stopVoiceSession();stopDictation();$(".launch").setAttribute("aria-expanded","false");});

$(".human").addEventListener("click",function(){handoff.classList.toggle("open");if(handoff.classList.contains("open"))handoff.querySelector("[name='name']").focus();});
input.addEventListener("input",function(){resizeInput();updatePrimary();});
input.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();if(input.value.trim())sendMessage(input.value,false);}});
$(".composer").addEventListener("submit",function(event){event.preventDefault();if(input.value.trim())sendMessage(input.value,false);});
micButton.addEventListener("click",function(){
  if(dictating)return;
  if(voiceSession)stopVoiceSession();if(busy)return;
  if(!recognitionConstructor()){setStatus("Microphone dictation is not supported in this browser. Open this website in the latest Chrome browser over HTTPS.");return;}
  finalTranscript="";interimTranscript="";dictationSendAfterStop=false;dictating=true;composer.classList.add("recording");micButton.classList.add("is-active");setStatus("Listening · tap Send when you are finished.");updatePrimary();
  // Recognition starts within the click gesture, allowing the browser to request mic access.
  listen(false);
});
primaryButton.addEventListener("click",function(){if(dictating){finishDictationAndSend();return;}if(input.value.trim())sendMessage(input.value,false);else startVoiceSession();});
voiceView.querySelector(".voice-exit").addEventListener("click",stopVoiceSession);
voiceView.querySelector(".voice-end").addEventListener("click",stopVoiceSession);
voiceMuteButton.addEventListener("click",function(){
  if(!voiceSession)return;
  voiceMuted=!voiceMuted;
  if(voiceMuted){stopRecognition();setVoiceState("muted");}
  else if(voiceModeChoice==="hands-free")listen(true);
  else setVoiceState("ready");
});
voiceStopButton.addEventListener("click",interruptVoice);
voiceOrb.addEventListener("click",function(){
  if(!voiceSession){startVoiceSession();return;}
  if(voiceModeChoice==="push-to-talk"){
    if(voiceState==="listening"){if(recognition){try{recognition.stop();}catch(error){setVoiceState("ready");}}}
    else if(voiceState==="ready")listen(true);
  }else if(voiceState==="thinking"||voiceState==="speaking")interruptVoice();
});
voiceModeButtons.forEach(function(button){button.addEventListener("click",function(){changeVoiceMode(button.getAttribute("data-mode"));});});

$(".handoff-submit").addEventListener("click",function(){
  if(busy)return;var data={};handoff.querySelectorAll("input,textarea").forEach(function(element){data[element.name]=element.value.trim();});
  if(!data.name){setStatus("Please enter your name.");return;}busy=true;setStatus("Sending your request…");
  call(Object.assign({action:"human-request"},data)).then(function(result){
    handoff.classList.remove("open");
    handoff.querySelectorAll("input,textarea").forEach(function(element){element.value="";});
    setStatus("Human request sent. A person will reply here.");
    return refreshHistory().then(function(){
      if(!result.confirmationSaved)bubble(result.confirmationText||"Your request to speak with a person has been sent. The business team will follow up here.","ai");
    });
  }).catch(function(error){setStatus(error.message);}).then(function(){busy=false;updatePrimary();});
});
window.setInterval(function(){if(panel.classList.contains("open")&&conversation&&!busy)refreshHistory().catch(function(){});},5000);
call({action:"widget-config"}).then(function(config){if(config.whatsapp_url){whatsappLink.href=config.whatsapp_url;whatsappLink.hidden=false;}if(config.instagram_url){instagramLink.href=config.instagram_url;instagramLink.hidden=false;}}).catch(function(error){console.warn("[Misma] Website social links could not be loaded:",error.message);});
call({action:"page-view"}).catch(function(error){console.warn("[Misma] Page refresh check failed:",error.message);});
}
fetch(api,{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action:"heartbeat",siteKey:key,pageUrl:location.href})
}).then(function(response){
  return response.json().then(function(data){
    if(!response.ok||data.error||data.connected!==true)throw Error(data.error||"This widget key is inactive for this website.");
    return data;
  });
}).then(initWidget).catch(function(error){
  console.warn("[Misma] Widget is disabled for this website.",error&&error.message?error.message:"");
});
})();