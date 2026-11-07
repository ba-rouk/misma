(function () {
"use strict";
var tag=document.currentScript,key=tag&&tag.dataset.siteKey,api=tag&&tag.dataset.endpoint;
if(!key||!api){console.warn("[Misma] Missing site key or API endpoint.");return;}
function initWidget(){
var siteSessionKey=key+"_"+location.hostname.toLowerCase();
var store="misma_visitor_"+siteSessionKey,conversationStore="misma_conversation_"+siteSessionKey,sizeStore="misma_widget_size_"+key;
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
".panel.open{display:grid}.panel.minimized{height:auto!important;min-height:0!important;grid-template-rows:auto}.panel.minimized .messages,.panel.minimized .handoff,.panel.minimized .composer-wrap,.panel.minimized .status,.panel.minimized .resize-handle,.panel.minimized .voice-view{display:none!important}",
".top{display:flex;align-items:center;gap:8px;padding:12px;background:#111827;color:white;min-width:0}.brand{flex:1;min-width:0}.brand b{display:block;font-size:14px}.brand small{font-size:11px;color:#b6c1cf}.top button{width:34px;height:34px;flex:none;border:0;border-radius:9px;background:#ffffff1c;color:#fff;cursor:pointer;font:600 19px/1 system-ui}",
".messages{min-height:0;overflow:auto;padding:13px;background:#f8fafc;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}.bubble{max-width:88%;padding:10px 12px;border-radius:13px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.ai{align-self:flex-start;background:white;border:1px solid #e6ebf2;color:#1a2635}.user{align-self:flex-end;background:#172033;color:#fff}.err{align-self:flex-start;background:#fff0ef;color:#9c332c}.typing{color:#697789;display:flex;align-items:center;gap:5px;font-style:italic}.typing:after{content:'';width:5px;height:5px;border-radius:50%;background:#22c55e;animation:misma-dot .9s ease-in-out infinite alternate}@keyframes misma-dot{to{opacity:.2;transform:translateY(-3px)}}",
".composer-wrap{padding:10px 10px 8px;border-top:1px solid #e8edf3;background:#fff}.composer{display:flex;align-items:flex-end;gap:8px;margin:0;padding:7px 7px 7px 10px;min-width:0;border:1px solid #dce2eb;border-radius:15px;background:#f7f9fc;box-shadow:0 1px 2px #0f172a0c}.composer textarea{box-sizing:border-box;flex:1;min-width:0;min-height:36px;max-height:108px;resize:none;border:0;outline:0;padding:8px 3px;background:transparent;font:400 13px/1.45 Inter,system-ui,sans-serif;color:#172033}.composer-actions{display:flex;align-items:center;gap:5px;flex:none;padding-bottom:2px}.icon-btn{width:35px;height:35px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:#536274;cursor:pointer;padding:0}.icon-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.icon-btn.is-active{background:#e8f8ee;color:#16a34a}.send-btn{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:#22c55e;color:#fff;cursor:pointer;padding:0}.send-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.send-btn[disabled]{opacity:.5;cursor:not-allowed}",
".handoff{display:none;padding:12px;border-top:1px solid #e8edf3;background:#fff;gap:8px}.handoff.open{display:grid}.handoff b{font-size:13px}.handoff p{margin:0;font-size:11px;color:#657286;line-height:1.45}.handoff input,.handoff textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid #dce2eb;border-radius:10px;padding:10px;font-family:inherit;font-size:13px;line-height:1.4;color:#182232}.handoff button{border:0;border-radius:10px;background:#172033;color:#fff;padding:10px 13px;cursor:pointer}.status{padding:0 12px 7px;font-size:11px;color:#718096;background:#fff;min-height:0}.resize-handle{width:32px;height:34px;display:grid;place-items:center;flex:none;padding:0;border:0;border-radius:9px;background:#ffffff1c;color:#fff;cursor:nwse-resize;touch-action:none;z-index:4}.resize-handle svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.composer.recording textarea{display:none}.recording-waveform{display:none;flex:1;align-items:center;justify-content:center;min-width:0;height:42px;gap:3px;overflow:hidden}.composer.recording .recording-waveform{display:flex}.recording-waveform i{display:block;width:3px;height:8px;flex:none;border-radius:9px;background:#22c55e;animation:misma-recording-wave .72s ease-in-out infinite alternate}.recording-waveform i:nth-child(3n){animation-delay:-.38s}.recording-waveform i:nth-child(3n + 1){animation-delay:-.16s}.recording-waveform i:nth-child(4n){animation-duration:.92s}@keyframes misma-recording-wave{from{height:5px;opacity:.55}to{height:29px;opacity:1}}.mic.is-active{color:#16a34a;background:#e8f8ee;animation:misma-mic-pulse 1.3s ease-in-out infinite}@keyframes misma-mic-pulse{50%{box-shadow:0 0 0 5px #22c55e20}}.voice-view{display:none;position:absolute;inset:0;z-index:8;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:space-between;gap:10px;padding:12px;color:#f4f6fb;background:#0b0d12;border-radius:18px;overflow:hidden;font-family:Inter,system-ui,sans-serif}.voice-view.open{display:flex}.voice-top{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:34px;gap:8px;color:#f4f6fb;font-size:13px;font-weight:600}.voice-exit{width:34px;height:34px;display:grid;place-items:center;border:1px solid #ffffff2a;border-radius:50%;background:#ffffff0d;color:#fff;cursor:pointer;font-size:19px}.voice-content{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:0;gap:12px}.voice-mode-choice{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid #ffffff20;border-radius:999px;background:#ffffff0d}.voice-mode-choice button{min-height:36px;padding:8px 12px;border:0;border-radius:999px;background:transparent;color:#c5ceda;font:500 12px Inter,system-ui,sans-serif;cursor:pointer}.voice-mode-choice button.is-selected{background:#e8eef8;color:#0d1420;font-weight:700}.voice-orb{display:grid;place-items:center;width:clamp(112px,30vw,154px);height:clamp(112px,30vw,154px);flex:none;padding:0;border:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#e1edff,#8ab4ff 46%,#3b5bdb 100%);box-shadow:0 0 55px #6c97ff47,inset 0 0 25px #ffffff4d;cursor:pointer;transition:opacity .2s,filter .2s,transform .2s}.voice-orb span{width:30%;height:30%;border-radius:50%;background:#ffffff61;filter:blur(9px)}.voice-orb[data-state=starting],.voice-orb[data-state=thinking]{animation:misma-voice-think 1s ease-in-out infinite}.voice-orb[data-state=listening]{animation:misma-voice-breathe 1.6s ease-in-out infinite}.voice-orb[data-state=speaking]{animation:misma-voice-speak .7s ease-in-out infinite}.voice-orb[data-state=ready]{opacity:.78}.voice-orb[data-state=muted]{opacity:.3;filter:grayscale(1)}.voice-status{min-height:1.4em;margin:0;color:#cbd5e1;font-size:13px;text-align:center}.voice-transcript{width:100%;max-height:20%;min-height:1.2em;overflow:auto;margin:0;color:#f4f6fb;font-size:12px;line-height:1.45;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}.voice-controls{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;width:100%}.voice-control{min-width:78px;min-height:38px;padding:8px 13px;border:1px solid #ffffff40;border-radius:999px;background:transparent;color:#f4f6fb;font:500 12px Inter,system-ui,sans-serif;cursor:pointer}.voice-control[aria-pressed=true]{background:#ffffff20}.voice-control.is-stop{background:#303d50;border-color:#303d50}.voice-control.is-end{background:#d94c56;border-color:#d94c56}.voice-control[hidden]{display:none!important}@keyframes misma-voice-breathe{0%,100%{transform:scale(.96)}50%{transform:scale(1.06)}}@keyframes misma-voice-think{0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:.95;transform:scale(1)}}@keyframes misma-voice-speak{0%,100%{transform:scale(.98)}50%{transform:scale(1.12)}}",
"@media(max-width:520px){.launch{width:54px;height:54px;min-height:54px;padding:0;gap:0;border-radius:50%}.launch-label{display:none}.panel{left:0;right:auto;width:calc(100vw - 28px);max-width:calc(100vw - 28px);height:min(570px,calc(100dvh - 100px))}.resize-handle{width:28px;height:28px}}",
"@media(prefers-reduced-motion:reduce){.launch,.typing:after{animation:none;transition:none}}",
"</style>",
"<button class='launch' aria-label='Open Misma chat' aria-expanded='false'><svg class='launch-logo' viewBox='0 0 100 100' fill='none' aria-hidden='true'><circle cx='50' cy='50' r='50' fill='#080b10'/><polyline points='17,48 32,63 56,36' stroke='#fff' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'/><polyline points='37,48 52,63 76,36' stroke='#fff' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'/></svg><span class='launch-label'>Ask Misma</span></button>",
"<section class='panel' aria-label='Misma customer chat'><header class='top'><div class='brand'><b>Misma</b><small>Business assistant</small></div>",
"<button class='human' type='button' title='Request a human' aria-label='Request a human'><svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'><circle cx='12' cy='8' r='3.4'/><path d='M5 20a7 7 0 0 1 14 0M19 5v4m-2-2h4'/></svg></button>",
"<button class='minimize' type='button' aria-label='Minimize chat' title='Minimize'>−</button><button class='close' type='button' aria-label='Close' title='Close'>×</button><button class='resize-handle' type='button' aria-label='Resize widget' title='Drag to resize'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7'/></svg></button></header>",
"<div class='messages' aria-live='polite'><div class='bubble ai'>Hello! I am Misma. How can I help you today?</div></div>",
"<div class='handoff'><b>Speak with a person</b><p>Leave your details and the business team will follow up in this conversation.</p><input name='name' maxlength='120' placeholder='Your name' autocomplete='name'><input name='email' maxlength='240' type='email' placeholder='Email (optional)'><input name='phone' maxlength='80' placeholder='Phone (optional)'><textarea name='reason' maxlength='500' placeholder='What would you like help with?'></textarea><button class='handoff-submit' type='button'>Request a human</button></div>",
"<div class='composer-wrap'><form class='composer'><div class='recording-waveform' aria-label='Listening'><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><textarea name='message' maxlength='2000' placeholder='Message Misma…' aria-label='Message Misma' rows='1'></textarea><div class='composer-actions'>",
"<button class='icon-btn mic' type='button' aria-label='Start microphone dictation' title='Dictate message'><svg viewBox='0 0 24 24'><rect x='9' y='2.5' width='6' height='12' rx='3'/><path d='M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6'/></svg></button>",
"<button class='send-btn primary is-voice' type='button' aria-label='Start voice chat' title='Start voice chat'><svg viewBox='0 0 24 24'><rect x='3' y='9' width='3' height='6' rx='1.5'/><rect x='8' y='5' width='3' height='14' rx='1.5'/><rect x='13' y='7' width='3' height='10' rx='1.5'/><rect x='18' y='3' width='3' height='18' rx='1.5'/></svg></button>",
"</div></form></div>",
"<div class='status' role='status' aria-live='polite'></div><div class='voice-view' role='dialog' aria-modal='true' aria-label='Misma speech talk'><div class='voice-top'><span>Misma speech talk</span><button class='voice-exit' type='button' aria-label='Exit speech talk' title='Exit'>×</button></div><div class='voice-content'><div class='voice-mode-choice' role='group' aria-label='Voice conversation style'><button type='button' class='voice-mode is-selected' data-mode='hands-free' aria-pressed='true'>Hands-free</button><button type='button' class='voice-mode' data-mode='push-to-talk' aria-pressed='false'>Push to talk</button></div><p class='voice-transcript' aria-live='polite'></p><button class='voice-orb' type='button' data-state='starting' aria-label='Voice conversation is connecting'><span aria-hidden='true'></span></button><p class='voice-status' aria-live='polite'>Connecting to your microphone…</p></div><div class='voice-controls'><button type='button' class='voice-control voice-mute' aria-pressed='false'>Mute</button><button type='button' class='voice-control voice-stop is-stop' hidden>Stop</button><button type='button' class='voice-control voice-end is-end'>End</button></div></div></section>"
].join("");

var $=function(selector){return root.querySelector(selector);};
var panel=$(".panel"),messages=$(".messages"),input=$(".composer textarea"),status=$(".status"),handoff=$(".handoff"),composer=$(".composer");
var micButton=$(".mic"),primaryButton=$(".primary"),minimizeButton=$(".minimize"),resizeHandle=$(".resize-handle");
var voiceView=$(".voice-view"),voiceOrb=$(".voice-orb"),voiceStatus=$(".voice-status"),voiceTranscript=$(".voice-transcript"),voiceMuteButton=$(".voice-mute"),voiceStopButton=$(".voice-stop"),voiceModeButtons=root.querySelectorAll(".voice-mode");
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
function requestMicPermission(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return Promise.resolve();
  return navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){stream.getTracks().forEach(function(track){track.stop();});});
}
function listen(isVoiceChat){
  var Recognition=recognitionConstructor();
  if(!Recognition){setStatus("Voice input is not supported in this browser. Try Chrome on HTTPS.");if(isVoiceChat)stopVoiceSession();else{dictating=false;micButton.classList.remove("is-active");}return;}
  stopRecognition();finalTranscript="";interimTranscript="";
  var instance=new Recognition();recognition=instance;instance.lang=navigator.language||"en-US";instance.interimResults=true;instance.continuous=false;instance.maxAlternatives=1;
  instance.onresult=function(event){
    var finalText="",interim="";
    for(var index=event.resultIndex;index<event.results.length;index+=1){
      var result=event.results[index],spoken=result&&result[0]?String(result[0].transcript||"").trim():"";
      if(!spoken)continue;if(result.isFinal)finalText+=(finalText?" ":"")+spoken;else interim+=(interim?" ":"")+spoken;
    }
    if(finalText)finalTranscript=(finalTranscript+" "+finalText).trim();interimTranscript=interim;
    if(!isVoiceChat){input.value=[finalTranscript,interimTranscript].filter(Boolean).join(" ");resizeInput();updatePrimary();}
    setStatus(isVoiceChat?"Listening…":"Listening · your words will appear in the message field.");
  };
  instance.onerror=function(event){
    var error=event&&event.error?event.error:"recognition";if(recognition===instance)recognition=null;
    if(error==="no-speech"&&isVoiceChat&&voiceSession){window.setTimeout(function(){if(voiceSession&&!busy)listen(true);},250);return;}
    setStatus(error==="not-allowed"||error==="service-not-allowed"?"Allow microphone access in your browser settings, then try again.":"Voice input stopped. Tap the microphone to try again.");
    if(isVoiceChat)stopVoiceSession();else{dictating=false;micButton.classList.remove("is-active");}
  };
  instance.onend=function(){
    if(recognition===instance)recognition=null;
    if(isVoiceChat){var spoken=finalTranscript.trim();if(voiceSession&&spoken&&!busy)sendMessage(spoken,true);else if(voiceSession&&!busy)window.setTimeout(function(){if(voiceSession)listen(true);},250);}
    else{dictating=false;micButton.classList.remove("is-active");input.value=[finalTranscript,interimTranscript].filter(Boolean).join(" ");resizeInput();updatePrimary();setStatus("");}
  };
  try{instance.start();}catch(error){if(recognition===instance)recognition=null;setStatus("Microphone could not start. Check browser microphone permission.");if(isVoiceChat)stopVoiceSession();else{dictating=false;micButton.classList.remove("is-active");}}
}
function speakAsWoman(text){
  var synth=window.speechSynthesis;
  if(!synth||typeof window.SpeechSynthesisUtterance==="undefined"){setStatus("Speech playback is not supported by this browser.");return Promise.resolve(false);}
  var femalePattern=/female|woman|girl|zira|samantha|susan|karen|victoria|aria|jenny|libby|natasha|sara|tessa|google us english female|google uk english female/i;
  var malePattern=/(^|[^a-z])(male|man|boy)(?=$|[^a-z])|david|mark|guy|ryan|daniel|george|james|fred|thomas/i;
  function getFemaleVoice(){return synth.getVoices().filter(function(voice){var label=voice.name+" "+voice.voiceURI;return femalePattern.test(label)&&!malePattern.test(label);})[0];}
  function waitForVoice(){var current=getFemaleVoice();if(current)return Promise.resolve(current);return new Promise(function(resolve){
    var finished=false;function done(){if(finished)return;finished=true;synth.removeEventListener("voiceschanged",done);resolve(getFemaleVoice());}
    synth.addEventListener("voiceschanged",done,{once:true});window.setTimeout(done,1200);
  });}
  var clean=String(text||"").replace(/https?:\/\/\S+/g," ").replace(/[*_~>|#]+/g," ").replace(/\s+/g," ").trim().slice(0,1600);
  if(!clean)return Promise.resolve(true);
  var parts=clean.match(/[^.!?]+[.!?]*\s*/g)||[clean];
  return waitForVoice().then(function(womanVoice){
    if(!womanVoice){setStatus("A woman's speech voice is not installed on this device. Enable a female English voice in device text-to-speech settings.");return false;}
    return new Promise(function(resolve){
      var index=0,finished=false;function next(){
        if(finished)return;if(index>=parts.length||!voiceSession){finished=true;resolve(true);return;}
        var utterance=new SpeechSynthesisUtterance(parts[index++].trim());utterance.lang=womanVoice.lang||"en";utterance.voice=womanVoice;utterance.pitch=1.04;utterance.rate=1;
        utterance.onend=next;utterance.onerror=next;synth.speak(utterance);
      }
      synth.cancel();next();
    });
  });
}
function sendMessage(rawText,speakReply){
  var text=String(rawText||"").trim();if(!text||busy)return Promise.resolve();busy=true;
  if(!speakReply){input.value="";resizeInput();updatePrimary();stopDictation();}
  bubble(text,"user");showTyping();setStatus("");updatePrimary();
  return call({action:"chat",message:text}).then(function(data){
    removeTyping();var answer=data.answer||"I could not prepare a reply.";bubble(answer,"ai");
    if(data.handoffPending)setStatus("Your message has been sent to the business team.");
    if(speakReply&&voiceSession)return speakAsWoman(answer).then(function(played){if(!played)voiceSession=false;});
    return null;
  }).catch(function(error){removeTyping();bubble(error.message||"Misma could not complete this request.","err");})
    .then(function(){busy=false;updatePrimary();if(voiceSession&&speakReply)listen(true);});
}
function stopDictation(){dictating=false;micButton.classList.remove("is-active");stopRecognition();}
function stopVoiceSession(){voiceSession=false;stopRecognition();if(window.speechSynthesis)window.speechSynthesis.cancel();primaryButton.classList.remove("is-active");updatePrimary();if(!busy)setStatus("");}
function startVoiceSession(){
  if(voiceSession){stopVoiceSession();return;}if(busy)return;
  if(!recognitionConstructor()){setStatus("Voice chat requires Chrome or another supported browser on HTTPS.");return;}
  requestMicPermission().then(function(){voiceSession=true;primaryButton.classList.add("is-active");updatePrimary();setStatus("Listening…");listen(true);})
    .catch(function(){setStatus("Allow microphone access in your browser settings, then try again.");});
}

$(".launch").addEventListener("click",function(){
  var opened=panel.classList.toggle("open");$(".launch").setAttribute("aria-expanded",String(opened));
  if(opened){panel.classList.remove("minimized");input.focus();call({action:"heartbeat"}).catch(function(error){setStatus(error.message);});refreshHistory().catch(function(error){setStatus(error.message);});}
});
$(".close").addEventListener("click",function(){panel.classList.remove("open","minimized");stopVoiceSession();stopDictation();$(".launch").setAttribute("aria-expanded","false");});
minimizeButton.addEventListener("click",function(){var minimized=panel.classList.toggle("minimized");minimizeButton.textContent=minimized?"□":"−";minimizeButton.setAttribute("aria-label",minimized?"Restore chat":"Minimize chat");minimizeButton.title=minimized?"Restore chat":"Minimize";if(minimized)stopVoiceSession();});
$(".human").addEventListener("click",function(){handoff.classList.toggle("open");if(handoff.classList.contains("open"))handoff.querySelector("[name='name']").focus();});
input.addEventListener("input",function(){resizeInput();updatePrimary();});
input.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();if(input.value.trim())sendMessage(input.value,false);}});
$(".composer").addEventListener("submit",function(event){event.preventDefault();if(input.value.trim())sendMessage(input.value,false);});
micButton.addEventListener("click",function(){
  if(dictating){if(recognition){try{recognition.stop();}catch(error){}}return;}
  if(voiceSession)stopVoiceSession();if(busy)return;
  requestMicPermission().then(function(){dictating=true;micButton.classList.add("is-active");setStatus("Listening…");listen(false);})
    .catch(function(){setStatus("Allow microphone access in your browser settings, then try again.");});
});
primaryButton.addEventListener("click",function(){if(input.value.trim())sendMessage(input.value,false);else startVoiceSession();});

