import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  getWebsiteWidgetTheme,
  getWebsiteThemeSuggestions,
  saveWebsiteWidgetTheme,
} from "../lib/api/misma.functions";

type Theme = {
  headerBackground: string; headerTextColor: string; headerSubtitleColor: string;
  chatBackground: string; textColor: string; fontFamily: string;
  botBubbleBackground: string; botBubbleTextColor: string;
  userBubbleBackground: string; userBubbleTextColor: string;
  sendButtonColor: string; headerButtonColor: string;
  footerBackground: string; matchChatBackground: boolean;
};
const DEFAULT_THEME: Theme = {
  headerBackground: "#111827", headerTextColor: "#FFFFFF", headerSubtitleColor: "#B6C1CF",
  chatBackground: "#F8FAFC", textColor: "#182232", fontFamily: "Inter",
  botBubbleBackground: "#FFFFFF", botBubbleTextColor: "#1A2635",
  userBubbleBackground: "#172033", userBubbleTextColor: "#FFFFFF",
  sendButtonColor: "#22C55E", headerButtonColor: "#FFFFFF1C",
  footerBackground: "#FFFFFF", matchChatBackground: true,
};
const FONTS = ["system-ui", "Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Montserrat", "Nunito", "serif", "monospace"];
const STACK: Record<string,string> = {
  "system-ui":"system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
  "Inter":"Inter,system-ui,sans-serif","Roboto":"Roboto,Arial,sans-serif",
  "Poppins":"Poppins,system-ui,sans-serif","Open Sans":"'Open Sans',Arial,sans-serif",
  "Lato":"Lato,Arial,sans-serif","Montserrat":"Montserrat,Arial,sans-serif",
  "Nunito":"Nunito,system-ui,sans-serif","serif":"Georgia,serif",
  "monospace":"ui-monospace,SFMono-Regular,Menlo,monospace",
};
const GOOGLE: Record<string,string> = {
  Inter:"Inter:wght@400;500;600;700",Roboto:"Roboto:wght@400;500;700",
  Poppins:"Poppins:wght@400;500;600;700","Open Sans":"Open+Sans:wght@400;500;600;700",
  Lato:"Lato:wght@400;700",Montserrat:"Montserrat:wght@400;500;600;700",
  Nunito:"Nunito:wght@400;600;700",
};
const PRESETS = ["#111827","#172033","#16A34A","#22C55E","#2563EB","#7C3AED","#F8FAFC","#FFFFFF","#182232","#64748B"];
const COLORS: Array<{key:keyof Theme;label:string;group:string}> = [
  {key:"headerBackground",label:"Header background",group:"Header"},
  {key:"headerTextColor",label:"Title text",group:"Header"},
  {key:"headerSubtitleColor",label:"Subtitle text",group:"Header"},
  {key:"chatBackground",label:"Chat background",group:"Chat background"},
  {key:"textColor",label:"General text",group:"Text"},
  {key:"botBubbleBackground",label:"Assistant bubble background",group:"Message bubbles"},
  {key:"botBubbleTextColor",label:"Assistant bubble text",group:"Message bubbles"},
  {key:"userBubbleBackground",label:"Visitor bubble background",group:"Message bubbles"},
  {key:"userBubbleTextColor",label:"Visitor bubble text",group:"Message bubbles"},
  {key:"sendButtonColor",label:"Send / voice button",group:"Buttons"},
  {key:"headerButtonColor",label:"Header icon buttons",group:"Buttons"},
  {key:"footerBackground",label:"Text-bar container",group:"Footer"},
];
function validHex(value:string){return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value.trim())?value.trim().toUpperCase():null;}
function lum(hex:string){const v=hex.slice(1,7);const channels=[0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];}
function lowContrast(fg:string,bg:string){const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5;}
function ColorField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  const update=(next:string)=>{setDraft(next);const safe=validHex(next);if(safe)onChange(safe);};
  const picker=validHex(value)||"#FFFFFF";
  return <div className="mw-color-field"><label>{label}</label><div className="mw-color-edit">
    <input aria-label={label+" picker"} type="color" value={picker.slice(0,7)} onChange={e=>update(e.target.value)}/>
    <input aria-label={label+" hex"} value={draft} maxLength={9} spellCheck={false} onChange={e=>update(e.target.value)} onBlur={()=>setDraft(value)}/>
  </div><div className="mw-presets">{PRESETS.map(p=><button key={p} type="button" title={p} aria-label={label+" preset "+p} style={{background:p}} onClick={()=>update(p)}/>)}</div></div>;
}
export const Route=createFileRoute("/dashboard/websites/$siteId/customize")({component:CustomizeWidget});
function CustomizeWidget(){
  const {siteId}=Route.useParams();
  const navigate=useNavigate();
  const [token,setToken]=useState("");
  const [theme,setTheme]=useState<Theme>(DEFAULT_THEME);
  const [saved,setSaved]=useState<Theme>(DEFAULT_THEME);
  const [siteName,setSiteName]=useState("Website widget");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [suggesting,setSuggesting]=useState(false);
  const [status,setStatus]=useState<{kind:string;message:string}|null>(null);
  const dirty=JSON.stringify(theme)!==JSON.stringify(saved);
  const updateColor=(key:keyof Theme,value:string)=>setTheme(current=>{
    const next={...current,[key]:value};if(key==="chatBackground"&&current.matchChatBackground)next.footerBackground=value;return next;
  });
  useEffect(()=>{
    const currentToken=sessionStorage.getItem("misma_id_token")||"";
    if(!currentToken){window.location.replace("/login?redirect="+encodeURIComponent("/dashboard/websites/"+siteId+"/customize"));return;}
    setToken(currentToken);
    void (async()=>{
      try{
        const data=await getWebsiteWidgetTheme({data:{token:currentToken,websiteId:siteId}});
        const normalized={...DEFAULT_THEME,...data.theme};
        if(normalized.matchChatBackground)normalized.footerBackground=normalized.chatBackground;
        setTheme(normalized);setSaved(normalized);setSiteName(data.suggestions?.siteName||"Website widget");
      }catch(error){setStatus({kind:"error",message:error instanceof Error?error.message:"Could not load this widget theme."});}
      finally{setLoading(false);}
    })();
  },[siteId]);
  useEffect(()=>{
    const spec=GOOGLE[theme.fontFamily];if(!spec)return;
    const id="misma-font-"+theme.fontFamily.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    if(document.getElementById(id))return;
    const link=document.createElement("link");link.id=id;link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family="+spec+"&display=swap";document.head.appendChild(link);
  },[theme.fontFamily]);
  useEffect(()=>{
    if(!dirty)return;
    const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
  },[dirty]);
  const warnings=useMemo(()=>({
    header:lowContrast(theme.headerTextColor,theme.headerBackground),
    subtitle:lowContrast(theme.headerSubtitleColor,theme.headerBackground),
    bot:lowContrast(theme.botBubbleTextColor,theme.botBubbleBackground),
    user:lowContrast(theme.userBubbleTextColor,theme.userBubbleBackground),
    general:lowContrast(theme.textColor,theme.chatBackground),
  }),[theme]);
  const footerBg=theme.matchChatBackground?theme.chatBackground:theme.footerBackground;
  const previewStyle={
    "--mw-header-bg":theme.headerBackground,"--mw-header-text":theme.headerTextColor,
    "--mw-header-subtitle":theme.headerSubtitleColor,"--mw-chat-bg":theme.chatBackground,
    "--mw-text":theme.textColor,"--mw-bot-bg":theme.botBubbleBackground,
    "--mw-bot-text":theme.botBubbleTextColor,"--mw-user-bg":theme.userBubbleBackground,
    "--mw-user-text":theme.userBubbleTextColor,"--mw-send":theme.sendButtonColor,
    "--mw-header-buttons":theme.headerButtonColor,"--mw-footer-bg":footerBg,
    fontFamily:STACK[theme.fontFamily]||STACK.Inter,
  } as React.CSSProperties;
  async function save(){
    if(!token||saving||!dirty)return;setSaving(true);setStatus(null);
    try{
      const next={...theme,footerBackground:theme.matchChatBackground?theme.chatBackground:theme.footerBackground};
      const result=await saveWebsiteWidgetTheme({data:{token,websiteId:siteId,theme:next}});
      const normalized={...DEFAULT_THEME,...result.theme};setTheme(normalized);setSaved(normalized);
      setStatus({kind:"success",message:"Widget theme saved. All installations will load it within about 60 seconds."});
    }catch(error){setStatus({kind:"error",message:error instanceof Error?error.message:"Could not save the widget theme."});}
    finally{setSaving(false);}
  }
  async function suggest(){
    if(!token||suggesting)return;setSuggesting(true);setStatus(null);
    try{
      const result=await getWebsiteThemeSuggestions({data:{token,websiteId:siteId}});
      const colors=(result.suggestions.colors||[]).map((entry:any)=>validHex(String(entry.color||""))).filter(Boolean) as string[];
      if(!colors.length)throw new Error("No brand colors were found. Scan this website first.");
      setTheme(current=>({...current,headerBackground:colors[0],sendButtonColor:colors[1]||colors[0],userBubbleBackground:colors[0],chatBackground:colors[2]||current.chatBackground,footerBackground:current.matchChatBackground?(colors[2]||current.chatBackground):current.footerBackground}));
      setStatus({kind:"success",message:"Applied the latest scanned brand colors. Check text contrast before saving."});
    }catch(error){setStatus({kind:"error",message:error instanceof Error?error.message:"Could not suggest website colors."});}
    finally{setSuggesting(false);}
  }
  function reset(){if(dirty&&!window.confirm("Discard unsaved changes and reset the widget to Misma defaults?"))return;setTheme(DEFAULT_THEME);setStatus({kind:"info",message:"Defaults restored. Save to publish these settings."});}
  const css=".mw-page{min-height:100vh;background:#0b0e13;color:#eef2f7;padding:18px 16px 50px;font-family:Inter,system-ui,sans-serif}.mw-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}.mw-head h1{margin:0;font-size:22px}.mw-head p{margin:5px 0 0;color:#9ca9b9;font-size:13px}.mw-btn{border:1px solid #293446;border-radius:10px;background:#151b25;color:#f8fafc;padding:10px 13px;font-weight:600;cursor:pointer}.mw-primary{background:#16a34a;border-color:#16a34a}.mw-btn:disabled{opacity:.5;cursor:not-allowed}.mw-status{padding:11px 13px;border-radius:10px;background:#1b2735;color:#dbeafe;font-size:13px;margin:12px 0}.mw-status.error{background:#3b2025;color:#fecaca}.mw-status.success{background:#173322;color:#bbf7d0}.mw-layout{display:grid;gap:16px;max-width:1100px;margin:auto}.mw-preview{position:sticky;top:0;z-index:10;padding:12px;border:1px solid #283447;border-radius:15px;background:#0b0e13ed;backdrop-filter:blur(16px)}.mw-preview-head{display:flex;justify-content:space-between;margin:0 0 10px;color:#aab7c7;font-size:11px;letter-spacing:.13em;font-weight:700}.mw-stage{display:flex;justify-content:center;min-height:225px}.mw-widget{width:min(100%,390px);overflow:hidden;border:1px solid #dce3ec;border-radius:18px;background:var(--mw-chat-bg);color:var(--mw-text);box-shadow:0 14px 40px #0006}.mw-top{display:flex;align-items:center;gap:8px;padding:12px;background:var(--mw-header-bg);color:var(--mw-header-text)}.mw-brand{min-width:0;flex:1}.mw-brand strong,.mw-brand small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mw-brand strong{font-size:14px}.mw-brand small{font-size:11px;color:var(--mw-header-subtitle)}.mw-icon{display:grid;place-items:center;width:29px;height:29px;border-radius:8px;background:var(--mw-header-buttons);color:var(--mw-header-text);font-size:14px}.mw-messages{display:grid;gap:9px;min-height:140px;padding:12px;background:var(--mw-chat-bg)}.mw-bubble{max-width:85%;padding:9px 11px;border-radius:13px;font-size:12px;line-height:1.5}.mw-bot{justify-self:start;background:var(--mw-bot-bg);color:var(--mw-bot-text);border:1px solid #0000000d}.mw-user{justify-self:end;background:var(--mw-user-bg);color:var(--mw-user-text)}.mw-footer{padding:10px;background:var(--mw-footer-bg);border-top:1px solid #00000012}.mw-pill{height:40px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border:1px solid #64748b55;border-radius:999px;background:color-mix(in srgb,var(--mw-footer-bg) 94%,#64748b 6%);color:var(--mw-text);font-size:11px}.mw-pill span:first-child{flex:1;opacity:.65}.mw-send{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--mw-send);color:white}.mw-controls{display:grid;gap:13px}.mw-section{padding:15px;border:1px solid #273346;border-radius:14px;background:#111722}.mw-section h2{margin:0 0 12px;font-size:15px}.mw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.mw-color-field label,.mw-field label{display:block;margin-bottom:7px;font-size:12px;color:#c4cedb}.mw-color-edit{display:flex;align-items:center;gap:8px}.mw-color-edit input[type=color]{width:44px;height:39px;padding:3px;border:1px solid #344154;border-radius:8px;background:#1b2431}.mw-color-edit input:not([type=color]),.mw-field select{flex:1;min-width:0;height:39px;padding:0 9px;border:1px solid #344154;border-radius:8px;background:#0c121b;color:#f8fafc;font:13px ui-monospace,monospace}.mw-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.mw-presets button{width:20px;height:20px;border:2px solid #ffffff55;border-radius:50%;cursor:pointer}.mw-hint{font-size:12px;color:#9ca9b9;line-height:1.5}.mw-warning{font-size:11px;color:#fbbf24}.mw-check{display:flex;gap:8px;align-items:center;font-size:13px;color:#dbe4ef}.mw-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}@media(min-width:900px){.mw-layout{grid-template-columns:390px minmax(0,1fr);align-items:start}.mw-preview{position:sticky;top:12px}.mw-controls{grid-column:2;grid-row:1}.mw-preview{grid-column:1;grid-row:1}}@media(max-width:520px){.mw-page{padding:13px 11px 40px}.mw-head h1{font-size:19px}.mw-preview{padding:9px}}";
  return <main className="mw-page"><style>{css}</style>
    <div className="mw-head"><div><h1>Customize widget</h1><p>{siteName} · Live preview before publishing</p></div>
      <button className="mw-btn" type="button" onClick={()=>{if(dirty&&!window.confirm("Leave without saving your widget changes?"))return;void navigate({to:"/dashboard"});}}>← Dashboard</button></div>
    {status&&<div className={"mw-status "+status.kind} role="status">{status.message}</div>}
    {loading&&<div className="mw-status">Loading saved widget settings…</div>}
    <div className="mw-layout">
      <section className="mw-preview"><div className="mw-preview-head"><span>LIVE PREVIEW</span><span>Sample conversation</span></div>
        <div className="mw-stage"><div className="mw-widget" style={previewStyle}>
          <header className="mw-top"><div className="mw-brand"><strong>Misma</strong><small>Business assistant</small></div><span className="mw-icon">◉</span><span className="mw-icon">◎</span><span className="mw-icon">♙</span><span className="mw-icon">×</span></header>
          <div className="mw-messages"><div className="mw-bubble mw-bot">Hello! I am Misma. How can I help you today?</div><div className="mw-bubble mw-user">What are your opening hours?</div><div className="mw-bubble mw-bot">We are open Monday to Saturday. How else can I help?</div></div>
          <footer className="mw-footer"><div className="mw-pill"><span>Message Misma…</span><span>♩</span><span className="mw-send">↑</span></div></footer>
        </div></div>
      </section>
      <div className="mw-controls">
        <section className="mw-section"><h2>Header</h2><div className="mw-grid">{COLORS.filter(x=>x.group==="Header").map(x=><ColorField key={x.key} label={x.label} value={String(theme[x.key])} onChange={v=>updateColor(x.key,v)}/>)}</div>{(warnings.header||warnings.subtitle)&&<p className="mw-warning">Header text contrast is below WCAG AA (4.5:1).</p>}</section>
        <section className="mw-section"><h2>Chat background</h2><div className="mw-grid">{COLORS.filter(x=>x.group==="Chat background").map(x=><ColorField key={x.key} label={x.label} value={String(theme[x.key])} onChange={v=>updateColor(x.key,v)}/>)}</div>{warnings.general&&<p className="mw-warning">General text contrast is below WCAG AA (4.5:1).</p>}</section>
        <section className="mw-section"><h2>Text</h2><div className="mw-field"><label htmlFor="mw-font">Font family</label><select id="mw-font" value={theme.fontFamily} onChange={e=>setTheme(v=>({...v,fontFamily:e.target.value}))}>{FONTS.map(font=><option key={font} value={font}>{font} — Aa 123</option>)}</select><p className="mw-hint" style={{fontFamily:STACK[theme.fontFamily]}}>Live font preview: The quick brown fox jumps over the lazy dog.</p></div><ColorField label="General text color" value={theme.textColor} onChange={v=>updateColor("textColor",v)}/></section>
        <section className="mw-section"><h2>Message bubbles</h2><div className="mw-grid">{COLORS.filter(x=>x.group==="Message bubbles").map(x=><ColorField key={x.key} label={x.label} value={String(theme[x.key])} onChange={v=>updateColor(x.key,v)}/>)}</div>{(warnings.bot||warnings.user)&&<p className="mw-warning">One or more bubble text colors fail WCAG AA contrast (4.5:1).</p>}</section>
        <section className="mw-section"><h2>Buttons</h2><div className="mw-grid">{COLORS.filter(x=>x.group==="Buttons").map(x=><ColorField key={x.key} label={x.label} value={String(theme[x.key])} onChange={v=>updateColor(x.key,v)}/>)}</div></section>
        <section className="mw-section"><h2>Footer</h2><label className="mw-check"><input type="checkbox" checked={theme.matchChatBackground} onChange={e=>setTheme(v=>({...v,matchChatBackground:e.target.checked,footerBackground:e.target.checked?v.chatBackground:v.footerBackground}))}/>Match chat background</label>{!theme.matchChatBackground&&<div style={{marginTop:12}}><ColorField label="Text-bar container background" value={theme.footerBackground} onChange={v=>updateColor("footerBackground",v)}/></div>}<p className="mw-hint">When linked, the footer follows the chat color. The text bar uses a subtle derived surface and border.</p></section>
        <div className="mw-actions"><button className="mw-btn" type="button" onClick={()=>{if(dirty&&!window.confirm("Discard unsaved changes and restore current Misma defaults?"))return;setTheme(DEFAULT_THEME);setStatus({kind:"info",message:"Defaults restored. Save to publish."});}}>Reset to default</button>
          <button className="mw-btn" type="button" disabled={suggesting} onClick={()=>void suggest()}>{suggesting?"Finding colors…":"Suggest colors from my website"}</button>
          <button className="mw-btn mw-primary" type="button" disabled={saving||loading||!dirty} onClick={()=>void save()}>{saving?"Saving…":dirty?"Save changes":"Saved"}</button></div>
      </div>
    </div>
  </main>;
}
