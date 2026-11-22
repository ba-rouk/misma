type WebsiteContentIndexRow = Record<string, unknown>;

export function deduplicateWebsiteContentRows(rows: WebsiteContentIndexRow[]): WebsiteContentIndexRow[] {
  const unique = new Map<string, WebsiteContentIndexRow>();

  for (const row of rows) {
    const normalizedName = String(row.name ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const conflictKey = [
      String(row.website_id ?? ""),
      String(row.item_type ?? ""),
      normalizedName,
      String(row.source_page_url ?? ""),
    ].join("\u001f");
    const existing = unique.get(conflictKey);

    if (!existing) {
      unique.set(conflictKey, { ...row });
      continue;
    }

    // Product cards, JSON-LD, and gallery fallbacks can describe the same item.
    // Merge useful fields so one duplicate cannot erase a known price or description.
    for (const field of ["description", "image_url", "item_url", "price_text"] as const) {
      const currentValue = String(existing[field] ?? "").trim();
      const nextValue = String(row[field] ?? "").trim();
      if (!currentValue && nextValue) existing[field] = row[field];
    }
  }

  return Array.from(unique.values());
}


export function normalizeWebsiteRecommendationName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/&/g, " and ")
    .replace(/\\b(?:photo|image|picture|thumbnail|thumb)(?:\\s*#?\\d+)?$/i, "")
    .toLocaleLowerCase()
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

export function deduplicateWebsiteRecommendationRows<T extends WebsiteContentIndexRow>(rows: T[]): T[] {
  const unique = new Map<string, T>();

  for (const row of rows) {
    const type = String(row.item_type ?? "").trim().toLocaleLowerCase();
    const name = normalizeWebsiteRecommendationName(row.name);
    if (!type || !name) continue;

    const identity = type + "\\u001f" + name;
    const existing = unique.get(identity);
    if (!existing) {
      unique.set(identity, { ...row });
      continue;
    }

    // Query results arrive newest-first. Keep the newest populated price and
    // canonical detail link, filling only fields that are missing in that row.
    for (const field of ["description", "image_url", "item_url", "price_text"] as const) {
      const currentValue = String(existing[field] ?? "").trim();
      const nextValue = String(row[field] ?? "").trim();
      if (!currentValue && nextValue) existing[field] = row[field];
    }
    // Prefer a descriptive title over a generic alt-text fallback such as
    // "Vanilla cake photo" without creating another recommendation card.
    const currentName = String(existing.name ?? "").trim();
    const nextName = String(row.name ?? "").trim();
    if (/\\b(?:photo|image|picture|thumbnail|thumb)(?:\\s*#?\\d+)?$/i.test(currentName) &&
        !/\\b(?:photo|image|picture|thumbnail|thumb)(?:\\s*#?\\d+)?$/i.test(nextName)) {
      existing.name = row.name;
    }
  }

  return Array.from(unique.values());
}
