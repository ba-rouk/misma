import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";

type Hsv = { h: number; s: number; v: number };
type Rgb = { r: number; g: number; b: number; a: number };
type ColorFormat = "hex" | "rgb" | "hsl";

const SAVED_COLORS_KEY = "misma_saved_appearance_colors";
const DEFAULT_SAVED_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#4ade80", "#2dd4bf", "#3b82f6", "#4f46e5",
  "#ec4899", "#f43f5e", "#d946ef", "#8b5cf6", "#06b6d4", "#10b981", "#84cc16",
];

function parseHex(value: string): Rgb | null {
  const clean = value.trim().replace(/^#/, "");
  if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1,
  };
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

function hsvToRgb({ h, s, v }: Hsv): Omit<Rgb, "a"> {
  const saturation = s / 100;
  const value = v / 100;
  const chroma = value * saturation;
  const hue = ((h % 360) + 360) % 360;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let rgb: [number, number, number];
  if (segment < 1) rgb = [chroma, x, 0];
  else if (segment < 2) rgb = [x, chroma, 0];
  else if (segment < 3) rgb = [0, chroma, x];
  else if (segment < 4) rgb = [0, x, chroma];
  else if (segment < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const match = value - chroma;
  return {
    r: Math.round((rgb[0] + match) * 255),
    g: Math.round((rgb[1] + match) * 255),
    b: Math.round((rgb[2] + match) * 255),
  };
}

function toHex(rgb: Omit<Rgb, "a">, alpha: number): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  const hex = "#" + channel(rgb.r) + channel(rgb.g) + channel(rgb.b);
  const alphaByte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return alphaByte === 255 ? hex : hex + channel(alphaByte);
}

function parseDisplayValue(value: string, format: ColorFormat): Omit<Rgb, "a"> | null {
  if (format === "hex") {
    const parsed = parseHex(value);
    return parsed ? { r: parsed.r, g: parsed.g, b: parsed.b } : null;
  }
  const numbers = value.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!numbers || numbers.length < 3 || numbers.some((number) => !Number.isFinite(number))) return null;
  if (format === "rgb") {
    if (numbers.slice(0, 3).some((number) => number < 0 || number > 255)) return null;
    return { r: Math.round(numbers[0]), g: Math.round(numbers[1]), b: Math.round(numbers[2]) };
  }
  const [h, s, l] = numbers;
  if (s < 0 || s > 100 || l < 0 || l > 100) return null;
  const lightness = l / 100;
  const saturation = s / 100 * (1 - Math.abs(2 * lightness - 1));
  const valuePart = lightness + saturation * (lightness < .5 ? 1 : -1);
  return hsvToRgb({ h, s: valuePart === 0 ? 0 : ((valuePart - lightness) / valuePart) * 100, v: valuePart * 100 });
}

function formatDisplayValue(rgb: Omit<Rgb, "a">, format: ColorFormat): string {
  if (format === "hex") return toHex(rgb, 1).toUpperCase();
  if (format === "rgb") return [rgb.r, rgb.g, rgb.b].join(", ");
  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [Math.round(hue), Math.round(saturation * 100) + "%", Math.round(lightness * 100) + "%"].join(", ");
}

function colorToCss(value: string): string {
  const parsed = parseHex(value);
  return parsed ? `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})` : "#4f46e5";
}

function readSavedColors(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_COLORS_KEY);
    if (!raw) return DEFAULT_SAVED_COLORS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SAVED_COLORS;
    const colors = parsed.filter((value): value is string => typeof value === "string" && Boolean(parseHex(value)));
    return colors.length ? colors.slice(0, 28) : DEFAULT_SAVED_COLORS;
  } catch {
    return DEFAULT_SAVED_COLORS;
  }
}

function saveColors(colors: string[]) {
  try {
    window.localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(colors));
    window.dispatchEvent(new Event("misma-saved-colors-change"));
  } catch {
    // Color selection still works for this session when browser storage is unavailable.
  }
}

