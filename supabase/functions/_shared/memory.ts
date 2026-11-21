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
