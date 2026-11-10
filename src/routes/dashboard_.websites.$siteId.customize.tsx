import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
const PRESETS = [
  "#ffffff", "#f8fafc", "#e2e8f0", "#94a3b8", "#64748b", "#334155", "#172033", "#090a0c",
  "#dc2626", "#ea580c", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#0d9488", "#06b6d4",
  "#2563eb", "#4f46e5", "#7c3aed", "#db2777", "#f472b6",
];
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
type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizePickerHex(input: string): string | null {
  let hex = input.trim().replace(/^#/, "");

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex.split("").map((character) => character + character).join("");
  }

  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return "#" + hex.toLowerCase();
}

function hexToHsv(input: string): HsvColor {
  const normalized = normalizePickerHex(input.slice(0, 7)) ?? "#000000";
  const hex = normalized.slice(1);

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;

  let rgb: [number, number, number];

  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return "#" + rgb
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("");
}

function preserveExistingAlpha(nextHex: string, current: string): string {
  return current.length === 9 ? nextHex + current.slice(7, 9) : nextHex;
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value.slice(1, 7).toUpperCase());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHsv(hexToHsv(value));
    setHexDraft(value.slice(1, 7).toUpperCase());
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function applyHex(input: string) {
    const normalized = normalizePickerHex(input);
    if (!normalized) return;

    setHsv(hexToHsv(normalized));
    setHexDraft(normalized.slice(1, 7).toUpperCase());
    onChange(preserveExistingAlpha(normalized, value));
  }

  function commitHsv(next: HsvColor) {
    const safe: HsvColor = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp01(next.s),
      v: clamp01(next.v),
    };
    const hex = hsvToHex(safe);

    setHsv(safe);
    setHexDraft(hex.slice(1).toUpperCase());
    onChange(preserveExistingAlpha(hex, value));
  }

  function updatePlane(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    commitHsv({
      ...hsv,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: 1 - clamp01((event.clientY - rect.top) / rect.height),
    });
  }

  function handlePlaneKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const next = { ...hsv };

    switch (event.key) {
      case "ArrowLeft":
        next.s -= step;
        break;
      case "ArrowRight":
        next.s += step;
        break;
      case "ArrowUp":
        next.v += step;
        break;
      case "ArrowDown":
        next.v -= step;
        break;
      default:
        return;
    }

    event.preventDefault();
    commitHsv(next);
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  const handleHexInput = (input: string) => {
    const next = input.replace(/^#/, "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
    setHexDraft(next);
    if (next.length === 6) applyHex(next);
  };

  const restoreHexDraft = () => {
    if (!normalizePickerHex(hexDraft)) {
      setHexDraft(value.slice(1, 7).toUpperCase());
    }
  };

  return (
    <div className="misma-theme-color-control" ref={rootRef}>
      <label className="misma-theme-color-label">{label}</label>

      <div className="misma-theme-color-row">
        <button
          type="button"
          className="misma-theme-color-preview"
          style={{ backgroundColor: value }}
          aria-label={"Choose " + label + " color"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
        <input
          type="text"
          className="misma-theme-color-code"
          aria-label={label + " Hex color"}
          value={hexDraft}
          maxLength={6}
          spellCheck={false}
          onChange={(event) => handleHexInput(event.target.value)}
          onBlur={restoreHexDraft}
        />
      </div>

      {open && (
        <div className="misma-theme-color-popover" role="dialog" aria-label={label + " color picker"}>
          <div className="misma-theme-popover-heading">
            <strong>Color</strong>
            <button type="button" aria-label="Close color picker" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div
            className="misma-theme-saturation-plane"
            style={{ "--misma-picker-hue": hueColor } as CSSProperties}
            role="group"
            aria-label="Color saturation and brightness"
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePlane(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) updatePlane(event);
            }}
            onKeyDown={handlePlaneKeyDown}
          >
            <span
              className="misma-theme-saturation-indicator"
              style={{
                left: (hsv.s * 100) + "%",
                top: ((1 - hsv.v) * 100) + "%",
              }}
            />
          </div>

          <div className="misma-theme-hue-control">
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={hsv.h}
              aria-label="Hue"
              onChange={(event) => commitHsv({ ...hsv, h: Number(event.target.value) })}
            />
          </div>

          <div className="misma-theme-picker-fields">
            <label>
              <span>Format</span>
              <select value="hex" aria-label="Color format" onChange={() => undefined}>
                <option value="hex">Hex</option>
              </select>
            </label>

            <label className="misma-theme-picker-hex-field">
              <span>Hex</span>
              <input
                type="text"
                value={hexDraft}
                maxLength={6}
                spellCheck={false}
                aria-label="Hex color value"
                aria-invalid={hexDraft.length !== 6}
                onChange={(event) => handleHexInput(event.target.value)}
                onBlur={restoreHexDraft}
              />
            </label>
          </div>

          <div className="misma-theme-document-palette">
            <span>Document colors</span>
            <div className="misma-theme-palette-grid">
              {PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={"Select " + color}
                  className={value.slice(0, 7).toLowerCase() === color ? "is-selected" : ""}
                  style={{ backgroundColor: color }}
                  onClick={() => applyHex(color)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeAccordionSection({
  id,
  title,
  copy,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  copy: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = "misma-theme-panel-" + id;

  return (
    <section className={"misma-theme-section " + (expanded ? "is-expanded" : "is-collapsed")}>
      <header className="misma-theme-section-heading">
        <button
          type="button"
          className="misma-theme-section-trigger"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={(expanded ? "Collapse " : "Expand ") + title + " settings"}
          onClick={onToggle}
        >
          <span className="misma-theme-section-number">{id}</span>
          <span className="misma-theme-section-copy">
            <span className="misma-theme-section-title" role="heading" aria-level={2}>{title}</span>
            <span className="misma-theme-section-description">{copy}</span>
          </span>
          <svg
            className={"misma-theme-accordion-icon" + (expanded ? " is-open" : "")}
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path
              d="m9 18 6-6-6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div
        id={panelId}
        className={"misma-theme-section-panel" + (expanded ? " is-expanded" : "")}
        role="region"
        aria-label={title + " settings"}
        aria-hidden={!expanded}
      >
        <div className="misma-theme-section-panel-inner" inert={!expanded ? true : undefined}>
          {children}
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute("/dashboard/websites/$siteId/customize")({component:WebsiteWidgetCustomizer});

function WebsiteWidgetCustomizer() {
  const {siteId}=Route.useParams(); const navigate=useNavigate();
  const [token,setToken]=useState(""); const [websiteName,setWebsiteName]=useState("Connected website"); const [domain,setDomain]=useState("");
  const [theme,setTheme]=useState<WidgetTheme>(DEFAULT_THEME); const [savedTheme,setSavedTheme]=useState<WidgetTheme>(DEFAULT_THEME);
  const [themeSuggestions,setThemeSuggestions]=useState<Record<string,unknown>>({});
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<{kind:"success"|"error"|"info";text:string}|null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("01");
  const toggleSection = (id: string) => {
    setExpandedSection((current) => current === id ? null : id);
  };
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
  if(loading)return <main className="misma-theme-page" aria-busy="true">
    <div className="misma-theme-skeleton" role="status" aria-label="Loading widget settings">
      <header className="misma-theme-skeleton-toolbar">
        <span className="misma-theme-skeleton-back" />
        <span className="misma-theme-skeleton-title" />
      </header>
      <section className="misma-theme-skeleton-preview">
        <div className="misma-theme-skeleton-heading"><i /><i /></div>
        <div className="misma-theme-skeleton-widget">
          <div className="misma-theme-skeleton-widget-header"><i /><span /><b /><b /><b /></div>
          <div className="misma-theme-skeleton-chat">
            <i className="is-left" /><i className="is-right" /><i className="is-left is-wide" />
          </div>
          <div className="misma-theme-skeleton-footer"><i /><b /><b /></div>
        </div>
      </section>
      <div className="misma-theme-skeleton-sections">
        {Array.from({length:7},(_,index)=><section className="misma-theme-skeleton-card" key={index}>
          <div className="misma-theme-skeleton-card-heading"><i /><span /><b /></div>
          <div className="misma-theme-skeleton-fields"><i /><i /></div>
        </section>)}
      </div>
    </div>
  </main>;
  if(message?.kind==="error"&&!token)return <main className="misma-theme-page"><div className="misma-theme-error">{message.text}<button onClick={()=>void navigate({to:"/dashboard"})}>Back to websites</button></div></main>;

  return <main className="misma-theme-page">
    <header className="misma-theme-toolbar">
      <button type="button" className="misma-theme-back" onClick={back}>← <span>Websites</span></button>
      <div className="misma-theme-title"><h1>Customize widget</h1><p>{websiteName}{domain?" · "+domain:""}</p></div>
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
      <ThemeAccordionSection
        id="01"
        title="Header"
        copy="Control the widget title, subtitle and header surface."
        expanded={expandedSection === "01"}
        onToggle={() => toggleSection("01")}
      >
        <div className="misma-theme-controls">
          {COLOR_FIELDS.filter((field) => field.group === "Header").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="02"
        title="Chat background"
        copy="Set the canvas behind the conversation."
        expanded={expandedSection === "02"}
        onToggle={() => toggleSection("02")}
      >
        <div className="misma-theme-controls">
          {COLOR_FIELDS.filter((field) => field.group === "Chat").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="03"
        title="Message bubbles"
        copy="Set separate surfaces and text colours for Misma and visitors."
        expanded={expandedSection === "03"}
        onToggle={() => toggleSection("03")}
      >
        <div className="misma-theme-controls">
          {COLOR_FIELDS.filter((field) => field.group === "Bubbles").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="04"
        title="Buttons"
        copy="Set the send / voice action and header icon surfaces."
        expanded={expandedSection === "04"}
        onToggle={() => toggleSection("04")}
      >
        <div className="misma-theme-controls">
          {COLOR_FIELDS.filter((field) => field.group === "Buttons").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="05"
        title="Typography"
        copy="Choose a safe font family and general text colour."
        expanded={expandedSection === "05"}
        onToggle={() => toggleSection("05")}
      >
        <label className="misma-theme-font-field">
          <span>Font family</span>
          <select
            value={theme.fontFamily}
            onChange={(event) => setTheme((current) => ({ ...current, fontFamily: event.target.value as FontName }))}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: FONT_STACKS[font] }}>{font}</option>
            ))}
          </select>
          <small style={{ fontFamily: FONT_STACKS[theme.fontFamily] }}>
            The quick brown fox jumps over the lazy dog.
          </small>
        </label>
        <div className="misma-theme-controls">
          {COLOR_FIELDS.filter((field) => field.group === "Text").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="06"
        title="Footer"
        copy="Style the text bar separately or link it to the chat canvas."
        expanded={expandedSection === "06"}
        onToggle={() => toggleSection("06")}
      >
        <label className="misma-theme-match-toggle">
          <input
            type="checkbox"
            checked={theme.matchChatBackground}
            onChange={(event) => setTheme((current) => ({ ...current, matchChatBackground: event.target.checked }))}
          />
          <span>
            <strong>Match chat background</strong>
            <small>Use the chat background as the footer surface.</small>
          </span>
        </label>
        <div className={theme.matchChatBackground ? "misma-theme-controls is-disabled" : "misma-theme-controls"}>
          {COLOR_FIELDS.filter((field) => field.group === "Footer").map((field) => (
            <ColorControl key={field.key} label={field.label} value={theme[field.key]} onChange={(value) => setColor(field.key, value)} />
          ))}
        </div>
        {theme.matchChatBackground && (
          <small className="misma-theme-hint">The text-bar container is using {theme.chatBackground}.</small>
        )}
      </ThemeAccordionSection>

      <ThemeAccordionSection
        id="07"
        title="Accessibility and website colours"
        copy="Check WCAG AA contrast and reuse colours from the latest scan."
        expanded={expandedSection === "07"}
        onToggle={() => toggleSection("07")}
      >
        {failures.length ? (
          <div className="misma-theme-contrast-warning" role="status">
            <strong>Contrast needs attention</strong>
            <span>
              {failures.map((item) => item.label + ": " + item.ratio.toFixed(2) + ":1").join(" · ")}.
              {" "}WCAG AA normally requires 4.5:1 for regular text.
            </span>
          </div>
        ) : (
          <div className="misma-theme-contrast-ok">
            Text contrast checks meet the 4.5:1 WCAG AA target for the sampled pairs.
          </div>
        )}
        <button type="button" className="misma-theme-secondary" onClick={suggest}>
          ✦ Suggest colours from my website
        </button>
        <p className="misma-theme-hint">
          Suggestions use colours recorded by the latest rendered-page scan, including theme-colour metadata, CSS declarations and inline / SVG brand colours.
        </p>
      </ThemeAccordionSection>

      <div className="misma-theme-bottom-actions">
        <button type="button" className="misma-theme-reset" onClick={reset}>Reset to default</button>
        <button type="button" className="misma-theme-save" onClick={() => void save()} disabled={!dirty || saving || !token}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      {dirty && <p className="misma-theme-unsaved" role="status">You have unsaved changes.</p>}
    </div>
  </main>;
}
