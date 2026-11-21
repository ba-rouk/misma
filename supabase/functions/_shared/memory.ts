import { z } from "npm:zod@4";

const schema = z.object({
  summary: z.string().min(8).max(1400),
  topics: z.array(z.string()).max(10),
  entities: z.array(z.string()).max(16),
  importance: z.number().min(0).max(1),
  facts: z.array(z.object({
    action: z.enum(["add", "update", "delete"]),
    key: z.string().min(1).max(180),
    type: z.enum(["profile", "preference", "project", "decision", "infrastructure", "workflow", "general"]),
    content: z.string().max(1200),
    confidence: z.number().min(0).max(1),
  }).strict()).max(10),
}).strict();

export type MemorySource = {
  memoryType: "exchange" | "fact";
  exchangeId: string | null;
  factId: string | null;
  chatId: number | null;
  chatTitle: string;
  content: string;
  createdAt: string;
  websiteId: string | null;
};

type DbClient = any;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function isLuhnCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function containsSensitiveSecret(text: string): boolean {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
    /\b(?:sk-[A-Za-z0-9_-]{16,}|sk_live_[A-Za-z0-9]{12,}|rk_live_[A-Za-z0-9]{12,})\b/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    /\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|AIza[0-9A-Za-z_-]{30,})\b/,
    /\b(?:api[_ -]?key|password|passphrase|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|private[_ -]?key)\s*[:=]\s*\S{6,}/i,
    /\b(?:\d[ -]?){13,19}\b/,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (!matches) continue;
    if (pattern.source.includes("\\d")) {
      if (matches.some(isLuhnCardNumber)) return true;
    } else return true;
  }
  return false;
}

export function isTrivialExchange(userText: string, assistantText: string): boolean {
  const normalized = normalizeText(userText);
  if (!normalized || normalized.length < 3 || userText.length > 8000 || assistantText.length > 12000) return true;
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|thanks|thank you|thx|ok|okay|cool|nice|great|bye|goodbye)$/.test(normalized);
}

function providerConfig(): { kind: "openai" | "gemini"; key: string; model: string; url: string } | null {
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq) return { kind: "openai", key: groq, model: Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b", url: "https://api.groq.com/openai/v1/chat/completions" };
  const openrouter = Deno.env.get("OPENROUTER_API_KEY");
  if (openrouter) return { kind: "openai", key: openrouter, model: Deno.env.get("OPENROUTER_MODEL") || "openrouter/auto", url: "https://openrouter.ai/api/v1/chat/completions" };
  const gemini = Deno.env.get("GEMINI_API_KEY");
  if (gemini) return { kind: "gemini", key: gemini, model: Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash", url: "https://generativelanguage.googleapis.com/v1beta/models/" };
  return null;
}
