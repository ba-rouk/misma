import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import {
  getMismaData,
  getConversationMessages,
  createConversation,
  deleteConversation,
  setConversationGroup,
  addKnowledge,
  deleteKnowledge,
  updateOrderStatus,
  saveWorkspaceProfile,
} from "../lib/api/misma.functions";
import { getSupabaseClient, getSupabaseConfig } from "../lib/supabase";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type TabId = "workspace" | "images" | "library" | "build" | "connect" | "manage" | "recent" | "settings";

type MismaAiSettings = {
  assistantMode: "Sales & customer support" | "Customer support" | "Sales assistant";
  responseTone: "Professional and friendly" | "Warm and conversational" | "Formal";
  responseLength: "Concise" | "Balanced" | "Detailed";
  languageMode: "Match visitor language" | "Business primary language" | "English";
  autoReply: boolean;
  useBusinessKnowledge: boolean;
  avoidUnverifiedClaims: boolean;
  askClarifyingQuestions: boolean;
  qualifyLeads: boolean;
  captureOrders: boolean;
  respectBusinessHours: boolean;
  humanHandoff: boolean;
  welcomeGreeting: boolean;
  protectSensitiveData: boolean;
};

const DEFAULT_MISMA_AI_SETTINGS: MismaAiSettings = {
  assistantMode: "Sales & customer support",
  responseTone: "Professional and friendly",
  responseLength: "Balanced",
  languageMode: "Match visitor language",
  autoReply: true,
  useBusinessKnowledge: true,
  avoidUnverifiedClaims: true,
  askClarifyingQuestions: true,
  qualifyLeads: true,
  captureOrders: true,
  respectBusinessHours: true,
  humanHandoff: true,
  welcomeGreeting: true,
  protectSensitiveData: true,
};

function SettingsNavIcon({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "profile" ? <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>
        : kind === "general" ? <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="#151a22" /><circle cx="15" cy="17" r="2" fill="#151a22" /></>
        : kind === "accent" ? <><path d="m12 3 7 7-7 11-7-11 7-7Z" /><path d="M5 10h14" /></>
        : kind === "notifications" ? <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>
        : kind === "voice" ? <><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" /></>
        : kind === "privacy" ? <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>
        : kind === "history" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
        : kind === "about" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7h.01" /></>
        : <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>}
    </svg>
  );
}

function SettingsToggle({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="aichat-setting-row" onClick={onToggle}>
      <span className="aichat-setting-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className={`aichat-setting-switch${checked ? " is-on" : ""}`} aria-hidden="true"><span /></span>
    </button>
  );
}

type Message = {
  id: string;
  role: "customer" | "ai" | "human" | "system";
  text: string;
  created_at?: string;
  attachments?: MessageAttachment[];
  pendingMedia?: "image" | "video";
};

type MessageAttachment = {
  path?: string;
  name: string;
  mimeType?: string;
  size?: number;
  kind: string;
  url?: string;
  videoId?: string;
  model?: string;
};

