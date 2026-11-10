import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getWebsiteWidgetTheme, saveWebsiteWidgetTheme } from "../lib/api/misma.functions";
import { getSupabaseClient } from "../lib/supabase";
import "../components/website-widget-customizer.css";

type FontName = "system-ui" | "Inter" | "Roboto" | "Poppins" | "Open Sans" | "Lato" | "Montserrat" | "Nunito" | "serif" | "monospace";
type ColorKey = "headerBackground" | "headerText" | "headerSubtitleText" | "chatBackground" | "textColor" | "botBubbleBackground" | "botBubbleText" | "userBubbleBackground" | "userBubbleText" | "sendButtonBackground" | "headerButtonBackground" | "footerBackground";
type WidgetTheme = {
  schemaVersion: 1; headerBackground: string; headerText: string; headerSubtitleText: string;
  chatBackground: string; textColor: string; fontFamily: FontName;
  botBubbleBackground: string; botBubbleText: string; userBubbleBackground: string; userBubbleText: string;
  sendButtonBackground: string; headerButtonBackground: string; footerBackground: string; matchChatBackground: boolean;
};
const DEFAULT_THEME: WidgetTheme = {
  schemaVersion: 1, headerBackground: "#111827", headerText: "#ffffff", headerSubtitleText: "#b6c1cf",
  chatBackground: "#f8fafc", textColor: "#182232", fontFamily: "Inter",
  botBubbleBackground: "#ffffff", botBubbleText: "#1a2635", userBubbleBackground: "#172033", userBubbleText: "#ffffff",
  sendButtonBackground: "#22c55e", headerButtonBackground: "#ffffff1c", footerBackground: "#ffffff",
  // Keep the existing white footer and pale chat surface unchanged on first edit.
  matchChatBackground: false,
};
const FONT_OPTIONS: FontName[] = ["system-ui", "Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Montserrat", "Nunito", "serif", "monospace"];
const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PRESETS = ["#ffffff", "#111827", "#172033", "#f8fafc", "#22c55e", "#2563eb", "#0f766e", "#f3e8ff"];
const FONT_STACKS: Record<FontName, string> = {
  "system-ui": "system-ui,-apple-system,BlinkMacSystemFont,sans-serif", Inter: "Inter,system-ui,sans-serif",
  Roboto: "Roboto,Arial,sans-serif", Poppins: "Poppins,system-ui,sans-serif", "Open Sans": "'Open Sans',Arial,sans-serif",
  Lato: "Lato,Arial,sans-serif", Montserrat: "Montserrat,Arial,sans-serif", Nunito: "Nunito,system-ui,sans-serif",
  serif: "Georgia,serif", monospace: "ui-monospace,SFMono-Regular,monospace",
};
const COLOR_FIELDS: Array<{key: ColorKey; label: string; group: string}> = [
  {key:"headerBackground",label:"Header background",group:"Header"},{key:"headerText",label:"Title text",group:"Header"},
  {key:"headerSubtitleText",label:"Subtitle text",group:"Header"},{key:"chatBackground",label:"Chat background",group:"Chat"},
  {key:"textColor",label:"Composer and general text",group:"Text"},{key:"botBubbleBackground",label:"Misma message background",group:"Bubbles"},
  {key:"botBubbleText",label:"Misma message text",group:"Bubbles"},{key:"userBubbleBackground",label:"Visitor message background",group:"Bubbles"},
  {key:"userBubbleText",label:"Visitor message text",group:"Bubbles"},{key:"sendButtonBackground",label:"Send / voice button",group:"Buttons"},
  {key:"headerButtonBackground",label:"Header icon buttons (including close)",group:"Buttons"},{key:"footerBackground",label:"Text-bar container",group:"Footer"},
];
function parseTheme(value: unknown): WidgetTheme {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = {...DEFAULT_THEME};
  for (const key of Object.keys(next) as Array<keyof WidgetTheme>) {
    if (key === "schemaVersion") continue;
    const candidate = input[key];
    if (key === "fontFamily" && typeof candidate === "string" && FONT_OPTIONS.includes(candidate as FontName)) next.fontFamily = candidate as FontName;
    else if (key === "matchChatBackground" && typeof candidate === "boolean") next.matchChatBackground = candidate;
    else if (typeof candidate === "string" && HEX.test(candidate)) (next as unknown as Record<string, unknown>)[key] = candidate.toLowerCase();
  }
  return next;
}
function rgba(hex: string): [number,number,number,number] {
  const raw = hex.replace("#",""); const value = raw.length === 6 ? raw + "ff" : raw;
  return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16),parseInt(value.slice(6,8),16)/255];
}
function blend(f: number[], b: number[]): number[] {
  const a = f[3] + b[3] * (1-f[3]); if (!a) return [255,255,255,1];
  return [0,1,2].map((i)=>(f[i]*f[3]+b[i]*b[3]*(1-f[3]))/a).concat(a);
}
function luminance(hex: string): number {
  const c=rgba(hex).slice(0,3).map((n)=>{const v=n/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function contrastRatio(foreground: string, background: string): number {
  const bg=blend(rgba(background),[255,255,255,1]);
  const fg=blend(rgba(foreground),bg);
  const toHex=(c:number[])=>"#"+c.slice(0,3).map(n=>Math.round(n).toString(16).padStart(2,"0")).join("");
  const a=luminance(toHex(fg)),b=luminance(toHex(bg));
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
function ColorControl({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <div className="misma-theme-color-control">
    <label className="misma-theme-color-label">{label}</label>
    <div className="misma-theme-color-inputs">
      <label className="misma-theme-picker" title={"Choose "+label}>
        <input aria-label={label+" color picker"} type="color" value={value.slice(0,7)} onChange={e=>{setDraft(e.target.value);onChange(e.target.value.toLowerCase());}} />
        <span>{value.toLowerCase()}</span>
      </label>
      <input aria-label={label+" hex value"} className={"misma-theme-hex"+(HEX.test(draft)?"":" is-invalid")} value={draft} maxLength={9} spellCheck={false}
        onChange={e=>{const v=e.target.value;setDraft(v);if(HEX.test(v))onChange(v.toLowerCase());}} onBlur={()=>{if(!HEX.test(draft))setDraft(value);}} />
    </div>
    <div className="misma-theme-presets">{PRESETS.map(p=><button key={p} type="button" title={p} aria-label={label+" "+p} className={value.toLowerCase()===p?"is-selected":""} style={{background:p}} onClick={()=>{setDraft(p);onChange(p);}} />)}</div>
    {!HEX.test(draft)&&<small className="misma-theme-field-error">Use #RRGGBB or #RRGGBBAA.</small>}
  </div>;
}
export const Route = createFileRoute("/dashboard/websites/$siteId/customize")({component:WebsiteWidgetCustomizer});

function WebsiteWidgetCustomizer() {
  const {siteId}=Route.useParams(); const navigate=useNavigate();
  const [token,setToken]=useState(""); const [websiteName,setWebsiteName]=useState("Connected website"); const [domain,setDomain]=useState("");
  const [theme,setTheme]=useState<WidgetTheme>(DEFAULT_THEME); const [savedTheme,setSavedTheme]=useState<WidgetTheme>(DEFAULT_THEME);
  const [themeSuggestions,setThemeSuggestions]=useState<Record<string,unknown>>({});
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<{kind:"success"|"error"|"info";text:string}|null>(null);
  const dirty=useMemo(()=>JSON.stringify(theme)!==JSON.stringify(savedTheme),[theme,savedTheme]);
  const footer=theme.matchChatBackground?theme.chatBackground:theme.footerBackground;
  const previewStyle={
    "--preview-header-bg":theme.headerBackground,"--preview-header-text":theme.headerText,"--preview-header-subtitle":theme.headerSubtitleText,
    "--preview-chat-bg":theme.chatBackground,"--preview-text":theme.textColor,"--preview-bot-bg":theme.botBubbleBackground,
    "--preview-bot-text":theme.botBubbleText,"--preview-user-bg":theme.userBubbleBackground,"--preview-user-text":theme.userBubbleText,
    "--preview-send-bg":theme.sendButtonBackground,"--preview-header-button-bg":theme.headerButtonBackground,
    "--preview-footer-bg":footer,"--preview-font":FONT_STACKS[theme.fontFamily],
  } as CSSProperties;

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        const session=await getSupabaseClient().auth.getSession();
        if(session.error)throw session.error;
        const accessToken=session.data.session?.access_token||"";
        if(!accessToken){window.location.replace("/login?redirect="+encodeURIComponent("/dashboard/websites/"+siteId+"/customize"));return;}
        if(!active)return; setToken(accessToken);
        const result=await getWebsiteWidgetTheme({data:{token:accessToken,websiteId:siteId}});
        if(!active)return;
        const site=result.website as {name?:string|null;domain?:string|null;theme?:unknown;theme_suggestions?:Record<string,unknown>|null};
        const loaded=parseTheme(site.theme);
        setWebsiteName(site.name||site.domain||"Connected website");setDomain(site.domain||"");
        setTheme(loaded);setSavedTheme(loaded);setThemeSuggestions(site.theme_suggestions&&typeof site.theme_suggestions==="object"?site.theme_suggestions:{});
      }catch(error){if(active)setMessage({kind:"error",text:error instanceof Error?error.message:"Could not load widget settings."});}
      finally{if(active)setLoading(false);}
    };
    void load();return()=>{active=false;};
  },[siteId]);
  useEffect(()=>{
    const googleFamilies: Partial<Record<FontName,string>> = {
      Inter:"Inter", Roboto:"Roboto", Poppins:"Poppins", "Open Sans":"Open+Sans",
      Lato:"Lato", Montserrat:"Montserrat", Nunito:"Nunito",
    };
    const family=googleFamilies[theme.fontFamily];
    if(!family || document.querySelector('link[data-misma-customizer-font="'+family+'"]'))return;
    try {
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="https://fonts.googleapis.com/css2?family="+family+"&display=swap";
      link.dataset.mismaCustomizerFont=family;
      document.head.appendChild(link);
    } catch { /* The system font stack remains the CSP-safe fallback. */ }
  },[theme.fontFamily]);
  useEffect(()=>{
    if(!dirty)return;
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);
  },[dirty]);
  const setColor=(key:ColorKey,value:string)=>setTheme(current=>({...current,[key]:value}));
  const back=()=>{if(dirty&&!window.confirm("You have unsaved widget changes. Leave without saving?"))return;void navigate({to:"/dashboard"});};
  const reset=()=>{setTheme({...DEFAULT_THEME});setMessage({kind:"info",text:"Production widget defaults restored locally. Save to publish them."});};
  const suggest=()=>{
    const updates:Partial<WidgetTheme>={};
    for(const field of COLOR_FIELDS){
      const value=themeSuggestions[field.key];
      if(typeof value==="string"&&HEX.test(value))updates[field.key]=value.toLowerCase();
    }
    const count=Object.keys(updates).length;
    if(!count){setMessage({kind:"info",text:"No usable brand colours were found in the latest website scan. Run Scan website and try again."});return;}
    setTheme(current=>({...current,...updates}));
    setMessage({kind:"success",text:"Applied "+count+" colour"+(count===1?"":"s")+" from the latest scan. Review contrast before saving."});
  };
  const save=async()=>{
    if(!token||saving||!dirty)return;setSaving(true);setMessage(null);
    try{
      const result=await saveWebsiteWidgetTheme({data:{token,websiteId:siteId,theme}});
      const saved=parseTheme((result.website as {theme?:unknown}).theme||theme);
      setTheme(saved);setSavedTheme(saved);
      setMessage({kind:"success",text:"Theme saved. Connected sites will receive it through the widget config endpoint within about 60 seconds. No script reinstallation is needed."});
    }catch(error){setMessage({kind:"error",text:error instanceof Error?error.message:"Could not save widget theme."});}
    finally{setSaving(false);}
  };
  const contrasts=[
    {label:"Header title",ratio:contrastRatio(theme.headerText,theme.headerBackground)},
    {label:"Header subtitle",ratio:contrastRatio(theme.headerSubtitleText,theme.headerBackground)},
    {label:"Chat text",ratio:contrastRatio(theme.textColor,theme.chatBackground)},
    {label:"Misma bubble",ratio:contrastRatio(theme.botBubbleText,theme.botBubbleBackground)},
    {label:"Visitor bubble",ratio:contrastRatio(theme.userBubbleText,theme.userBubbleBackground)},
  ];
  const failures=contrasts.filter(item=>item.ratio<4.5);
  if(loading)return <main className="misma-theme-page"><div className="misma-theme-loading">Loading website widget settings…</div></main>;
  if(message?.kind==="error"&&!token)return <main className="misma-theme-page"><div className="misma-theme-error">{message.text}<button onClick={()=>void navigate({to:"/dashboard"})}>Back to websites</button></div></main>;

  return <main className="misma-theme-page">
    <header className="misma-theme-toolbar">
      <button type="button" className="misma-theme-back" onClick={back}>← <span>Websites</span></button>
      <div className="misma-theme-title"><span className="misma-theme-eyebrow">WIDGET CUSTOMIZATION</span><h1>Customize widget</h1><p>{websiteName}{domain?" · "+domain:""}</p></div>
      <button type="button" className="misma-theme-save" onClick={()=>void save()} disabled={!dirty||saving||!token}>{saving?"Saving…":"Save changes"}</button>
      <button type="button" className="misma-theme-close" onClick={back} aria-label="Close customization" title="Close customization">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>
      </button>
    </header>
    {message&&<div className={"misma-theme-notice is-"+message.kind} role="status">{message.text}</div>}
    <section className="misma-theme-preview-sticky" aria-label="Live widget preview">
      <div className="misma-theme-preview-heading"><div><strong>Live preview</strong><span>Updates as you edit</span></div><span className="misma-theme-preview-live"><i/> LIVE</span></div>
      <div className="misma-widget-preview" style={previewStyle}>
        <div className="misma-widget-preview-header"><div className="misma-widget-preview-brand"><strong>Misma</strong><small>Business assistant</small></div>
          <button type="button" aria-label="WhatsApp">◔</button><button type="button" aria-label="Instagram">◎</button><button type="button" aria-label="Request a person">＋</button><button type="button" className="misma-widget-preview-close" aria-label="Close preview" title="Close preview"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div>
        <div className="misma-widget-preview-chat">
          <div className="misma-widget-preview-bubble is-bot">Hello! I am Misma. How can I help you today?</div>
          <div className="misma-widget-preview-bubble is-user">Do you deliver to Kigali?</div>
          <div className="misma-widget-preview-bubble is-bot">Yes, we deliver in Kigali. What would you like to order?</div>
        </div>
        <div className="misma-widget-preview-footer"><div className="misma-widget-preview-input"><span>Message Misma…</span><i>＋</i></div><button type="button" aria-label="Microphone">♩</button><button type="button" aria-label="Send or voice" className="is-send">≋</button></div>
      </div>
    </section>
    <div className="misma-theme-content">
      {[
        {id:"01",title:"Header",copy:"Control the widget title, subtitle and header surface.",group:"Header"},
        {id:"02",title:"Chat background",copy:"Set the canvas behind the conversation.",group:"Chat"},
      ].map(section=><section key={section.id} className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>{section.id}</span><div><h2>{section.title}</h2><p>{section.copy}</p></div></div>
        <div className="misma-theme-controls">{COLOR_FIELDS.filter(field=>field.group===section.group).map(field=><ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={value=>setColor(field.key,value)}/>)}</div>
      </section>)}
      <section className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>03</span><div><h2>Message bubbles</h2><p>Set separate surfaces and text colours for Misma and visitors.</p></div></div>
        <div className="misma-theme-controls">{COLOR_FIELDS.filter(field=>field.group==="Bubbles").map(field=><ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={value=>setColor(field.key,value)}/>)}</div>
      </section>
      <section className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>04</span><div><h2>Buttons</h2><p>Set the send / voice action and header icon surfaces.</p></div></div>
        <div className="misma-theme-controls">{COLOR_FIELDS.filter(field=>field.group==="Buttons").map(field=><ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={value=>setColor(field.key,value)}/>)}</div>
      </section>
      <section className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>05</span><div><h2>Typography</h2><p>Choose a safe font family and general text colour.</p></div></div>
        <label className="misma-theme-font-field"><span>Font family</span><select value={theme.fontFamily} onChange={e=>setTheme(current=>({...current,fontFamily:e.target.value as FontName}))}>{FONT_OPTIONS.map(font=><option key={font} value={font} style={{fontFamily:FONT_STACKS[font]}}>{font}</option>)}</select><small style={{fontFamily:FONT_STACKS[theme.fontFamily]}}>The quick brown fox jumps over the lazy dog.</small></label>
        <div className="misma-theme-controls">{COLOR_FIELDS.filter(field=>field.group==="Text").map(field=><ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={value=>setColor(field.key,value)}/>)}</div>
      </section>
      <section className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>06</span><div><h2>Footer</h2><p>Style the text bar separately or link it to the chat canvas.</p></div></div>
        <label className="misma-theme-match-toggle"><input type="checkbox" checked={theme.matchChatBackground} onChange={e=>setTheme(current=>({...current,matchChatBackground:e.target.checked}))}/><span><strong>Match chat background</strong><small>Use the chat background as the footer surface.</small></span></label>
        <div className={theme.matchChatBackground?"misma-theme-controls is-disabled":"misma-theme-controls"}>{COLOR_FIELDS.filter(field=>field.group==="Footer").map(field=><ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={value=>setColor(field.key,value)}/>)}</div>
        {theme.matchChatBackground&&<small className="misma-theme-hint">The text-bar container is using {theme.chatBackground}.</small>}
      </section>
      <section className="misma-theme-section">
        <div className="misma-theme-section-heading"><span>07</span><div><h2>Accessibility and website colours</h2><p>Check WCAG AA contrast and reuse colours from the latest scan.</p></div></div>
        {failures.length?<div className="misma-theme-contrast-warning" role="status"><strong>Contrast needs attention</strong><span>{failures.map(item=>item.label+": "+item.ratio.toFixed(2)+":1").join(" · ")}. WCAG AA normally requires 4.5:1 for regular text.</span></div>:<div className="misma-theme-contrast-ok">Text contrast checks meet the 4.5:1 WCAG AA target for the sampled pairs.</div>}
        <button type="button" className="misma-theme-secondary" onClick={suggest}>✦ Suggest colours from my website</button>
        <p className="misma-theme-hint">Suggestions use colours recorded by the latest rendered-page scan, including theme-colour metadata, CSS declarations and inline / SVG brand colours. Misma reads public rendered HTTP output; it does not read PHP, Node, Go, Python or other server-side source code.</p>
      </section>
      <div className="misma-theme-bottom-actions"><button type="button" className="misma-theme-reset" onClick={reset}>Reset to default</button><button type="button" className="misma-theme-save" onClick={()=>void save()} disabled={!dirty||saving||!token}>{saving?"Saving…":"Save changes"}</button></div>
      {dirty&&<p className="misma-theme-unsaved" role="status">You have unsaved changes.</p>}
    </div>
  </main>;
}