function saveSize(){try{localStorage.setItem(sizeStore,JSON.stringify({width:panel.offsetWidth,height:panel.offsetHeight}));}catch(error){}}
try{
  var savedSize=JSON.parse(localStorage.getItem(sizeStore)||"null");
  if(savedSize&&savedSize.width&&savedSize.height){panel.style.width=Math.max(270,Math.min(window.innerWidth-28,Number(savedSize.width)))+"px";panel.style.height=Math.max(350,Math.min(window.innerHeight-96,Number(savedSize.height)))+"px";}
}catch(error){}
var resizeState=null;
resizeHandle.addEventListener("pointerdown",function(event){if(panel.classList.contains("minimized"))return;event.preventDefault();resizeState={x:event.clientX,y:event.clientY,width:panel.offsetWidth,height:panel.offsetHeight};try{resizeHandle.setPointerCapture(event.pointerId);}catch(error){}});
resizeHandle.addEventListener("pointermove",function(event){if(!resizeState)return;var width=Math.max(270,Math.min(window.innerWidth-28,resizeState.width+event.clientX-resizeState.x));var height=Math.max(350,Math.min(window.innerHeight-96,resizeState.height+event.clientY-resizeState.y));panel.style.width=width+"px";panel.style.height=height+"px";});
function finishResize(){if(!resizeState)return;resizeState=null;saveSize();}
resizeHandle.addEventListener("pointerup",finishResize);resizeHandle.addEventListener("pointercancel",finishResize);

$(".handoff-submit").addEventListener("click",function(){
  if(busy)return;var data={};handoff.querySelectorAll("input,textarea").forEach(function(element){data[element.name]=element.value.trim();});
  if(!data.name){setStatus("Please enter your name.");return;}busy=true;setStatus("Sending your request…");
  call(Object.assign({action:"human-request"},data)).then(function(){handoff.classList.remove("open");handoff.querySelectorAll("input,textarea").forEach(function(element){element.value="";});setStatus("Human request sent. A person will reply here.");return refreshHistory();})
    .catch(function(error){setStatus(error.message);}).then(function(){busy=false;updatePrimary();});
});
window.setInterval(function(){if(panel.classList.contains("open")&&!panel.classList.contains("minimized")&&conversation&&!busy)refreshHistory().catch(function(){});},5000);
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