function cleanRecentChatTitle(value: unknown): string {
  const cleaned = String(value ?? "")
    .replace(/^(?:(?:customer|visitor|user|human|contact|lead)\s*(?::|#|-)\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(?:customer|visitor|user|human|contact|lead)(?:\s*[:#-].*)?$/i.test(cleaned)) return "";
  if (/^(?:customer|visitor|user|human)[-_ ]+[0-9a-f-]{6,}$/i.test(cleaned)) return "";
  return cleaned.slice(0, 72);
}

function detectMediaIntent(prompt: string): "image" | "video" | null {
  const text = prompt.trim().toLowerCase().replace(/^(?:hey\s+)?misma[,!: ]+/, "").trim();
  if (!text) return null;
  const mediaTarget = /\b(video|clip|reel|animation|image|picture|photo|illustration|artwork|graphic|logo|poster|banner|thumbnail)\b/.test(text);
  if (!mediaTarget) return null;
  const directCreation =
    /^(?:please\s+)?(?:generate|create|make|draw|render|produce|design|animate)\b/.test(text) ||
    /^(?:can|could|would|will)\s+you(?:\s+please)?\s+(?:generate|create|make|draw|render|produce|design|animate)\b/.test(text) ||
    /^(?:i want|i need|i would like|i'd like)\s+(?:you\s+to\s+|to\s+)?(?:please\s+)?(?:generate|create|make|draw|render|produce|design|animate)\b/.test(text) ||
    /^(?:i want|i need|i'd like|make me|create me|generate me|draw me|design me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|graphic|logo|poster|banner|thumbnail|video|clip|reel|animation)\b/.test(text) ||
    /\b(?:turn|convert)\b.{0,45}\b(into|to)\b/.test(text);
  const informationRequest =
    /^(?:how|what|why|where|when|who|which|is|are|am|do|does|did|should|explain|describe)\b/.test(text) ||
    /^(?:can|could|would|will)\s+you\s+(?:explain|tell me|describe|help me understand|show me how|teach me)\b/.test(text) ||
    /\b(?:i want to know|i am wondering|im wondering|help me understand|tell me about|show me how|describe how|what is the best way to)\b/.test(text) ||
    (/\?\s*$/.test(text) && !directCreation);
  if (informationRequest && !directCreation) return null;
  if (!directCreation) return null;
  if (/\b(video|clip|reel|animation)\b/.test(text)) return "video";
  return "image";
}
type ActionIconName =
  | "copy"
  | "share"
  | "edit"
  | "download"
  | "crop"
  | "thumbs-up"
  | "thumbs-down"
  | "volume"
  | "volume-off"
  | "refresh";

function ActionIcon({ name }: { name: ActionIconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  return (
    <svg {...common}>
      {name === "copy" && (
        <>
          <rect x="8" y="8" width="13" height="13" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </>
      )}
      {name === "share" && (
        <>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2" />
        </>
      )}
      {name === "edit" && (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </>
      )}
      {name === "download" && <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>}
      {name === "crop" && <><path d="M7 3v14a2 2 0 0 0 2 2h12" /><path d="M3 7h14a2 2 0 0 1 2 2v12" /></>}
      {name === "thumbs-up" && (
        <path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm0 0 5-8c2 0 3 1 3 3l-1 5h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7" />
      )}
      {name === "thumbs-down" && (
        <path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Zm0 0 5 8c2 0 3-1 3-3l-1-5h5a2 2 0 0 0 2-2l-2-7a2 2 0 0 0-2-2H7" />
      )}
      {name === "volume" && (
        <>
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
      {name === "volume-off" && (
        <>
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="m16 9 5 6m0-6-5 6" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" />
        </>
      )}
    </svg>
  );
}

async function compressImageForUpload(file: File): Promise<File> {
  const supportedOriginal = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!file.type.startsWith("image/")) return file;
  if (supportedOriginal && file.size <= 4 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not compress the image.")), "image/jpeg", 0.82);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

async function extractVideoKeyframes(file: File): Promise<File[]> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Could not read the video ${file.name}.`));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("This video does not have readable duration metadata.");
    }
    const duration = video.duration;
    // Five evenly spaced samples improve safety coverage across the generated clip.
    const fractions = duration > 2
      ? [0.1, 0.3, 0.5, 0.7, 0.9]
      : [0.2, 0.5, 0.8];
    const frames: File[] = [];
    for (let index = 0; index < fractions.length; index++) {
      const target = Math.min(Math.max(0.05, duration * fractions[index]), Math.max(0.05, duration - 0.05));
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("Could not sample a frame from the uploaded video.")); };
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = target;
      });
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare a video preview.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not extract a video preview.")), "image/jpeg", 0.78);
      });
      frames.push(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-frame-${index + 1}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }));
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function MessageAttachmentViews({
  attachments,
  onDownload,
  onCrop,
  onShare,
  onCopy,
}: {
  attachments?: MessageAttachment[];
  onDownload?: (attachment: MessageAttachment) => void;
  onCrop?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => void;
  onCopy?: (attachment: MessageAttachment) => void;
}) {
  if (!attachments?.length) return null;
  const visible = attachments.filter((item) => item.kind !== "video-frame" && item.kind !== "video-job" && item.url);
  if (!visible.length) return null;
  return (
    <div className="aichat-message-attachments">
      {visible.map((item, index) => {
        const key = item.path || item.videoId || item.url || `${item.name}-${index}`;
        if (item.kind === "image" || item.kind === "generated-image" || item.mimeType?.startsWith("image/")) {
          const isGenerated = item.kind === "generated-image";
          return (
            <div key={key} className="aichat-generated-media-wrap">
              <a href={item.url} target="_blank" rel="noreferrer" className="aichat-attachment-image-link">
                <img className="aichat-attachment-image" src={item.url} alt={item.name} loading="lazy" />
              </a>
              {isGenerated && (
                <div className="aichat-image-action-bar" role="group" aria-label="Generated image actions">
                  {onDownload && <button type="button" title="Download image" aria-label="Download image" onClick={() => onDownload(item)}><ActionIcon name="download" /></button>}
                  {onCrop && <button type="button" title="Crop image" aria-label="Crop image" onClick={() => onCrop(item)}><ActionIcon name="crop" /></button>}
                  {onShare && <button type="button" title="Share image" aria-label="Share image" onClick={() => onShare(item)}><ActionIcon name="share" /></button>}
                  {onCopy && <button type="button" title="Copy image" aria-label="Copy image" onClick={() => onCopy(item)}><ActionIcon name="copy" /></button>}
                </div>
              )}
            </div>
          );
        }
        if (item.kind === "video" || item.kind === "generated-video" || item.mimeType?.startsWith("video/")) {
          return <div key={key} className="aichat-generated-media-wrap"><video className="aichat-attachment-video" src={item.url} controls preload="metadata" />{item.kind === "generated-video" && onDownload && <button type="button" className="aichat-media-download" onClick={() => onDownload(item)}><ActionIcon name="download" /> Download video</button>}</div>;
        }
        return <a key={key} className="aichat-attachment-file" href={item.url} target="_blank" rel="noreferrer" download={item.name}>📎 {item.name}</a>;
      })}
    </div>
  );
}

const SUGGESTIONS = [
  "How many orders came in today?",
  "Show me recent conversations",
];

// Helper to safely render basic markdown
function MarkdownContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="aichat-markdown">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const code = lines.join("\n");
          return (
            <pre key={index}>
              <code>{code}</code>
            </pre>
          );
        }

        const paragraphs = part.split(/\n\n+/);
        return paragraphs.map((para, pIdx) => {
          const trimmed = para.trim();
          if (!trimmed) return null;

          if (trimmed.startsWith("### ")) {
            return <h3 key={`${index}-${pIdx}`}>{trimmed.slice(4)}</h3>;
          }
          if (trimmed.startsWith("## ")) {
            return <h2 key={`${index}-${pIdx}`}>{trimmed.slice(3)}</h2>;
          }
          if (trimmed.startsWith("# ")) {
            return <h1 key={`${index}-${pIdx}`}>{trimmed.slice(2)}</h1>;
          }

          if (
            trimmed
              .split("\n")
              .every(
                (l) => l.trim().startsWith("- ") || l.trim().startsWith("• "),
              )
          ) {
            const items = trimmed
              .split("\n")
              .map((l) => l.replace(/^[-•]\s*/, ""));
            return (
              <ul key={`${index}-${pIdx}`}>
                {items.map((item, iIdx) => (
                  <li key={iIdx}>{formatInline(item)}</li>
                ))}
              </ul>
            );
          }

          if (trimmed.split("\n").every((l) => /^\d+\.\s/.test(l.trim()))) {
            const items = trimmed
              .split("\n")
              .map((l) => l.replace(/^\d+\.\s*/, ""));
            return (
              <ol key={`${index}-${pIdx}`}>
                {items.map((item, iIdx) => (
                  <li key={iIdx}>{formatInline(item)}</li>
                ))}
              </ol>
            );
          }

          return <p key={`${index}-${pIdx}`}>{formatInline(trimmed)}</p>;
        });
      })}
    </div>
  );
}

function formatInline(text: string) {
  const segments = text.split(
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g,
  );
  return segments.map((seg, sIdx) => {
    if (seg.startsWith("[") && seg.includes("](") && seg.endsWith(")")) {
      const match = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return (
          <a
            key={sIdx}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#58a6ff", textDecoration: "underline" }}
          >
            {match[1]}
          </a>
        );
      }
    }
    if (seg.startsWith("`") && seg.endsWith("`")) {
      return <code key={sIdx}>{seg.slice(1, -1)}</code>;
    }
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return <strong key={sIdx}>{seg.slice(2, -2)}</strong>;
    }
    if (seg.startsWith("*") && seg.endsWith("*")) {
      return <em key={sIdx}>{seg.slice(1, -1)}</em>;
    }
    return seg;
  });
}

function Dashboard() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const signingOutRef = useRef(false);

  // Sidebar states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useIsomorphicLayoutEffect(() => {
    const saved = localStorage.getItem("misma_sidebar_open");
    setSidebarOpen(
      saved !== null ? saved === "true" : window.innerWidth >= 768,
    );
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Active navigation tab (5 primary items)
  const [activeTab, setActiveTab] = useState<TabId>("workspace");

  // Chats and tasks panel state
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [chatMenuOpenId, setChatMenuOpenId] = useState<number | null>(null);
  const [downloadingMediaUrl, setDownloadingMediaUrl] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<{ attachment: MessageAttachment; conversationId: number | null } | null>(null);
  const [cropAspect, setCropAspect] = useState<"original" | "square" | "portrait" | "landscape">("original");
  const [mediaActionStatus, setMediaActionStatus] = useState("");

  // Business and user data
  const [workspace, setWorkspace] = useState<any>(null);
  const [workspaceAssets, setWorkspaceAssets] = useState<any[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Profile
  const [profileName, setProfileName] = useState("Your account");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [accentColor, setAccentColor] = useState("#8ab4ff");
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    productUpdates: true,
    securityAlerts: true,
    chatActivity: true,
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(false);
  const [voiceInputActive, setVoiceInputActive] = useState(false);
  const [aiSettings, setAiSettings] = useState<MismaAiSettings>(DEFAULT_MISMA_AI_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("misma_ai_settings");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<MismaAiSettings>;
        setAiSettings({ ...DEFAULT_MISMA_AI_SETTINGS, ...parsed });
      }
    } catch {
      // Keep the recommended defaults if saved preferences cannot be read.
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem("misma_ai_settings", JSON.stringify(aiSettings));
    } catch {
      // The preferences remain usable for this session if browser storage is unavailable.
    }
  }, [aiSettings, settingsLoaded]);

  useEffect(() => {
    try {
      const savedAccent = localStorage.getItem("misma_accent_color");
      const savedNotifications = localStorage.getItem("misma_notification_preferences");
      const savedVoice = localStorage.getItem("misma_voice_uri");
      const savedAutoSpeak = localStorage.getItem("misma_auto_speak_replies");
      if (savedAccent && /^#[0-9a-f]{6}$/i.test(savedAccent)) setAccentColor(savedAccent);
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications) as Partial<typeof notificationPreferences>;
        setNotificationPreferences((current) => ({ ...current, ...parsed }));
      }
      if (savedVoice) setSelectedVoiceUri(savedVoice);
      if (savedAutoSpeak === "true") setAutoSpeakReplies(true);
    } catch {
      // Keep accessible defaults if browser preferences cannot be read.
    } finally {
      setAppearanceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;
    document.documentElement.style.setProperty("--misma-accent", accentColor);
    try {
      localStorage.setItem("misma_accent_color", accentColor);
      localStorage.setItem("misma_notification_preferences", JSON.stringify(notificationPreferences));
      localStorage.setItem("misma_voice_uri", selectedVoiceUri);
      localStorage.setItem("misma_auto_speak_replies", String(autoSpeakReplies));
    } catch {
      // Preferences remain active for this session when storage is unavailable.
    }
  }, [accentColor, notificationPreferences, selectedVoiceUri, autoSpeakReplies, appearanceLoaded]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refreshVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  const updateAiSetting = <K extends keyof MismaAiSettings>(key: K, value: MismaAiSettings[K]) => {
    setAiSettings((current) => ({ ...current, [key]: value }));
  };

  // Chat conversation state
  const [currentConversationId, setCurrentConversationId] = useState<
    number | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [failedPrompt, setFailedPrompt] = useState("");
  const [failedAction, setFailedAction] = useState<"send" | "regenerate" | "edit" | null>(null);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState<string | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, "up" | "down" | undefined>>({});
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [thinkHarder, setThinkHarder] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [createMode, setCreateMode] = useState<"image" | "video" | null>(null);
  const [mediaProgress, setMediaProgress] = useState("");
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);


  // Forms in other tabs
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // Business profile form
  const [profileForm, setProfileForm] = useState({
    name: "",
    location: "",
    description: "",
    openingHours: "",
    primaryLanguage: "English" as
      "English" | "Kinyarwanda" | "French" | "Swahili",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  const [recentSearch, setRecentSearch] = useState("");
  const recentChats = conversations
    .filter((item) => String(item.channel || "").trim().toLowerCase() === "dashboard")
    .map((item) => ({ ...item, name: cleanRecentChatTitle(item.name) || "New chat" }));
  const conversationGroups = Array.from(new Set(recentChats.map((item) => item.group_name).filter((value): value is string => Boolean(value))));

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);
  const shouldAutoScrollRef = useRef(true);
  const regenerateInFlightRef = useRef(false);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 120;
  };

  // Save desktop sidebar preference
  const toggleDesktopSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("misma_sidebar_open", String(next));
      return next;
    });
  };

  // Prevent background scroll when mobile sidebar is open
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  // Keep the dashboard session in sync with Supabase, including token refreshes.
  useEffect(() => {
    let active = true;
    try {
      const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(
        (event, session) => {
          if (!active) return;
          if (!session) {
            setToken(null);
            setAuthChecked(true);
            if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
              navigate({ to: "/login", replace: true });
            }
            return;
          }

          const s = session;
          sessionStorage.setItem("misma_id_token", s.access_token);
          if (s.user.email) sessionStorage.setItem("misma_email", s.user.email);
          setProfileEmail(s.user.email ?? "");
          const metadata = s.user.user_metadata || {};
          const displayName = [
            metadata.full_name,
            metadata.name,
            metadata.display_name,
          ].find(
            (v): v is string => typeof v === "string" && v.trim().length > 0,
          );
          const image = [metadata.avatar_url, metadata.picture].find(
            (v): v is string => typeof v === "string" && v.trim().length > 0,
          );
          const resolvedName = displayName ?? s.user.email?.split("@")[0] ?? "Your account";
          setProfileName(resolvedName);
          setProfileNameDraft(resolvedName);
          const avatarPath = metadata.avatar_path;
          if (typeof avatarPath === "string" && avatarPath.length > 0) {
            void getSupabaseClient().storage.from("misma-media").createSignedUrl(avatarPath, 3600).then(({ data, error }) => {
              if (!error && data?.signedUrl) setProfileImage(data.signedUrl);
              else setProfileImage(image ?? "");
            });
          } else {
            setProfileImage(image ?? "");
          }
          setToken(s.access_token);
          setAuthChecked(true);
        },
      );
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    } catch {
      if (active) navigate({ to: "/login", replace: true });
    }
  }, [navigate]);

  const isAuthenticated = Boolean(token);

  // Sign out after one hour without dashboard activity.
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: number;
    const expireSession = () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      void getSupabaseClient()
        .auth.signOut({ scope: "local" })
        .then(({ error }) => {
          if (error) console.error("Could not sign out after inactivity:", error);
        })
        .catch((error: unknown) => {
          console.error("Could not sign out after inactivity:", error);
        })
        .finally(() => {
          sessionStorage.removeItem("misma_id_token");
          sessionStorage.removeItem("misma_email");
          navigate({ to: "/login", replace: true });
        });
    };
    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(expireSession, 60 * 60 * 1000);
    };
    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
      "mousemove",
    ];
    for (const event of activityEvents) {
      window.addEventListener(event, resetTimeout, { passive: true });
    }
    resetTimeout();

    return () => {
      window.clearTimeout(timeoutId);
      for (const event of activityEvents) {
        window.removeEventListener(event, resetTimeout);
      }
    };
  }, [isAuthenticated, navigate]);

  // Load workspace and dashboard data
  const loadData = () => {
    if (!token) return;
    setLoadError("");
    getMismaData({ data: { token } })
      .then((data) => {
        setWorkspace(data.workspace);
        setConversations(data.conversations ?? []);
        setOrders(data.orders ?? []);
        setKnowledgeList(data.knowledge ?? []);
        setCustomers(data.customers ?? []);
        setWorkspaceAssets(data.assets ?? []);
        if (data.workspace) {
          setProfileForm({
            name: data.workspace.name || "",
            location: data.workspace.location || "",
            description: data.workspace.description || "",
            openingHours: data.workspace.opening_hours || "",
            primaryLanguage: data.workspace.primary_language || "English",
          });
        }
      })
      .catch((cause) => {
        setLoadError(cause instanceof Error ? cause.message : "Could not load your Misma workspace.");
      });
  };

  useEffect(() => {
    if (!authChecked || !token) return;
    loadData();
  }, [authChecked, token]);

  // Autogrow textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${Math.max(newHeight, 24)}px`;
    }
  }, [draft]);

  // Auto-scroll message list to bottom when appropriate
  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Load messages when selecting a conversation
  const selectConversation = async (convId: number) => {
    if (!token) return;
    setCurrentConversationId(convId);
    setActiveTab("workspace");
    setMobileMenuOpen(false);
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
    setFailedMessageId(null);
    setEditingMessageId(null);
    setEditingOriginalText(null);
    setMessageFeedback({});
    setSpeakingMessageId(null);
    setSelectedFiles([]);
    setThinkHarder(false);
    setCreateMode(null);
    setPlusMenuOpen(false);
    setMediaProgress("");
    setSelectedFiles([]);
    setThinkHarder(false);
    setCreateMode(null);
    setPlusMenuOpen(false);
    setMediaProgress("");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    shouldAutoScrollRef.current = true;
    try {
      const res = await getConversationMessages({
        data: { token, conversationId: convId },
      });
      setMessages(res.messages);
    } catch (cause) {
      setChatError(
        cause instanceof Error ? cause.message : "Could not load messages.",
      );
    }
  };

  // Start a fresh new chat
  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setDraft("");
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
    setFailedMessageId(null);
    setEditingMessageId(null);
    setEditingOriginalText(null);
    setMessageFeedback({});
    setSpeakingMessageId(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setActiveTab("workspace");
    setMobileMenuOpen(false);
    shouldAutoScrollRef.current = true;
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };


  const handleSetConversationGroup = async (conversationId: number, groupName: string | null) => {
    if (!token) return;
    try {
      await setConversationGroup({ data: { token, conversationId, groupName } });
      setChatMenuOpenId(null);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update this chat group.");
    }
  };

  const handleCreateConversationGroup = (conversationId: number) => {
    const value = window.prompt("Enter a group name for this chat:");
    const groupName = value?.trim().slice(0, 60);
    if (groupName) void handleSetConversationGroup(conversationId, groupName);
    setChatMenuOpenId(null);
  };

  // Delete conversation with confirmation
  const handleDeleteConversation = async (convId: number) => {
    if (!token) return;
    if (
      !confirm(
        "Are you sure you want to delete this conversation? This action cannot be undone.",
      )
    )
      return;
    try {
      await deleteConversation({ data: { token, conversationId: convId } });
      if (currentConversationId === convId) {
        handleNewChat();
      }
      loadData();
    } catch (cause) {
      alert(
        cause instanceof Error
          ? cause.message
          : "Could not delete conversation.",
      );
    }
  };

  const showCopiedState = (messageId: string) => {
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => current === messageId ? null : current);
    }, 1400);
  };

  const handleCopyMessage = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      showCopiedState(msg.id);
    } catch {
      setChatError("Could not copy this message. Check your browser clipboard permissions.");
    }
  };

  const handleShareMessage = async (msg: Message, title: string) => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: msg.text });
      } else {
        await navigator.clipboard.writeText(msg.text);
        showCopiedState(msg.id);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setChatError("Sharing is not available here. Try copying the message instead.");
    }
  };

  const handleReadAloud = (msg: Message) => {
    if (!("speechSynthesis" in window)) {
      setChatError("Read aloud is not supported by this browser.");
      return;
    }
    if (speakingMessageId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg.text);
    const selectedVoice = availableVoices.find((voice) => voice.voiceURI === selectedVoiceUri);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msg.id);
    window.speechSynthesis.speak(utterance);
  };



  const handleVoiceInput = () => {
    if (voiceInputActive) {
      speechRecognitionRef.current?.stop?.();
      setVoiceInputActive(false);
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setChatError("Voice dictation is not supported in this browser. Try a recent version of Chrome.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setDraft((current) => [current.trim(), transcript].filter(Boolean).join(current.trim() ? " " : ""));
    };
    recognition.onerror = (event: any) => {
      setChatError(event?.error === "not-allowed"
        ? "Allow microphone access to use voice dictation."
        : "Voice dictation stopped. Please try again.");
    };
    recognition.onend = () => {
      setVoiceInputActive(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    setChatError("");
    setVoiceInputActive(true);
    try {
      recognition.start();
    } catch {
      setVoiceInputActive(false);
      speechRecognitionRef.current = null;
      setChatError("The microphone could not be started. Please try again.");
    }
  };

  const testSelectedVoice = () => {
    if (!("speechSynthesis" in window)) {
      setChatError("Voice playback is not supported by this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Hello, this is your selected Misma voice.");
    const voice = availableVoices.find((item) => item.voiceURI === selectedVoiceUri);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  const saveAccountProfile = async () => {
    const name = profileNameDraft.trim();
    if (!token || profileSaving) return;
    if (name.length < 2 || name.length > 80) {
      setProfileError("Enter a profile name between 2 and 80 characters.");
      return;
    }
    setProfileSaving(true);
    setProfileError("");
    setProfileSaved(false);
    try {
      const client = getSupabaseClient();
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) throw new Error("Your sign-in session expired. Please sign in again.");
      let avatarPath = typeof userData.user.user_metadata?.avatar_path === "string"
        ? userData.user.user_metadata.avatar_path
        : "";
      if (profileAvatarFile) {
        if (!workspace?.id) throw new Error("Your workspace is still loading. Please try again.");
        if (profileAvatarFile.size > 5 * 1024 * 1024) throw new Error("Profile photos must be 5 MB or smaller.");
        const extension = profileAvatarFile.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "jpg";
        avatarPath = workspace.id + "/" + userData.user.id + "/avatar-" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await client.storage.from("misma-media").upload(avatarPath, profileAvatarFile, {
          upsert: true,
          contentType: profileAvatarFile.type || "image/jpeg",
        });
        if (uploadError) throw new Error("Could not save the profile photo: " + uploadError.message);
      }
      const { error: updateError } = await client.auth.updateUser({
        data: { ...userData.user.user_metadata, full_name: name, ...(avatarPath ? { avatar_path: avatarPath } : {}) },
      });
      if (updateError) throw new Error(updateError.message);
      setProfileName(name);
      if (avatarPath) {
        const { data: signed, error: signedError } = await client.storage.from("misma-media").createSignedUrl(avatarPath, 3600);
        if (!signedError && signed?.signedUrl) setProfileImage(signed.signedUrl);
      }
      setProfileAvatarFile(null);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 3000);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const exportCurrentChat = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      conversationId: currentConversationId,
      messages: messages.map(({ id, role, text, created_at }) => ({ id, role, text, created_at })),
    };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "misma-chat-export.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };


  const handleRateMessage = (messageId: string, rating: "up" | "down") => {
    const nextRating = messageFeedback[messageId] === rating ? undefined : rating;
    setMessageFeedback((current) => ({ ...current, [messageId]: nextRating }));
    const numericMessageId = Number(messageId);
    if (nextRating && Number.isSafeInteger(numericMessageId) && numericMessageId > 0 && workspace?.id) {
      void postChatAction({ action: "core01-feedback", workspaceId: workspace.id, messageId: numericMessageId, rating: nextRating })
        .catch((cause) => console.warn("Core.01 feedback could not be saved.", cause));
    }
  };

  const handleEditMessage = (msg: Message) => {
    if (isSending) return;
    const isPersistedMessage = !msg.id.startsWith("user-") && Number.isSafeInteger(Number(msg.id)) && msg.id.trim() !== "";
    if (!isPersistedMessage) {
      setMessages((current) => current.filter((item) => item.id !== msg.id));
      setFailedMessageId(null);
      setFailedAction(null);
      setFailedPrompt("");
    } else {
      const messageIndex = messages.findIndex((item) => item.id === msg.id);
      const hasLaterUserMessages = messages.slice(messageIndex + 1).some(
        (item) => item.role === "human" || item.role === "customer",
      );
      if (
        hasLaterUserMessages &&
        !window.confirm(
          "Editing this message will replace it and remove all later messages in this conversation. Continue?",
        )
      ) {
        return;
      }
      setEditingMessageId(msg.id);
      setEditingOriginalText(msg.text);
    }
    setDraft(msg.text);
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
    textareaRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingOriginalText(null);
    setDraft("");
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
  };

  // Sending, retrying, or editing a user message.
  const uploadSelectedAttachments = async (
    filesToUpload: File[] = selectedFiles,
    videoFrameMode = false,
  ): Promise<MessageAttachment[]> => {
    if (!filesToUpload.length) return [];
    if (!workspace?.id) throw new Error("Your workspace is still loading. Please try again.");
    const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
    if (userError || !userData.user) throw new Error("Your sign-in session expired. Please sign in again.");

    const uploaded: MessageAttachment[] = [];
    const uploadOne = async (file: File, kind: "image" | "video" | "video-frame" | "file") => {
      if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
      if ((file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) && file.size > 12 * 1024 * 1024) {
        throw new Error("PDF files must be 12 MB or smaller for AI analysis.");
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload";
      const path = `${workspace.id}/${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await getSupabaseClient().storage.from("misma-media").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
      uploaded.push({ path, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, kind });
    };

    let videoCount = 0;
    for (const original of filesToUpload) {
      if (videoFrameMode) {
        const preparedFrame = await compressImageForUpload(original);
        await uploadOne(preparedFrame, "video-frame");
      } else if (original.type.startsWith("image/")) {
        const preparedImage = await compressImageForUpload(original);
        await uploadOne(preparedImage, "image");
      } else if (original.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(original.name)) {
        videoCount += 1;
        if (videoCount > 1) throw new Error("Upload one video per message so Misma can sample its keyframes.");
        await uploadOne(original, "video");
        const frames = await extractVideoKeyframes(original);
        for (const frame of frames) await uploadOne(frame, "video-frame");
      } else {
        await uploadOne(original, "file");
      }
    }
    if (uploaded.length > 8) throw new Error("This upload created too many attachments. Please send fewer files.");
    return uploaded;
  };

  const postChatAction = async (body: Record<string, unknown>) => {
    const config = getSupabaseConfig();
    if (!config) throw new Error("Supabase is not configured. Add the Misma project URL and publishable key.");
    const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json() as Record<string, any>;
    if (!response.ok) {
      const error = new Error(typeof result.error === "string" ? result.error : "Misma AI request failed.") as Error & {
        responseData?: Record<string, any>;
        status?: number;
      };
      error.responseData = result;
      error.status = response.status;
      throw error;
    }
    return result;
  };


  const fetchAttachmentBlob = async (
    attachment: MessageAttachment,
    conversationId: number | null = currentConversationId,
  ): Promise<Blob> => {
    if (!attachment.url && !attachment.path) throw new Error("This media file is unavailable.");
    if (attachment.kind === "generated-image" || attachment.kind === "generated-video") {
      if (!token || !workspace?.id || !conversationId || !attachment.url) {
        throw new Error("Open the conversation containing this generated file, then try again.");
      }
      const config = getSupabaseConfig();
      if (!config) throw new Error("Supabase is not configured.");
      const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "download-generated-media",
          workspaceId: workspace.id,
          conversationId,
          url: attachment.url,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "Could not retrieve this generated file.");
      }
      return response.blob();
    }
    if (attachment.path) {
      const { data, error } = await getSupabaseClient().storage.from("misma-media").download(attachment.path);
      if (error || !data) throw new Error(error?.message || "Could not retrieve this file from your library.");
      return data;
    }
    const response = await fetch(attachment.url!);
    if (!response.ok) throw new Error("Could not retrieve this image. Check that its link is still available.");
    return response.blob();
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  };

  const showMediaActionStatus = (message: string) => {
    setMediaActionStatus(message);
    window.setTimeout(() => setMediaActionStatus(""), 2400);
  };

  const handleDownloadGeneratedMedia = async (
    attachment: MessageAttachment,
    conversationId: number | null = currentConversationId,
  ) => {
    if (!token || downloadingMediaUrl) return;
    setDownloadingMediaUrl(attachment.url || attachment.path || attachment.name);
    setChatError("");
    try {
      const blob = await fetchAttachmentBlob(attachment, conversationId);
      downloadBlob(blob, attachment.name || (attachment.kind === "generated-video" ? "misma-video.mp4" : "misma-image.png"));
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "Could not download this file.");
    } finally {
      setDownloadingMediaUrl(null);
    }
  };

  const handleCopyImage = async (attachment: MessageAttachment, conversationId: number | null = currentConversationId) => {
    try {
      const blob = await fetchAttachmentBlob(attachment, conversationId);
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image for copying.");
        context.drawImage(bitmap, 0, 0);
        const png = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare this image for copying.")), "image/png");
        });
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard access is not supported by this browser.");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      } finally {
        bitmap.close();
      }
      showMediaActionStatus("Image copied");
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "Could not copy this image.");
    }
  };

  const handleShareImage = async (attachment: MessageAttachment, conversationId: number | null = currentConversationId) => {
    try {
      const blob = await fetchAttachmentBlob(attachment, conversationId);
      const file = new File([blob], attachment.name || "misma-image.png", { type: blob.type || "image/png" });
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: attachment.name || "Misma image" });
        return;
      }
      if (!navigator.clipboard?.writeText || !attachment.url) throw new Error("Image sharing is not supported by this browser.");
      await navigator.clipboard.writeText(attachment.url);
      showMediaActionStatus("Image link copied");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setChatError(cause instanceof Error ? cause.message : "Could not share this image.");
    }
  };

  const handleOpenImageCrop = (attachment: MessageAttachment, conversationId: number | null = currentConversationId) => {
    setCropAspect("original");
    setCropTarget({ attachment, conversationId });
  };

  const handleDownloadCroppedImage = async () => {
    if (!cropTarget) return;
    try {
      const blob = await fetchAttachmentBlob(cropTarget.attachment, cropTarget.conversationId);
      const bitmap = await createImageBitmap(blob);
      try {
        const originalRatio = bitmap.width / bitmap.height;
        const ratio = cropAspect === "square" ? 1 : cropAspect === "portrait" ? 4 / 5 : cropAspect === "landscape" ? 16 / 9 : originalRatio;
        let sourceWidth = bitmap.width;
        let sourceHeight = bitmap.height;
        if (originalRatio > ratio) sourceWidth = bitmap.height * ratio;
        else sourceHeight = bitmap.width / ratio;
        const outputWidth = Math.min(2000, Math.round(sourceWidth));
        const outputHeight = Math.max(1, Math.round(outputWidth / ratio));
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a cropped image.");
        context.drawImage(
          bitmap,
          (bitmap.width - sourceWidth) / 2,
          (bitmap.height - sourceHeight) / 2,
          sourceWidth,
          sourceHeight,
          0,
          0,
          outputWidth,
          outputHeight,
        );
        const cropped = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export the cropped image.")), "image/png");
        });
        downloadBlob(cropped, (cropTarget.attachment.name || "misma-image").replace(/\.[^.]+$/, "") + "-cropped.png");
        setCropTarget(null);
      } finally {
        bitmap.close();
      }
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "Could not crop this image.");
    }
  };

  const handleSend = async (
    customPrompt?: string,
    options: { retry?: boolean } = {},
  ) => {
    let textToSend = (customPrompt ?? draft).trim();
    if ((!textToSend && !selectedFiles.length) || isSending || !token) return;
    if (!textToSend) textToSend = "Please inspect the attached files and explain the important details.";

    const implicitMediaMode = editingMessageId ? null : detectMediaIntent(textToSend);
    if (implicitMediaMode) {
      void handleCreateMedia(implicitMediaMode, textToSend);
      return;
    }

    const isRetry = options.retry === true;
    const editId = editingMessageId;
    const tempUserId = isRetry ? failedMessageId : `user-${Date.now()}`;

    if (!editId && !isRetry) {
      const tempUserMsg: Message = {
        id: tempUserId ?? `user-${Date.now()}`,
        role: "human",
        text: textToSend,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
    }

    setDraft("");
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
    setIsSending(true);
    shouldAutoScrollRef.current = true;

    try {
      const attachments = editId ? [] : await uploadSelectedAttachments();
      const res = await postChatAction({
        action: "chat",
        message: textToSend,
        conversationId: currentConversationId,
        workspaceId: workspace?.id,
        attachments,
        thinkHarder,
        ...(editId ? { editMessageId: Number(editId) } : {}),
      });
      if (!res.aiMessage) throw new Error("Misma AI returned an empty response.");

      if (!currentConversationId && res.conversationId) {
        setCurrentConversationId(res.conversationId);
      }

      if (editId) {
        setMessages((prev) => {
          const index = prev.findIndex((item) => item.id === editId);
          if (index < 0) return [...prev, res.aiMessage];
          return [
            ...prev.slice(0, index),
            { ...prev[index], text: textToSend },
            res.aiMessage,
          ];
        });
        setEditingMessageId(null);
        setEditingOriginalText(null);
      } else {
        setMessages((prev) => {
          const withPersistedUser = tempUserId && res.userMessage
            ? prev.map((item) => item.id === tempUserId ? res.userMessage : item)
            : prev;
          return [...withPersistedUser, res.aiMessage];
        });
        if (autoSpeakReplies) handleReadAloud(res.aiMessage);
      }

      setSelectedFiles([]);
      setThinkHarder(false);
      setFailedMessageId(null);
      setFailedAction(null);
      setFailedPrompt("");
      loadData();
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : "Failed to connect to Misma AI.";
      setChatError(errMsg);
      setFailedPrompt(textToSend);
      setFailedAction(editId ? "edit" : "send");
      setFailedMessageId(tempUserId);
      setDraft(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateMedia = async (
    requestedMode?: "image" | "video",
    promptOverride?: string,
    reuse?: { sourceUserMessageId: number; replaceAiMessageId: number; attachments: MessageAttachment[] },
  ) => {
    const mode = requestedMode ?? createMode;
    if (!mode || !token || isSending || isGeneratingMedia) return;
    const prompt = promptOverride?.trim() || draft.trim() || (mode === "image"
      ? "Create a high-quality image using the attached reference."
      : "Create a short cinematic video using the attached reference.");
    setChatError("");
    setMediaProgress(mode === "image" ? "" : "Preparing your video with Agnes…");
    setIsGeneratingMedia(true);
    setPlusMenuOpen(false);
    setCreateMode(null);
    setDraft("");
    shouldAutoScrollRef.current = true;

    const tempUserId = reuse ? null : `media-user-${Date.now()}`;
    const pendingMediaId = `media-pending-${Date.now()}`;
    const pendingMessage: Message = {
      id: pendingMediaId,
      role: "ai",
      text: mode === "image" ? "" : "Misma is preparing your video…",
      pendingMedia: mode,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => reuse
      ? [...current, pendingMessage]
      : [...current, {
          id: tempUserId!,
          role: "human",
          text: prompt,
          created_at: new Date().toISOString(),
        }, pendingMessage]);

    try {
      const attachments = reuse
        ? reuse.attachments.filter((item) => Boolean(item.path)).map((item) => ({
            path: item.path!,
            name: item.name,
            mimeType: item.mimeType || "application/octet-stream",
            size: item.size || 0,
            kind: item.kind,
          }))
        : await uploadSelectedAttachments();
      const result = await postChatAction({
        action: mode === "image" ? "create-image" : "create-video",
        message: prompt,
        conversationId: currentConversationId,
        workspaceId: workspace?.id,
        attachments,
        ...(reuse ? {
          regenerateMedia: true,
          sourceUserMessageId: reuse.sourceUserMessageId,
          replaceAiMessageId: reuse.replaceAiMessageId,
        } : {}),
      });
      if (result.conversationId) setCurrentConversationId(result.conversationId);
      if (result.userMessage && tempUserId) {
        setMessages((current) => current.map((item) => item.id === tempUserId ? result.userMessage : item));
      }
      setSelectedFiles([]);

      if (mode === "image") {
        if (!result.aiMessage) throw new Error("Agnes did not return a generated image.");
        setMessages((current) => {
          const withoutPending = current.filter((item) => item.id !== pendingMediaId);
          return reuse
            ? withoutPending.map((item) => item.id === String(reuse.replaceAiMessageId) ? result.aiMessage : item)
            : [...withoutPending, result.aiMessage];
        });
        setMediaProgress("");
        loadData();
        return;
      }

      const videoId = result.videoJob?.videoId;
      const model = result.videoJob?.model;
      if (typeof videoId !== "string" || typeof model !== "string") {
        throw new Error("Agnes did not return a video generation job.");
      }
      const progressMessageId = pendingMediaId;
      setMessages((current) => current.map((item) => item.id === progressMessageId ? {
        ...item,
        text: "Agnes is generating your video…",
        pendingMedia: "video",
      } : item));
      let completedUrl: string | null = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
        let status: Record<string, any> | null = null;
        let pollError: unknown = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            status = await postChatAction({
              action: "poll-video",
              workspaceId: workspace?.id,
              conversationId: result.conversationId,
              videoId,
              model,
            });
            pollError = null;
            break;
          } catch (error) {
            pollError = error;
            const detail = error instanceof Error ? error.message : String(error);
            if (!/agnes video status|temporar|network|failed to fetch|http (408|429|500|502|503|504)/i.test(detail) || retry === 2) break;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 1200 * (retry + 1)));
          }
        }
        if (pollError || !status) throw pollError instanceof Error ? pollError : new Error("Agnes video status could not be retrieved.");
        const progress = Number(status.progress) || 0;
        setMediaProgress(`Creating video… ${progress}%`);
        setMessages((current) => current.map((item) => item.id === progressMessageId ? {
          ...item,
          text: `Agnes is generating your video… ${progress}%`,
          pendingMedia: "video",
        } : item));
        if (status.status === "completed" && typeof status.url === "string") {
          completedUrl = status.url;
          break;
        }
        if (status.status === "failed") {
          throw new Error(typeof status.error === "string" ? status.error : "Agnes video generation failed.");
        }
      }
      if (!completedUrl) throw new Error("Video generation is taking longer than expected. The job may still be running; you can try again later.");
      setMediaProgress("Checking video frames for safe content…");
      const reviewConfig = getSupabaseConfig();
      if (!reviewConfig || !completedUrl) throw new Error("Could not prepare the generated video for its safety review.");
      const reviewDownload = await fetch(`${reviewConfig.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: reviewConfig.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "download-video-for-review",
          workspaceId: workspace?.id,
          conversationId: result.conversationId,
          videoId,
          url: completedUrl,
        }),
      });
      if (!reviewDownload.ok) {
        const detail = await reviewDownload.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error || "Could not inspect the generated video safely.");
      }
      const reviewBlob = await reviewDownload.blob();
      if (reviewBlob.size <= 0 || reviewBlob.size > 150 * 1024 * 1024) {
        throw new Error("The generated video is empty or too large to run a safety review.");
      }
      const reviewFile = new File([reviewBlob], "misma-generated-video-review.mp4", {
        type: reviewBlob.type.startsWith("video/") ? reviewBlob.type : "video/mp4",
      });
      const reviewFrames = await extractVideoKeyframes(reviewFile);
      if (reviewFrames.length < 2) throw new Error("Misma could not sample enough frames to review this video safely.");
      const reviewAttachments = await uploadSelectedAttachments(reviewFrames, true);
      await postChatAction({
        action: "review-video-frames",
        workspaceId: workspace?.id,
        conversationId: result.conversationId,
        videoId,
        url: completedUrl,
        attachments: reviewAttachments,
      });
      const saved = await postChatAction({
        action: "save-generated-media",
        workspaceId: workspace?.id,
        conversationId: result.conversationId,
        videoId,
        url: completedUrl,
        ...(reuse ? { replaceAiMessageId: reuse.replaceAiMessageId } : {}),
      });
      if (!saved.aiMessage) throw new Error("The generated video could not be saved to this chat.");
      setMessages((current) => {
        const withoutPending = current.filter((item) => item.id !== progressMessageId);
        return reuse
          ? withoutPending.map((item) => item.id === String(reuse.replaceAiMessageId) ? saved.aiMessage : item)
          : [...withoutPending, saved.aiMessage];
      });
      setMediaProgress("Video created.");
      window.setTimeout(() => setMediaProgress(""), 3500);
      loadData();
    } catch (cause) {
      const responseData = cause instanceof Error
        ? (cause as Error & { responseData?: Record<string, any> }).responseData
        : undefined;
      if (responseData?.conversationId) setCurrentConversationId(Number(responseData.conversationId));
      if (responseData?.userMessage && tempUserId) {
        setMessages((current) => current.map((item) => item.id === tempUserId ? responseData.userMessage : item));
      }
      setMessages((current) => current.filter((item) => item.id !== pendingMediaId));
      setDraft(prompt);
      setCreateMode(mode);
      setChatError(cause instanceof Error ? cause.message : "Agnes media generation failed.");
      setMediaProgress("");
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  const addSelectedFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const additions = Array.from(files);
    const next = [...selectedFiles, ...additions];
    if (next.length > 4) {
      setChatError("Attach up to four files per message.");
      return;
    }
    const isVideoFile = (file: File) => file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name);
    if (next.some(isVideoFile) && next.filter(isVideoFile).length > 1) {
      setChatError("Upload one video per message so Misma can sample its keyframes.");
      return;
    }
    const oversized = additions.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      setChatError(`${oversized.name} is larger than the 25 MB upload limit.`);
      return;
    }
    const oversizedPdf = additions.find((file) =>
      (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) &&
      file.size > 12 * 1024 * 1024
    );
    if (oversizedPdf) {
      setChatError("PDF files must be 12 MB or smaller for AI analysis.");
      return;
    }
    setChatError("");
    setSelectedFiles(next);
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData;
    const pastedFiles = Array.from(clipboard.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length) {
      event.preventDefault();
      const normalized = pastedFiles.map((file, index) => file.name
        ? file
        : new File([file], file.type.startsWith("image/") ? `pasted-image-${index + 1}.png` : `pasted-file-${index + 1}`, { type: file.type || "application/octet-stream" }));
      addSelectedFiles(normalized);
      return;
    }

    const html = clipboard.getData("text/html");
    if (!html) return;
    const imageSource = new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
    if (!imageSource || !/^https?:\/\//i.test(imageSource)) return;

    event.preventDefault();
    void (async () => {
      try {
        const response = await fetch(imageSource, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error("The copied image could not be retrieved from that website.");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("The copied link did not return an image.");
        if (blob.size > 25 * 1024 * 1024) throw new Error("The copied image is larger than 25 MB.");
        const extension = blob.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
        addSelectedFiles([new File([blob], `pasted-image.${extension}`, { type: blob.type })]);
      } catch {
        setChatError("Your browser could not read the copied image from that website. Use Copy image or save the image first, then paste or upload it.");
      }
    })();
  };

  // Regenerate the latest AI response using the saved user prompt.
  // The Edge Function reuses that prompt and never inserts a second human message.
  const handleRegenerate = async () => {
    if (!currentConversationId || !token || isSending || regenerateInFlightRef.current) return;
    regenerateInFlightRef.current = true;
    setChatError("");
    setFailedPrompt("");
    setFailedAction(null);
    setIsSending(true);
    shouldAutoScrollRef.current = true;

    try {
      const config = getSupabaseConfig();
      if (!config) {
        throw new Error("Supabase is not configured. Add the Misma project URL and publishable key.");
      }
      const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId: currentConversationId, regenerate: true }),
      });
      const res = (await response.json()) as {
        error?: string;
        aiMessage?: Message;
      };
      if (!response.ok) throw new Error(res.error || "Could not regenerate this response.");
      if (!res.aiMessage) throw new Error("Misma AI returned an empty response.");

      setMessages((prev) => {
        let latestUserIndex = -1;
        prev.forEach((item, index) => {
          if (item.role === "human" || item.role === "customer") latestUserIndex = index;
        });
        if (latestUserIndex < 0) return prev;
        return [...prev.slice(0, latestUserIndex + 1), res.aiMessage!];
      });
      setFailedAction(null);
      setFailedMessageId(null);
      setFailedPrompt("");
      setMessageFeedback({});
      loadData();
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : "Could not regenerate this response.");
      setFailedAction("regenerate");
    } finally {
      regenerateInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const handleRegenerateMessage = async (message: Message) => {
    const generatedMedia = message.attachments?.find((item) => item.kind === "generated-image" || item.kind === "generated-video");
    if (!generatedMedia) {
      await handleRegenerate();
      return;
    }
    const at = messages.findIndex((item) => item.id === message.id);
    const promptMessage = messages.slice(0, at).reverse().find((item) => item.role === "human" || item.role === "customer");
    const sourceUserMessageId = Number(promptMessage?.id);
    const replaceAiMessageId = Number(message.id);
    if (!promptMessage || !Number.isSafeInteger(sourceUserMessageId) || sourceUserMessageId < 1 ||
      !Number.isSafeInteger(replaceAiMessageId) || replaceAiMessageId < 1) {
      setChatError("The original media prompt is unavailable, so this item cannot be recreated.");
      return;
    }
    await handleCreateMedia(generatedMedia.kind === "generated-video" ? "video" : "image", promptMessage.text, {
      sourceUserMessageId,
      replaceAiMessageId,
      attachments: promptMessage.attachments || [],
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (createMode) void handleCreateMedia();
      else void handleSend();
    }
  };

  const signOut = async () => {
    setProfileError("");
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : "Could not sign out.",
      );
    } finally {
      sessionStorage.removeItem("misma_id_token");
      sessionStorage.removeItem("misma_email");
      navigate({ to: "/login", replace: true });
    }
  };

  // Knowledge handlers
  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newQuestion.trim() || !newAnswer.trim() || savingKnowledge)
      return;
    setSavingKnowledge(true);
    try {
      await addKnowledge({
        data: { token, question: newQuestion.trim(), answer: newAnswer.trim() },
      });
      setNewQuestion("");
      setNewAnswer("");
      loadData();
    } catch (cause) {
      alert(
        cause instanceof Error ? cause.message : "Could not add knowledge.",
      );
    } finally {
      setSavingKnowledge(false);
    }
  };

  const handleDeleteKnowledge = async (id: number) => {
    if (
      !token ||
      !confirm("Are you sure you want to delete this knowledge Q&A?")
    )
      return;
    try {
      await deleteKnowledge({ data: { token, id } });
      loadData();
    } catch (cause) {
      alert(
        cause instanceof Error ? cause.message : "Could not delete knowledge.",
      );
    }
  };

  // Order status handler
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: "New" | "Confirmed" | "Preparing" | "Delivered",
  ) => {
    if (!token) return;
    try {
      await updateOrderStatus({ data: { token, id: orderId, status } });
      loadData();
    } catch (cause) {
      alert(
        cause instanceof Error
          ? cause.message
          : "Could not update order status.",
      );
    }
  };

  // Business profile handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || savingProfile) return;
    setSavingProfile(true);
    setProfileSaveSuccess(false);
    try {
      await saveWorkspaceProfile({
        data: {
          token,
          name: profileForm.name,
          location: profileForm.location,
          description: profileForm.description,
          openingHours: profileForm.openingHours,
          primaryLanguage: profileForm.primaryLanguage,
        },
      });
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const userName = workspace?.name
    ? workspace.name.split(" ")[0]
    : (profileEmail || "there").split("@")[0];
  const latestAiMessageId = [...messages].reverse().find((item) => item.role === "ai")?.id;
  const settingsNavItems = [{"id":"settings-profile","label":"Profile","icon":"profile"},{"id":"settings-general","label":"General","icon":"general"},{"id":"settings-accent","label":"Accent color","icon":"accent"},{"id":"settings-notifications","label":"Notifications","icon":"notifications"},{"id":"settings-voice","label":"Voice","icon":"voice"},{"id":"settings-privacy","label":"Privacy & Security","icon":"privacy"},{"id":"settings-history","label":"History & Data","icon":"history"},{"id":"settings-about","label":"About","icon":"about"},{"id":"settings-logout","label":"Log out","icon":"logout"}];
  const filteredSettingsNavItems = settingsNavItems.filter((item) =>
    !settingsSearchQuery.trim() || item.label.toLowerCase().includes(settingsSearchQuery.trim().toLowerCase()),
  );

  return (
    <div className="aichat">
      {/* Mobile Translucent Backdrop */}
      <button
        type="button"
        className={`aichat-backdrop${mobileMenuOpen ? " is-mobile-open" : ""}`}
        aria-label="Close sidebar"
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* ── Main Sidebar ── */}
      <aside
        className={`aichat-side${sidebarOpen ? "" : " is-collapsed"}${mobileMenuOpen ? " is-mobile-open" : ""}`}
        aria-label="Primary Navigation"
      >
        {/* Top: Logo & Collapse Button */}
        <div className="aichat-side-top">
          <a href="/dashboard" className="aichat-brand-link">
            <span className="aichat-brand-icon">
              <svg viewBox="0 0 100 100" width="18" height="18">
                <polyline
                  points="26,52 38,64 60,38"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeLinecap="square"
                />
                <polyline
                  points="42,52 54,64 76,38"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeLinecap="square"
                />
              </svg>
            </span>
            <span className="aichat-side-brand">Misma</span>
          </a>
          <button
            type="button"
            className="aichat-collapse-btn"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={toggleDesktopSidebar}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="aichat-newchat-wrap">
          <button
            type="button"
            className="aichat-newchat"
            onClick={handleNewChat}
            data-tooltip="New chat"
          >
            <span className="aichat-newchat-plus">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="aichat-newchat-text">New chat</span>
          </button>
        </div>

        {/* Main sidebar navigation */}
        <nav className="aichat-primary-nav" aria-label="Main menu">
          {/* 1. Workspace */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "workspace" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("workspace");
              setMobileMenuOpen(false);
            }}
            data-tooltip="Workspace"
          >
            <span className="aichat-nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="aichat-nav-label">Workspace</span>
          </button>

          {/* Images */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "images" ? " active" : ""}`}
            onClick={() => { setActiveTab("images"); setMobileMenuOpen(false); }}
            data-tooltip="Images"
          >
            <span className="aichat-nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </span>
            <span className="aichat-nav-label">Images</span>
          </button>

          {/* Library */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "library" ? " active" : ""}`}
            onClick={() => { setActiveTab("library"); setMobileMenuOpen(false); }}
            data-tooltip="Library"
          >
            <span className="aichat-nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5z" />
                <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" />
                <path d="M8 6h8M8 9h8" />
              </svg>
            </span>
            <span className="aichat-nav-label">Library</span>
            {workspaceAssets.length > 0 && <span className="aichat-nav-badge">{workspaceAssets.length}</span>}
          </button>

          {/* Build */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "build" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("build");
              setMobileMenuOpen(false);
            }}
            data-tooltip="Build"
          >
            <span className="aichat-nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </span>
            <span className="aichat-nav-label">Build</span>
            {knowledgeList.length > 0 && (
              <span className="aichat-nav-badge">{knowledgeList.length}</span>
            )}
          </button>

          {/* 3. Connect */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "connect" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("connect");
              setMobileMenuOpen(false);
            }}
            data-tooltip="Connect"
          >
            <span className="aichat-nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <span className="aichat-nav-label">Connect</span>
          </button>

          {/* 4. Manage */}
          <button
            type="button"
            className={`aichat-nav-btn${activeTab === "manage" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("manage");
              setMobileMenuOpen(false);
            }}
            data-tooltip="Manage"
          >
            <span className="aichat-nav-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <span className="aichat-nav-label">Manage</span>
            {orders.length > 0 && (
              <span className="aichat-nav-badge">{orders.length}</span>
            )}
          </button>
        </nav>

        {/* ── Chats and tasks widget (Cloud AI style) ── */}
        <div className="aichat-chats-widget">
          <div className="aichat-chats-widget-header">
            <button
              type="button"
              className="aichat-chats-widget-title-btn"
              onClick={() => setChatsExpanded((v) => !v)}
              aria-expanded={chatsExpanded}
            >
              <span className="aichat-chats-widget-title">Chats and tasks</span>
              <svg
                className={`aichat-chats-widget-caret${chatsExpanded ? " open" : ""}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            <button
              type="button"
              className="aichat-chats-widget-filter"
              title="Filter chats"
              aria-label="Filter chats"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="17" y1="12" x2="7" y2="12" />
                <line x1="13" y1="18" x2="11" y2="18" />
              </svg>
            </button>
          </div>
          {chatsExpanded && (
            <div className="aichat-chats-widget-list">
              {recentChats.length === 0 ? (
                <div className="aichat-chats-widget-empty">No chats yet.</div>
              ) : (
                recentChats.slice(0, 5).map((c) => (
                  <div className="aichat-chat-list-item" key={c.id}>
                  <button
                    type="button"
                    className={`aichat-chats-widget-item${currentConversationId === c.id ? " active" : ""}`}
                    onClick={() => void selectConversation(c.id)}
                    title={c.name || "New chat"}
                  >
                    <span
                      className="aichat-chats-widget-dot"
                      aria-hidden="true"
                    />
                    <span className="aichat-chats-widget-item-text">
                      {c.name || "New chat"}
                    </span>
                  </button>
                  <button type="button" className="aichat-chat-more" aria-label="Chat options" aria-expanded={chatMenuOpenId === c.id} onClick={() => setChatMenuOpenId((current) => current === c.id ? null : c.id)}>⋯</button>
                  {chatMenuOpenId === c.id && (
                    <div className="aichat-chat-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => handleCreateConversationGroup(c.id)}>Group in…</button>
                      {conversationGroups.map((group) => <button key={group} type="button" role="menuitem" onClick={() => void handleSetConversationGroup(c.id, group)}>Move to {group}</button>)}
                      {c.group_name && <button type="button" role="menuitem" onClick={() => void handleSetConversationGroup(c.id, null)}>Remove group</button>}
                      <button type="button" role="menuitem" className="is-danger" onClick={() => { setChatMenuOpenId(null); void handleDeleteConversation(c.id); }}>Delete permanently</button>
                    </div>
                  )}
                  </div>
                ))
              )}
              {recentChats.length > 0 && (
                <button
                  type="button"
                  className="aichat-chats-widget-viewall"
                  onClick={() => {
                    setActiveTab("recent");
                    setMobileMenuOpen(false);
                  }}
                >
                  View all
                </button>
              )}
            </div>
          )}
        </div>

        {/* User Profile Card */}
        <div className="aichat-side-user">
          {profileMenuOpen && (
            <div className="aichat-profile-menu">
              <span>{profileEmail || "Signed in"}</span>
              <button type="button" onClick={() => {
                setActiveTab("settings");
                setProfileMenuOpen(false);
                setMobileMenuOpen(false);
              }}>
                Settings
              </button>
              {profileError && (
                <span className="aichat-profile-error">{profileError}</span>
              )}
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
          <button
            type="button"
            className={`aichat-user-profile${activeTab === "settings" ? " active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              setProfileMenuOpen(false);
              setMobileMenuOpen(false);
            }}
            aria-label="Open settings"
            title="Settings"
          >
            {profileImage ? (
              <img className="aichat-user-avatar" src={profileImage} alt="" />
            ) : (
              <span className="aichat-user-avatar">
                {profileName[0]?.toUpperCase() ?? "M"}
              </span>
            )}
            <span className="aichat-user-info">
              <b>{profileName}</b>
              <small>Your business</small>
            </span>
          </button>
          <button
            type="button"
            className="aichat-user-more"
            title="Account options"
            aria-label="Open account options"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((v) => !v)}
          >
            •••
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main
        className={`aichat-main${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
      >
        {/* Keep the menu control available when the sidebar is closed. */}
        <header className="aichat-topbar">
          <button
            type="button"
            className="aichat-header-toggle"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileMenuOpen((v) => !v);
              } else {
                toggleDesktopSidebar();
              }
            }}
            title="Toggle sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>

        {loadError && (
          <p className="aichat-error-box" role="alert">
            {loadError}
          </p>
        )}

        {/* ── View 1: Workspace (ChatGPT-Style Interface) ── */}
        {activeTab === "workspace" && (
          <div className="aichat-scroll-area">
            <div className="aichat-conversation-wrap" ref={scrollRef} onScroll={handleScroll}>
              {messages.length === 0 ? (
                /* Empty State */
                <div className="aichat-greeting-wrap">
                  <div className="aichat-glow" aria-hidden="true" />
                  <div className="aichat-logo-hero">
                    <svg viewBox="0 0 100 100" width="100%" height="100%">
                      <circle cx="50" cy="50" r="48" fill="#000" />
                      <polyline
                        points="26,52 38,64 60,38"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="8"
                        strokeLinecap="square"
                      />
                      <polyline
                        points="42,52 54,64 76,38"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="8"
                        strokeLinecap="square"
                      />
                    </svg>
                  </div>
                  <div className="aichat-greeting">
                    <h1>
                      Hi {profileName}.<em>How can I help you today?</em>
                    </h1>
                    <p>
                      Ask anything about your business, incoming orders,
                      customer conversations, or website operations.
                    </p>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="aichat-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="aichat-chip"
                        onClick={() => void handleSend(s)}
                      >
                        <span>{s}</span>
                        <span className="aichat-chip-arrow">↑</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Message Stream */
                messages.map((msg) => {
                  const isUserMessage = msg.role === "human" || msg.role === "customer";
                  const isAiMessage = msg.role === "ai";
                  const isLatestAiMessage = isAiMessage && msg.id === latestAiMessageId;
                  return (
                    <div
                      key={msg.id}
                      className={"aichat-message-row " + (isUserMessage ? "is-user" : "is-ai")}
                    >
                      {isAiMessage && msg.pendingMedia !== "image" && (
                        <div className="aichat-msg-avatar ai" title="Misma AI">
                          <svg viewBox="0 0 100 100" width="16" height="16">
                            <polyline points="26,52 38,64 60,38" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="square" />
                            <polyline points="42,52 54,64 76,38" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="square" />
                          </svg>
                        </div>
                      )}
                      <div className="aichat-message-content">
                        <div className="aichat-bubble">
                          <MessageAttachmentViews
                            attachments={msg.attachments}
                            onDownload={(attachment) => void handleDownloadGeneratedMedia(attachment)}
                            onCrop={(attachment) => handleOpenImageCrop(attachment)}
                            onShare={(attachment) => void handleShareImage(attachment)}
                            onCopy={(attachment) => void handleCopyImage(attachment)}
                          />
                          {msg.pendingMedia === "image" ? (
                            <div className="aichat-image-generation-dots" role="status" aria-label="Image generation in progress">
                              <i /><i /><i />
                            </div>
                          ) : msg.pendingMedia === "video" ? (
                            <div className="aichat-media-skeleton is-video" role="status" aria-live="polite">
                              <div className="aichat-media-skeleton-preview" aria-hidden="true">
                                <span className="aichat-media-skeleton-shimmer" />
                                <span className="aichat-media-skeleton-orbit"><i /><i /><i /></span>
                              </div>
                              <div className="aichat-media-skeleton-copy">
                                <strong>Creating your video</strong>
                                <span>{msg.text}</span>
                                <small>Video generation can take a little longer. You can keep this chat open.</small>
                              </div>
                            </div>
                          ) : <MarkdownContent content={msg.text} /> }
                        </div>
                        <div
                          className="aichat-message-actions"
                          role="group"
                          aria-label={isUserMessage ? "Your message actions" : "Misma response actions"}
                        >
                          {isUserMessage ? (
                            <>
                              <button type="button" className="aichat-message-action" title="Copy message" aria-label="Copy message" onClick={() => void handleCopyMessage(msg)}>
                                <ActionIcon name="copy" />
                              </button>
                              <button type="button" className="aichat-message-action" title="Share prompt" aria-label="Share prompt" onClick={() => void handleShareMessage(msg, "Misma prompt")}>
                                <ActionIcon name="share" />
                              </button>
                              <button type="button" className="aichat-message-action" title="Edit message" aria-label="Edit message" disabled={isSending} onClick={() => handleEditMessage(msg)}>
                                <ActionIcon name="edit" />
                              </button>
                            </>
                          ) : isAiMessage ? (
                            <>
                              <button type="button" className="aichat-message-action" title="Copy response" aria-label="Copy response" onClick={() => void handleCopyMessage(msg)}>
                                <ActionIcon name="copy" />
                              </button>
                              <button
                                type="button"
                                className={"aichat-message-action" + (messageFeedback[msg.id] === "up" ? " is-active" : "")}
                                title="Good response"
                                aria-label="Rate response positively"
                                aria-pressed={messageFeedback[msg.id] === "up"}
                                onClick={() => handleRateMessage(msg.id, "up")}
                              >
                                <ActionIcon name="thumbs-up" />
                              </button>
                              <button
                                type="button"
                                className={"aichat-message-action" + (messageFeedback[msg.id] === "down" ? " is-active" : "")}
                                title="Poor response"
                                aria-label="Rate response negatively"
                                aria-pressed={messageFeedback[msg.id] === "down"}
                                onClick={() => handleRateMessage(msg.id, "down")}
                              >
                                <ActionIcon name="thumbs-down" />
                              </button>
                              <button
                                type="button"
                                className="aichat-message-action"
                                title={speakingMessageId === msg.id ? "Stop reading" : "Read aloud"}
                                aria-label={speakingMessageId === msg.id ? "Stop reading aloud" : "Read response aloud"}
                                onClick={() => handleReadAloud(msg)}
                              >
                                <ActionIcon name={speakingMessageId === msg.id ? "volume-off" : "volume"} />
                              </button>
                              <button type="button" className="aichat-message-action" title="Share response" aria-label="Share response" onClick={() => void handleShareMessage(msg, "Misma response")}>
                                <ActionIcon name="share" />
                              </button>
                              {isLatestAiMessage && (
                                <button type="button" className="aichat-message-action" title="Try again" aria-label="Regenerate response" disabled={isSending || isGeneratingMedia} onClick={() => void handleRegenerateMessage(msg)}>
                                  <ActionIcon name="refresh" />
                                </button>
                              )}
                            </>
                          ) : null}
                          {copiedMessageId === msg.id && (
                            <span className="aichat-action-status" role="status">Copied</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* AI Thinking State */}
              {isSending && (
                <div className="aichat-thinking-row" aria-live="polite">
                  <div className="aichat-thinking-icon">
                    <svg viewBox="0 0 100 100" width="14" height="14">
                      <polyline
                        points="26,52 38,64 60,38"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="10"
                        strokeLinecap="square"
                      />
                      <polyline
                        points="42,52 54,64 76,38"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="10"
                        strokeLinecap="square"
                      />
                    </svg>
                  </div>
                  <span>Misma is thinking</span>
                  <div className="aichat-thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {chatError && (
                <div className="aichat-error-box" role="alert">
                  <span>{chatError}</span>
                  {failedAction === "regenerate" ? (
                    <button type="button" className="aichat-retry-btn" onClick={() => void handleRegenerate()} disabled={isSending}>
                      Try again
                    </button>
                  ) : failedPrompt ? (
                    <button type="button" className="aichat-retry-btn" onClick={() => void handleSend(failedPrompt, { retry: true })} disabled={isSending}>
                      Retry
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {/* Message Composer */}
            <div className="aichat-composer-container">
              <div className="aichat-composer-inner">
                {editingMessageId && (
                  <div className="aichat-editing-banner">
                    <span>Editing message: {editingOriginalText}</span>
                    <button type="button" onClick={handleCancelEdit}>Cancel</button>
                  </div>
                )}
                <form
                  className="aichat-composer-card aichat-composer-card-tools"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (createMode) void handleCreateMedia();
                    else void handleSend();
                  }}
                >
                  <div className="aichat-composer-tools-row">
                    {thinkHarder && (
                      <button type="button" className="aichat-composer-mode-pill" onClick={() => setThinkHarder(false)}>✧ Think harder <span>×</span></button>
                    )}
                    {createMode && (
                      <button type="button" className="aichat-composer-mode-pill is-create" onClick={() => setCreateMode(null)}>✦ Create {createMode} <span>×</span></button>
                    )}
                    {mediaProgress && <span className="aichat-composer-progress">{mediaProgress}</span>}
                  </div>
                  {selectedFiles.length > 0 && (
                    <div className="aichat-composer-attachments">
                      {selectedFiles.map((file, index) => (
                        <div className="aichat-composer-attachment-chip" key={`${file.name}-${file.lastModified}-${index}`}>
                          <span>{file.type.startsWith("image/") ? "▧" : file.type.startsWith("video/") ? "▶" : "📎"}</span>
                          <span title={file.name}>{file.name}</span>
                          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setSelectedFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="aichat-composer-sendrow">
                    <div className="aichat-composer-plus-wrap">
                      <button type="button" className="aichat-composer-plus" aria-label="Add files and tools" aria-expanded={plusMenuOpen} disabled={isSending || isGeneratingMedia || Boolean(editingMessageId)} onClick={() => setPlusMenuOpen((open) => !open)}>
                        {plusMenuOpen ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        )}
                      </button>
                      {plusMenuOpen && (
                        <div className="aichat-composer-plus-menu" role="menu" aria-label="Message tools">
                          <button type="button" role="menuitemcheckbox" aria-checked={thinkHarder} onClick={() => { setThinkHarder((value) => !value); setPlusMenuOpen(false); }}>
                            <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg></span>
                            <span><strong>Think harder</strong></span>
                            <span className="aichat-plus-menu-check">{thinkHarder ? "✓" : ""}</span>
                          </button>
                          <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setPlusMenuOpen(false); }}>
                            <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20H6a3 3 0 0 1 0-6h1"/><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8.2 8.2a5 5 0 0 1-7.1-7.1L12 2.7"/></svg></span>
                            <span><strong>Upload files</strong></span>
                          </button>
                          <button type="button" role="menuitem" onClick={() => { photoInputRef.current?.click(); setPlusMenuOpen(false); }}>
                            <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
                            <span><strong>Photo</strong></span>
                          </button>
                          <button type="button" role="menuitem" onClick={() => { cameraInputRef.current?.click(); setPlusMenuOpen(false); }}>
                            <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="m14 4 7 5h-7z"/><circle cx="10" cy="12" r="3"/></svg></span>
                            <span><strong>Camera</strong></span>
                          </button>
                          <div className="aichat-plus-menu-divider" />
                          <button type="button" role="menuitem" onClick={() => { setCreateMode("video"); setPlusMenuOpen(false); }}>
                            <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></span>
                            <span><strong>Create video</strong></span>
                          </button>
                        </div>
                      )}
                    </div>
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      className="aichat-composer-textarea"
                      placeholder={createMode ? `Describe the ${createMode} you want Agnes to create…` : "Message Misma…"}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handleComposerPaste}
                      disabled={isSending}
                      aria-label="Message Misma"
                    />
                    <button
                      type="button"
                      className={`aichat-composer-voice${voiceInputActive ? " is-listening" : ""}`}
                      onClick={handleVoiceInput}
                      disabled={isSending || isGeneratingMedia}
                      aria-label={voiceInputActive ? "Stop voice dictation" : "Start voice dictation"}
                      title={voiceInputActive ? "Stop voice dictation" : "Use voice"}
                    >
                      {voiceInputActive ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" /></svg>
                      )}
                    </button>
                    <button
                      type="submit"
                      className={`aichat-composer-send-btn${(draft.trim() || selectedFiles.length || createMode) && !isSending ? " can-send" : ""}`}
                      disabled={(!draft.trim() && !selectedFiles.length && !createMode) || isSending}
                      title={createMode ? `Create ${createMode} with Agnes` : editingMessageId ? "Save edited message" : "Send message"}
                      aria-label={createMode ? `Create ${createMode} with Agnes` : "Send message"}
                    >
                      {isGeneratingMedia ? "…" : createMode ? "✦" : "↑"}
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" hidden multiple onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={photoInputRef} type="file" accept="image/*" hidden multiple onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                </form>
                <p className="aichat-disclaimer-text">
                  Misma can make mistakes. Verify important business details.{" "}
                  <a href="#">Learn more</a>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Images: generated and uploaded image workspace ── */}
        {activeTab === "images" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header aichat-assets-heading">
                <div>
                  <h2>Images</h2>
                  <p>Browse images from your Misma conversations and create new visuals.</p>
                </div>
                <button type="button" className="aichat-action-btn" onClick={() => {
                  setActiveTab("workspace");
                  setCreateMode("image");
                  setPlusMenuOpen(false);
                  setMobileMenuOpen(false);
                  window.setTimeout(() => textareaRef.current?.focus(), 0);
                }}>＋ Create image</button>
              </div>
              {workspaceAssets.filter((asset) => asset.kind === "image" || asset.kind === "generated-image" || String(asset.mimeType || "").startsWith("image/")).length === 0 ? (
                <div className="aichat-card aichat-assets-empty">
                  <div className="aichat-assets-empty-icon">▧</div>
                  <h3>Your image library is ready</h3>
                  <p>Generated images and image uploads from your chats will appear here.</p>
                  <button type="button" className="aichat-action-btn" onClick={() => {
                    setActiveTab("workspace");
                    setCreateMode("image");
                    window.setTimeout(() => textareaRef.current?.focus(), 0);
                  }}>Create your first image</button>
                </div>
              ) : (
                <div className="aichat-assets-grid">
                  {workspaceAssets
                    .filter((asset) => asset.kind === "image" || asset.kind === "generated-image" || String(asset.mimeType || "").startsWith("image/"))
                    .map((asset) => (
                      <article className="aichat-asset-card" key={asset.id}>
                        <a href={asset.url} target="_blank" rel="noreferrer" className="aichat-asset-image-link">
                          <img src={asset.url} alt={asset.name || "Misma image"} loading="lazy" />
                        </a>
                        <div className="aichat-asset-card-footer">
                          <span title={asset.name}>{asset.name || (asset.kind === "generated-image" ? "Generated image" : "Image")}</span>
                          <div className="aichat-image-action-bar" role="group" aria-label="Image actions">
                            <button type="button" title="Download image" aria-label="Download image" onClick={() => void handleDownloadGeneratedMedia(asset, asset.conversationId)}><ActionIcon name="download" /></button>
                            <button type="button" title="Crop image" aria-label="Crop image" onClick={() => handleOpenImageCrop(asset, asset.conversationId)}><ActionIcon name="crop" /></button>
                            <button type="button" title="Share image" aria-label="Share image" onClick={() => void handleShareImage(asset, asset.conversationId)}><ActionIcon name="share" /></button>
                            <button type="button" title="Copy image" aria-label="Copy image" onClick={() => void handleCopyImage(asset, asset.conversationId)}><ActionIcon name="copy" /></button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Library: uploaded documents, media, and generated assets ── */}
        {activeTab === "library" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Library</h2>
                <p>Find images, documents, and media shared in your workspace conversations.</p>
              </div>
              <div className="aichat-card">
                <div className="aichat-library-toolbar">
                  <span>{workspaceAssets.length} saved items</span>
                  <input className="aichat-input" type="search" placeholder="Search your library…" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} aria-label="Search library" />
                </div>
                {workspaceAssets.filter((asset) => `${asset.name} ${asset.kind} ${asset.mimeType}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).length === 0 ? (
                  <div className="aichat-assets-empty">
                    <div className="aichat-assets-empty-icon">▤</div>
                    <h3>No library items found</h3>
                    <p>Upload an image or document in Workspace to add it to your library.</p>
                    <button type="button" className="aichat-action-btn secondary" onClick={() => { setActiveTab("workspace"); setMobileMenuOpen(false); }}>Open workspace</button>
                  </div>
                ) : (
                  <div className="aichat-library-list">
                    {workspaceAssets
                      .filter((asset) => `${asset.name} ${asset.kind} ${asset.mimeType}`.toLowerCase().includes(librarySearch.trim().toLowerCase()))
                      .map((asset) => {
                        const isImage = asset.kind === "image" || asset.kind === "generated-image" || String(asset.mimeType || "").startsWith("image/");
                        const isVideo = asset.kind === "video" || asset.kind === "generated-video" || String(asset.mimeType || "").startsWith("video/");
                        return (
                          <article className="aichat-library-item" key={asset.id}>
                            {isImage ? <img src={asset.url} alt={asset.name || "Library image"} loading="lazy" /> : <span className="aichat-library-file-icon">{isVideo ? "▶" : "▤"}</span>}
                            <div className="aichat-library-item-copy">
                              <strong title={asset.name}>{asset.name || "Workspace file"}</strong>
                              <small>{asset.mimeType || asset.kind} · {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : "Saved item"}</small>
                            </div>
                            <a href={asset.url} target="_blank" rel="noreferrer" download={asset.name} className="aichat-library-open" aria-label={`Open ${asset.name || "file"}`} title="Open file"><ActionIcon name="download" /></a>
                          </article>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── View 2: Build (AI Agent & Knowledge Base) ── */}
        {activeTab === "build" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Build AI Capabilities</h2>
                <p>
                  Train Misma on your business knowledge, questions, and
                  customer answers.
                </p>
              </div>

              {/* Add Knowledge Card */}
              <div className="aichat-card">
                <h3>Add New Business Knowledge</h3>
                <p>
                  When customers ask this question, Misma will answer with the
                  approved response.
                </p>
                <form onSubmit={handleAddKnowledge}>
                  <div className="aichat-input-group">
                    <label htmlFor="k-question">Question / Trigger</label>
                    <input
                      id="k-question"
                      className="aichat-input"
                      placeholder="e.g., Do you offer home delivery in Kigali?"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      required
                    />
                  </div>
                  <div className="aichat-input-group">
                    <label htmlFor="k-answer">Approved Answer</label>
                    <textarea
                      id="k-answer"
                      className="aichat-textarea"
                      rows={3}
                      placeholder="e.g., Yes! We deliver everywhere in Kigali within 24 hours."
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="aichat-action-btn"
                    disabled={
                      savingKnowledge ||
                      !newQuestion.trim() ||
                      !newAnswer.trim()
                    }
                  >
                    {savingKnowledge ? "Saving…" : "+ Add Knowledge Q&A"}
                  </button>
                </form>
              </div>

              {/* Approved Knowledge Library Table */}
              <div className="aichat-card">
                <h3>Trained Knowledge Library ({knowledgeList.length})</h3>
                <p>
                  Active Q&As used by Misma AI across your website and connected
                  channels.
                </p>
                {knowledgeList.length === 0 ? (
                  <p style={{ color: "#657180" }}>
                    No custom knowledge items yet. Add your first Q&A above.
                  </p>
                ) : (
                  <div className="aichat-table-wrap">
                    <table className="aichat-table">
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Answer</th>
                          <th style={{ textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knowledgeList.map((k) => (
                          <tr key={k.id}>
                            <td style={{ fontWeight: 600 }}>{k.question}</td>
                            <td>{k.answer}</td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                style={{ color: "#ff7b72" }}
                                onClick={() => void handleDeleteKnowledge(k.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── View 3: Connect Channels ── */}
        {activeTab === "connect" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Connect Channels</h2>
                <p>
                  Connect Misma to your external communication channels.
                </p>
              </div>

              {/* Channels Grid */}
              <div className="aichat-card">
                <h3>Connected Business Channels</h3>
                <p>
                  Synchronize conversations from messaging apps into one unified
                  inbox.
                </p>
                <div className="aichat-form-grid">
                  <div
                    style={{
                      padding: 14,
                      border: "1px solid #212631",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <b>💬 WhatsApp Business</b>
                      <span style={{ color: "#8b949e", fontSize: 12 }}>
                        Ready to link
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#8b949e",
                      }}
                    >
                      Connect via Meta Cloud API webhook.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── View 4: Manage (Business, Orders & Settings) ── */}
        {activeTab === "manage" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Manage Business & Operations</h2>
                <p>
                  Configure business profile, track live customer orders, and
                  view metrics.
                </p>
              </div>

              {/* Business Profile Form */}
              <div className="aichat-card">
                <h3>Business Information</h3>
                <p>
                  Misma references these details to answer customer questions
                  about your business.
                </p>
                <form onSubmit={handleSaveProfile}>
                  <div className="aichat-form-grid">
                    <div className="aichat-input-group">
                      <label htmlFor="biz-name">Business Name</label>
                      <input
                        id="biz-name"
                        className="aichat-input"
                        value={profileForm.name}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            name: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className="aichat-input-group">
                      <label htmlFor="biz-loc">Location / Address</label>
                      <input
                        id="biz-loc"
                        className="aichat-input"
                        value={profileForm.location}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            location: e.target.value,
                          }))
                        }
                        placeholder="e.g. Kigali, Rwanda"
                        required
                      />
                    </div>
                  </div>

                  <div className="aichat-form-grid">
                    <div className="aichat-input-group">
                      <label htmlFor="biz-hours">Opening Hours</label>
                      <input
                        id="biz-hours"
                        className="aichat-input"
                        value={profileForm.openingHours}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            openingHours: e.target.value,
                          }))
                        }
                        placeholder="e.g. Mon–Sat 8:00 AM – 7:00 PM"
                        required
                      />
                    </div>
                    <div className="aichat-input-group">
                      <label htmlFor="biz-lang">Primary Language</label>
                      <select
                        id="biz-lang"
                        className="aichat-select"
                        value={profileForm.primaryLanguage}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            primaryLanguage: e.target.value as any,
                          }))
                        }
                      >
                        <option value="English">English</option>
                        <option value="Kinyarwanda">Kinyarwanda</option>
                        <option value="French">French</option>
                        <option value="Swahili">Swahili</option>
                      </select>
                    </div>
                  </div>

                  <div className="aichat-input-group">
                    <label htmlFor="biz-desc">
                      Business Description & Services
                    </label>
                    <textarea
                      id="biz-desc"
                      className="aichat-textarea"
                      rows={3}
                      value={profileForm.description}
                      onChange={(e) =>
                        setProfileForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="aichat-action-btn"
                    disabled={savingProfile}
                  >
                    {savingProfile
                      ? "Saving…"
                      : profileSaveSuccess
                        ? "✓ Profile Saved"
                        : "Save Business Profile"}
                  </button>
                </form>
              </div>

              {/* Orders Table */}
              <div className="aichat-card">
                <h3>Customer Orders ({orders.length})</h3>
                <p>
                  Track orders received from customer conversations and update
                  delivery status.
                </p>
                {orders.length === 0 ? (
                  <p style={{ color: "#657180" }}>No orders placed yet.</p>
                ) : (
                  <div className="aichat-table-wrap">
                    <table className="aichat-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Chat</th>
                          <th>Item</th>
                          <th>Total (RWF)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td style={{ fontFamily: "var(--font-mono)" }}>
                              {o.id}
                            </td>
                            <td>{o.customer}</td>
                            <td>{o.item}</td>
                            <td>{Number(o.total_rwf).toLocaleString()} RWF</td>
                            <td>
                              <select
                                className="aichat-select"
                                style={{
                                  height: 32,
                                  padding: "0 8px",
                                  width: "auto",
                                }}
                                value={o.status}
                                onChange={(e) =>
                                  void handleUpdateOrderStatus(
                                    o.id,
                                    e.target.value as any,
                                  )
                                }
                              >
                                <option value="New">New</option>
                                <option value="Confirmed">Confirmed</option>
                                <option value="Preparing">Preparing</option>
                                <option value="Delivered">Delivered</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Customers Table */}
              <div className="aichat-card">
                <h3>Top Customers ({customers.length})</h3>
                <p>Customer accounts tracked across interactions.</p>
                {customers.length === 0 ? (
                  <p style={{ color: "#657180" }}>No customers recorded yet.</p>
                ) : (
                  <div className="aichat-table-wrap">
                    <table className="aichat-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Orders Count</th>
                          <th>Lifetime Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td>{c.orders_count}</td>
                            <td>
                              {Number(c.lifetime_value_rwf).toLocaleString()}{" "}
                              RWF
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── View 5: AI Settings for business and website assistants ── */}
        {activeTab === "settings" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content aichat-settings-content">
              <div className="aichat-tab-header">
                <h2>Settings</h2>
                <p>Configure how Misma represents your business, supports website visitors, and hands conversations to your team.</p>
              </div>
              <div className="aichat-settings-nav" aria-label="Settings sections">
                {settingsNavItems.filter((item) => item.icon !== "logout").map((item) => (
                  <button key={item.id} type="button" className="aichat-settings-nav-button" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    <span className="aichat-settings-nav-icon"><SettingsNavIcon kind={item.icon} /></span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <section id="settings-profile" className="aichat-card aichat-settings-card aichat-profile-settings">
                <div className="aichat-settings-profile-head">
                  <button type="button" className="aichat-settings-avatar-button" onClick={() => profileAvatarInputRef.current?.click()} aria-label="Change profile picture" title="Change profile picture">
                    {profileImage ? <img src={profileImage} alt="" /> : <span>{profileNameDraft[0]?.toUpperCase() || "M"}</span>}
                    <span className="aichat-settings-avatar-edit" aria-hidden="true">✎</span>
                  </button>
                  <div>
                    <h3>Profile</h3>
                    <p>Update the name and picture used for your Misma account.</p>
                    <small>{profileEmail}</small>
                  </div>
                  <input ref={profileAvatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        setProfileError("Profile photos must be 5 MB or smaller.");
                      } else {
                        setProfileAvatarFile(file);
                        setProfileImage(URL.createObjectURL(file));
                        setProfileError("");
                      }
                    }
                    event.target.value = "";
                  }} />
                </div>
                <div className="aichat-profile-edit-row">
                  <div className="aichat-input-group">
                    <label htmlFor="misma-profile-name">Profile name</label>
                    <input id="misma-profile-name" className="aichat-input" value={profileNameDraft} maxLength={80} onChange={(event) => setProfileNameDraft(event.target.value)} placeholder="Your name" />
                  </div>
                  <button type="button" className="aichat-action-btn" onClick={() => void saveAccountProfile()} disabled={profileSaving}>
                    {profileSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
                {profileError && <p className="aichat-profile-error" role="alert">{profileError}</p>}
                {profileSaved && <p className="aichat-settings-status" role="status">Profile changes saved.</p>}
                {profileAvatarFile && <p className="aichat-settings-hint">New profile photo selected. Save changes to upload it.</p>}
              </section>
              <div className="aichat-settings-divider-label" id="settings-general">General</div>
              <div className="aichat-settings-intro">
                <span className="aichat-settings-intro-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg></span>
                <span><strong>Recommended business assistant profile</strong><small>Recommended defaults for a helpful, accurate, and trustworthy assistant on business websites.</small></span>
                <span className="aichat-settings-saved">{settingsLoaded ? "Saved on this device" : "Loading settings…"}</span>
              </div>
              <section className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/><path d="M16 3h5v5"/></svg></span>
                  <span><h3>Assistant profile</h3><p>Choose the job Misma should do and the way it should communicate.</p></span>
                </div>
                <div className="aichat-settings-select-grid">
                  <div className="aichat-input-group"><label htmlFor="misma-assistant-mode">Primary role</label><select id="misma-assistant-mode" className="aichat-select" value={aiSettings.assistantMode} onChange={(event) => updateAiSetting("assistantMode", event.target.value as MismaAiSettings["assistantMode"])}><option>Sales &amp; customer support</option><option>Customer support</option><option>Sales assistant</option></select></div>
                  <div className="aichat-input-group"><label htmlFor="misma-response-tone">Response tone</label><select id="misma-response-tone" className="aichat-select" value={aiSettings.responseTone} onChange={(event) => updateAiSetting("responseTone", event.target.value as MismaAiSettings["responseTone"])}><option>Professional and friendly</option><option>Warm and conversational</option><option>Formal</option></select></div>
                  <div className="aichat-input-group"><label htmlFor="misma-response-length">Response length</label><select id="misma-response-length" className="aichat-select" value={aiSettings.responseLength} onChange={(event) => updateAiSetting("responseLength", event.target.value as MismaAiSettings["responseLength"])}><option>Concise</option><option>Balanced</option><option>Detailed</option></select></div>
                  <div className="aichat-input-group"><label htmlFor="misma-language-mode">Reply language</label><select id="misma-language-mode" className="aichat-select" value={aiSettings.languageMode} onChange={(event) => updateAiSetting("languageMode", event.target.value as MismaAiSettings["languageMode"])}><option>Match visitor language</option><option>Business primary language</option><option>English</option></select></div>
                </div>
              </section>
              <section className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2" fill="#11141a"/><circle cx="16" cy="12" r="2" fill="#11141a"/><circle cx="10" cy="19" r="2" fill="#11141a"/></svg></span>
                  <span><h3>Knowledge and answer quality</h3><p>Keep customer answers accurate, consistent, and aligned with approved business information.</p></span>
                </div>
                <SettingsToggle title="Use business knowledge first" description="Prioritize approved FAQs, products, services, policies, and business information." checked={aiSettings.useBusinessKnowledge} onToggle={() => updateAiSetting("useBusinessKnowledge", !aiSettings.useBusinessKnowledge)} />
                <SettingsToggle title="Avoid unverified promises" description="Do not invent prices, stock levels, delivery times, opening hours, or policy details." checked={aiSettings.avoidUnverifiedClaims} onToggle={() => updateAiSetting("avoidUnverifiedClaims", !aiSettings.avoidUnverifiedClaims)} />
                <SettingsToggle title="Ask when details are missing" description="Ask a short clarifying question instead of guessing when a request is unclear." checked={aiSettings.askClarifyingQuestions} onToggle={() => updateAiSetting("askClarifyingQuestions", !aiSettings.askClarifyingQuestions)} />
                <SettingsToggle title="Reply automatically" description="Let Misma answer incoming website questions using configured business knowledge." checked={aiSettings.autoReply} onToggle={() => updateAiSetting("autoReply", !aiSettings.autoReply)} />
              </section>
              <section className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 4h18v13H3z"/><path d="M8 21h8M12 17v4M7 9h10M7 13h6"/></svg></span>
                  <span><h3>Website and sales experience</h3><p>Help visitors discover your business, make decisions, and complete the next step.</p></span>
                </div>
                <SettingsToggle title="Show a welcome greeting" description="Start new website conversations with a brief, friendly introduction." checked={aiSettings.welcomeGreeting} onToggle={() => updateAiSetting("welcomeGreeting", !aiSettings.welcomeGreeting)} />
                <SettingsToggle title="Qualify interested leads" description="Ask for relevant contact and requirement details when a visitor shows interest." checked={aiSettings.qualifyLeads} onToggle={() => updateAiSetting("qualifyLeads", !aiSettings.qualifyLeads)} />
                <SettingsToggle title="Capture order details" description="Collect item, quantity, delivery, and contact details before confirming an order." checked={aiSettings.captureOrders} onToggle={() => updateAiSetting("captureOrders", !aiSettings.captureOrders)} />
                <SettingsToggle title="Respect business hours" description="Use saved opening hours and never imply that the business is open when it is closed." checked={aiSettings.respectBusinessHours} onToggle={() => updateAiSetting("respectBusinessHours", !aiSettings.respectBusinessHours)} />
              </section>
              <section className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                  <span><h3>Customer care and privacy</h3><p>Protect customers and make it easy for your team to take over when needed.</p></span>
                </div>
                <SettingsToggle title="Offer human handoff" description="Route complaints, sensitive issues, and requests for a real person to your team." checked={aiSettings.humanHandoff} onToggle={() => updateAiSetting("humanHandoff", !aiSettings.humanHandoff)} />
                <SettingsToggle title="Protect sensitive information" description="Never ask customers to share passwords, full payment card details, or private account credentials." checked={aiSettings.protectSensitiveData} onToggle={() => updateAiSetting("protectSensitiveData", !aiSettings.protectSensitiveData)} />
              </section>
              <section id="settings-accent" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">◐</span>
                  <span><h3>Accent color</h3><p>Choose the highlight color used for active controls and selection states.</p></span>
                </div>
                <div className="aichat-accent-options">
                  {[
                    { label: "Blue", value: "#8ab4ff" },
                    { label: "Violet", value: "#b39bff" },
                    { label: "Green", value: "#72cba4" },
                    { label: "Rose", value: "#f18ca8" },
                    { label: "Orange", value: "#efa66c" },
                  ].map((color) => (
                    <button key={color.value} type="button" className={`aichat-accent-option${accentColor === color.value ? " is-selected" : ""}`} onClick={() => setAccentColor(color.value)} aria-pressed={accentColor === color.value}>
                      <span style={{ backgroundColor: color.value }} />
                      {color.label}
                    </button>
                  ))}
                </div>
              </section>

              <section id="settings-notifications" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">♧</span>
                  <span><h3>Notifications</h3><p>Choose which Misma activity reminders you want enabled in this browser.</p></span>
                </div>
                <SettingsToggle title="Product updates" description="Show relevant information about new Misma features." checked={notificationPreferences.productUpdates} onToggle={() => setNotificationPreferences((current) => ({ ...current, productUpdates: !current.productUpdates }))} />
                <SettingsToggle title="Security alerts" description="Keep security and sign-in notices enabled." checked={notificationPreferences.securityAlerts} onToggle={() => setNotificationPreferences((current) => ({ ...current, securityAlerts: !current.securityAlerts }))} />
                <SettingsToggle title="Chat activity" description="Enable notifications for new chat activity when supported by the browser." checked={notificationPreferences.chatActivity} onToggle={() => setNotificationPreferences((current) => ({ ...current, chatActivity: !current.chatActivity }))} />
                <p className="aichat-settings-hint">These preferences are saved in this browser. Push delivery requires a notification service to be configured by the app.</p>
              </section>

              <section id="settings-voice" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">♫</span>
                  <span><h3>Voice</h3><p>Choose the browser voice Misma uses when reading answers aloud. Voice availability depends on your device.</p></span>
                </div>
                <div className="aichat-settings-voice-row">
                  <div className="aichat-input-group">
                    <label htmlFor="misma-voice-choice">Reply voice</label>
                    <select id="misma-voice-choice" className="aichat-select" value={selectedVoiceUri} onChange={(event) => setSelectedVoiceUri(event.target.value)}>
                      <option value="">Device default voice</option>
                      {availableVoices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang}){voice.default ? " — default" : ""}</option>)}
                    </select>
                  </div>
                  <button type="button" className="aichat-action-btn secondary" onClick={testSelectedVoice}>Preview voice</button>
                </div>
                <SettingsToggle title="Read new replies aloud" description="Automatically speak each new text answer using the selected device voice." checked={autoSpeakReplies} onToggle={() => setAutoSpeakReplies((current) => !current)} />
                <p className="aichat-settings-hint">Voice dictation uses your browser's speech recognition and inserts a transcript into the message box. Misma does not upload microphone audio as a recording.</p>
              </section>

              <section id="settings-privacy" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">◇</span>
                  <span><h3>Privacy &amp; Security</h3><p>Review how Misma handles your account and conversation data.</p></span>
                </div>
                <div className="aichat-settings-info-row"><strong>Account access</strong><span>Workspace data is accessed using your signed-in Supabase session.</span></div>
                <div className="aichat-settings-info-row"><strong>Profile photo</strong><span>Stored in your Misma media bucket and displayed with a signed URL.</span></div>
                <div className="aichat-settings-info-row"><strong>Voice dictation</strong><span>Audio capture is handled by the browser speech-recognition feature; only the resulting transcript is added to your draft.</span></div>
              </section>

              <section id="settings-history" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">◷</span>
                  <span><h3>History &amp; Data</h3><p>Export the open conversation or manage saved chats from Recent chats.</p></span>
                </div>
                <div className="aichat-settings-action-row">
                  <div><strong>Export current conversation</strong><small>Download the visible conversation as a JSON file.</small></div>
                  <button type="button" className="aichat-action-btn secondary" onClick={exportCurrentChat} disabled={!messages.length}>Export chat</button>
                </div>
                <div className="aichat-settings-action-row">
                  <div><strong>Manage saved conversations</strong><small>Open Recent chats to group or permanently delete conversations.</small></div>
                  <button type="button" className="aichat-action-btn secondary" onClick={() => setActiveTab("recent")}>Open history</button>
                </div>
              </section>

              <section id="settings-about" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">ⓘ</span>
                  <span><h3>About Misma</h3><p>Business AI workspace.</p></span>
                </div>
                <div className="aichat-settings-info-row"><strong>Application</strong><span>Misma</span></div>
                <div className="aichat-settings-info-row"><strong>Version</strong><span>1.0.0</span></div>
              </section>

              <section id="settings-logout" className="aichat-card aichat-settings-card aichat-settings-logout">
                <div><h3>Log out</h3><p>Sign out of your Misma account on this device.</p></div>
                <button type="button" className="aichat-settings-logout-button" onClick={() => void signOut()}>Log out</button>
              </section>

              <section id="settings-search" className="aichat-card aichat-settings-card aichat-settings-search">
                <label htmlFor="misma-settings-search">Search settings</label>
                <div className="aichat-settings-search-control">
                  <span aria-hidden="true">⌕</span>
                  <input id="misma-settings-search" type="search" value={settingsSearchQuery} onChange={(event) => setSettingsSearchQuery(event.target.value)} placeholder="Search for a setting…" />
                </div>
                {settingsSearchQuery.trim() && (
                  <div className="aichat-settings-search-results">
                    {filteredSettingsNavItems.length ? filteredSettingsNavItems.map((item) => (
                      <button key={item.id} type="button" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{item.label}<span>↗</span></button>
                    )) : <p>No matching settings found.</p>}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── View 6: Recent Conversations ── */}
        {activeTab === "recent" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Recent chats ({recentChats.length})</h2>
                <p>
                  Find, reopen, group, or permanently delete your recent Misma chats.
                </p>
              </div>

              <div className="aichat-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="search"
                    className="aichat-input"
                    style={{ maxWidth: 320, padding: "8px 12px", height: 38 }}
                    placeholder="Search recent conversations…"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    aria-label="Search conversations"
                  />
                  <button
                    type="button"
                    className="aichat-action-btn"
                    style={{ padding: "8px 14px", height: 38 }}
                    onClick={handleNewChat}
                  >
                    + Start New Chat
                  </button>
                </div>

                {recentChats.length === 0 ? (
                  <p style={{ color: "#657180" }}>
                    No recorded conversations yet. Start chatting in Workspace!
                  </p>
                ) : (
                  <div className="aichat-table-wrap">
                    <table className="aichat-table">
                      <thead>
                        <tr>
                          <th>Chat</th>
                          <th>Channel</th>
                          <th>Group</th>
                          <th>Latest activity</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentChats
                          .filter(
                            (c) =>
                              !recentSearch.trim() ||
                              (c.name || "")
                                .toLowerCase()
                                .includes(recentSearch.toLowerCase()) ||
                              (c.text || "")
                                .toLowerCase()
                                .includes(recentSearch.toLowerCase()) ||
                              (c.channel || "")
                                .toLowerCase()
                                .includes(recentSearch.toLowerCase()),
                          )
                          .map((c) => (
                            <tr key={c.id}>
                              <td style={{ fontWeight: 600 }}>
                                {c.name || "New chat"}
                              </td>
                              <td>
                                <span className="aichat-header-badge">
                                  {c.channel || "Dashboard"}
                                </span>
                              </td>
                              <td>{c.group_name || "—"}</td>
                              <td>
                                {c.text ? c.text.slice(0, 50) : "No message"}
                              </td>
                              <td>{c.status || "AI"}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <div className="aichat-chat-list-item aichat-recent-chat-actions">
                                  <button type="button" className="aichat-action-btn secondary" style={{ height: 32, padding: "0 10px", fontSize: 13 }} onClick={() => void selectConversation(c.id)}>
                                    Open Chat
                                  </button>
                                  <button type="button" className="aichat-chat-more" aria-label={`Options for ${c.name || "chat"}`} aria-expanded={chatMenuOpenId === c.id} onClick={() => setChatMenuOpenId((current) => current === c.id ? null : c.id)}>⋯</button>
                                  {chatMenuOpenId === c.id && (
                                    <div className="aichat-chat-menu" role="menu">
                                      <button type="button" role="menuitem" onClick={() => handleCreateConversationGroup(c.id)}>Group in…</button>
                                      {conversationGroups.map((group) => <button key={group} type="button" role="menuitem" onClick={() => void handleSetConversationGroup(c.id, group)}>Move to {group}</button>)}
                                      {c.group_name && <button type="button" role="menuitem" onClick={() => void handleSetConversationGroup(c.id, null)}>Remove group</button>}
                                      <button type="button" role="menuitem" className="is-danger" onClick={() => { setChatMenuOpenId(null); void handleDeleteConversation(c.id); }}>Delete permanently</button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {cropTarget && (
          <div className="aichat-crop-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCropTarget(null); }}>
            <section className="aichat-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="misma-crop-title">
              <div className="aichat-crop-heading">
                <div><h2 id="misma-crop-title">Crop image</h2><p>Choose a crop ratio. Misma will export a centered crop at high resolution.</p></div>
                <button type="button" aria-label="Close crop editor" onClick={() => setCropTarget(null)}>×</button>
              </div>
              <div className={`aichat-crop-preview is-${cropAspect}`}>
                <img src={cropTarget.attachment.url} alt={cropTarget.attachment.name || "Image crop preview"} />
              </div>
              <label className="aichat-crop-ratio-label" htmlFor="misma-crop-ratio">Aspect ratio</label>
              <select id="misma-crop-ratio" className="aichat-select" value={cropAspect} onChange={(event) => setCropAspect(event.target.value as typeof cropAspect)}>
                <option value="original">Original</option>
                <option value="square">Square · 1:1</option>
                <option value="portrait">Portrait · 4:5</option>
                <option value="landscape">Landscape · 16:9</option>
              </select>
              <div className="aichat-crop-actions">
                <button type="button" className="aichat-action-btn secondary" onClick={() => setCropTarget(null)}>Cancel</button>
                <button type="button" className="aichat-action-btn" onClick={() => void handleDownloadCroppedImage()}>Download crop</button>
              </div>
            </section>
          </div>
        )}
        {mediaActionStatus && <div className="aichat-media-toast" role="status">{mediaActionStatus}</div>}
      </main>
    </div>
  );
}
