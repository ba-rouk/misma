import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

type ColorFormat = "hex" | "rgb" | "hsl";
type HsvColor = { hue: number; saturation: number; value: number; alpha: number };

const DEFAULT_SAVED_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#4ade80", "#2dd4bf", "#3b82f6", "#4f46e5",
  "#ec4899", "#f43f5e", "#d946ef", "#8b5cf6", "#0ea5e9", "#10b981", "#84cc16",
];
const SAVED_COLORS_KEY = "misma_appearance_saved_colors";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(input: string): string | null {
  let value = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) value = value.split("").map((part) => part + part).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return null;
  return "#" + value.toUpperCase();
}

function hexToHsv(input: string): HsvColor {
  const normalized = normalizeHex(input) || "#000000";
  const raw = normalized.slice(1);
  const red = parseInt(raw.slice(0, 2), 16) / 255;
  const green = parseInt(raw.slice(2, 4), 16) / 255;
  const blue = parseInt(raw.slice(4, 6), 16) / 255;
  const alpha = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max, alpha };
}

function hsvToHex(color: HsvColor): string {
  const hue = ((color.hue % 360) + 360) % 360;
  const chroma = color.value * color.saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = color.value - chroma;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, second, 0];
  else if (hue < 120) rgb = [second, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, second];
  else if (hue < 240) rgb = [0, second, chroma];
  else if (hue < 300) rgb = [second, 0, chroma];
  else rgb = [chroma, 0, second];
  const bytes = rgb.map((part) => Math.round((part + offset) * 255));
  const base = "#" + bytes.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase();
  const alpha = Math.round(clamp(color.alpha, 0, 1) * 255);
  return alpha >= 255 ? base : base + alpha.toString(16).padStart(2, "0").toUpperCase();
}

