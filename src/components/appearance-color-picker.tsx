import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = { label: string; value: string; onChange: (value: string) => void };

const DEFAULT_SAVED = ["#ef4444", "#f97316", "#eab308", "#4ade80", "#2dd4bf", "#3b82f6", "#4f46e5", "#ec4899", "#f43f5e", "#d946ef", "#8b5cf6", "#0ea5e9", "#10b981", "#84cc16"];

function hexToHsv(hex: string) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max * 100 : 0, v: max * 100 };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v / 100 * s / 100;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v / 100 - c;
  const sector = Math.floor(h / 60) % 6;
  const values = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return "#" + values.map(n => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("");
}

export function AppearanceColorPicker({ label, value, onChange }: Props) {
  const initial = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : "#000000";
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(initial));
  const [hexDraft, setHexDraft] = useState(initial.toUpperCase());
  const [opacity, setOpacity] = useState(() => initial.length === 9 ? Math.round(parseInt(initial.slice(7, 9), 16) / 255 * 100) : 100);
  const [saved, setSaved] = useState<string[]>(DEFAULT_SAVED);
  const [format, setFormat] = useState("Hex");
  const rootRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const baseHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const current = opacity < 100 ? baseHex + Math.round(opacity / 100 * 255).toString(16).padStart(2, "0") : baseHex;
  const hueColor = `hsl(${hsv.h} 100% 50%)`;

  useEffect(() => {
    setHsv(hexToHsv(value));
    setHexDraft(value.slice(0, 7).toUpperCase());
    setOpacity(value.length === 9 ? Math.round(parseInt(value.slice(7, 9), 16) / 255 * 100) : 100);
  }, [value]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("misma-appearance-saved-colors");
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSaved(parsed.filter((x): x is string => typeof x === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(x)).slice(0, 28));
      }
    } catch { /* keep built-in swatches */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  const commit = (next: string) => {
    const normalized = next.toUpperCase();
    setHexDraft(normalized.slice(0, 7));
    const alpha = normalized.length === 9 ? Math.round(parseInt(normalized.slice(7, 9), 16) / 255 * 100) : 100;
    setOpacity(alpha);
    onChange(normalized);
    setHsv(hexToHsv(normalized));
  };

  const updateSquare = (clientX: number, clientY: number) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    const v = Math.max(0, Math.min(100, 100 - (clientY - rect.top) / rect.height * 100));
    const next = { ...hsv, s, v };
    setHsv(next);
    const color = hsvToHex(next.h, next.s, next.v);
    setHexDraft(color.toUpperCase());
    onChange(opacity < 100 ? color + Math.round(opacity / 100 * 255).toString(16).padStart(2, "0") : color);
  };

  const addSaved = () => {
    const next = [current.toUpperCase(), ...saved.filter(c => c.toLowerCase() !== current.toLowerCase())].slice(0, 28);
    setSaved(next);
    try { window.localStorage.setItem("misma-appearance-saved-colors", JSON.stringify(next)); } catch { /* optional persistence */ }
  };

  return (
    <div className="misma-color-picker" ref={rootRef}>
      <button type="button" className="misma-color-picker-trigger" aria-label={`Choose ${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="misma-color-picker-trigger-swatch" style={{ backgroundColor: value }} />
        <span className="misma-color-picker-trigger-hex">{value.toUpperCase()}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="misma-color-picker-popover" role="dialog" aria-label={`${label} color picker`}>
          <div
            ref={squareRef}
            className="misma-color-picker-spectrum"
            style={{ backgroundColor: hueColor, backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)" }}
            role="slider"
            aria-label="Color saturation and brightness"
            aria-valuetext={current}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); updateSquare(event.clientX, event.clientY); }}
            onPointerMove={event => { if (event.buttons === 1) updateSquare(event.clientX, event.clientY); }}
            onKeyDown={event => {
              const step = event.shiftKey ? 10 : 2;
              const next = { ...hsv, s: Math.max(0, Math.min(100, hsv.s + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))), v: Math.max(0, Math.min(100, hsv.v + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))) };
              if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); setHsv(next); commit(hsvToHex(next.h, next.s, next.v)); }
            }}
          >
            <span className="misma-color-picker-spectrum-pointer" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
          </div>
          <label className="misma-color-picker-range-row">
            <span className="sr-only">Hue</span>
            <input aria-label="Hue" type="range" min="0" max="360" value={hsv.h} onChange={event => { const next = { ...hsv, h: Number(event.target.value) }; setHsv(next); commit(opacity < 100 ? hsvToHex(next.h, next.s, next.v) + Math.round(opacity / 100 * 255).toString(16).padStart(2, "0") : hsvToHex(next.h, next.s, next.v)); }} className="misma-color-picker-hue" />
          </label>
          <label className="misma-color-picker-range-row">
            <span className="sr-only">Opacity</span>
            <input aria-label="Opacity" type="range" min="0" max="100" value={opacity} onChange={event => { const nextOpacity = Number(event.target.value); setOpacity(nextOpacity); const color = hsvToHex(hsv.h, hsv.s, hsv.v); onChange(nextOpacity < 100 ? color + Math.round(nextOpacity / 100 * 255).toString(16).padStart(2, "0") : color); }} className="misma-color-picker-opacity" style={{ "--picker-color": current } as CSSProperties} />
          </label>
          <div className="misma-color-picker-fields">
            <select aria-label="Color format" value={format} onChange={event => setFormat(event.target.value)}><option>Hex</option></select>
            <label className="misma-color-picker-hex-field"><span>#</span><input aria-label="Hex color value" value={hexDraft.replace(/^#/, "")} maxLength={6} spellCheck={false} onChange={event => { const draft = "#" + event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); setHexDraft(draft.toUpperCase()); if (/^#[0-9a-f]{6}$/i.test(draft)) { setHsv(hexToHsv(draft)); onChange(opacity < 100 ? draft + Math.round(opacity / 100 * 255).toString(16).padStart(2, "0") : draft); } }} onBlur={() => { if (!/^#[0-9a-f]{6}$/i.test(hexDraft)) setHexDraft(value.slice(0, 7).toUpperCase()); }} /></label>
            <label className="misma-color-picker-opacity-field"><input aria-label="Opacity percentage" type="number" min="0" max="100" value={opacity} onChange={event => { const nextOpacity = Math.max(0, Math.min(100, Number(event.target.value) || 0)); setOpacity(nextOpacity); onChange(nextOpacity < 100 ? baseHex + Math.round(nextOpacity / 100 * 255).toString(16).padStart(2, "0") : baseHex); }} /><span>%</span></label>
          </div>
          <div className="misma-color-picker-saved-heading"><strong>Saved colors:</strong><button type="button" onClick={addSaved}>+ Add</button></div>
          <div className="misma-color-picker-swatches" aria-label="Saved colors">
            {saved.map((color, index) => <button key={`${color}-${index}`} type="button" aria-label={`Use color ${color}`} aria-pressed={color.toLowerCase() === current.toLowerCase()} className={color.toLowerCase() === current.toLowerCase() ? "is-selected" : ""} style={{ backgroundColor: color }} onClick={() => commit(color)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
