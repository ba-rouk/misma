import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getWebsiteWidgetTheme, saveWebsiteWidgetTheme } from "../../../../lib/api/misma.functions";

type WidgetTheme = {
  schemaVersion: 1;
  headerBackground: string; headerText: string; chatBackground: string; textColor: string;
  fontFamily: "system-ui" | "Inter" | "Roboto" | "Poppins" | "Open Sans" | "Lato" | "Montserrat" | "Nunito" | "serif" | "monospace";
  botBubbleBackground: string; botBubbleText: string; userBubbleBackground: string; userBubbleText: string;
  sendButtonBackground: string; headerButtonBackground: string; footerBackground: string; matchChatBackground: boolean;
};

const DEFAULT_THEME: WidgetTheme = {
  schemaVersion: 1,
  headerBackground: "#111827", headerText: "#ffffff", chatBackground: "#f8fafc", textColor: "#182232",
  fontFamily: "Inter", botBubbleBackground: "#ffffff", botBubbleText: "#1a2635",
  userBubbleBackground: "#172033", userBubbleText: "#ffffff", sendButtonBackground: "#22c55e",
  headerButtonBackground: "#ffffff1c", footerBackground: "#ffffff", matchChatBackground: true,
};
const FONT_OPTIONS: WidgetTheme["fontFamily"][] = ["system-ui","Inter","Roboto","Poppins","Open Sans","Lato","Montserrat","Nunito","serif","monospace"];
const PRESETS = ["#111827","#f8fafc","#ffffff","#172033","#22c55e","#16a34a","#2563eb","#7c3aed","#f97316","#fce7f3","#0f766e","#334155"];
const FONT_STACK: Record<WidgetTheme["fontFamily"], string> = {
  "system-ui":"system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
  "Inter":"Inter,system-ui,-apple-system,sans-serif", "Roboto":"Roboto,Arial,sans-serif",
  "Poppins":"Poppins,system-ui,sans-serif", "Open Sans":"'Open Sans',Arial,sans-serif",
  "Lato":"Lato,Arial,sans-serif", "Montserrat":"Montserrat,Arial,sans-serif",
  "Nunito":"Nunito,system-ui,sans-serif", "serif":"Georgia,serif", "monospace":"ui-monospace,SFMono-Regular,monospace",
};
function luminance(hex: string) {
  const values = hex.slice(1).match(/.{2}/g)?.map((v) => parseInt(v,16)/255) || [0,0,0];
  const linear = values.map((v) => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrast(a: string,b: string) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function ColorControl({label,value,onChange,pair}: {label:string;value:string;onChange:(v:string)=>void;pair?:string}) {
  const ratio = pair ? contrast(value,pair) : null;
  return <div className="mw-color-control">
    <div className="mw-color-title"><label>{label}</label>{ratio !== null && <small className={ratio>=4.5?"pass":"warn"}>{ratio.toFixed(2)}:1 {ratio>=4.5?"WCAG AA":"Below WCAG AA"}</small>}</div>
    <div className="mw-color-inputs"><input aria-label={label+" color picker"} type="color" value={/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)?value.slice(0,7):"#000000"} onChange={e=>onChange(e.target.value)} /><input aria-label={label+" hex value"} value={value} maxLength={9} onChange={e=>onChange(e.target.value)} /></div>
    <div className="mw-presets">{PRESETS.slice(0,8).map(color=><button type="button" key={color} title={color} style={{background:color}} onClick={()=>onChange(color)} aria-label={label+" preset "+color}/>)}</div>
  </div>;
}

export const Route = createFileRoute("/dashboard/websites/$siteId/customize")({ component: CustomizeWidgetPage });

function CustomizeWidgetPage() {
  const { siteId } = Route.useParams();
  const navigate = useNavigate();
  const [theme,setTheme]=useState<WidgetTheme>(DEFAULT_THEME);
  const [savedTheme,setSavedTheme]=useState<WidgetTheme>(DEFAULT_THEME);
  const [siteName,setSiteName]=useState("Website widget");
  const [suggestions,setSuggestions]=useState<Partial<WidgetTheme>|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  const dirty=JSON.stringify(theme)!==JSON.stringify(savedTheme);
  const footer=theme.matchChatBackground?theme.chatBackground:theme.footerBackground;
  useEffect(()=>{
    let active=true;
    const token=sessionStorage.getItem("misma_id_token");
    if(!token){window.location.replace("/login?redirect="+encodeURIComponent(window.location.pathname));return;}
    getWebsiteWidgetTheme({data:{token,websiteId:siteId}}).then(({website}:any)=>{
      if(!active)return;
      setSiteName(website.name||website.domain||"Website widget");
      const loaded=website.theme&&typeof website.theme==="object"?{...DEFAULT_THEME,...website.theme}:DEFAULT_THEME;
      setTheme(loaded);setSavedTheme(loaded);
      setSuggestions(website.theme_suggestions&&typeof website.theme_suggestions==="object"?website.theme_suggestions:null);
    }).catch((e:any)=>{if(active)setError(e?.message||"Could not load this website's theme.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[siteId]);
  useEffect(()=>{
    const before=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);
  },[dirty]);
  const setColor=(key:keyof WidgetTheme,value:string)=>setTheme(current=>({...current,[key]:value}));
  const save=async()=>{
    const token=sessionStorage.getItem("misma_id_token");if(!token)return;
    setSaving(true);setError("");setSuccess("");
    try{const {website}:any=await saveWebsiteWidgetTheme({data:{token,websiteId:siteId,theme}});
      const saved={...DEFAULT_THEME,...website.theme};setTheme(saved);setSavedTheme(saved);setSuccess("Saved. This website widget will use the new theme without reinstalling its script.");
    }catch(e:any){setError(e?.message||"Could not save widget customization.");}finally{setSaving(false);}
  };
  const suggest=()=>{
    if(!suggestions){setError("No brand colors are available yet. Scan this website first, then try again.");return;}
    setTheme(current=>({...current,...Object.fromEntries(Object.entries(suggestions).filter(([key,value])=>key in DEFAULT_THEME && typeof value==="string" && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value))) }));
    setError("");setSuccess("Website brand colors applied. Review the contrast warnings before saving.");
  };
  const reset=()=>{if(!window.confirm("Reset this widget to Misma's default appearance?"))return;setTheme(DEFAULT_THEME);setError("");setSuccess("");};
  const change=(key:keyof WidgetTheme)=>(value:string)=>setColor(key,value);
  const contrastWarnings=useMemo(()=>[
    ["Header text",theme.headerText,theme.headerBackground],["Body text",theme.textColor,theme.chatBackground],
    ["Assistant message",theme.botBubbleText,theme.botBubbleBackground],["Visitor message",theme.userBubbleText,theme.userBubbleBackground],
  ].filter(([,fg,bg])=>contrast(String(fg),String(bg))<4.5),[theme]);
  if(loading)return <main className="mw-custom-page"><p>Loading widget customization…</p></main>;
  return <main className="mw-custom-page">
    <header className="mw-custom-heading"><button type="button" onClick={()=>{if(dirty&&!confirm("Discard your unsaved changes?"))return;navigate({to:"/dashboard"});}}>← Back</button><div><h1>Customize widget</h1><p>{siteName} · Live preview</p></div><button className="mw-save" type="button" disabled={!dirty||saving} onClick={()=>void save()}>{saving?"Saving…":"Save changes"}</button></header>
    <section className="mw-preview-sticky">
      <div className="mw-preview-label"><span>LIVE PREVIEW</span><small>Changes appear instantly</small></div>
      <div className="mw-preview-shell" style={{fontFamily:FONT_STACK[theme.fontFamily],background:theme.chatBackground,color:theme.textColor}}>
        <div className="mw-preview-header" style={{background:theme.headerBackground,color:theme.headerText}}>
          <div className="mw-preview-brand"><b>Misma Assistant</b><small style={{color:theme.headerText,opacity:.72}}>Here to help you</small></div>
          <button style={{background:theme.headerButtonBackground,color:theme.headerText}}>◉</button><button style={{background:theme.headerButtonBackground,color:theme.headerText}}>◎</button><button style={{background:theme.headerButtonBackground,color:theme.headerText}}>×</button>
        </div>
        <div className="mw-preview-messages" style={{background:theme.chatBackground}}>
          <div className="mw-preview-bubble bot" style={{background:theme.botBubbleBackground,color:theme.botBubbleText}}>Hello! Welcome. How can I help you today?</div>
          <div className="mw-preview-bubble user" style={{background:theme.userBubbleBackground,color:theme.userBubbleText}}>I would like to know more about your services.</div>
          <div className="mw-preview-bubble bot" style={{background:theme.botBubbleBackground,color:theme.botBubbleText}}>Of course! Tell me what you are looking for and I will guide you.</div>
        </div>
        <div className="mw-preview-footer" style={{background:footer}}>
          <div className="mw-preview-composer" style={{background:"color-mix(in srgb, "+footer+" 90%, #64748b 10%)",borderColor:"color-mix(in srgb, "+footer+" 78%, #64748b 22%)"}}>
            <span style={{color:theme.textColor,opacity:.65}}>Message Misma…</span><span>♩</span><button style={{background:theme.sendButtonBackground}}>➤</button>
          </div>
        </div>
      </div>
    </section>
    <div className="mw-custom-controls">
      <section className="mw-section"><h2>Header</h2><ColorControl label="Header background" value={theme.headerBackground} onChange={change("headerBackground")}/><ColorControl label="Title and subtitle text" value={theme.headerText} pair={theme.headerBackground} onChange={change("headerText")}/></section>
      <section className="mw-section"><h2>Chat background</h2><ColorControl label="Chat background" value={theme.chatBackground} onChange={change("chatBackground")}/></section>
      <section className="mw-section"><h2>Text</h2><label className="mw-field-label">Font family<select value={theme.fontFamily} onChange={e=>setTheme(t=>({...t,fontFamily:e.target.value as WidgetTheme["fontFamily"]}))}>{FONT_OPTIONS.map(font=><option key={font} value={font} style={{fontFamily:FONT_STACK[font]}}>{font}</option>)}</select></label><p className="mw-font-preview" style={{fontFamily:FONT_STACK[theme.fontFamily]}}>The quick brown fox jumps over the lazy dog.</p><ColorControl label="Widget text" value={theme.textColor} pair={theme.chatBackground} onChange={change("textColor")}/></section>
      <section className="mw-section"><h2>Message bubbles</h2><ColorControl label="Assistant bubble background" value={theme.botBubbleBackground} onChange={change("botBubbleBackground")}/><ColorControl label="Assistant bubble text" value={theme.botBubbleText} pair={theme.botBubbleBackground} onChange={change("botBubbleText")}/><ColorControl label="Visitor bubble background" value={theme.userBubbleBackground} onChange={change("userBubbleBackground")}/><ColorControl label="Visitor bubble text" value={theme.userBubbleText} pair={theme.userBubbleBackground} onChange={change("userBubbleText")}/></section>
      <section className="mw-section"><h2>Buttons</h2><ColorControl label="Send and voice button" value={theme.sendButtonBackground} onChange={change("sendButtonBackground")}/><ColorControl label="Header buttons" value={theme.headerButtonBackground} onChange={change("headerButtonBackground")}/></section>
      <section className="mw-section"><h2>Footer</h2><label className="mw-match-toggle"><input type="checkbox" checked={theme.matchChatBackground} onChange={e=>setTheme(t=>({...t,matchChatBackground:e.target.checked}))}/> Match chat background</label><ColorControl label="Text-bar container background" value={theme.matchChatBackground?theme.chatBackground:theme.footerBackground} onChange={change("footerBackground")}/><small>The text-bar pill uses a subtle surface and border derived from this color.</small></section>
      <section className="mw-section mw-actions"><button type="button" onClick={reset}>Reset to default</button><button type="button" onClick={suggest}>Suggest colors from my website</button></section>
      {contrastWarnings.length>0&&<p className="mw-warning" role="status">Some text/background combinations are below WCAG AA 4.5:1: {contrastWarnings.map(x=>x[0]).join(", ")}. Adjust these before publishing.</p>}
      {error&&<p className="mw-error" role="alert">{error}</p>}{success&&<p className="mw-success" role="status">{success}</p>}
      <button className="mw-save mw-save-bottom" type="button" disabled={!dirty||saving} onClick={()=>void save()}>{saving?"Saving…":"Save changes"}</button>
    </div>
  </main>;
}