function hsvToRgb(color: HsvColor): [number, number, number] {
  const hex = hsvToHex({ ...color, alpha: 1 }).slice(1);
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function hsvToHsl(color: HsvColor): [number, number, number] {
  const lightness = color.value * (1 - color.saturation / 2);
  const saturation = lightness === 0 || lightness === 1
    ? 0
    : (color.value - lightness) / Math.min(lightness, 1 - lightness);
  return [Math.round(color.hue), Math.round(saturation * 100), Math.round(lightness * 100)];
}

function displayColor(color: HsvColor, format: ColorFormat) {
  const hex = hsvToHex(color);
  if (format === "hex") return hex;
  const rgb = hsvToRgb(color);
  if (format === "rgb") {
    return color.alpha < 0.999
      ? "rgba(" + rgb.join(", ") + ", " + Number(color.alpha.toFixed(2)) + ")"
      : "rgb(" + rgb.join(", ") + ")";
  }
  const hsl = hsvToHsl(color);
  return color.alpha < 0.999
    ? "hsla(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%, " + Number(color.alpha.toFixed(2)) + ")"
    : "hsl(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%)";
}

function parseDisplayColor(input: string, format: ColorFormat): string | null {
  if (format === "hex") return normalizeHex(input);
  if (format === "rgb") {
    const match = input.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
    if (!match) return null;
    const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (channels.some((channel) => channel > 255)) return null;
    const alpha = clamp(match[4] === undefined ? 1 : Number(match[4]), 0, 1);
    const hex = "#" + channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("");
    return normalizeHex(hex + (alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, "0") : ""));
  }
  const match = input.trim().match(/^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (!match) return null;
  const hue = ((Number(match[1]) % 360) + 360) % 360;
  const saturation = clamp(Number(match[2]) / 100, 0, 1);
  const lightness = clamp(Number(match[3]) / 100, 0, 1);
  const value = lightness + saturation * Math.min(lightness, 1 - lightness);
  const hsvSaturation = value === 0 ? 0 : 2 * (1 - lightness / value);
  const alpha = clamp(match[4] === undefined ? 1 : Number(match[4]), 0, 1);
  return hsvToHex({ hue, saturation: hsvSaturation, value, alpha });
}

function loadSavedColors(): string[] {
  if (typeof window === "undefined") return DEFAULT_SAVED_COLORS;
  try {
    const raw = window.localStorage.getItem(SAVED_COLORS_KEY);
    if (!raw) return DEFAULT_SAVED_COLORS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SAVED_COLORS;
    const colors = parsed.map((item) => typeof item === "string" ? normalizeHex(item) : null).filter((item): item is string => Boolean(item));
    return colors.length ? colors.slice(0, 21) : DEFAULT_SAVED_COLORS;
  } catch {
    return DEFAULT_SAVED_COLORS;
  }
}

export function MismaColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const [colorText, setColorText] = useState(() => displayColor(hexToHsv(value), "hex"));
  const [savedColors, setSavedColors] = useState<string[]>(loadSavedColors);
  const [position, setPosition] = useState({ left: 16, top: 90 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const draggingSpectrumRef = useRef(false);

  useEffect(() => {
    const next = hexToHsv(value);
    setHsv(next);
    setColorText(displayColor(next, format));
  }, [value]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(savedColors.slice(0, 21)));
    } catch {
      // Saving swatches is optional; the color selection itself remains available.
    }
  }, [savedColors]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const previewStyle = useMemo(() => ({ backgroundColor: value } satisfies CSSProperties), [value]);
  const hueColor = "hsl(" + hsv.hue + ", 100%, 50%)";

  function applyColor(next: HsvColor) {
    const safe = {
      hue: clamp(next.hue, 0, 360),
      saturation: clamp(next.saturation, 0, 1),
      value: clamp(next.value, 0, 1),
      alpha: clamp(next.alpha, 0, 1),
    };
    setHsv(safe);
    const hex = hsvToHex(safe);
    setColorText(displayColor(safe, format));
    onChange(hex);
  }

  function applyHex(hex: string) {
    const next = hexToHsv(hex);
    setHsv(next);
    setColorText(displayColor(next, format));
    onChange(normalizeHex(hex) || hex);
  }

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(440, window.innerWidth - 24);
      const estimatedHeight = 610;
      const left = clamp(rect.left, 12, Math.max(12, window.innerWidth - width - 12));
      const top = rect.bottom + 10 + estimatedHeight > window.innerHeight
        ? Math.max(12, rect.top - estimatedHeight - 10)
        : rect.bottom + 10;
      setPosition({ left, top });
    }
    setOpen(true);
  }

  function updateSpectrum(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    applyColor({
      ...hsv,
      saturation: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      value: 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1),
    });
  }

  function handleSpectrumPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    draggingSpectrumRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSpectrum(event);
  }

  function handleSpectrumPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (draggingSpectrumRef.current) updateSpectrum(event);
  }

  function handleSpectrumKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") applyColor({ ...hsv, saturation: hsv.saturation - step });
    if (event.key === "ArrowRight") applyColor({ ...hsv, saturation: hsv.saturation + step });
    if (event.key === "ArrowUp") applyColor({ ...hsv, value: hsv.value + step });
    if (event.key === "ArrowDown") applyColor({ ...hsv, value: hsv.value - step });
  }

  function changeText(input: string) {
    setColorText(input);
    const parsed = parseDisplayColor(input, format);
    if (parsed) applyHex(parsed);
  }

  function changeFormat(next: ColorFormat) {
    setFormat(next);
    setColorText(displayColor(hsv, next));
  }

  function saveCurrentColor() {
    const color = hsvToHex(hsv);
    setSavedColors((current) => [color, ...current.filter((item) => item.toUpperCase() !== color.toUpperCase())].slice(0, 21));
  }

  const dialog = open && typeof document !== "undefined" ? createPortal(
    <div className="misma-color-picker-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section
        className="misma-color-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label + " color picker"}
        style={{ left: position.left + "px", top: position.top + "px" }}
      >
        <div className="misma-color-picker-spectrum-wrap">
          <div
            className="misma-color-picker-spectrum"
            style={{ backgroundColor: hueColor }}
            role="slider"
            tabIndex={0}
            aria-label="Saturation and brightness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.value * 100)}
            aria-valuetext={"Saturation " + Math.round(hsv.saturation * 100) + " percent, brightness " + Math.round(hsv.value * 100) + " percent"}
            onPointerDown={handleSpectrumPointerDown}
            onPointerMove={handleSpectrumPointerMove}
            onPointerUp={() => { draggingSpectrumRef.current = false; }}
            onPointerCancel={() => { draggingSpectrumRef.current = false; }}
            onKeyDown={handleSpectrumKeyDown}
          >
            <span className="misma-color-picker-spectrum-thumb" style={{ left: hsv.saturation * 100 + "%", top: (1 - hsv.value) * 100 + "%" }} />
          </div>
        </div>

        <label className="misma-color-picker-slider-row">
          <span className="misma-color-picker-sr-only">Hue</span>
          <input
            className="misma-color-picker-hue"
            type="range"
            min="0"
            max="360"
            step="1"
            value={hsv.hue}
            onChange={(event) => applyColor({ ...hsv, hue: Number(event.target.value) })}
            aria-label="Hue"
          />
        </label>

        <label className="misma-color-picker-slider-row misma-color-picker-alpha-row">
          <span className="misma-color-picker-sr-only">Opacity</span>
          <span className="misma-color-picker-alpha-track" style={{ "--picker-alpha-color": hsvToHex({ ...hsv, alpha: 1 }).slice(0, 7) } as CSSProperties}>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(hsv.alpha * 100)}
              onChange={(event) => applyColor({ ...hsv, alpha: Number(event.target.value) / 100 })}
              aria-label="Opacity"
            />
          </span>
        </label>

        <div className="misma-color-picker-values">
          <label className="misma-color-picker-format">
            <span className="misma-color-picker-sr-only">Color format</span>
            <select value={format} onChange={(event) => changeFormat(event.target.value as ColorFormat)} aria-label="Color format">
              <option value="hex">Hex</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
            </select>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5-5 5 5M7 14l5 5 5-5" /></svg>
          </label>
          <label className="misma-color-picker-code">
            <span className="misma-color-picker-sr-only">{format.toUpperCase()} color value</span>
            <input
              type="text"
              value={colorText}
              onChange={(event) => changeText(event.target.value)}
              onBlur={() => {
                const parsed = parseDisplayColor(colorText, format);
                if (parsed) setColorText(displayColor(hexToHsv(parsed), format));
                else setColorText(displayColor(hsv, format));
              }}
              aria-label={format.toUpperCase() + " color value"}
              spellCheck={false}
              autoCapitalize="characters"
            />
          </label>
          <label className="misma-color-picker-opacity">
            <span className="misma-color-picker-sr-only">Opacity percentage</span>
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(hsv.alpha * 100)}
              onChange={(event) => applyColor({ ...hsv, alpha: clamp(Number(event.target.value || 0), 0, 100) / 100 })}
              aria-label="Opacity percentage"
            />
            <span>%</span>
          </label>
        </div>

        <div className="misma-color-picker-saved-heading">
          <strong>Saved colors:</strong>
          <button type="button" onClick={saveCurrentColor}><span aria-hidden="true">+</span> Add</button>
        </div>
        <div className="misma-color-picker-swatches" aria-label="Saved colors">
          {savedColors.map((color, index) => (
            <button
              key={color + "-" + index}
              type="button"
              className={"misma-color-picker-swatch" + (color.toUpperCase() === hsvToHex(hsv).toUpperCase() ? " is-selected" : "")}
              style={{ backgroundColor: color }}
              onClick={() => applyHex(color)}
              aria-label={"Select saved color " + color}
              aria-pressed={color.toUpperCase() === hsvToHex(hsv).toUpperCase()}
              title={color}
            />
          ))}
        </div>
        <button type="button" className="misma-color-picker-done" onClick={() => setOpen(false)}>Done</button>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="misma-color-picker-trigger"
        onClick={open ? () => setOpen(false) : openPicker}
        aria-label={"Choose " + label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={value}
      >
        <span className="misma-color-picker-trigger-swatch" style={previewStyle} />
        <span className="misma-color-picker-trigger-value">{value.toUpperCase()}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5-5 5 5M7 14l5 5 5-5" /></svg>
      </button>
      {dialog}
    </>
  );
}
