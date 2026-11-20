type AnyRecord = Record<string, any>;
type KnowledgeMode = "owner" | "customer";

const CUSTOMER_SHARED_ROOM_KEYS = new Set([
  "business_profile",
  "products",
  "prices",
  "policies",
  "faq",
  "general",
]);

function requireQuery(result: AnyRecord, label: string) {
  if (result?.error) throw new Error("Misma could not load " + label + ".");
  return result?.data ?? [];
}

function labelKnowledgeRow(row: AnyRecord, roomById: Map<number, AnyRecord>, websiteById: Map<string, AnyRecord>) {
  const room = row.room_id ? roomById.get(Number(row.room_id)) : null;
  const website = row.website_connection_id ? websiteById.get(String(row.website_connection_id)) : null;
  return {
    id: Number(row.id),
    question: String(row.question || ""),
    answer: String(row.answer || ""),
    sourceType: String(row.source_type || "unknown"),
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    websiteConnectionId: row.website_connection_id ? String(row.website_connection_id) : null,
    websiteName: website ? String(website.name || website.domain || "Connected website") : null,
    websiteDomain: website ? String(website.domain || "") : null,
    roomId: row.room_id == null ? null : Number(row.room_id),
    roomName: room ? String(room.display_name || room.room_key) : "Workspace-wide",
    approved: row.approved === true,
  };
}

/**
 * Shared business knowledge boundary for both Misma operating surfaces.
 *
 * Owner mode can inspect every website room and pending import so the owner
 * can manage the whole business. Customer mode requires an exact, previously
 * validated website connection and receives only approved global knowledge,
 * approved knowledge for that website, public-safe shared Core.01 rooms, the
 * selected website's own room, active workspace products and that website's
 * own scanned pages. It never loads orders, contacts or other customer data.
 */
