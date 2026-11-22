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