export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 16, left: 16 });
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(parseHex(value) || { r: 79, g: 70, b: 229, a: 1 }));
  const [opacity, setOpacity] = useState(() => (parseHex(value)?.a ?? 1) * 100);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [inputDraft, setInputDraft] = useState("");
  const [savedColors, setSavedColors] = useState<string[]>(DEFAULT_SAVED_COLORS);

  const rgb = hsvToRgb(hsv);
  const selectedColor = toHex(rgb, opacity / 100);
  const displayValue = formatDisplayValue(rgb, format);

  useEffect(() => {
    const parsed = parseHex(value);
    if (!parsed) return;
    const nextHsv = rgbToHsv(parsed);
    setHsv(nextHsv);
    setOpacity(parsed.a * 100);
    setInputDraft(formatDisplayValue(parsed, format));
  }, [value, format]);

  useEffect(() => {
    setSavedColors(readSavedColors());
    const refresh = () => setSavedColors(readSavedColors());
    window.addEventListener("misma-saved-colors-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("misma-saved-colors-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-misma-color-picker]")) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  function updateColor(nextHsv: Hsv, nextOpacity = opacity) {
    setHsv(nextHsv);
    const next = toHex(hsvToRgb(nextHsv), nextOpacity / 100);
    setInputDraft(formatDisplayValue(hsvToRgb(nextHsv), format));
    onChange(next);
  }

  function updateSquareFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const brightness = Math.max(0, Math.min(100, 100 - ((event.clientY - rect.top) / rect.height) * 100));
    updateColor({ ...hsv, s: saturation, v: brightness });
  }

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pickerWidth = Math.min(380, window.innerWidth - 24);
    const pickerHeight = Math.min(640, window.innerHeight - 24);
    const left = window.innerWidth < 768
      ? Math.max(12, (window.innerWidth - pickerWidth) / 2)
      : Math.max(12, Math.min(window.innerWidth - pickerWidth - 12, rect.right - pickerWidth));
    let top = rect.bottom + 10;
    if (top + pickerHeight > window.innerHeight - 12) top = Math.max(12, rect.top - pickerHeight - 10);
    setPosition({ top, left });
    setOpen(true);
  }

  function changeOpacity(nextOpacity: number) {
    const safeOpacity = Math.max(0, Math.min(100, nextOpacity));
    setOpacity(safeOpacity);
    setInputDraft(formatDisplayValue(rgb, format));
    onChange(toHex(rgb, safeOpacity / 100));
  }

  function commitTextValue() {
    const parsed = parseDisplayValue(inputDraft, format);
    if (parsed) {
      const nextHsv = rgbToHsv({ ...parsed, a: opacity / 100 });
      updateColor(nextHsv);
    } else {
      setInputDraft(displayValue);
    }
  }

  function handleSquareKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2],
    };
    const change = steps[event.key];
    if (!change) return;
    event.preventDefault();
    updateColor({
      h: hsv.h,
      s: Math.max(0, Math.min(100, hsv.s + change[0])),
      v: Math.max(0, Math.min(100, hsv.v + change[1])),
    });
  }

  function addSavedColor() {
    const next = [selectedColor, ...savedColors.filter((color) => color.toLowerCase() !== selectedColor.toLowerCase())].slice(0, 28);
    setSavedColors(next);
    saveColors(next);
  }

  return (
    <div className="misma-color-picker-root" data-misma-color-picker>
      <button
        ref={triggerRef}
        type="button"
        className="misma-color-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => open ? setOpen(false) : openPicker()}
      >
        <span style={{ backgroundColor: colorToCss(value) }} />
      </button>

      {open && (
        <div
          className="misma-color-picker-popover"
          role="dialog"
          aria-label={label + " color picker"}
          style={{ top: position.top, left: position.left }}
          data-misma-color-picker
        >
          <div
            ref={squareRef}
            className="misma-color-picker-square"
            role="slider"
            tabIndex={0}
            aria-label="Color saturation and brightness"
            aria-valuetext={`Hue ${Math.round(hsv.h)}, saturation ${Math.round(hsv.s)} percent, brightness ${Math.round(hsv.v)} percent`}
            style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            onPointerDown={(event) => {
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSquareFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (draggingRef.current) updateSquareFromPointer(event);
            }}
            onPointerUp={() => { draggingRef.current = false; }}
            onPointerCancel={() => { draggingRef.current = false; }}
            onKeyDown={handleSquareKeyDown}
          >
            <span className="misma-color-picker-square-white" />
            <span className="misma-color-picker-square-black" />
            <span
              className="misma-color-picker-marker"
              style={{ left: hsv.s + "%", top: (100 - hsv.v) + "%" }}
            />
          </div>

          <label className="misma-color-picker-range-row">
            <span className="misma-color-picker-visually-hidden">Hue</span>
            <input
              className="misma-color-picker-hue"
              type="range"
              min="0"
              max="360"
              value={Math.round(hsv.h)}
              onChange={(event) => updateColor({ ...hsv, h: Number(event.target.value) })}
              aria-label="Hue"
            />
          </label>

          <label className="misma-color-picker-range-row">
            <span className="misma-color-picker-visually-hidden">Opacity</span>
            <input
              className="misma-color-picker-opacity"
              type="range"
              min="0"
              max="100"
              value={Math.round(opacity)}
              style={{ background: `linear-gradient(90deg, transparent, ${`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`}), conic-gradient(#ddd 25%, #fff 0 50%, #ddd 0 75%, #fff 0) 0 0 / 12px 12px` }}
              onChange={(event) => changeOpacity(Number(event.target.value))}
              aria-label="Opacity"
            />
          </label>

          <div className="misma-color-picker-values">
            <label className="misma-color-picker-format">
              <span className="misma-color-picker-visually-hidden">Color format</span>
              <select value={format} onChange={(event) => {
                const nextFormat = event.target.value as ColorFormat;
                setFormat(nextFormat);
                setInputDraft(formatDisplayValue(rgb, nextFormat));
              }}>
                <option value="hex">Hex</option>
                <option value="rgb">RGB</option>
                <option value="hsl">HSL</option>
              </select>
              <span aria-hidden="true">⌄</span>
            </label>
            <label className="misma-color-picker-text-value">
              <span className="misma-color-picker-visually-hidden">{format.toUpperCase()} color value</span>
              {format === "hex" && <span aria-hidden="true">#</span>}
              <input
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={inputDraft || displayValue}
                onChange={(event) => setInputDraft(event.target.value)}
                onBlur={commitTextValue}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTextValue(); } }}
                aria-label={format.toUpperCase() + " color value"}
              />
            </label>
            <label className="misma-color-picker-opacity-value">
              <span className="misma-color-picker-visually-hidden">Opacity percentage</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(opacity)}
                onChange={(event) => changeOpacity(Number(event.target.value))}
                aria-label="Opacity percentage"
              />
              <span aria-hidden="true">%</span>
            </label>
          </div>

          <div className="misma-color-picker-saved-heading">
            <strong>Saved colors</strong>
            <button type="button" onClick={addSavedColor}>+ Add</button>
          </div>
          <div className="misma-color-picker-swatches" aria-label="Saved colors">
            {savedColors.map((color) => (
              <button
                key={color}
                type="button"
                className={color.toLowerCase() === selectedColor.toLowerCase() ? "is-selected" : ""}
                style={{ backgroundColor: colorToCss(color) }}
                aria-label={"Select saved color " + color}
                aria-pressed={color.toLowerCase() === selectedColor.toLowerCase()}
                onClick={() => {
                  const parsed = parseHex(color);
                  if (!parsed) return;
                  const nextHsv = rgbToHsv(parsed);
                  setHsv(nextHsv);
                  setOpacity(parsed.a * 100);
                  setInputDraft(formatDisplayValue(parsed, format));
                  onChange(color);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