export async function loadSharedBusinessKnowledge(
  db: any,
  input: {
    workspaceId: string;
    mode: KnowledgeMode;
    websiteConnectionId?: string;
    voice?: boolean;
    websiteInfo?: AnyRecord;
    fallbackRoomId?: number;
  },
) {
  const workspaceId = String(input.workspaceId || "");
  if (!workspaceId) throw new Error("A Misma workspace is required.");
  const isCustomer = input.mode === "customer";
  const websiteConnectionId = String(input.websiteConnectionId || "");
  if (isCustomer && !websiteConnectionId) {
    throw new Error("A validated website connection is required for customer knowledge.");
  }
  const voice = input.voice === true;
  const [workspaceResult, roomsResult, websitesResult] = await Promise.all([
    db.from("workspaces")
      .select("name,location,description,opening_hours,primary_language")
      .eq("id", workspaceId)
      .single(),
    db.from("core_01_rooms")
      .select("id,room_key,display_name,room_type,website_connection_id")
      .eq("workspace_id", workspaceId),
    db.from("website_connections")
      .select("id,name,website_url,domain")
      .eq("workspace_id", workspaceId)
      .is("widget_deleted_at", null),
  ]);
  if (workspaceResult.error || !workspaceResult.data) throw new Error("Could not load the business profile.");
  const rooms = requireQuery(roomsResult, "Core.01 rooms");
  const websites = requireQuery(websitesResult, "connected websites");
  const roomById = new Map<number, AnyRecord>(rooms.map((room: AnyRecord) => [Number(room.id), room]));
  const websiteById = new Map<string, AnyRecord>(websites.map((site: AnyRecord) => [String(site.id), site]));

  if (!isCustomer) {
    const [knowledgeResult, lessonsResult, productsResult, pagesResult] = await Promise.all([
      db.from("knowledge_entries")
        .select("id,question,answer,approved,source_type,source_ref,website_connection_id,room_id")
        .eq("workspace_id", workspaceId)
        .order("id", { ascending: false })
        .limit(1000),
      db.from("core_01_lessons")
        .select("id,room_id,room_key,lesson,confidence,status,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "approved")
        .order("confidence", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(300),
      db.from("products_services")
        .select("id,item_type,name,description,price_text,active,created_from")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(300),
      db.from("website_scan_pages")
        .select("website_id,canonical_url,title,content_text,scanned_at")
        .eq("workspace_id", workspaceId)
        .order("scanned_at", { ascending: false })
        .limit(40),
    ]);
    const allKnowledge = requireQuery(knowledgeResult, "business knowledge");
    const lessons = requireQuery(lessonsResult, "approved Core.01 lessons");
    const products = requireQuery(productsResult, "products and services");
    const scannedPages = requireQuery(pagesResult, "scanned website content");
    const enrichLesson = (lesson: AnyRecord) => {
      const room = lesson.room_id ? roomById.get(Number(lesson.room_id)) : null;
      const site = room?.website_connection_id ? websiteById.get(String(room.website_connection_id)) : null;
      return {
        room: String(lesson.room_key || room?.room_key || "general"),
        roomName: String(room?.display_name || lesson.room_key || "General"),
        websiteName: site ? String(site.name || site.domain || "Connected website") : null,
        websiteDomain: site ? String(site.domain || "") : null,
        lesson: String(lesson.lesson || "").slice(0, 2000),
        confidence: Number(lesson.confidence) || 0,
      };
    };
    return {
      workspace: workspaceResult.data,
      websites,
      approvedKnowledge: allKnowledge.filter((row: AnyRecord) => row.approved === true)
        .map((row: AnyRecord) => labelKnowledgeRow(row, roomById, websiteById)),
      pendingKnowledge: allKnowledge.filter((row: AnyRecord) => row.approved !== true)
        .map((row: AnyRecord) => labelKnowledgeRow(row, roomById, websiteById)),
      core01: lessons.map(enrichLesson),
      products: products.map((row: AnyRecord) => ({
        id: Number(row.id),
        type: String(row.item_type || "product"),
        name: String(row.name || ""),
        description: String(row.description || ""),
        price: String(row.price_text || ""),
        active: row.active === true,
        createdFrom: String(row.created_from || "manual"),
      })),
      scannedWebsitePages: scannedPages.map((page: AnyRecord) => {
        const site = websiteById.get(String(page.website_id));
        return {
          websiteConnectionId: String(page.website_id || ""),
          websiteName: String(site?.name || site?.domain || "Connected website"),
          websiteDomain: String(site?.domain || ""),
          title: String(page.title || "").slice(0, 240),
          url: String(page.canonical_url || "").slice(0, 1200),
          content: String(page.content_text || "").slice(0, 2000),
          scannedAt: page.scanned_at || null,
        };
      }),
    };
  }

  const globalPublicRoomIds = rooms
    .filter((room: AnyRecord) => room.room_type !== "website" &&
      !room.website_connection_id && CUSTOMER_SHARED_ROOM_KEYS.has(String(room.room_key)))
    .map((room: AnyRecord) => Number(room.id));
  const selectedWebsiteRoom = rooms.find((room: AnyRecord) =>
    String(room.website_connection_id || "") === websiteConnectionId
  );
  const selectedWebsiteRoomId = Number(selectedWebsiteRoom?.id || input.fallbackRoomId || 0);
  const allowedRoomIds = [...new Set([
    ...globalPublicRoomIds,
    ...(selectedWebsiteRoomId > 0 ? [selectedWebsiteRoomId] : []),
  ])];

  let knowledgeQuery = db.from("knowledge_entries")
    .select("id,question,answer,approved,source_type,source_ref,website_connection_id,room_id")
    .eq("workspace_id", workspaceId)
    .eq("approved", true)
    .or("website_connection_id.is.null,website_connection_id.eq." + websiteConnectionId)
    .order("id", { ascending: false })
    .limit(500);
  const [knowledgeResult, productsResult, pagesResult] = await Promise.all([
    knowledgeQuery,
    db.from("products_services")
      .select("item_type,name,description,price_text")
      .eq("workspace_id", workspaceId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(voice ? 15 : 60),
    db.from("website_scan_pages")
      .select("canonical_url,title,content_text")
      .eq("workspace_id", workspaceId)
      .eq("website_id", websiteConnectionId)
      .order("scanned_at", { ascending: false })
      .limit(voice ? 3 : 12),
  ]);
  const allApprovedKnowledge = requireQuery(knowledgeResult, "approved customer knowledge");
  const allowedGlobalRoomIds = new Set(globalPublicRoomIds);
  const knowledge = allApprovedKnowledge.filter((row: AnyRecord) => {
    if (row.website_connection_id != null) {
      return String(row.website_connection_id) === websiteConnectionId;
    }
    return row.room_id == null || allowedGlobalRoomIds.has(Number(row.room_id));
  });
  const lessonsResult = allowedRoomIds.length
    ? await db.from("core_01_lessons")
      .select("room_key,lesson,confidence,room_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "approved")
      .in("room_id", allowedRoomIds)
      .order("confidence", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(voice ? 8 : 24)
    : { data: [], error: null };
  const products = requireQuery(productsResult, "active products and services");
  const pages = requireQuery(pagesResult, "the selected website's scanned pages");
  const lessons = requireQuery(lessonsResult, "the selected website's approved Core.01 lessons");
  const website = input.websiteInfo || websiteById.get(websiteConnectionId) || {};
  const pageContext = pages.map((page: AnyRecord) => ({
    title: String(page.title || "").slice(0, 240),
    url: String(page.canonical_url || "").slice(0, 1200),
    content: String(page.content_text || "").slice(0, voice ? 1200 : 2600),
  }));
  return {
    workspace: workspaceResult.data,
    website: {
      businessName: String(workspaceResult.data.name || website.name || "Business").slice(0, 120),
      websiteUrl: String(website.website_url || "").slice(0, 180),
      websiteDomain: String(website.domain || "").slice(0, 180),
    },
    scannedWebsitePages: pageContext,
    knowledge: knowledge.slice(0, voice ? 12 : 100).map((row: AnyRecord) => ({
      question: String(row.question || "").slice(0, 500),
      answer: String(row.answer || "").slice(0, 4000),
    })),
    products: products,
    core01: lessons.map((lesson: AnyRecord) => ({
      room_key: String(lesson.room_key || "website"),
      lesson: String(lesson.lesson || "").slice(0, 2000),
      confidence: Number(lesson.confidence) || 0,
    })),
  };
}
