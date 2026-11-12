import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
  type MouseEvent,
} from "react";
import {
  getMismaData,
  getWorkspaceAssets,
  getVisitorNotifications,
  getWorkspaceLiveUpdates,
  getConversationMessages,
  getConversationActivity,
  createConversation,
  deleteConversation,
  setConversationGroup,
  addKnowledge,
  deleteKnowledge,
  updateOrderStatus,
  saveWorkspaceProfile,
  markVisitorMessagesRead,
  markHumanRequestNotificationRead,
  createWebsiteConnection,
  saveWebsiteSocialLinks,
  shareWebsiteWidgetAcrossWorkspace,
  deleteWebsiteConnection,
  createProductService,
  updateHumanRequestStatus,
  deleteHumanRequest,
  deleteWorkspaceNotification,
  saveWorkspaceName,
  updateProductServiceStatus,
  createWorkspaceLibraryFile,
  deleteWorkspaceLibraryFile,
  deleteChatAttachment,
} from "../lib/api/misma.functions";
import { getSupabaseClient, getSupabaseConfig } from "../lib/supabase";
import { MicrophoneAccessPanel } from "../components/microphone-access-panel";
import { VoiceInputBar } from "../components/voice-input-bar";
import { getSpeechVoiceForPreset } from "../lib/misma-voice";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const MAX_COMPOSER_FILES = 5;
const MAX_DOCUMENT_UPLOAD_MB = 10;
const MAX_IMAGE_UPLOAD_MB = 25;

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type TabId = "workspace" | "website-statistics" | "websites" | "customers" | "notifications" | "products" | "build" | "knowledge" | "connect" | "phone" | "website-connect" | "whatsapp" | "images" | "library" | "manage" | "settings";

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

type UnreadVisitorMessage = {
  id: number;
  conversationId: number;
  text: string;
  created_at: string;
  channel: string;
  conversationTitle: string;
};


function getUserMessageTextColor(hex: string): string {
  const toLinear = (channel: string) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * toLinear(hex.slice(1, 3)) +
    0.7152 * toLinear(hex.slice(3, 5)) +
    0.0722 * toLinear(hex.slice(5, 7));
  const contrastWithDark = (luminance + 0.05) / 0.0584; // #111827
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithDark >= contrastWithWhite ? "#111827" : "#ffffff";
}


type DashboardNavIconKind = "workspace" | "images" | "library" | "manage" | "build" | "connect" | "chevron-down" | "chevron-right";

function DashboardNavIcon({ kind }: { kind: DashboardNavIconKind }) {
  return (
    <svg
      className="aichat-nav-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "workspace" ? (
        <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>
      ) : kind === "images" ? (
        <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>
      ) : kind === "library" ? (
        <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6M9 11h6" /></>
      ) : kind === "manage" ? (
        <><circle cx="9" cy="8" r="3.25" /><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.5" /></>
      ) : kind === "build" ? (
        <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>
      ) : kind === "connect" ? (
        <><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-2.12 2.12a5 5 0 0 0 7.07 7.07L13 19" /></>
      ) : kind === "chevron-down" ? (
        <path d="m6 9 6 6 6-6" />
      ) : (
        <path d="m9 6 6 6-6 6" />
      )}
    </svg>
  );
}

function HumanRequestIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

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


const WEBSITE_PHONE_COUNTRY_CODES = [
  { name: "Rwanda", code: "250", flag: "🇷🇼" },
  { name: "United States", code: "1", flag: "🇺🇸" },
  { name: "Canada", code: "1", flag: "🇨🇦" },
  { name: "United Kingdom", code: "44", flag: "🇬🇧" },
  { name: "France", code: "33", flag: "🇫🇷" },
  { name: "Germany", code: "49", flag: "🇩🇪" },
  { name: "Belgium", code: "32", flag: "🇧🇪" },
  { name: "Netherlands", code: "31", flag: "🇳🇱" },
  { name: "Switzerland", code: "41", flag: "🇨🇭" },
  { name: "Ireland", code: "353", flag: "🇮🇪" },
  { name: "Italy", code: "39", flag: "🇮🇹" },
  { name: "Spain", code: "34", flag: "🇪🇸" },
  { name: "Portugal", code: "351", flag: "🇵🇹" },
  { name: "Sweden", code: "46", flag: "🇸🇪" },
  { name: "Norway", code: "47", flag: "🇳🇴" },
  { name: "Denmark", code: "45", flag: "🇩🇰" },
  { name: "Poland", code: "48", flag: "🇵🇱" },
  { name: "Turkey", code: "90", flag: "🇹🇷" },
  { name: "United Arab Emirates", code: "971", flag: "🇦🇪" },
  { name: "Saudi Arabia", code: "966", flag: "🇸🇦" },
  { name: "Qatar", code: "974", flag: "🇶🇦" },
  { name: "India", code: "91", flag: "🇮🇳" },
  { name: "Pakistan", code: "92", flag: "🇵🇰" },
  { name: "Bangladesh", code: "880", flag: "🇧🇩" },
  { name: "China", code: "86", flag: "🇨🇳" },
  { name: "Japan", code: "81", flag: "🇯🇵" },
  { name: "South Korea", code: "82", flag: "🇰🇷" },
  { name: "Singapore", code: "65", flag: "🇸🇬" },
  { name: "Malaysia", code: "60", flag: "🇲🇾" },
  { name: "Indonesia", code: "62", flag: "🇮🇩" },
  { name: "Philippines", code: "63", flag: "🇵🇭" },
  { name: "Thailand", code: "66", flag: "🇹🇭" },
  { name: "Vietnam", code: "84", flag: "🇻🇳" },
  { name: "Australia", code: "61", flag: "🇦🇺" },
  { name: "New Zealand", code: "64", flag: "🇳🇿" },
  { name: "South Africa", code: "27", flag: "🇿🇦" },
  { name: "Nigeria", code: "234", flag: "🇳🇬" },
  { name: "Ghana", code: "233", flag: "🇬🇭" },
  { name: "Kenya", code: "254", flag: "🇰🇪" },
  { name: "Uganda", code: "256", flag: "🇺🇬" },
  { name: "Tanzania", code: "255", flag: "🇹🇿" },
  { name: "Burundi", code: "257", flag: "🇧🇮" },
  { name: "Ethiopia", code: "251", flag: "🇪🇹" },
  { name: "Egypt", code: "20", flag: "🇪🇬" },
  { name: "Morocco", code: "212", flag: "🇲🇦" },
  { name: "Brazil", code: "55", flag: "🇧🇷" },
  { name: "Mexico", code: "52", flag: "🇲🇽" },
  { name: "Argentina", code: "54", flag: "🇦🇷" },
  { name: "Colombia", code: "57", flag: "🇨🇴" },
];

function normalizeInstagramProfile(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let handle = "";
  if (trimmed.startsWith("@")) {
    handle = trimmed.slice(1);
  } else {
    let parsed: URL;
    try {
      parsed = new URL(trimmed.includes("://") ? trimmed : "https://" + trimmed);
    } catch {
      throw new Error("Enter an @handle or a valid instagram.com profile URL.");
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || host !== "instagram.com") {
      throw new Error("Only instagram.com profile URLs are accepted.");
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) throw new Error("Enter a single Instagram profile URL, not a post or reel link.");
    handle = segments[0].replace(/^@/, "");
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    throw new Error("Enter a valid Instagram username (letters, numbers, periods, or underscores).");
  }
  return "https://instagram.com/" + handle;
}

type WebsiteSocialDraft = {
  instagramUrl: string;
  gmailAddress: string;
  whatsappCountryCode: string;
  whatsappNumber: string;
  whatsappMessage: string;
};

function WebsiteSocialSettings({
  site,
  token,
  onSaved,
}: {
  site: any;
  token: string;
  onSaved: (website: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<WebsiteSocialDraft>({
    instagramUrl: site.instagram_url || "",
    gmailAddress: site.gmail_address || "",
    whatsappCountryCode: site.whatsapp_country_code || "250",
    whatsappNumber: site.whatsapp_number || "",
    whatsappMessage: site.whatsapp_message || "",
  });

  const currentDraft = (): WebsiteSocialDraft => ({
    instagramUrl: site.instagram_url || "",
    gmailAddress: site.gmail_address || "",
    whatsappCountryCode: site.whatsapp_country_code || "250",
    whatsappNumber: site.whatsapp_number || "",
    whatsappMessage: site.whatsapp_message || "",
  });

  useEffect(() => {
    if (!open) setDraft(currentDraft());
  }, [open, site.id, site.instagram_url, site.gmail_address, site.whatsapp_country_code, site.whatsapp_number, site.whatsapp_message]);

  async function saveDraft(nextDraft: WebsiteSocialDraft) {
    setError("");
    setStatus("");
    let instagramUrl: string | null;
    try {
      instagramUrl = normalizeInstagramProfile(nextDraft.instagramUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid Instagram profile.");
      return;
    }

    const digitsOnly = nextDraft.whatsappNumber.replace(/\D/g, "");
    const subscriberNumber = digitsOnly.replace(/^0+/, "");
    const countryCode = nextDraft.whatsappCountryCode.replace(/\D/g, "");
    let whatsappCountryCode: string | null = null;
    let whatsappNumber: string | null = null;
    let whatsappMessage: string | null = null;
    if (subscriberNumber) {
      const totalDigits = countryCode.length + subscriberNumber.length;
      if (!countryCode || countryCode.length > 4 || totalDigits < 7 || totalDigits > 15) {
        setError("Enter a valid WhatsApp number. The country code and number must total 7–15 digits.");
        return;
      }
      whatsappCountryCode = countryCode;
      whatsappNumber = subscriberNumber;
      whatsappMessage = nextDraft.whatsappMessage.trim();
      if (!whatsappMessage) {
        setError("A default message is required when a WhatsApp number is provided.");
        return;
      }
    }

    const gmailAddress = nextDraft.gmailAddress.trim().toLowerCase();
    if (gmailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(gmailAddress)) {
      setError("Enter a valid Gmail address.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveWebsiteSocialLinks({
        data: {
          token,
          websiteId: site.id,
          instagramUrl,
          gmailAddress: gmailAddress || null,
          whatsappCountryCode,
          whatsappNumber,
          whatsappMessage,
        },
      });
      onSaved(result.website);
      setDraft({
        instagramUrl: result.website.instagram_url || "",
        gmailAddress: result.website.gmail_address || "",
        whatsappCountryCode: result.website.whatsapp_country_code || "250",
        whatsappNumber: result.website.whatsapp_number || "",
        whatsappMessage: result.website.whatsapp_message || "",
      });
      setStatus("Saved. Gmail will appear in the widget header after the next config refresh; no script update is needed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the website links.");
    } finally {
      setSaving(false);
    }
  }

  async function removeInstagram() {
    await saveDraft({ ...draft, instagramUrl: "" });
  }

  async function removeGmail() {
    await saveDraft({ ...draft, gmailAddress: "" });
  }

  async function removeWhatsApp() {
    await saveDraft({
      ...draft,
      whatsappCountryCode: "250",
      whatsappNumber: "",
      whatsappMessage: "",
    });
  }

  return (
    <div className="aichat-website-social-settings">
      <button
        type="button"
        className="aichat-social-dropdown"
        aria-expanded={open}
        aria-label={open ? "Close Add channels settings" : "Open Add channels settings"}
        onClick={() => {
          if (!open) {
            setDraft(currentDraft());
            setError("");
            setStatus("");
          }
          setOpen((current) => !current);
        }}
      >
        <span>Add channels</span>
        <svg className={open ? "is-open" : ""} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="aichat-social-form">
          <section className="aichat-social-channel">
            <div className="aichat-social-channel-heading">
              <strong>Instagram</strong>
              <span>{site.instagram_url ? "Added" : "Optional"}</span>
            </div>
            <label>
              Instagram URL or @handle
              <input
                value={draft.instagramUrl}
                type="text"
                placeholder="https://instagram.com/yourbusiness or @yourbusiness"
                autoComplete="url"
                readOnly={Boolean(site.instagram_url)}
                onChange={(event) => setDraft((current) => ({ ...current, instagramUrl: event.target.value }))}
              />
            </label>
            {site.instagram_url && (
              <button type="button" className="aichat-social-remove" disabled={saving} onClick={() => void removeInstagram()}>
                Remove Instagram
              </button>
            )}
          </section>

          <section className="aichat-social-channel">
            <div className="aichat-social-channel-heading">
              <strong>Gmail</strong>
              <span>{site.gmail_address ? "Added" : "Optional"}</span>
            </div>
            <label>
              Gmail contact address
              <input
                value={draft.gmailAddress}
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                placeholder="business@gmail.com"
                readOnly={Boolean(site.gmail_address)}
                onChange={(event) => setDraft((current) => ({ ...current, gmailAddress: event.target.value }))}
              />
            </label>
            <small>Visitors can open a Gmail compose window addressed to this email.</small>
            {site.gmail_address && (
              <button type="button" className="aichat-social-remove" disabled={saving} onClick={() => void removeGmail()}>
                Remove Gmail
              </button>
            )}
          </section>

          <section className="aichat-social-channel">
            <div className="aichat-social-channel-heading">
              <strong>WhatsApp</strong>
              <span>{site.whatsapp_number ? "Added" : "Optional"}</span>
            </div>
            <div className="aichat-whatsapp-number-row">
              <label>
                Country code
                <select
                  value={draft.whatsappCountryCode}
                  disabled={Boolean(site.whatsapp_number)}
                  onChange={(event) => setDraft((current) => ({ ...current, whatsappCountryCode: event.target.value }))}
                >
                  {!WEBSITE_PHONE_COUNTRY_CODES.some((country) => country.code === draft.whatsappCountryCode) && (
                    <option value={draft.whatsappCountryCode}>+{draft.whatsappCountryCode}</option>
                  )}
                  {WEBSITE_PHONE_COUNTRY_CODES.map((country) => (
                    <option key={country.name} value={country.code}>{country.flag} {country.name} (+{country.code})</option>
                  ))}
                </select>
              </label>
              <label>
                Phone number
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={draft.whatsappNumber}
                  readOnly={Boolean(site.whatsapp_number)}
                  placeholder="e.g. 788123456"
                  onChange={(event) => setDraft((current) => ({ ...current, whatsappNumber: event.target.value }))}
                />
              </label>
            </div>
            <label>
              Default message
              <textarea
                rows={3}
                value={draft.whatsappMessage}
                readOnly={Boolean(site.whatsapp_number)}
                placeholder="Hello! How can we help you today?"
                onChange={(event) => setDraft((current) => ({ ...current, whatsappMessage: event.target.value }))}
              />
            </label>
            {site.whatsapp_number && (
              <button type="button" className="aichat-social-remove" disabled={saving} onClick={() => void removeWhatsApp()}>
                Remove WhatsApp
              </button>
            )}
          </section>
          {error && <p className="aichat-social-error" role="alert">{error}</p>}
          {status && <p className="aichat-social-success" role="status">{status}</p>}
          <button type="button" className="aichat-social-save" disabled={saving} onClick={() => void saveDraft(draft)}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}


function WhatsAppConnectionCard({
  site,
  token,
  onSaved,
}: {
  site: any;
  token: string;
  onSaved: (website: any) => void;
}) {
  const [countryCode, setCountryCode] = useState(String(site.whatsapp_country_code || "250"));
  const [phoneNumber, setPhoneNumber] = useState(String(site.whatsapp_number || ""));
  const [defaultMessage, setDefaultMessage] = useState(String(site.whatsapp_message || "Hello! How can we help you today?"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setCountryCode(String(site.whatsapp_country_code || "250"));
    setPhoneNumber(String(site.whatsapp_number || ""));
    setDefaultMessage(String(site.whatsapp_message || "Hello! How can we help you today?"));
  }, [site.id, site.whatsapp_country_code, site.whatsapp_number, site.whatsapp_message]);

  const save = async () => {
    setError("");
    setStatus("");
    const subscriberNumber = phoneNumber.replace(/\D/g, "").replace(/^0+/, "");
    const normalizedCountryCode = countryCode.replace(/\D/g, "");
    if (!subscriberNumber) {
      setError("Enter a WhatsApp phone number.");
      return;
    }
    const totalDigits = normalizedCountryCode.length + subscriberNumber.length;
    if (!normalizedCountryCode || normalizedCountryCode.length > 4 || totalDigits < 7 || totalDigits > 15) {
      setError("Enter a valid WhatsApp number with its country code.");
      return;
    }
    const message = defaultMessage.trim();
    if (!message) {
      setError("Enter a default message.");
      return;
    }
    if (!token || saving) return;

    setSaving(true);
    try {
      const result = await saveWebsiteSocialLinks({
        data: {
          token,
          websiteId: site.id,
          instagramUrl: site.instagram_url || null,
          gmailAddress: site.gmail_address || null,
          whatsappCountryCode: normalizedCountryCode,
          whatsappNumber: subscriberNumber,
          whatsappMessage: message,
        },
      });
      onSaved(result.website);
      setStatus("Saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save WhatsApp settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="aichat-card aichat-whatsapp-connect-card">
      <div className="aichat-panel-heading">
        <h3>{site.name || site.domain || "Website"}</h3>
        <span className="aichat-status-pill">{site.whatsapp_number ? "Added" : "Not added"}</span>
      </div>
      <div className="aichat-whatsapp-connect-fields">
        <div className="aichat-whatsapp-number-row">
          <label>
            Country code
            <select className="aichat-select" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              {!WEBSITE_PHONE_COUNTRY_CODES.some((country) => country.code === countryCode) && <option value={countryCode}>+{countryCode}</option>}
              {WEBSITE_PHONE_COUNTRY_CODES.map((country) => (
                <option key={country.name} value={country.code}>{country.flag} {country.name} (+{country.code})</option>
              ))}
            </select>
          </label>
          <label>
            Phone number
            <input className="aichat-input" type="tel" inputMode="tel" autoComplete="tel-national" value={phoneNumber} placeholder="e.g. 788123456" onChange={(event) => setPhoneNumber(event.target.value)} />
          </label>
        </div>
        <label className="aichat-whatsapp-default-message">
          Default message
          <textarea className="aichat-textarea" rows={3} maxLength={500} value={defaultMessage} placeholder="Hello! How can we help you today?" onChange={(event) => setDefaultMessage(event.target.value)} />
        </label>
      </div>
      {error && <p className="aichat-social-error" role="alert">{error}</p>}
      {status && <p className="aichat-social-success" role="status">{status}</p>}
      <button type="button" className="aichat-whatsapp-connect-save" disabled={saving || !phoneNumber.trim() || !defaultMessage.trim()} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
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
type ComposerUploadStatus = "uploading" | "ready" | "error";

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

function normalizeComposerAttachment(file: File): File {
  const extension = file.name.toLowerCase().split(".").pop() || "";
  const inferredTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: /(?:misma-)?voice-note-/i.test(file.name) ? "audio/webm" : "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    pdf: "application/pdf",
  };
  const inferredType = inferredTypes[extension];
  const currentType = file.type.toLowerCase();
  const isLegacyVoiceNoteWebm = extension === "webm" && /(?:misma-)?voice-note-/i.test(file.name);
  if (isLegacyVoiceNoteWebm && !currentType.startsWith("audio/")) {
    return new File([file], file.name, { type: "audio/webm", lastModified: file.lastModified });
  }
  const shouldInfer = !currentType || currentType === "application/octet-stream";
  if (!shouldInfer || !inferredType || inferredType === currentType) return file;
  return new File([file], file.name, { type: inferredType, lastModified: file.lastModified });
}

async function compressImageForUpload(file: File): Promise<File> {
  const supportedOriginal = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!file.type.startsWith("image/")) return file;
  if (supportedOriginal && file.size <= 4 * 1024 * 1024) {
    const dimensions = await createImageBitmap(file);
    const alreadySmall = Math.max(dimensions.width, dimensions.height) <= 1600;
    dimensions.close();
    if (alreadySmall) return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not compress the image.")), "image/jpeg", 0.85);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

async function uploadStorageObjectWithProgress(file: File, path: string, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<void> {
  const config = getSupabaseConfig();
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken || !config) throw new Error("Your sign-in session expired. Please sign in again.");
  if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const endpoint = config.url.replace(/\/$/, "") + "/storage/v1/object/misma-media/" + encodedPath;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const finish = (callback: () => void) => { if (settled) return; settled = true; cleanup(); callback(); };
    xhr.open("POST", endpoint, true);
    xhr.setRequestHeader("apikey", config.publishableKey);
    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("Cache-Control", "3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); finish(resolve); return; }
      let detail = "";
      try { const payload = JSON.parse(xhr.responseText) as { message?: string; error?: string }; detail = payload.message || payload.error || ""; } catch { /* use a generic storage error */ }
      finish(() => reject(new Error(detail || "Supabase Storage rejected the upload (HTTP " + xhr.status + ").")));
    };
    xhr.onerror = () => finish(() => reject(new Error("Network error while uploading " + file.name + ".")));
    xhr.onabort = () => finish(() => reject(new DOMException("Upload cancelled.", "AbortError")));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { xhr.abort(); return; }
    xhr.send(file);
  });
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

async function readDocxComposerPreview(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 22) throw new Error("This Word document is incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error("This is not a readable Word document.");
  const entryCount = view.getUint16(endRecord + 10, true);
  let cursor = view.getUint32(endRecord + 16, true);
  let documentXml: Uint8Array | null = null;
  for (let index = 0; index < entryCount && cursor + 46 <= bytes.length; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameEnd = cursor + 46 + nameLength;
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, nameEnd));
    if (name === "word/document.xml") {
      if (uncompressedSize > 10 * 1024 * 1024 || localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
        throw new Error("This Word document is too large or incomplete to preview.");
      }
      const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) throw new Error("This Word document is incomplete.");
      const compressed = bytes.subarray(dataStart, dataEnd);
      if (method === 0) documentXml = compressed.slice();
      else if (method === 8) {
        const buffer = new ArrayBuffer(compressed.byteLength);
        new Uint8Array(buffer).set(compressed);
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
        documentXml = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error("This Word document uses an unsupported compression method.");
      break;
    }
    cursor = nameEnd + extraLength + commentLength;
  }
  if (!documentXml) throw new Error("No readable text was found in this Word document.");
  return new TextDecoder().decode(documentXml)
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1_600);
}

function readComposerFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read " + file.name + " for preview."));
    reader.onabort = () => reject(new Error("Preview reading was cancelled."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The browser returned an invalid file preview."));
    };
    reader.readAsDataURL(file);
  });
}

async function readStoredProfileImage(blob: Blob, storagePath: string): Promise<string> {
  const path = storagePath.toLowerCase();
  const mimeType = blob.type.startsWith("image/")
    ? blob.type
    : path.endsWith(".png") ? "image/png"
    : path.endsWith(".webp") ? "image/webp"
    : "image/jpeg";
  const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const fileName = storagePath.split("/").pop() || "misma-profile.jpg";
  return readComposerFileAsDataUrl(new File([typedBlob], fileName, { type: mimeType }));
}

async function createComposerImageThumbnail(file: File): Promise<string> {
  // Decode the browser File and draw a small thumbnail. This avoids depending
  // on Android's temporary picker/blob URL after the upload request completes.
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare an image preview.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(outputType, 0.82);
  } finally {
    bitmap.close();
  }
}

async function prepareProfileAvatarForUpload(file: File): Promise<{ file: File; previewDataUrl: string }> {
  let source: CanvasImageSource;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file);
      source = bitmap;
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
    } catch {
      const imageDataUrl = await readComposerFileAsDataUrl(file);
      const fallbackImage = new Image();
      fallbackImage.src = imageDataUrl;
      await fallbackImage.decode();
      source = fallbackImage;
      sourceWidth = fallbackImage.naturalWidth;
      sourceHeight = fallbackImage.naturalHeight;
    }
    if (!sourceWidth || !sourceHeight) throw new Error("The selected profile photo could not be decoded.");
    const scale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the profile photo.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const outputType = file.type.toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not encode the selected profile photo.")),
        outputType,
        0.9,
      );
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "misma-profile";
    const outputName = baseName + (outputType === "image/png" ? ".png" : ".jpg");
    const normalizedFile = new File([blob], outputName, { type: outputType, lastModified: file.lastModified });
    return { file: normalizedFile, previewDataUrl: await readComposerFileAsDataUrl(normalizedFile) };
  } finally {
    bitmap?.close();
  }
}

function ComposerAttachmentPreview({
  file, previewUrl, uploadStatus, uploadProgress, onRemove, onRetry,
}: {
  file: File;
  previewUrl: string | null;
  uploadStatus: "uploading" | "ready" | "error";
  uploadProgress: number;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const lowerName = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)$/i.test(lowerName);
  const isAudio = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName);
  const isVideo = file.type.startsWith("video/") || (!file.type.startsWith("audio/") && /\.(mp4|mov|m4v|webm|mkv)$/i.test(lowerName));
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx");
  const isTextPreviewable = file.type.startsWith("text/") ||
    /\.(txt|md|csv|json|jsonl|xml|html|css|scss|js|jsx|ts|tsx|py|sql|sh|yaml|yml|toml|go|rs|java|kt|swift|c|cpp|h|hpp|php|rb|vue|svelte)$/i.test(lowerName);
  const extension = file.name.split(".").pop()?.slice(0, 6).toUpperCase() || "FILE";
  const sizeLabel = file.size < 1024 * 1024
    ? Math.max(1, Math.round(file.size / 1024)) + " KB"
    : (file.size / (1024 * 1024)).toFixed(1) + " MB";
  const isUploading = uploadStatus === "uploading";
  const isError = uploadStatus === "error";
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [videoPreviewError, setVideoPreviewError] = useState(false);
  const className = "aichat-composer-attachment-card" +
    (isImage ? " is-image" : isVideo ? " is-video" : isAudio ? " is-audio" : " is-file") + (isError ? " is-error" : "");

  useEffect(() => {
    let active = true;
    if (!isImage) {
      setImagePreview(null);
      setImagePreviewError(false);
      return () => { active = false; };
    }
    setImagePreview(null);
    setImagePreviewError(false);
    void (async () => {
      try {
        let preview: string;
        try {
          preview = await createComposerImageThumbnail(file);
        } catch {
          // FileReader is the compatibility fallback for browsers whose image
          // decoder cannot create an ImageBitmap for a selected format.
          preview = await readComposerFileAsDataUrl(file);
        }
        if (active) setImagePreview(preview);
      } catch {
        if (active) setImagePreviewError(true);
      }
    })();
    return () => { active = false; };
  }, [file, isImage]);

  useEffect(() => {
    let active = true;
    if (!isTextPreviewable && !isDocx) {
      setTextPreview(null);
      return () => { active = false; };
    }
    setTextPreview(null);
    void (async () => {
      try {
        const content = isDocx
          ? await readDocxComposerPreview(file)
          : await file.slice(0, 6_000).text();
        if (active) setTextPreview(content.trim() || "This file contains no readable text.");
      } catch {
        if (active) setTextPreview("A text preview is not available for this file.");
      }
    })();
    return () => { active = false; };
  }, [file, isTextPreviewable, isDocx]);

  return (
    <div className={className} title={file.name} aria-busy={isUploading}>
      <div className={"aichat-composer-attachment-square" + (!isImage && !isVideo ? " is-file" : "")}>
        {isImage ? (
          imagePreview && !imagePreviewError ? (
            <img
              className="aichat-composer-attachment-content-image"
              src={imagePreview}
              alt={file.name}
              decoding="async"
              loading="eager"
              fetchPriority="high"
              onError={() => setImagePreviewError(true)}
            />
          ) : (
            <div className="aichat-composer-preview-placeholder" role="status">
              {imagePreviewError ? extension : "Preparing image…"}
            </div>
          )
        ) : isVideo && previewUrl && !videoPreviewError ? (
          <video
            className="aichat-composer-attachment-content-video"
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            aria-label={file.name}
            onError={() => setVideoPreviewError(true)}
          />
        ) : isAudio && previewUrl ? (
          <audio className="aichat-composer-audio-player" src={previewUrl} controls preload="metadata" aria-label={"Play " + file.name} />
        ) : isPdf && previewUrl ? (
          <iframe className="aichat-composer-file-preview-pdf" src={previewUrl} title={"PDF preview: " + file.name} />
        ) : isTextPreviewable || isDocx ? (
          <pre className="aichat-composer-file-preview-text">
            {textPreview === null ? "Loading file content…" : textPreview}
          </pre>
        ) : (
          <div className="aichat-composer-file-card-copy">
            <span className="aichat-composer-file-icon" aria-hidden="true">{extension}</span>
            <span className="aichat-composer-file-details">
              <strong>{file.name}</strong>
              <small>{extension} · {sizeLabel}</small>
            </span>
          </div>
        )}

        {isUploading && (
          <div
            className={"aichat-composer-upload-state is-uploading" + (uploadProgress > 0 ? " is-determinate" : "")}
            role="progressbar"
            aria-label={"Uploading " + file.name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(0, Math.min(100, Math.round(uploadProgress * 100)))}
          >
            <svg className="aichat-composer-upload-ring" viewBox="0 0 28 28" aria-hidden="true">
              <circle className="aichat-composer-upload-track" cx="14" cy="14" r="11" />
              <circle
                className="aichat-composer-upload-progress"
                cx="14"
                cy="14"
                r="11"
                style={{ strokeDashoffset: 69.12 * (1 - Math.max(0, Math.min(1, uploadProgress))) }}
              />
            </svg>
          </div>
        )}
        {uploadStatus === "ready" && (
          <span className="aichat-composer-upload-state is-ready" role="status" aria-label={file.name + " uploaded"}>
            <i>✓</i>
          </span>
        )}
      </div>

      <span className="aichat-composer-attachment-name" title={file.name}>{file.name} · {sizeLabel}</span>
      <button type="button" className="aichat-composer-attachment-remove" aria-label={"Remove " + file.name} onClick={onRemove}>×</button>
      {isError && (
        <button
          type="button"
          className="aichat-composer-attachment-retry"
          aria-label={"Retry upload of " + file.name}
          title="Retry upload"
          onClick={onRetry}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" />
          </svg>
        </button>
      )}
    </div>
  );
}
function LibraryFilePreview({
  asset,
  onClose,
}: {
  asset: any;
  onClose: () => void;
}) {
  const mimeType = String(asset.mimeType || "").toLowerCase();
  const fileName = String(asset.name || "Workspace file");
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(fileName);
  const isVideo = mimeType.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(fileName);
  const isAudio = mimeType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(fileName);
  const isPdf = mimeType === "application/pdf" || extension === "pdf";
  const isText = mimeType.startsWith("text/") || ["json", "csv", "xml", "md", "log"].includes(extension);
  const size = Number(asset.size || 0);
  return (
    <div className="aichat-library-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="aichat-library-preview-dialog" role="dialog" aria-modal="true" aria-label={"Preview " + fileName}>
        <header className="aichat-library-preview-header">
          <div className="aichat-library-preview-title">
            <strong title={fileName}>{fileName}</strong>
            <small>{mimeType || asset.kind || "File"} · {size ? (size / (1024 * 1024)).toFixed(2) + " MB" : "Saved item"}</small>
          </div>
          <div className="aichat-library-preview-actions">
            <a href={asset.url} target="_blank" rel="noreferrer" download={fileName}>Download</a>
            <button type="button" aria-label="Close file preview" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="aichat-library-preview-body">
          {isImage ? (
            <img src={asset.url} alt={fileName} />
          ) : isVideo ? (
            <video src={asset.url} controls playsInline preload="metadata" />
          ) : isAudio ? (
            <audio src={asset.url} controls preload="metadata" />
          ) : isPdf || isText ? (
            <iframe src={asset.url} title={"Preview of " + fileName} sandbox={isPdf ? undefined : ""} />
          ) : (
            <div className="aichat-library-preview-unavailable">
              <span>▤</span>
              <strong>Preview is not available for this file type</strong>
              <p>Download the file to open it with a compatible app.</p>
              <a href={asset.url} target="_blank" rel="noreferrer" download={fileName}>Download {fileName}</a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function GeneratedImageActions({
  onDownload,
  onShare,
  onCrop,
  onCopy,
}: {
  onDownload?: () => void;
  onShare?: () => void;
  onCrop?: () => void;
  onCopy?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (action?: () => void) => {
    setMenuOpen(false);
    action?.();
  };

  return (
    <div className="aichat-image-options" onKeyDown={(event) => {
      if (event.key === "Escape") setMenuOpen(false);
    }}>
      <button
        type="button"
        className="aichat-image-more"
        title="Image options"
        aria-label="Image options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {menuOpen && (
        <div className="aichat-image-options-menu" role="menu" aria-label="Image actions">
          {onDownload && <button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); runAction(onDownload); }}><ActionIcon name="download" />Download image</button>}
          {onShare && <button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); runAction(onShare); }}><ActionIcon name="share" />Share image</button>}
          {onCrop && <button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); runAction(onCrop); }}><ActionIcon name="crop" />Crop image</button>}
          {onCopy && <button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); runAction(onCopy); }}><ActionIcon name="copy" />Copy image</button>}
        </div>
      )}
    </div>
  );
}

function MessageAttachmentViews({
  attachments,
  onDownload,
  onCrop,
  onShare,
  onCopy,
  onOpenImage,
  variant = "default",
}: {
  attachments?: MessageAttachment[];
  onDownload?: (attachment: MessageAttachment) => void;
  onCrop?: (attachment: MessageAttachment) => void;
  onShare?: (attachment: MessageAttachment) => void;
  onCopy?: (attachment: MessageAttachment) => void;
  onOpenImage: (attachment: MessageAttachment) => void;
  variant?: "default" | "user";
}) {
  if (!attachments?.length) return null;
  const visible = attachments.filter((item) => item.kind !== "video-frame" && item.kind !== "video-job" && item.url);
  if (!visible.length) return null;
  return (
    <div className={"aichat-message-attachments" + (variant === "user" ? " is-user-attachments" : "")}>
      {visible.map((item, index) => {
        const key = item.path || item.videoId || item.url || `${item.name}-${index}`;
        if (item.kind === "image" || item.kind === "generated-image" || item.mimeType?.startsWith("image/")) {
          const isGenerated = item.kind === "generated-image";
          return (
            <div key={key} className="aichat-generated-media-wrap is-image">
              <button type="button" className="aichat-attachment-image-link" onClick={() => onOpenImage(item)} aria-label={"Open image " + item.name}>
                <img className="aichat-attachment-image" src={item.url} alt={item.name} loading="eager" decoding="async" fetchPriority="high" />
              </button>
              {isGenerated && (
                <GeneratedImageActions
                  onDownload={onDownload ? () => onDownload(item) : undefined}
                  onShare={onShare ? () => onShare(item) : undefined}
                  onCrop={onCrop ? () => onCrop(item) : undefined}
                  onCopy={onCopy ? () => onCopy(item) : undefined}
                />
              )}
            </div>
          );
        }
        if (item.kind === "audio" || item.mimeType?.startsWith("audio/")) {
          return <div key={key} className="aichat-generated-media-wrap aichat-attachment-audio"><audio src={item.url} controls preload="metadata" aria-label={"Play " + item.name} /><span>{item.name}</span></div>;
        }
        if (item.kind === "video" || item.kind === "generated-video" || item.mimeType?.startsWith("video/")) {
          return <div key={key} className="aichat-generated-media-wrap"><video className="aichat-attachment-video" src={item.url} controls preload="metadata" />{item.kind === "generated-video" && onDownload && <button type="button" className="aichat-media-download" onClick={() => onDownload(item)}><ActionIcon name="download" /> Download video</button>}</div>;
        }
        return <a key={key} className="aichat-attachment-file" href={item.url} target="_blank" rel="noreferrer" download={item.name}>📎 {item.name}</a>;
      })}
    </div>
  );
}

function AttachmentImageLightbox({ attachment, onClose }: { attachment: MessageAttachment; onClose: () => void }) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  if (!attachment.url) return null;
  return <div className="aichat-attachment-lightbox" role="dialog" aria-modal="true" aria-label={"Image viewer: " + attachment.name}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onTouchStart={(event) => { const t = event.touches[0]; touchStart.current = { x: t.clientX, y: t.clientY }; }}
    onTouchEnd={(event) => { const start = touchStart.current; const t = event.changedTouches[0]; touchStart.current = null; if (start && (Math.abs(t.clientX - start.x) > 90 || Math.abs(t.clientY - start.y) > 90)) onClose(); }}>
    <button type="button" className="aichat-attachment-lightbox-close" onClick={onClose} aria-label="Close image viewer">×</button>
    <img src={attachment.url} alt={attachment.name} />
    <span className="aichat-attachment-lightbox-caption">{attachment.name}</span>
  </div>;
}
type MismaVoicePreset = "girl" | "woman" | "boy" | "man";

function getVoiceForPreset(voices: SpeechSynthesisVoice[], preset: MismaVoicePreset): SpeechSynthesisVoice | undefined {
  return getSpeechVoiceForPreset(voices, preset);
}
function getLoginGreeting(): string {
  const hour = new Date().getHours();
  const choices = hour < 12
    ? ["Good morning", "Morning", "Hey", "Hi there", "Welcome back", "Great to see you"]
    : hour < 18
      ? ["Good afternoon", "Hey there", "Hello", "Welcome back", "Great to see you", "Hi there"]
      : ["Good evening", "Hey", "Hello there", "Welcome back", "Good to see you", "Hi there"];
  let previous = "";
  try {
    previous = window.localStorage.getItem("misma_last_login_greeting") || "";
  } catch {
    // Use a fresh greeting for this session when storage is unavailable.
  }
  const candidates = choices.filter((choice) => choice !== previous);
  const greeting = (candidates.length ? candidates : choices)[Math.floor(Math.random() * (candidates.length || choices.length))];
  try {
    window.localStorage.setItem("misma_last_login_greeting", greeting);
  } catch {
    // Ignore storage restrictions; the greeting remains available in component state.
  }
  return greeting;
}

// Display assistant replies as clean text rather than exposing Markdown decoration.
function plainTextMessage(content: string): string {
  return content
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/^\s*(?:'''|""")([\s\S]*?)(?:'''|""")\s*$/gm, "$1")
    .replace(/^\s*(['"`]){3,}\s*$/gm, "")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*(?:[-*+•]|\d+[.)])\s+/g, "$1")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/~~([\s\S]*?)~~/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2")
    .replace(/(^|\n)\s*>+\s?/g, "$1")
    .replace(/^[ \t]*(?:-{3,}|_{3,}|\*{3,})[ \t]*$/gm, "")
    .replace(/^\s*\|?[-: ]+\|[-: |]+\s*$/gm, "")
    .replace(/[ \t]*\|[ \t]*/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function MarkdownContent({ content }: { content: string }) {
  const paragraphs = plainTextMessage(content).split(/\n\n+/);
  return (
    <div className="aichat-markdown">
      {paragraphs.map((paragraph, index) => (
        paragraph.trim()
          ? <p key={index} style={{ whiteSpace: "pre-wrap" }}>{paragraph.trim()}</p>
          : null
      ))}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [dashboardUserId, setDashboardUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const signingOutRef = useRef(false);
  const workspaceAssetsRequestStartedRef = useRef(false);
  const workspaceAssetsGenerationRef = useRef(0);
  const dashboardUserIdRef = useRef<string | null>(null);

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
  const [dashboardTabHistory, setDashboardTabHistory] = useState<TabId[]>([]);
  const previousDashboardTabRef = useRef<TabId>("workspace");
  const skipDashboardTabHistoryRef = useRef(false);

  useEffect(() => {
    const previousTab = previousDashboardTabRef.current;
    if (previousTab === activeTab) return;
    if (skipDashboardTabHistoryRef.current) {
      skipDashboardTabHistoryRef.current = false;
    } else {
      setDashboardTabHistory((history) => [...history, previousTab].slice(-40));
    }
    previousDashboardTabRef.current = activeTab;
  }, [activeTab]);

  const canGoBack = !staffMode && (activeTab !== "workspace" || dashboardTabHistory.length > 0);
  const handleDashboardBack = () => {
    const previousTab = dashboardTabHistory[dashboardTabHistory.length - 1];
    if (previousTab) {
      skipDashboardTabHistoryRef.current = true;
      setDashboardTabHistory((history) => history.slice(0, -1));
      setActiveTab(previousTab);
    } else if (activeTab !== "workspace") {
      setActiveTab("workspace");
    }
    setMobileMenuOpen(false);
  };
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({ workspace: false, manage: false, build: false, connect: false });
  const [greeting, setGreeting] = useState("Welcome back");
  const hasChosenGreetingRef = useRef(false);

  // Chats and tasks panel state
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [chatActionMenuId, setChatActionMenuId] = useState<number | null>(null);
  const [deleteChatTarget, setDeleteChatTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const [chatGroupMenuOpen, setChatGroupMenuOpen] = useState(false);
  const [libraryUploadBusy, setLibraryUploadBusy] = useState(false);
  const [libraryAssetMenuId, setLibraryAssetMenuId] = useState<string | null>(null);
  const [libraryPreviewAsset, setLibraryPreviewAsset] = useState<any>(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<any>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);
  const [chatGroupFilter, setChatGroupFilter] = useState("all");
  const [downloadingMediaUrl, setDownloadingMediaUrl] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<{ attachment: MessageAttachment; conversationId: number | null } | null>(null);
  const [cropAspect, setCropAspect] = useState<"original" | "square" | "portrait" | "landscape">("original");
  const [mediaActionStatus, setMediaActionStatus] = useState("");

  // Business and user data
  const [workspace, setWorkspace] = useState<any>(null);
  const [workspaceAssets, setWorkspaceAssets] = useState<any[]>([]);
  const [workspaceAssetsLoaded, setWorkspaceAssetsLoaded] = useState(false);
  const [workspaceAssetsLoading, setWorkspaceAssetsLoading] = useState(false);
  const [workspaceAssetsLoadError, setWorkspaceAssetsLoadError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [connectedWebsites, setConnectedWebsites] = useState<any[]>([]);
  const [humanHandoffs, setHumanHandoffs] = useState<any[]>([]);
  const [allNotifications, setAllNotifications] = useState<any[]>([]);
  const [selectedHumanRequestNotificationId, setSelectedHumanRequestNotificationId] = useState<number | null>(null);
  const [humanRequestMenuId, setHumanRequestMenuId] = useState<number | null>(null);
  const [humanRequestDeletingId, setHumanRequestDeletingId] = useState<number | null>(null);
  const [deleteRequestTarget, setDeleteRequestTarget] = useState<{ requestId: number | null; notificationId: number | null; visitorName: string } | null>(null);
  const [deleteRequestError, setDeleteRequestError] = useState("");
  const [staffMode, setStaffMode] = useState(false);
  const [staffTitle, setStaffTitle] = useState("");
  const [staffNameDraft, setStaffNameDraft] = useState("");
  const [staffEmailDraft, setStaffEmailDraft] = useState("");
  const [staffPasswordDraft, setStaffPasswordDraft] = useState("");
  const [staffAccountBusy, setStaffAccountBusy] = useState(false);
  const [staffAccountMessage, setStaffAccountMessage] = useState("");
  const [staffAccountError, setStaffAccountError] = useState("");
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [accountDeleteConfirmation, setAccountDeleteConfirmation] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState("");
  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [businessNameSaving, setBusinessNameSaving] = useState(false);
  const [businessNameSaved, setBusinessNameSaved] = useState(false);
  const [businessNameError, setBusinessNameError] = useState("");
  const [productsServices, setProductsServices] = useState<any[]>([]);
  const [channelConnections, setChannelConnections] = useState<any[]>([]);
  const [channelEnvironment, setChannelEnvironment] = useState({ whatsappConfigured: false, phoneConfigured: false });
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState("");
  const [channelBusy, setChannelBusy] = useState<string | null>(null);
  const [websiteActionId, setWebsiteActionId] = useState<string | null>(null);
  const [websiteScanFeedback, setWebsiteScanFeedback] = useState<Record<string, { kind: "success" | "error" | "info"; message: string }>>({});
  const [expandedWebsiteIds, setExpandedWebsiteIds] = useState<string[]>([]);
  const [sharedWidgetExpanded, setSharedWidgetExpanded] = useState(false);
  const sharedWidgetPublicKey = connectedWebsites.length
    ? connectedWebsites[0].widget_public_key || connectedWebsites[0].public_key
    : "";
  const everyWebsiteUsesSharedWidget = Boolean(sharedWidgetPublicKey) &&
    connectedWebsites.every((site) => (site.widget_public_key || site.public_key) === sharedWidgetPublicKey);
  const unreadHumanRequestNotificationCount = allNotifications.filter((notification) => notification.is_read !== true).length;
  const [knowledgeUploadBusy, setKnowledgeUploadBusy] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [websiteDraftUrl, setWebsiteDraftUrl] = useState("");
  const [websiteDraftName, setWebsiteDraftName] = useState("");
  const [sharedWebsiteWidget, setSharedWebsiteWidget] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("misma_shared_website_widget") === "true"; }
    catch { return false; }
  });
  const [productDraft, setProductDraft] = useState({ kind: "product", name: "", description: "", price: "" });
  const [unreadVisitorMessages, setUnreadVisitorMessages] = useState<UnreadVisitorMessage[]>([]);
  const [unreadVisitorCount, setUnreadVisitorCount] = useState(0);

  // Profile
  const [profileName, setProfileName] = useState("Your account");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const profileAvatarPathRef = useRef<string | null>(null);
  const [profileAvatarStoragePath, setProfileAvatarStoragePath] = useState<string | null>(null);
  const [profileAvatarPreparing, setProfileAvatarPreparing] = useState(false);
  const profileAvatarPreviewUrlRef = useRef<string | null>(null);
  const profileAvatarFallbackUrlRef = useRef<string | null>(null);
  const profileAvatarSelectionRef = useRef(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [staffTitleDraft, setStaffTitleDraft] = useState("");
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
  const [notificationPermissionMessage, setNotificationPermissionMessage] = useState("");
  const [humanRequestPushEnabled, setHumanRequestPushEnabled] = useState(false);
  const [humanRequestPushBusy, setHumanRequestPushBusy] = useState(false);
  const [humanRequestPushMessage, setHumanRequestPushMessage] = useState("");
  const notificationCursorRef = useRef({ initialized: false, latestId: 0 });
  const pushNotificationLinkHandledRef = useRef(false);
  const [privacyPreferences, setPrivacyPreferences] = useState({ useConversationHistory: true });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoicePreset, setSelectedVoicePreset] = useState<MismaVoicePreset>("woman");
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
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
      // Keep the stored defaults if previous device settings cannot be read.
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem("misma_ai_settings", JSON.stringify(aiSettings));
    } catch {
      // The existing AI defaults remain usable for the current session.
    }
  }, [aiSettings, settingsLoaded]);

  useEffect(() => {
    try {
      const savedAccent = localStorage.getItem("misma_accent_color");
      const savedNotifications = localStorage.getItem("misma_notification_preferences");
      const savedVoice = localStorage.getItem("misma_voice_preset") || localStorage.getItem("misma_voice_uri");
      const savedAutoSpeak = localStorage.getItem("misma_auto_speak_replies");
      const savedPrivacy = localStorage.getItem("misma_privacy_preferences");
      if (savedPrivacy) {
        const parsed = JSON.parse(savedPrivacy) as Partial<typeof privacyPreferences>;
        setPrivacyPreferences((current) => ({ ...current, ...parsed }));
      }
      if (savedAccent && /^#[0-9a-f]{6}$/i.test(savedAccent)) setAccentColor(savedAccent);
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications) as Partial<typeof notificationPreferences>;
        setNotificationPreferences((current) => ({ ...current, ...parsed }));
      }
      if (savedVoice === "girl" || savedVoice === "woman") setSelectedVoicePreset(savedVoice);
      else if (savedVoice === "boy" || savedVoice === "man") {
        setSelectedVoicePreset("woman");
        localStorage.setItem("misma_voice_preset", "woman");
        localStorage.removeItem("misma_voice_uri");
      }
      if (savedAutoSpeak === "true") setAutoSpeakReplies(true);
    } catch {
      // Keep accessible defaults if browser preferences cannot be read.
    } finally {
      setAppearanceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;
    // Accent Color is scoped exclusively to the background of the user's chat bubbles.
    document.documentElement.style.setProperty("--misma-user-message-bg", accentColor);
    document.documentElement.style.setProperty("--misma-user-message-text", getUserMessageTextColor(accentColor));
    try {
      localStorage.setItem("misma_accent_color", accentColor);
      localStorage.setItem("misma_notification_preferences", JSON.stringify(notificationPreferences));
      localStorage.setItem("misma_voice_preset", selectedVoicePreset);
      localStorage.setItem("misma_auto_speak_replies", String(autoSpeakReplies));
      localStorage.setItem("misma_privacy_preferences", JSON.stringify(privacyPreferences));
    } catch {
      // Preferences remain active for this session when storage is unavailable.
    }
  }, [accentColor, notificationPreferences, selectedVoicePreset, autoSpeakReplies, privacyPreferences, appearanceLoaded]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("misma_privacy_preferences");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<typeof privacyPreferences>;
        setPrivacyPreferences((current) => ({ ...current, ...parsed }));
      }
    } catch {
      // Keep privacy-preserving defaults when saved preferences cannot be read.
    }
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refreshVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  const toggleChatActivityNotifications = async () => {
    const currentlyEnabled = notificationPreferences.chatActivity;
    const supported = typeof window !== "undefined" && "Notification" in window;
    const needsPermissionPrompt = currentlyEnabled && supported && window.Notification.permission === "default";
    const enabling = !currentlyEnabled || needsPermissionPrompt;
    if (enabling) {
      if (!supported) {
        setNotificationPermissionMessage("This browser does not support desktop notifications. Your preference is saved, but alerts will not appear here.");
      } else {
        let permission = window.Notification.permission;
        if (permission === "default") permission = await window.Notification.requestPermission();
        if (permission !== "granted") {
          setNotificationPermissionMessage("Allow Misma notifications in your browser's site settings to receive new chat alerts.");
          setNotificationPreferences((current) => ({ ...current, chatActivity: false }));
          return;
        }
        setNotificationPermissionMessage("Browser notifications are enabled for new visitor messages.");
      }
    } else {
      setNotificationPermissionMessage("Browser notifications are paused.");
    }
    setNotificationPreferences((current) => ({ ...current, chatActivity: enabling }));
  };

  // Chat conversation state
  const [currentConversationId, setCurrentConversationId] = useState<
    number | null
  >(null);
  const [viewStateRestored, setViewStateRestored] = useState(false);
  const [pendingRestoreConversationId, setPendingRestoreConversationId] = useState<number | null>(null);
  const [dashboardDataLoaded, setDashboardDataLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitorIsTyping, setVisitorIsTyping] = useState(false);

  // Restore the last dashboard section and selected chat after a full browser refresh.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("misma_dashboard_view_v1");
      if (saved) {
        const parsed = JSON.parse(saved) as { activeTab?: unknown; conversationId?: unknown };
        const validTabs: TabId[] = [
          "workspace", "website-statistics", "websites", "customers", "notifications",
          "products", "build", "knowledge", "connect", "phone", "website-connect",
          "whatsapp", "images", "library", "manage", "settings",
        ];
        if (typeof parsed.activeTab === "string" && validTabs.includes(parsed.activeTab as TabId)) {
          setActiveTab(parsed.activeTab as TabId);
        }
        const conversationId = Number(parsed.conversationId);
        if (Number.isSafeInteger(conversationId) && conversationId > 0) {
          setCurrentConversationId(conversationId);
          setPendingRestoreConversationId(conversationId);
        }
      }
    } catch {
      // Ignore malformed or unavailable browser storage and use the default dashboard view.
    } finally {
      setViewStateRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!viewStateRestored) return;
    try {
      localStorage.setItem("misma_dashboard_view_v1", JSON.stringify({
        activeTab,
        conversationId: currentConversationId,
      }));
    } catch {
      // Keep the current view for this session when browser storage is unavailable.
    }
  }, [activeTab, currentConversationId, viewStateRestored]);
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
  const [mobileActionMessageId, setMobileActionMessageId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [thinkHarder, setThinkHarder] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const selectedComposerFilesRef = useRef<File[]>([]);
  const composerPreviewUrlsRef = useRef<Map<File, string>>(new Map());
  const uploadAbortControllersRef = useRef<Map<File, AbortController>>(new Map());
  const uploadedComposerAttachmentsRef = useRef<Map<File, MessageAttachment[]>>(new Map());
  const attachmentUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [composerUploadStatuses, setComposerUploadStatuses] = useState<Map<File, "uploading" | "ready" | "error">>(new Map());
  const [composerUploadProgress, setComposerUploadProgress] = useState<Map<File, number>>(new Map());
  const [lightboxAttachment, setLightboxAttachment] = useState<MessageAttachment | null>(null);
  const [, setUploadingAttachments] = useState(false);
  const [createMode, setCreateMode] = useState<"image" | "video" | null>(null);
  const [mediaProgress, setMediaProgress] = useState("");
  const [mediaProgressPercent, setMediaProgressPercent] = useState(0);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [failedMediaRetry, setFailedMediaRetry] = useState<{
    mode: "image" | "video";
    prompt: string;
    conversationId: number;
    sourceUserMessageId: number;
  } | null>(null);


  // Forms in other tabs
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [knowledgeWebsiteId, setKnowledgeWebsiteId] = useState("");
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

  const supabaseApiBase = (() => {
    const url = getSupabaseConfig()?.url || "";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  })();
  const handoffConversationIds = new Set(humanHandoffs.map((request) => Number(request.conversation_id)).filter((id) => Number.isSafeInteger(id) && id > 0));
  const recentChats = conversations
    .filter((item) => String(item.channel || "").trim().toLowerCase() === "dashboard" && !handoffConversationIds.has(Number(item.id)))
    .map((item) => ({ ...item, name: cleanRecentChatTitle(item.name) || "New chat" }));
  const conversationGroups = Array.from(new Set(recentChats.map((item) => item.group_name).filter((value): value is string => Boolean(value))));
  const filteredRecentChats = chatGroupFilter === "all"
    ? recentChats
    : chatGroupFilter === "__ungrouped__"
      ? recentChats.filter((item) => !item.group_name)
      : recentChats.filter((item) => item.group_name === chatGroupFilter);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileMessageActionTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knowledgeFileInputRef = useRef<HTMLInputElement>(null);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const regenerateInFlightRef = useRef(false);
  const chatLongPressTimerRef = useRef<number | null>(null);
  const chatLongPressTriggeredRef = useRef(false);
  const chatViewVersionRef = useRef(0);
  const activeConversationIdRef = useRef<number | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const mediaAbortControllerRef = useRef<AbortController | null>(null);


  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 120;
  };

  // Save desktop sidebar preference and close all flyout groups when collapsing.
  const toggleDesktopSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    localStorage.setItem("misma_sidebar_open", String(next));

    if (!next) {
      setExpandedNavGroups({
        workspace: false,
        manage: false,
        build: false,
        connect: false,
      });
    }
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
          // Auth links are handled by public landing routes and must never be
          // hijacked by dashboard session navigation.
          if (
            typeof window !== "undefined" &&
            ["/reset-password", "/auth/confirmed", "/auth/confirm"].includes(window.location.pathname)
          ) return;
          if (!session) {
            profileAvatarPathRef.current = null;
            profileAvatarPreviewUrlRef.current = null;
            setProfileAvatarStoragePath(null);
            setProfileImage("");
            setDashboardUserId(null);
            dashboardUserIdRef.current = null;
            try {
              sessionStorage.removeItem("misma_id_token");
              sessionStorage.removeItem("misma_email");
            } catch {
              // Ignore storage restrictions during sign-out.
            }
            setWorkspace(null);
            setConversations([]);
            setUnreadVisitorMessages([]);
            setUnreadVisitorCount(0);
            setOrders([]);
            setKnowledgeList([]);
            setCustomers([]);
            setConnectedWebsites([]);
            setHumanHandoffs([]);
            setAllNotifications([]);
            setProductsServices([]);
            setChannelConnections([]);
            setDashboardDataLoaded(false);
            activeConversationIdRef.current = null;
            setCurrentConversationId(null);
            setPendingRestoreConversationId(null);
            setMessages([]);
            setWorkspaceAssets([]);
            setWorkspaceAssetsLoaded(false);
            setWorkspaceAssetsLoading(false);
            workspaceAssetsGenerationRef.current += 1;
            workspaceAssetsRequestStartedRef.current = false;
            setToken(null);
            setAuthChecked(true);
            if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
              navigate({ to: "/login", replace: true });
            }
            return;
          }

          const s = session;
          if (dashboardUserIdRef.current !== s.user.id) {
            if (dashboardUserIdRef.current) {
              // Never show another account's locally cached dashboard while the new
              // account's workspace is being fetched.
              activeConversationIdRef.current = null;
              setCurrentConversationId(null);
              setPendingRestoreConversationId(null);
              setMessages([]);
              setWorkspace(null);
              setConversations([]);
              setUnreadVisitorMessages([]);
              setUnreadVisitorCount(0);
              setOrders([]);
              setKnowledgeList([]);
              setCustomers([]);
              setConnectedWebsites([]);
              setHumanHandoffs([]);
              setAllNotifications([]);
              setProductsServices([]);
              setChannelConnections([]);
              setDashboardDataLoaded(false);
            }
            dashboardUserIdRef.current = s.user.id;
            workspaceAssetsGenerationRef.current += 1;
            workspaceAssetsRequestStartedRef.current = false;
            setWorkspaceAssets([]);
            setWorkspaceAssetsLoaded(false);
            setWorkspaceAssetsLoading(false);
            setWorkspaceAssetsLoadError("");
          }
          sessionStorage.setItem("misma_id_token", s.access_token);
          if (s.user.email) sessionStorage.setItem("misma_email", s.user.email);
          setDashboardUserId(s.user.id);
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
          if (!hasChosenGreetingRef.current) {
            setGreeting(getLoginGreeting());
            hasChosenGreetingRef.current = true;
          }
          setProfileName(resolvedName);
          setProfileNameDraft(resolvedName);
          const avatarPath = typeof metadata.avatar_path === "string" && metadata.avatar_path.length > 0 ? metadata.avatar_path : null;
          const avatarPathChanged = profileAvatarPathRef.current !== avatarPath;
          profileAvatarPathRef.current = avatarPath;
          if (avatarPathChanged) {
            setProfileAvatarStoragePath(avatarPath);
            if (!avatarPath) setProfileImage(image ?? "");
          } else if (!avatarPath) {
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

  useEffect(() => {
    const path = profileAvatarStoragePath;
    if (!path) return;
    let active = true;
    void (async () => {
      const { data: avatarBlob, error } = await getSupabaseClient().storage.from("misma-media").download(path);
      if (error || !avatarBlob) throw error || new Error("The saved profile photo could not be downloaded.");
      const dataUrl = await readStoredProfileImage(avatarBlob, path);
      if (active) setProfileImage(dataUrl);
    })().catch((cause) => {
      console.warn("[misma] Could not load the saved profile photo.", cause);
      // Keep a newly selected preview visible if the persisted copy is temporarily unavailable.
    });
    return () => { active = false; };
  }, [profileAvatarStoragePath]);

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

  // All calls to the public widget function use a real signed-in workspace token.
  const callWidgetFunction = async (payload: Record<string, unknown>, signal?: AbortSignal) => {
    const config = getSupabaseConfig();
    if (!token || !config) throw new Error("Your Misma workspace session or Supabase configuration is unavailable.");
    const baseUrl = config.url.endsWith("/") ? config.url.slice(0, -1) : config.url;
    const response = await fetch(`${baseUrl}/functions/v1/misma-widget`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, workspaceId: payload.workspaceId || workspace?.id }),
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || `Misma integration request failed (${response.status}).`);
    return result;
  };


  const toggleHumanRequestPushNotifications = async () => {
    if (humanRequestPushBusy) return;
    const supported = typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    if (!supported) {
      setHumanRequestPushMessage("This browser does not support background push notifications. Human requests will still appear in Misma's notification centre.");
      return;
    }

    setHumanRequestPushBusy(true);
    setHumanRequestPushMessage("");
    try {
      if (humanRequestPushEnabled) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await callWidgetFunction({ action: "delete-push-subscription", endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setHumanRequestPushEnabled(false);
        setHumanRequestPushMessage("Human request alerts are disabled on this device.");
        return;
      }

      // Permission is requested only in response to this explicit user action.
      const permission = window.Notification.permission === "default"
        ? await window.Notification.requestPermission()
        : window.Notification.permission;
      if (permission !== "granted") {
        setHumanRequestPushMessage("Allow Misma notifications in your browser's site settings, then enable alerts again.");
        return;
      }

      const vapid = await callWidgetFunction({ action: "push-public-key" });
      if (typeof vapid.publicKey !== "string" || !vapid.publicKey) {
        throw new Error("Misma could not prepare the push notification service. Try again.");
      }
      const normalizedKey = vapid.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const decodedKey = window.atob(normalizedKey + "=".repeat((4 - normalizedKey.length % 4) % 4));
      const applicationServerKey = new Uint8Array(decodedKey.length);
      for (let index = 0; index < decodedKey.length; index += 1) {
        applicationServerKey[index] = decodedKey.charCodeAt(index);
      }

      const registration = await navigator.serviceWorker.register("/misma-push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
      try {
        await callWidgetFunction({
          action: "save-push-subscription",
          subscription: subscription.toJSON(),
        });
      } catch (cause) {
        if (!existingSubscription) await subscription.unsubscribe().catch(() => false);
        throw cause;
      }
      setHumanRequestPushEnabled(true);
      setHumanRequestPushMessage("Human request alerts are enabled on this device, including when Misma is closed.");
    } catch (cause) {
      setHumanRequestPushMessage(cause instanceof Error ? cause.message : "Could not update push notifications on this device.");
    } finally {
      setHumanRequestPushBusy(false);
    }
  };

  useEffect(() => {
    if (!dashboardDataLoaded || !token || !workspace?.id || !("serviceWorker" in navigator)) {
      if (!dashboardDataLoaded || !token) setHumanRequestPushEnabled(false);
      return;
    }
    let cancelled = false;
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const scriptUrl = registration?.active?.scriptURL || registration?.waiting?.scriptURL || "";
      if (!registration || !scriptUrl.endsWith("/misma-push-sw.js") || window.Notification?.permission !== "granted") return;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await callWidgetFunction({ action: "save-push-subscription", subscription: subscription.toJSON() });
      if (!cancelled) setHumanRequestPushEnabled(true);
    }).catch((cause) => {
      console.warn("[misma] Could not restore this device's push subscription:", cause);
    });
    return () => { cancelled = true; };
  }, [dashboardDataLoaded, token, workspace?.id]);

  // Load workspace and dashboard data
  useEffect(() => {
    if (!dashboardDataLoaded) return;
    const latestId = unreadVisitorMessages.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const cursor = notificationCursorRef.current;
    if (!cursor.initialized) {
      cursor.initialized = true;
      cursor.latestId = latestId;
      return;
    }
    const newMessages = unreadVisitorMessages.filter((item) => Number(item.id) > cursor.latestId);
    cursor.latestId = Math.max(cursor.latestId, latestId);
    if (!notificationPreferences.chatActivity || !newMessages.length || typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const latest = newMessages.reduce((current, item) => Number(item.id) > Number(current.id) ? item : current);
    const notification = new window.Notification("New Misma chat message", {
      body: (latest.conversationTitle ? latest.conversationTitle + ": " : "") + latest.text.slice(0, 140),
      tag: "misma-visitor-message-" + latest.id,
    });
    notification.onclick = () => {
      window.focus();
      setActiveTab("notifications");
      notification.close();
    };
  }, [dashboardDataLoaded, unreadVisitorMessages, notificationPreferences.chatActivity]);

  const applyDashboardData = (data: any, refreshChannelStatus = true) => {
    const supportMode = data.accessMode === "support";
    setStaffMode(supportMode);
    setStaffTitle(supportMode ? String(data.staffTitle || "Customer support") : "");
    setWorkspace(data.workspace);
    setBusinessNameDraft(String(data.workspace?.name || ""));
    setConversations(supportMode ? [] : data.conversations ?? []);
    setUnreadVisitorMessages(supportMode ? [] : data.unreadVisitorMessages ?? []);
    setUnreadVisitorCount(supportMode ? 0 : data.unreadVisitorCount ?? 0);
    setOrders(supportMode ? [] : data.orders ?? []);
    setKnowledgeList(supportMode ? [] : data.knowledge ?? []);
    setCustomers(data.customers ?? []);
    setConnectedWebsites(supportMode ? [] : data.websites ?? []);
    setHumanHandoffs(data.handoffs ?? []);
    setAllNotifications(data.notifications ?? []);
    setProductsServices(supportMode ? [] : data.products ?? []);
    setChannelConnections(supportMode ? [] : data.channelConnections ?? []);
    if (supportMode) {
      activeConversationIdRef.current = null;
      setCurrentConversationId(null);
      setPendingRestoreConversationId(null);
      setMessages([]);
      setWorkspaceAssets([]);
      setWorkspaceAssetsLoaded(false);
      setActiveTab("customers");
      setChatActionMenuId(null);
      setProfileMenuOpen(false);
    }

    if (refreshChannelStatus && !supportMode && data.workspace?.id) {
      void callWidgetFunction({ action: "connection-status", workspaceId: data.workspace.id })
        .then((status) => setChannelEnvironment({
          whatsappConfigured: Boolean(status.whatsappConfigured),
          phoneConfigured: Boolean(status.phoneConfigured),
        }))
        .catch((cause) => console.warn("Could not read channel configuration status:", cause));
    }

    if (data.workspace) {
      setProfileForm({
        name: data.workspace.name || "",
        location: data.workspace.location || "",
        description: data.workspace.description || "",
        openingHours: data.workspace.opening_hours || "",
        primaryLanguage: data.workspace.primary_language || "English",
      });
    }
  };

  // Paint the most recent authenticated dashboard snapshot before the async
  // Supabase auth listener completes. A reload should not blank recents or badges
  // while the server refresh runs in the background.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedToken = sessionStorage.getItem("misma_id_token") || "";
      const encodedPayload = storedToken.split(".")[1];
      if (!encodedPayload) return;
      const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
      const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
      const claims = JSON.parse(window.atob(paddedPayload)) as { sub?: unknown; exp?: unknown };
      const userId = typeof claims.sub === "string" ? claims.sub : "";
      if (!userId || (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now())) return;

      const cacheKey = "misma_dashboard_bootstrap_v1_" + userId;
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached?.version !== 1 || !cached?.data || !Array.isArray(cached.data.conversations)) return;
      if (dashboardUserIdRef.current && dashboardUserIdRef.current !== userId) return;

      dashboardUserIdRef.current = userId;
      setDashboardUserId(userId);
      applyDashboardData(cached.data, false);
      setDashboardDataLoaded(true);
    } catch {
      // Expired or unavailable local snapshots must never block live authentication.
    }
  }, []);

  const loadData = () => {
    if (!token) return;
    setLoadError("");

    // Rehydrate the previous authenticated session's non-media dashboard snapshot
    // immediately, then refresh it from Supabase in the background.
    const cacheKey = dashboardUserId ? "misma_dashboard_bootstrap_v1_" + dashboardUserId : "";
    let hasCachedDashboard = false;
    if (cacheKey) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (cached?.version === 1 && cached?.data && Array.isArray(cached.data.conversations)) {
          applyDashboardData(cached.data, false);
          setDashboardDataLoaded(true);
          hasCachedDashboard = true;
        }
      } catch {
        try { sessionStorage.removeItem(cacheKey); } catch { /* Ignore unavailable session storage. */ }
      }
    }
    if (!hasCachedDashboard) setDashboardDataLoaded(false);

    getMismaData({ data: { token } })
      .then((data) => {
        applyDashboardData(data, true);
        if (cacheKey) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              version: 1,
              savedAt: Date.now(),
              data: {
                workspace: data.workspace,
                accessMode: data.accessMode || "owner",
                staffTitle: data.staffTitle || null,
                conversations: data.conversations ?? [],
                orders: data.orders ?? [],
                knowledge: data.knowledge ?? [],
                customers: data.customers ?? [],
                websites: data.websites ?? [],
                handoffs: data.handoffs ?? [],
                notifications: data.notifications ?? [],
                products: data.products ?? [],
                channelConnections: data.channelConnections ?? [],
                unreadVisitorMessages: data.unreadVisitorMessages ?? [],
                unreadVisitorCount: data.unreadVisitorCount ?? 0,
              },
            }));
          } catch {
            // Session storage has a browser quota; live API data remains available.
          }
        }
        setDashboardDataLoaded(true);
      })
      .catch((cause) => {
        setLoadError(cause instanceof Error ? cause.message : "Could not load your Misma workspace.");
        setDashboardDataLoaded(true);
      });
  };

  useEffect(() => {
    if (!authChecked || !token) return;
    loadData();
  }, [authChecked, token, dashboardUserId]);

  const openHumanRequestNotification = async (notification: any) => {
    const notificationId = Number(notification.id);
    setSelectedHumanRequestNotificationId((current) => current === notificationId ? null : notificationId);
    if (notification.is_read === true || !token) return;
    setAllNotifications((current) => current.map((item) =>
      Number(item.id) === notificationId ? { ...item, is_read: true } : item
    ));
    try {
      await markHumanRequestNotificationRead({ data: { token, notificationId } });
    } catch (cause) {
      setAllNotifications((current) => current.map((item) =>
        Number(item.id) === notificationId ? { ...item, is_read: false } : item
      ));
      console.warn("Could not mark the human request notification as read:", cause);
    }
  };


  useEffect(() => {
    if (!dashboardDataLoaded || pushNotificationLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "notifications") {
      setActiveTab("notifications");
      const notificationId = Number(params.get("notificationId"));
      if (Number.isSafeInteger(notificationId) && notificationId > 0) {
        const notification = allNotifications.find((item) => Number(item.id) === notificationId);
        if (notification) void openHumanRequestNotification(notification);
        else setSelectedHumanRequestNotificationId(notificationId);
      }
      params.delete("tab");
      params.delete("notificationId");
      const remainingQuery = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + (remainingQuery ? "?" + remainingQuery : "") + window.location.hash,
      );
    }
    pushNotificationLinkHandledRef.current = true;
  }, [dashboardDataLoaded, allNotifications]);

  const refreshVisitorNotifications = () => {
    if (!token) return;
    Promise.all([
      getVisitorNotifications({ data: { token } }),
      getWorkspaceLiveUpdates({ data: { token } }),
    ])
      .then(([visitorData, liveData]) => {
        setUnreadVisitorMessages(visitorData.unreadVisitorMessages ?? []);
        setUnreadVisitorCount(visitorData.unreadVisitorCount ?? 0);
        setConnectedWebsites(liveData.websites ?? []);
        setHumanHandoffs(liveData.handoffs ?? []);
        setAllNotifications(liveData.notifications ?? []);
        setCustomers(liveData.customers ?? []);
        setChannelConnections(liveData.channelConnections ?? []);
        setConversations((current) => {
          const previous = new Map(current.map((item: any) => [Number(item.id), item]));
          return (liveData.conversations ?? []).map((item: any) => {
            const existing = previous.get(Number(item.id));
            return {
              ...existing,
              id: item.id,
              channel: item.channel,
              text: item.latest_text || existing?.text || "",
              status: item.status,
              updated_at: item.updated_at,
              group_name: item.group_name ?? null,
              name: existing?.name || (item.channel === "Website" ? "Website visitor" : item.channel === "WhatsApp" ? "WhatsApp customer" : item.channel === "Phone" ? "Phone caller" : "New chat"),
            };
          });
        });
      })
      .catch((cause) => {
        console.warn("Could not refresh workspace visitor activity:", cause);
      });
  };

  useEffect(() => {
    if (!token || !dashboardDataLoaded || (activeTab !== "images" && activeTab !== "library")) return;
    if (workspaceAssetsLoaded || workspaceAssetsRequestStartedRef.current) return;

    workspaceAssetsRequestStartedRef.current = true;
    const generation = workspaceAssetsGenerationRef.current;
    setWorkspaceAssetsLoading(true);
    setWorkspaceAssetsLoadError("");
    void getWorkspaceAssets({ data: { token } })
      .then((result) => {
        if (generation !== workspaceAssetsGenerationRef.current) return;
        setWorkspaceAssets(result.assets ?? []);
        setWorkspaceAssetsLoaded(true);
      })
      .catch((cause) => {
        if (generation !== workspaceAssetsGenerationRef.current) return;
        setWorkspaceAssetsLoadError(cause instanceof Error ? cause.message : "Could not load your saved files.");
      })
      .finally(() => {
        if (generation === workspaceAssetsGenerationRef.current) setWorkspaceAssetsLoading(false);
      });
  }, [token, dashboardDataLoaded, activeTab, workspaceAssetsLoaded]);

  useEffect(() => {
    if (!authChecked || !token) return;
    const refreshId = window.setInterval(refreshVisitorNotifications, 8000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshVisitorNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authChecked, token]);

  useEffect(() => () => clearMobileMessageActionTimer(), []);

  // Follow the visual viewport so the composer remains above the on-screen keyboard on phones.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateMobileViewport = () => {
      if (window.innerWidth < 768) {
        document.documentElement.style.setProperty(
          "--misma-mobile-viewport-height",
          `${Math.round(viewport.height)}px`,
        );
      } else {
        document.documentElement.style.removeProperty("--misma-mobile-viewport-height");
      }
    };
    updateMobileViewport();
    viewport.addEventListener("resize", updateMobileViewport);
    viewport.addEventListener("scroll", updateMobileViewport);
    window.addEventListener("orientationchange", updateMobileViewport);
    return () => {
      viewport.removeEventListener("resize", updateMobileViewport);
      viewport.removeEventListener("scroll", updateMobileViewport);
      window.removeEventListener("orientationchange", updateMobileViewport);
      document.documentElement.style.removeProperty("--misma-mobile-viewport-height");
    };
  }, []);

  // Measure from the natural content height on every edit so CSS constraints cannot
  // leave the composer stuck at its empty height (especially after mobile keyboard resize).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.height = "auto";
      const maxHeight = Math.min(190, window.innerWidth < 768 ? Math.round(window.innerHeight * 0.34) : 190);
      const contentHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.max(38, Math.min(contentHeight, maxHeight))}px`;
      textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    };
    const frame = window.requestAnimationFrame(resize);
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [draft]);

  // Auto-scroll message list to bottom when appropriate
  useEffect(() => {
    if (!dashboardUserId || currentConversationId === null || activeConversationIdRef.current !== currentConversationId) return;
    try {
      sessionStorage.setItem("misma_active_chat_messages_v2_" + dashboardUserId, JSON.stringify({
        conversationId: currentConversationId,
        messages: messages.slice(-120),
        savedAt: Date.now(),
      }));
    } catch {
      // Keep chat history on the server if the tab's storage quota is full.
    }
  }, [dashboardUserId, currentConversationId, messages]);

  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Load messages when selecting a conversation
  const selectConversation = async (
    convId: number,
    options: { activateWorkspace?: boolean; isRestore?: boolean } = {},
  ) => {
    if (!token || staffMode) return;
    if (!options.isRestore) setPendingRestoreConversationId(null);
    chatViewVersionRef.current += 1;
    const conversationLoadVersion = chatViewVersionRef.current;
    activeConversationIdRef.current = convId;
    const conversationCacheKey = dashboardUserId
      ? "misma_active_chat_messages_v2_" + dashboardUserId
      : "";
    let hasCachedConversationMessages = false;
    if (conversationCacheKey) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(conversationCacheKey) || "null");
        if (Number(cached?.conversationId) === convId && Array.isArray(cached?.messages)) {
          setMessages(cached.messages);
          hasCachedConversationMessages = true;
        }
      } catch {
        try { sessionStorage.removeItem(conversationCacheKey); } catch { /* Ignore unavailable session storage. */ }
      }
    }
    if (!hasCachedConversationMessages) setMessages([]);
    setChatActionMenuId(null);
    setCurrentConversationId(convId);
    setVisitorIsTyping(false);
    if (options.activateWorkspace !== false) setActiveTab("workspace");
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
      if (conversationLoadVersion !== chatViewVersionRef.current || activeConversationIdRef.current !== convId) return;
      setMessages(res.messages);
      const unreadForConversation = unreadVisitorMessages.filter((item) => item.conversationId === convId).length;
      if (unreadForConversation > 0) {
        try {
          const readResult = await markVisitorMessagesRead({ data: { token, conversationId: convId } });
          setUnreadVisitorMessages((items) => items.filter((item) => item.conversationId !== convId));
          setUnreadVisitorCount((count) => Math.max(0, count - readResult.markedCount));
        } catch (readError) {
          console.warn("Could not update the visitor message read state:", readError);
        }
      }
    } catch (cause) {
      setChatError(
        cause instanceof Error ? cause.message : "Could not load messages.",
      );
    }
  };

  // Reload the previously selected conversation only after workspace data is available.
  useEffect(() => {
    if (
      !viewStateRestored ||
      !authChecked ||
      !token ||
      !dashboardDataLoaded ||
      pendingRestoreConversationId === null
    ) return;

    const savedConversationExists = conversations.some(
      (conversation: any) => Number(conversation.id) === pendingRestoreConversationId,
    );

    if (savedConversationExists) {
      void selectConversation(pendingRestoreConversationId, {
        activateWorkspace: false,
        isRestore: true,
      });
    } else {
      setCurrentConversationId(null);
      activeConversationIdRef.current = null;
      setMessages([]);
    }
    setPendingRestoreConversationId(null);
  }, [
    viewStateRestored,
    authChecked,
    token,
    dashboardDataLoaded,
    pendingRestoreConversationId,
    conversations,
  ]);

  // Start a fresh new chat
  const handleNewChat = () => {
    chatViewVersionRef.current += 1;
    activeConversationIdRef.current = null;
    setChatActionMenuId(null);
    setCurrentConversationId(null);
    setVisitorIsTyping(false);
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
      setChatActionMenuId(null);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update this chat group.");
    }
  };

  const handleCreateConversationGroup = (conversationId: number) => {
    const value = window.prompt("Enter a group name for this chat:");
    const groupName = value?.trim().slice(0, 60);
    if (groupName) void handleSetConversationGroup(conversationId, groupName);
    setChatActionMenuId(null);
  };

  const startChatLongPress = (conversationId: number) => {
    if (chatLongPressTimerRef.current !== null) window.clearTimeout(chatLongPressTimerRef.current);
    chatLongPressTriggeredRef.current = false;
    chatLongPressTimerRef.current = window.setTimeout(() => {
      chatLongPressTriggeredRef.current = true;
      setChatActionMenuId(conversationId);
    }, 520);
  };

  const cancelChatLongPress = () => {
    if (chatLongPressTimerRef.current !== null) {
      window.clearTimeout(chatLongPressTimerRef.current);
      chatLongPressTimerRef.current = null;
    }
  };

  const handleDeleteConversation = async (convId: number) => {
    if (!token || deletingChat) return;
    setDeletingChat(true);
    try {
      await deleteConversation({ data: { token, conversationId: convId } });
      if (activeConversationIdRef.current === convId) handleNewChat();
      setDeleteChatTarget(null);
      setChatActionMenuId(null);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not delete conversation.");
    } finally {
      setDeletingChat(false);
    }
  };

  const handleDeleteLibraryAsset = async (asset: any) => {
    if (!token || deletingAsset) return;
    setDeletingAsset(true);
    try {
      if (asset.libraryFileId) {
        await deleteWorkspaceLibraryFile({ data: { token, id: String(asset.libraryFileId) } });
      } else {
        await deleteChatAttachment({
          data: {
            token,
            conversationId: Number(asset.conversationId),
            messageId: Number(asset.messageId),
            ...(asset.path ? { path: asset.path } : { url: asset.url }),
          },
        });
        setMessages((current) => current.map((message) => Number(message.id) === Number(asset.messageId)
          ? { ...message, attachments: (message.attachments || []).filter((attachment) => asset.path ? attachment.path !== asset.path : attachment.url !== asset.url) }
          : message));
      }
      setDeleteAssetTarget(null);
      setLibraryAssetMenuId(null);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not delete this library item.");
    } finally {
      setDeletingAsset(false);
    }
  };

  const handleLibraryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !token || !workspace?.id || libraryUploadBusy) return;
    const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      alert(oversized.name + " is larger than 25 MB.");
      return;
    }
    setLibraryUploadBusy(true);
    try {
      const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
      if (userError || !userData.user) throw new Error("Your sign-in session expired. Please sign in again.");
      const client = getSupabaseClient();
      const uploadOne = async (file: File) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload";
        const path = `${workspace.id}/${userData.user.id}/library-${crypto.randomUUID()}-${safeName}`;
        const { error } = await client.storage.from("misma-media").upload(path, file, {
          upsert: false,
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
        try {
          await createWorkspaceLibraryFile({ data: {
            token, path, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size,
          } });
        } catch (cause) {
          await client.storage.from("misma-media").remove([path]);
          throw cause;
        }
      };
      for (let index = 0; index < files.length; index += 3) {
        await Promise.all(files.slice(index, index + 3).map(uploadOne));
      }
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not upload files to Library.");
    } finally {
      setLibraryUploadBusy(false);
    }
  };

  const showCopiedState = (messageId: string) => {
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => current === messageId ? null : current);
    }, 1400);
  };

  const clearMobileMessageActionTimer = () => {
    if (mobileMessageActionTimerRef.current !== null) {
      window.clearTimeout(mobileMessageActionTimerRef.current);
      mobileMessageActionTimerRef.current = null;
    }
  };

  const startMobileMessageLongPress = (messageId: string) => {
    if (!window.matchMedia("(hover: none)").matches && window.innerWidth >= 768) return;
    clearMobileMessageActionTimer();
    mobileMessageActionTimerRef.current = window.setTimeout(() => {
      setMobileActionMessageId(messageId);
      if ("vibrate" in navigator) navigator.vibrate?.(12);
      mobileMessageActionTimerRef.current = null;
    }, 520);
  };

  const cancelMobileMessageLongPress = () => {
    clearMobileMessageActionTimer();
  };

  const openMobileMessageActionsFromContextMenu = (event: MouseEvent, messageId: string) => {
    if (!window.matchMedia("(hover: none)").matches) return;
    event.preventDefault();
    clearMobileMessageActionTimer();
    setMobileActionMessageId(messageId);
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
    const selectedVoice = getVoiceForPreset(availableVoices, selectedVoicePreset);
    if (!selectedVoice) {
      setChatError("This device does not have a matching " + (selectedVoicePreset === "boy" || selectedVoicePreset === "man" ? "male" : "female") + " speech voice installed. Add one in your device text-to-speech settings.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(msg.text);
    utterance.voice = selectedVoice;
    utterance.pitch = selectedVoicePreset === "girl" ? 1.2 : selectedVoicePreset === "boy" ? 0.88 : selectedVoicePreset === "woman" ? 1 : 0.82;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msg.id);
    window.speechSynthesis.speak(utterance);
  };



  const testSelectedVoice = () => {
    if (!("speechSynthesis" in window)) {
      setChatError("Voice playback is not supported by this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const voice = getVoiceForPreset(availableVoices, selectedVoicePreset);
    if (!voice) {
      setChatError("This device does not have a matching " + (selectedVoicePreset === "boy" || selectedVoicePreset === "man" ? "male" : "female") + " speech voice installed. Add one in your device text-to-speech settings.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance("Hello, this is your selected Misma voice.");
    utterance.voice = voice;
    utterance.pitch = selectedVoicePreset === "girl" ? 1.2 : selectedVoicePreset === "boy" ? 0.88 : selectedVoicePreset === "woman" ? 1 : 0.82;
    window.speechSynthesis.speak(utterance);
  };

  const saveAccountProfile = async () => {
    const name = profileNameDraft.trim();
    if (!token || profileSaving || profileAvatarPreparing) return;
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
          upsert: false,
          cacheControl: "604800",
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
        profileAvatarPathRef.current = avatarPath;
        setProfileAvatarStoragePath(avatarPath);
      }
      setProfileAvatarFile(null);
      setProfileAvatarPreparing(false);
      profileAvatarPreviewUrlRef.current = null;
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 3000);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const saveBusinessName = async () => {
    const name = businessNameDraft.trim();
    if (!token || businessNameSaving) return;
    if (name.length < 2 || name.length > 120) {
      setBusinessNameError("Enter a business name between 2 and 120 characters.");
      return;
    }
    setBusinessNameSaving(true);
    setBusinessNameError("");
    setBusinessNameSaved(false);
    try {
      const result = await saveWorkspaceName({ data: { token, name } });
      setWorkspace((current: any) => current ? { ...current, ...result.workspace } : current);
      setBusinessNameDraft(result.workspace.name);
      setBusinessNameSaved(true);
      window.setTimeout(() => setBusinessNameSaved(false), 3000);
    } catch (cause) {
      setBusinessNameError(cause instanceof Error ? cause.message : "Could not update the business name.");
    } finally {
      setBusinessNameSaving(false);
    }
  };

  const createSupportAccount = async () => {
    if (!token || !workspace?.id || staffAccountBusy) return;
    setStaffAccountError("");
    setStaffAccountMessage("");
    const name = staffNameDraft.trim();
    const title = staffTitleDraft.trim();
    const email = staffEmailDraft.trim().toLowerCase();
    if (name.length < 2 || name.length > 80) {
      setStaffAccountError("Enter a staff name between 2 and 80 characters.");
      return;
    }
    if (title.length < 2 || title.length > 60) {
      setStaffAccountError("Enter a role between 2 and 60 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStaffAccountError("Enter a valid staff email address.");
      return;
    }
    if (staffPasswordDraft.length < 8) {
      setStaffAccountError("Use a password with at least 8 characters.");
      return;
    }

    setStaffAccountBusy(true);
    try {
      const { error } = await getSupabaseClient().functions.invoke("misma-workspace-admin", {
        body: {
          action: "create-support-user",
          workspaceId: workspace.id,
          name,
          title,
          email,
          password: staffPasswordDraft,
        },
      });
      if (error) {
        let message = error.message || "Could not create the staff account.";
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const body = await context.clone().json() as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // Use the Functions client's error text.
          }
        }
        throw new Error(message);
      }
      setStaffNameDraft("");
      setStaffTitleDraft("");
      setStaffEmailDraft("");
      setStaffPasswordDraft("");
      setStaffAccountMessage("Staff account created. They can sign in with these credentials.");
    } catch (cause) {
      setStaffAccountError(cause instanceof Error ? cause.message : "Could not create the staff account.");
    } finally {
      setStaffAccountBusy(false);
    }
  };

  const deleteOwnerAccount = async () => {
    if (!token || !workspace?.id || accountDeleting || accountDeleteConfirmation.trim() !== "DELETE") return;
    setAccountDeleting(true);
    setAccountDeleteError("");
    try {
      const { error } = await getSupabaseClient().functions.invoke("misma-workspace-admin", {
        body: { action: "delete-account", workspaceId: workspace.id, confirmation: "DELETE" },
      });
      if (error) {
        let message = error.message || "Could not delete this account.";
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const body = await context.clone().json() as { error?: string };
            if (body.error) message = body.error;
          } catch {
            // Use the Functions client's error text.
          }
        }
        throw new Error(message);
      }

      setAccountDeleteOpen(false);
      try {
        ["misma_id_token", "misma_email", "misma_sidebar_open", "misma_dashboard_view_v1"].forEach((key) => sessionStorage.removeItem(key));
        if (dashboardUserId) sessionStorage.removeItem("misma_dashboard_bootstrap_v1_" + dashboardUserId);
        await getSupabaseClient().auth.signOut({ scope: "global" });
      } catch {
        // The account has already been removed. Clear the local app session regardless.
      }
      window.location.replace("/login");
    } catch (cause) {
      setAccountDeleteError(cause instanceof Error ? cause.message : "Could not delete this account.");
    } finally {
      setAccountDeleting(false);
    }
  };

  const refreshProfileAvatar = async () => {
    const path = profileAvatarPathRef.current;
    if (!path) { setProfileImage(""); return; }
    try {
      const storage = getSupabaseClient().storage.from("misma-media");
      const { data: avatarBlob, error: downloadError } = await storage.download(path);
      if (downloadError || !avatarBlob) throw downloadError || new Error("Could not load the profile photo.");
      setProfileImage(await readStoredProfileImage(avatarBlob, path));
    } catch { setProfileImage(""); }
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

  useEffect(() => {
    selectedComposerFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => () => {
    if (profileAvatarPreviewUrlRef.current) URL.revokeObjectURL(profileAvatarPreviewUrlRef.current);
    if (profileAvatarFallbackUrlRef.current) URL.revokeObjectURL(profileAvatarFallbackUrlRef.current);
  }, []);

  const releaseComposerPreviewUrl = (file: File) => {
    const url = composerPreviewUrlsRef.current.get(file);
    if (url) URL.revokeObjectURL(url);
    composerPreviewUrlsRef.current.delete(file);
  };

  useEffect(() => () => {
    uploadAbortControllersRef.current.forEach((controller) => controller.abort());
    composerPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    composerPreviewUrlsRef.current.clear();
    if (profileAvatarPreviewUrlRef.current) URL.revokeObjectURL(profileAvatarPreviewUrlRef.current);
  }, []);

  // Sending, retrying, or editing a user message.
  const uploadSelectedAttachments = async (
    filesToUpload: File[] = selectedFiles,
    videoFrameMode = false,
    signal?: AbortSignal,
    onProgress?: (file: File, fraction: number) => void,
  ): Promise<MessageAttachment[]> => {
    if (!filesToUpload.length) return [];
    setUploadingAttachments(true);
    const uploadedPaths: string[] = [];
    try {
      if (!workspace?.id) throw new Error("Your workspace is still loading. Please try again.");
      const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
      if (userError || !userData.user) throw new Error("Your sign-in session expired. Please sign in again.");

      const uploadOne = async (file: File, kind: "image" | "video" | "video-frame" | "audio" | "file"): Promise<MessageAttachment> => {
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
        if (!(file.type.startsWith("image/") || file.type.startsWith("video/")) && file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than the 10 MB document limit.`);
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload";
        const path = `${workspace.id}/${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
        await uploadStorageObjectWithProgress(file, path, signal, (fraction) => onProgress?.(file, fraction));
        uploadedPaths.push(path);
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        let url: string | undefined;
        if (kind !== "video-frame") {
          const { data: signed, error: signedError } = await getSupabaseClient()
            .storage.from("misma-media").createSignedUrl(path, 604800);
          if (signedError || !signed?.signedUrl) {
            throw new Error(`Could not prepare ${file.name} for the chat preview.`);
          }
          url = signed.signedUrl;
        }
        return {
          path,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          kind,
          ...(url ? { url } : {}),
        };
      };
      const uploadFrames = async (frames: File[]) => {
        const result: MessageAttachment[] = [];
        for (let index = 0; index < frames.length; index += 3) {
          const batch = frames.slice(index, index + 3);
          const prepared = await Promise.all(batch.map(compressImageForUpload));
          const settled = await Promise.allSettled(prepared.map((frame) => uploadOne(frame, "video-frame")));
          const failed = settled.find((item): item is PromiseRejectedResult => item.status === "rejected");
          if (failed) throw failed.reason;
          result.push(...settled.map((item) => (item as PromiseFulfilledResult<MessageAttachment>).value));
        }
        return result;
      };
      if (videoFrameMode) {
        const frames = await uploadFrames(filesToUpload);
        if (frames.length > 8) throw new Error("This upload created too many attachments. Please send fewer files.");
        return frames;
      }

      const videos = filesToUpload.filter((file) => file.type.startsWith("video/") || (!file.type.startsWith("audio/") && /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)));
      if (videos.length > 1) throw new Error("Upload one video per message so Misma can sample its keyframes.");

      const processFile = async (original: File): Promise<MessageAttachment[]> => {
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        if (original.type.startsWith("video/") || (!original.type.startsWith("audio/") && /\.(mp4|mov|m4v|webm|mkv)$/i.test(original.name))) {
          const uploadedVideo = await uploadOne(original, "video");
          const frames = await extractVideoKeyframes(original);
          return [uploadedVideo, ...await uploadFrames(frames)];
        }
        if (original.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(original.name)) {
          const normalizedAudio = original.type.startsWith("audio/")
            ? original
            : new File([original], original.name, { type: "audio/mpeg", lastModified: original.lastModified });
          return [await uploadOne(normalizedAudio, "audio")];
        }
        if (original.type.startsWith("image/")) {
          const prepared = await compressImageForUpload(original);
          if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
          return [await uploadOne(prepared, "image")];
        }
        return [await uploadOne(original, "file")];
      };

      const result: MessageAttachment[] = [];
      // Bounded parallelism keeps multiple images moving without exhausting mobile RAM or connections.
      for (let index = 0; index < filesToUpload.length; index += 2) {
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        const batch = filesToUpload.slice(index, index + 2);
        const settled = await Promise.allSettled(batch.map(processFile));
        const failed = settled.find((item): item is PromiseRejectedResult => item.status === "rejected");
        if (failed) throw failed.reason;
        result.push(...settled.flatMap((item) => (item as PromiseFulfilledResult<MessageAttachment[]>).value));
        if (result.length > 8) throw new Error("This upload created too many attachments. Please send fewer files.");
      }
      return result;
    } catch (error) {
      if (uploadedPaths.length) {
        await getSupabaseClient().storage.from("misma-media").remove(uploadedPaths).catch(() => undefined);
      }
      throw error;
    } finally {
      setUploadingAttachments(false);
    }
  };

  // Upload each selected file immediately; a per-file AbortController cancels an upload when its card is removed.
  const queueComposerAttachmentUpload = (files: File[]) => {
    const task = attachmentUploadQueueRef.current.then(async () => {
      const failures: string[] = [];
      for (const file of files) {
        if (!selectedComposerFilesRef.current.includes(file) || uploadedComposerAttachmentsRef.current.has(file)) continue;
        const controller = new AbortController();
        uploadAbortControllersRef.current.set(file, controller);
        setComposerUploadStatuses((current) => new Map(current).set(file, "uploading"));
        setComposerUploadProgress((current) => new Map(current).set(file, 0));
        try {
          const uploaded = await uploadSelectedAttachments([file], false, controller.signal, (_source, fraction) => {
            setComposerUploadProgress((current) => new Map(current).set(file, fraction));
          });
          if (!selectedComposerFilesRef.current.includes(file) || controller.signal.aborted) {
            const paths = uploaded.map((item) => item.path).filter((path): path is string => Boolean(path));
            if (paths.length) await getSupabaseClient().storage.from("misma-media").remove(paths).catch(() => undefined);
            continue;
          }
          uploadedComposerAttachmentsRef.current.set(file, uploaded);
          setComposerUploadStatuses((current) => new Map(current).set(file, "ready"));
          setComposerUploadProgress((current) => new Map(current).set(file, 1));
        } catch (cause) {
          if (controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) continue;
          setComposerUploadStatuses((current) => new Map(current).set(file, "error"));
          failures.push(cause instanceof Error ? cause.message : "Could not upload " + file.name + ".");
        } finally {
          uploadAbortControllersRef.current.delete(file);
        }
      }
      if (failures.length) throw new Error(failures.join(" "));
    });
    attachmentUploadQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  };

  const ensureComposerAttachmentsUploaded = async (files: File[]): Promise<MessageAttachment[]> => {
    await attachmentUploadQueueRef.current;
    for (const file of files) {
      if (!uploadedComposerAttachmentsRef.current.has(file)) await queueComposerAttachmentUpload([file]);
    }
    const missing = files.filter((file) => !uploadedComposerAttachmentsRef.current.has(file));
    if (missing.length) throw new Error("One or more attachments could not be uploaded. Please remove and attach them again.");
    return files.flatMap((file) => uploadedComposerAttachmentsRef.current.get(file) || []);
  };

  const postChatAction = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const config = getSupabaseConfig();
    if (!config) throw new Error("Supabase is not configured. Add the Misma project URL and publishable key.");
    const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...body,
        ...(body.action === "chat" ? { aiSettings, privacySettings: privacyPreferences } : {}),
      }),
      signal,
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
      showMediaActionStatus("Download started");
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
      if (typeof navigator.share === "function") {
        try {
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: attachment.name || "Misma image" });
          } else if (attachment.url) {
            await navigator.share({ title: attachment.name || "Misma image", url: attachment.url });
          } else {
            throw new Error("This browser cannot share image files.");
          }
          showMediaActionStatus("Image shared");
          return;
        } catch (shareError) {
          if (shareError instanceof Error && shareError.name === "AbortError") return;
          // Continue with a clipboard fallback when this WebView cannot share files or URLs.
        }
      }
      if (navigator.clipboard?.writeText && attachment.url) {
        await navigator.clipboard.writeText(attachment.url);
        showMediaActionStatus("Image link copied");
        return;
      }
      throw new Error("Image sharing is unavailable in this browser. Try downloading the image instead.");
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
    options: { retry?: boolean; signal?: AbortSignal; voice?: boolean } = {},
  ): Promise<string | null> => {
    let textToSend = (customPrompt ?? draft).trim();
    if ((!textToSend && !selectedFiles.length) || isSending || !token || options.signal?.aborted) return null;
    if (selectedFiles.some((file) => composerUploadStatuses.get(file) !== "ready")) {
      setChatError("Wait for every attachment to finish uploading, or retry/remove the failed file.");
      return null;
    }

    const implicitMediaMode = editingMessageId ? null : detectMediaIntent(textToSend);
    if (implicitMediaMode) {
      void handleCreateMedia(implicitMediaMode, textToSend);
      return null;
    }

    const isRetry = options.retry === true;
    const editId = editingMessageId;
    const tempUserId = isRetry ? failedMessageId : `user-${Date.now()}`;
    const filesToSend = editId ? [] : [...selectedFiles];
    let sendConversationId = currentConversationId;
    // Speech Talk belongs to the signed-in workspace owner, not the selected website visitor.
    const isOwnerSpeechTalk = options.voice === true;
    if (isOwnerSpeechTalk) sendConversationId = null;

    if (!options.voice && !editId && !isRetry) {
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
    const requestController = new AbortController();
    const abortFromVoiceMode = () => requestController.abort();
    options.signal?.addEventListener("abort", abortFromVoiceMode, { once: true });
    if (options.signal?.aborted) requestController.abort();
    chatAbortControllerRef.current = requestController;

    try {
      if (requestController.signal.aborted) return null;
      const selectedConversation = conversations.find((item: any) => Number(item.id) === Number(currentConversationId));
      if (!isOwnerSpeechTalk && currentConversationId && selectedConversation?.status === "Needs you" && selectedConversation?.channel !== "Dashboard" && !editId && !isRetry) {
        if (selectedFiles.length) throw new Error("Send text-only replies during a customer handoff.");
        const reply = await callWidgetFunction({
          action: "send-human-reply",
          workspaceId: workspace?.id,
          conversationId: currentConversationId,
          message: textToSend,
          voice: options.voice === true,
        }, requestController.signal);
        if (!reply.message) throw new Error("The human reply was not saved.");
        if (!options.voice) {
          setMessages((prev) => prev.map((item) => item.id === tempUserId ? reply.message : item));
        }
        setSelectedFiles([]);
        setThinkHarder(false);
        loadData();
        return options.voice && typeof reply.message.text === "string" ? reply.message.text : null;
      }
      const attachments = editId ? [] : await ensureComposerAttachmentsUploaded(filesToSend);
      if (!editId && filesToSend.length && !sendConversationId) {
        const created = await createConversation({
          data: { token, title: textToSend.slice(0, 72) || "Attachment chat" },
        });
        const createdId = Number(created.conversation.id);
        if (!Number.isSafeInteger(createdId) || createdId < 1) {
          throw new Error("Misma could not create a conversation for this attachment.");
        }
        sendConversationId = createdId;
        activeConversationIdRef.current = createdId;
        setCurrentConversationId(createdId);
        loadData();
      }
      if (!editId && filesToSend.length && tempUserId) {
        setMessages((prev) => prev.map((item) =>
          item.id === tempUserId ? { ...item, attachments } : item
        ));
        // Move uploaded files into the outgoing message while Misma prepares its response.
        setSelectedFiles([]);
        selectedComposerFilesRef.current = [];
      }
      const res = await postChatAction({
        action: "chat",
        message: textToSend,
        conversationId: sendConversationId,
        workspaceId: workspace?.id,
        attachments,
        ...(isRetry && filesToSend.length ? { retryExistingMessage: true } : {}),
        thinkHarder,
        ...(options.voice ? { voice: true } : {}),
        ...(editId ? { editMessageId: Number(editId) } : {}),
      }, requestController.signal);
      if (options.voice) {
        const voiceReply = typeof res.voiceReply === "string" ? res.voiceReply.trim() : "";
        if (!voiceReply) throw new Error("Misma could not prepare a spoken reply.");

        if (res.conversationId) {
          const returnedConversationId = Number(res.conversationId);
          if (Number.isSafeInteger(returnedConversationId) && returnedConversationId > 0 && returnedConversationId !== sendConversationId) {
            activeConversationIdRef.current = returnedConversationId;
            setCurrentConversationId(returnedConversationId);
          }
        }

        setSelectedFiles([]);
        selectedComposerFilesRef.current = [];
        setThinkHarder(false);
        loadData();
        // Spoken words and the spoken reply are intentionally never added to chat bubbles.
        return voiceReply;
      }

      if (!res.aiMessage) throw new Error("Misma AI returned an empty response.");

      if (!sendConversationId && res.conversationId) {
        activeConversationIdRef.current = Number(res.conversationId);
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
        if (autoSpeakReplies && !options.signal) handleReadAloud(res.aiMessage);
      }

      setSelectedFiles([]);
      selectedComposerFilesRef.current = [];
      for (const file of filesToSend) releaseComposerPreviewUrl(file);
      uploadedComposerAttachmentsRef.current.clear();
      setComposerUploadStatuses((current) => { const nextStatus = new Map(current); filesToSend.forEach((file) => nextStatus.delete(file)); return nextStatus; });
      setComposerUploadProgress((current) => { const nextProgress = new Map(current); filesToSend.forEach((file) => nextProgress.delete(file)); return nextProgress; });
      setThinkHarder(false);
      setFailedMessageId(null);
      setFailedAction(null);
      setFailedPrompt("");
      loadData();
      return typeof res.aiMessage.text === "string" ? res.aiMessage.text : "";
    } catch (cause) {
      if (requestController.signal.aborted) return null;
      const errMsg = options.voice
        ? "Speech conversation could not be completed. Please try again."
        : cause instanceof Error ? cause.message : "Failed to connect to Misma AI.";
      setChatError(errMsg);
      if (options.voice) return null;
      setFailedPrompt(textToSend);
      setFailedAction(editId ? "edit" : "send");
      setFailedMessageId(tempUserId);
      if (filesToSend.length) {
        setMessages((current) => current.map((item) =>
          item.id === tempUserId ? { ...item, attachments: [] } : item
        ));
        selectedComposerFilesRef.current = filesToSend;
        setSelectedFiles(filesToSend);
      }
      setDraft(textToSend);
      return null;
    } finally {
      options.signal?.removeEventListener("abort", abortFromVoiceMode);
      if (chatAbortControllerRef.current === requestController) {
        chatAbortControllerRef.current = null;
        setIsSending(false);
      }
    }
  };

  const stopMisma = () => {
    let stopped = false;
    if (chatAbortControllerRef.current) {
      const controller = chatAbortControllerRef.current;
      chatAbortControllerRef.current = null;
      controller.abort();
      stopped = true;
    }
    if (mediaAbortControllerRef.current) {
      const controller = mediaAbortControllerRef.current;
      mediaAbortControllerRef.current = null;
      controller.abort();
      stopped = true;
    }
    if (stopped) {
      setIsSending(false);
      setIsGeneratingMedia(false);
      setMediaProgress("");
      setMediaProgressPercent(0);
      setChatError("Stopped.");
    }
  };

  const handleCreateMedia = async (
    requestedMode?: "image" | "video",
    promptOverride?: string,
    reuse?: { sourceUserMessageId: number; replaceAiMessageId: number; attachments: MessageAttachment[] },
    retrySaved?: { sourceUserMessageId: number; conversationId: number; prompt: string; mode: "image" | "video" },
  ) => {
    const mode = requestedMode ?? retrySaved?.mode ?? createMode;
    if (!mode || !token || isSending || isGeneratingMedia) return;
    const typedPrompt = promptOverride?.trim() || draft.trim();
    const activeSavedRetry = retrySaved ?? (
      failedMediaRetry && failedMediaRetry.mode === mode && failedMediaRetry.prompt === typedPrompt
        ? failedMediaRetry
        : undefined
    );
    const prompt = activeSavedRetry?.prompt || typedPrompt || (mode === "image"
      ? "Create a high-quality image using the attached reference."
      : "Create a short cinematic video using the attached reference.");
    const controller = new AbortController();
    mediaAbortControllerRef.current = controller;
    const startViewVersion = chatViewVersionRef.current;
    let targetConversationId: number | null = activeSavedRetry?.conversationId ?? (currentConversationId ? Number(currentConversationId) : null);
    let savedPromptMessageId: number | null = activeSavedRetry?.sourceUserMessageId ?? (reuse?.sourceUserMessageId ?? null);
    const isTargetOpen = () => targetConversationId !== null && activeConversationIdRef.current === targetConversationId;
    const filesToSend = activeSavedRetry || reuse ? [] : [...selectedFiles];
    const updateTargetMessages = (updater: (current: Message[]) => Message[]) => {
      if (!isTargetOpen()) return;
      setMessages((current) => isTargetOpen() ? updater(current) : current);
    };
    const pause = (milliseconds: number) => new Promise<void>((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException("Stopped", "AbortError"));
        return;
      }
      const timer = window.setTimeout(() => {
        controller.signal.removeEventListener("abort", abort);
        resolve();
      }, milliseconds);
      const abort = () => {
        window.clearTimeout(timer);
        controller.signal.removeEventListener("abort", abort);
        reject(new DOMException("Stopped", "AbortError"));
      };
      controller.signal.addEventListener("abort", abort, { once: true });
    });

    let imageProgressTimer: number | null = null;
    setChatError("");
    setMediaProgress(mode === "image" ? "" : "Preparing your video with Agnes…");
    setMediaProgressPercent(mode === "image" ? 5 : 0);
    setIsGeneratingMedia(true);
    if (mode === "image") {
      const startedAt = Date.now();
      imageProgressTimer = window.setInterval(() => {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        // Agnes returns a completed image rather than live stage percentages, so
        // display a clearly labelled estimate that approaches (but never claims) 100%.
        const estimate = Math.min(94, Math.round(5 + 89 * (1 - Math.exp(-elapsedSeconds / 24))));
        setMediaProgressPercent((current) => Math.max(current, estimate));
      }, 700);
    }
    setPlusMenuOpen(false);
    setCreateMode(null);
    setDraft("");
    if (!activeSavedRetry && !reuse) setFailedMediaRetry(null);
    shouldAutoScrollRef.current = true;

    const tempUserId = (reuse || activeSavedRetry) ? null : `media-user-${Date.now()}`;
    const pendingMediaId = `media-pending-${Date.now()}`;
    const pendingMessage: Message = {
      id: pendingMediaId,
      role: "ai",
      text: mode === "image" ? "" : "Misma is preparing your video…",
      pendingMedia: mode,
      created_at: new Date().toISOString(),
    };

    try {
      if (!targetConversationId) {
        const created = await createConversation({ data: { token, title: prompt.slice(0, 72) || "Media creation" } });
        targetConversationId = Number(created.conversation.id);
        if (!Number.isSafeInteger(targetConversationId) || targetConversationId <= 0) {
          throw new Error("Misma could not reserve a conversation for this media request.");
        }
        // Only attach the new conversation to the screen when the user has not moved away.
        if (chatViewVersionRef.current === startViewVersion && activeConversationIdRef.current === null) {
          activeConversationIdRef.current = targetConversationId;
          setCurrentConversationId(targetConversationId);
        }
        loadData();
      } else {
        activeConversationIdRef.current = targetConversationId;
      }
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");

      updateTargetMessages((current) => (reuse || activeSavedRetry)
        ? [...current, pendingMessage]
        : [...current, {
            id: tempUserId!,
            role: "human",
            text: prompt,
            created_at: new Date().toISOString(),
          }, pendingMessage]);

      const attachments = activeSavedRetry
        ? []
        : reuse
          ? reuse.attachments.filter((item) => Boolean(item.path)).map((item) => ({
              path: item.path!,
              name: item.name,
              mimeType: item.mimeType || "application/octet-stream",
              size: item.size || 0,
              kind: item.kind,
            }))
          : await ensureComposerAttachmentsUploaded(filesToSend);
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (!activeSavedRetry && !reuse && filesToSend.length) {
        updateTargetMessages((current) => current.map((item) =>
          item.id === tempUserId ? { ...item, attachments } : item
        ));
        if (isTargetOpen()) {
          setSelectedFiles([]);
          selectedComposerFilesRef.current = [];
        }
      }

      const result = await postChatAction({
        action: mode === "image" ? "create-image" : "create-video",
        message: prompt,
        conversationId: targetConversationId,
        workspaceId: workspace?.id,
        attachments,
        ...(activeSavedRetry ? {
          retryMedia: true,
          sourceUserMessageId: activeSavedRetry.sourceUserMessageId,
        } : reuse ? {
          regenerateMedia: true,
          sourceUserMessageId: reuse.sourceUserMessageId,
          replaceAiMessageId: reuse.replaceAiMessageId,
        } : {}),
      }, controller.signal);

      if (result.conversationId && Number(result.conversationId) !== targetConversationId) {
        throw new Error("Misma returned a different conversation for this media request.");
      }
      if (result.userMessage && tempUserId) {
        const savedId = Number(result.userMessage.id);
        if (Number.isSafeInteger(savedId) && savedId > 0) savedPromptMessageId = savedId;
        if (isTargetOpen()) {
          updateTargetMessages((current) => current.some((item) => item.id === tempUserId)
            ? current.map((item) => item.id === tempUserId ? result.userMessage : item)
            : [...current, result.userMessage]);
        }
        setSelectedFiles([]);
      }

      if (mode === "image") {
        if (!result.aiMessage) throw new Error("Agnes did not return a generated image.");
        updateTargetMessages((current) => {
          const withoutPending = current.filter((item) => item.id !== pendingMediaId);
          return reuse
            ? withoutPending.map((item) => item.id === String(reuse.replaceAiMessageId) ? result.aiMessage : item)
            : [...withoutPending, result.aiMessage];
        });
        if (isTargetOpen()) setMediaProgress("");
        setFailedMediaRetry(null);
        uploadedComposerAttachmentsRef.current.clear();
        selectedComposerFilesRef.current = [];
        loadData();
        return;
      }

      const videoId = result.videoJob?.videoId;
      const model = result.videoJob?.model;
      if (typeof videoId !== "string" || typeof model !== "string") {
        throw new Error("Agnes did not return a video generation job.");
      }
      updateTargetMessages((current) => current.map((item) => item.id === pendingMediaId ? {
        ...item,
        text: "Agnes is generating your video…",
        pendingMedia: "video",
      } : item));

      let completedUrl: string | null = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        await pause(5000);
        let status: Record<string, any> | null = null;
        let pollError: unknown = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            status = await postChatAction({
              action: "poll-video",
              workspaceId: workspace?.id,
              conversationId: targetConversationId,
              videoId,
              model,
            }, controller.signal);
            pollError = null;
            break;
          } catch (error) {
            pollError = error;
            if (controller.signal.aborted) throw error;
            const detail = error instanceof Error ? error.message : String(error);
            if (!/agnes video status|temporar|network|failed to fetch|http (408|429|500|502|503|504)/i.test(detail) || retry === 2) break;
            await pause(1200 * (retry + 1));
          }
        }
        if (pollError || !status) throw pollError instanceof Error ? pollError : new Error("Agnes video status could not be retrieved.");
        const progress = Number(status.progress) || 0;
        if (isTargetOpen()) setMediaProgress(`Creating video… ${progress}%`);
        updateTargetMessages((current) => current.map((item) => item.id === pendingMediaId ? {
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
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (isTargetOpen()) setMediaProgress("Checking video frames for safe content…");
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
          conversationId: targetConversationId,
          videoId,
          url: completedUrl,
        }),
        signal: controller.signal,
      });
      if (!reviewDownload.ok) {
        const detail = await reviewDownload.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error || "Could not inspect the generated video safely.");
      }
      const reviewBlob = await reviewDownload.blob();
      if (reviewBlob.size <= 0 || reviewBlob.size > 150 * 1024 * 1024) {
        throw new Error("The generated video is empty or too large to run a safety review.");
      }
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      const reviewFile = new File([reviewBlob], "misma-generated-video-review.mp4", {
        type: reviewBlob.type.startsWith("video/") ? reviewBlob.type : "video/mp4",
      });
      const reviewFrames = await extractVideoKeyframes(reviewFile);
      if (reviewFrames.length < 2) throw new Error("Misma could not sample enough frames to review this video safely.");
      const reviewAttachments = await uploadSelectedAttachments(reviewFrames, true, controller.signal);
      if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
      await postChatAction({
        action: "review-video-frames",
        workspaceId: workspace?.id,
        conversationId: targetConversationId,
        videoId,
        url: completedUrl,
        attachments: reviewAttachments,
      }, controller.signal);
      const saved = await postChatAction({
        action: "save-generated-media",
        workspaceId: workspace?.id,
        conversationId: targetConversationId,
        videoId,
        url: completedUrl,
        ...(reuse ? { replaceAiMessageId: reuse.replaceAiMessageId } : {}),
      }, controller.signal);
      if (!saved.aiMessage) throw new Error("The generated video could not be saved to this chat.");
      updateTargetMessages((current) => {
        const withoutPending = current.filter((item) => item.id !== pendingMediaId);
        return reuse
          ? withoutPending.map((item) => item.id === String(reuse.replaceAiMessageId) ? saved.aiMessage : item)
          : [...withoutPending, saved.aiMessage];
      });
      if (isTargetOpen()) {
        setMediaProgress("Video created.");
        window.setTimeout(() => setMediaProgress(""), 3500);
      }
      setFailedMediaRetry(null);
      uploadedComposerAttachmentsRef.current.clear();
      selectedComposerFilesRef.current = [];
      loadData();
    } catch (cause) {
      const responseData = cause instanceof Error
        ? (cause as Error & { responseData?: Record<string, any> }).responseData
        : undefined;
      if (isTargetOpen()) {
        if (filesToSend.length) {
          selectedComposerFilesRef.current = filesToSend;
          setSelectedFiles(filesToSend);
        }
        if (responseData?.userMessage && tempUserId) {
          const savedId = Number(responseData.userMessage.id);
          if (Number.isSafeInteger(savedId) && savedId > 0) savedPromptMessageId = savedId;
          updateTargetMessages((current) => current.some((item) => item.id === tempUserId)
            ? current.map((item) => item.id === tempUserId ? responseData.userMessage : item)
            : [...current, responseData.userMessage]);
          setSelectedFiles([]);
          selectedComposerFilesRef.current = [];
        }
        updateTargetMessages((current) => current.filter((item) => item.id !== pendingMediaId));
        if (controller.signal.aborted) {
          setChatError("Generation stopped.");
        } else {
          setDraft(prompt);
          setCreateMode(mode);
          setChatError(cause instanceof Error ? cause.message : "Agnes media generation failed.");
        }
        setMediaProgress("");
      }
      if (!controller.signal.aborted && !reuse && savedPromptMessageId && targetConversationId) {
        setFailedMediaRetry({ mode, prompt, conversationId: targetConversationId, sourceUserMessageId: savedPromptMessageId });
      }
    } finally {
      if (imageProgressTimer !== null) window.clearInterval(imageProgressTimer);
      setMediaProgressPercent(0);
      if (mediaAbortControllerRef.current === controller) {
        mediaAbortControllerRef.current = null;
        setIsGeneratingMedia(false);
      }
    }
  };

  const addSelectedFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).map(normalizeComposerAttachment);
    const current = selectedComposerFilesRef.current;
    const fingerprint = (file: File) =>
      [file.name.trim().toLowerCase(), file.size, file.lastModified, file.type.toLowerCase()].join("::");
    const retryFiles: File[] = [];
    const additions: File[] = [];
    const seen = new Set(current.map(fingerprint));

    for (const file of picked) {
      const key = fingerprint(file);
      const existing = current.find((item) => fingerprint(item) === key);
      if (existing) {
        if (composerUploadStatuses.get(existing) === "error" && !retryFiles.includes(existing)) retryFiles.push(existing);
        continue;
      }
      if (!seen.has(key)) {
        seen.add(key);
        additions.push(file);
      }
    }
    if (!additions.length && !retryFiles.length) {
      setChatError("");
      return;
    }

    const next = [...current, ...additions];
    if (next.length > MAX_COMPOSER_FILES) {
      setChatError("Attach up to five files per message.");
      return;
    }
    const isVideoFile = (file: File) => file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name);
    if (next.some(isVideoFile) && next.filter(isVideoFile).length > 1) {
      setChatError("Upload one video per message so Misma can sample its keyframes.");
      return;
    }
    const candidates = [...retryFiles, ...additions];
    const oversizedImageOrVideo = candidates.find((file) =>
      (file.type.startsWith("image/") || isVideoFile(file)) && file.size > MAX_IMAGE_UPLOAD_MB * 1024 * 1024
    );
    if (oversizedImageOrVideo) {
      setChatError(oversizedImageOrVideo.name + " is larger than the 25 MB media limit.");
      return;
    }
    const oversizedDocument = candidates.find((file) =>
      !(file.type.startsWith("image/") || isVideoFile(file)) && file.size > MAX_DOCUMENT_UPLOAD_MB * 1024 * 1024
    );
    if (oversizedDocument) {
      setChatError(oversizedDocument.name + " is larger than the 10 MB document limit.");
      return;
    }
    const allowedDocument = /\.(pdf|docx|txt|csv|md|json|jsonl|xml|html|css|scss|js|jsx|ts|tsx|py|sql|sh|yaml|yml|toml|go|rs|java|kt|swift|c|cpp|h|hpp|php|rb|vue|svelte)$/i;
    const unsupported = candidates.find((file) => !file.type.startsWith("image/") && !isVideoFile(file) && !allowedDocument.test(file.name));
    if (unsupported) {
      setChatError(unsupported.name + ": supported files are images, PDF, DOCX, TXT, CSV, and common text/code files.");
      return;
    }

    setChatError("");
    for (const file of additions) composerPreviewUrlsRef.current.set(file, URL.createObjectURL(file));
    const uploadingFiles = [...retryFiles, ...additions];
    setComposerUploadStatuses((currentStatuses) => {
      const nextStatus = new Map(currentStatuses);
      uploadingFiles.forEach((file) => nextStatus.set(file, "uploading"));
      return nextStatus;
    });
    setComposerUploadProgress((currentProgress) => {
      const nextProgress = new Map(currentProgress);
      uploadingFiles.forEach((file) => nextProgress.set(file, 0));
      return nextProgress;
    });
    selectedComposerFilesRef.current = next;
    setSelectedFiles(next);
    void queueComposerAttachmentUpload(uploadingFiles).catch((cause) => {
      setChatError(cause instanceof Error ? cause.message : "Could not upload the selected attachment.");
    });
  };
  const removeSelectedComposerFile = (index: number) => {
    const removed = selectedComposerFilesRef.current[index];
    if (!removed) return;
    uploadAbortControllersRef.current.get(removed)?.abort();
    uploadAbortControllersRef.current.delete(removed);
    const next = selectedComposerFilesRef.current.filter((_, itemIndex) => itemIndex !== index);
    selectedComposerFilesRef.current = next;
    setSelectedFiles(next);
    releaseComposerPreviewUrl(removed);
    setComposerUploadStatuses((current) => { const nextStatus = new Map(current); nextStatus.delete(removed); return nextStatus; });
    setComposerUploadProgress((current) => { const nextProgress = new Map(current); nextProgress.delete(removed); return nextProgress; });
    const uploaded = uploadedComposerAttachmentsRef.current.get(removed);
    uploadedComposerAttachmentsRef.current.delete(removed);
    const paths = (uploaded || []).map((item) => item.path).filter((path): path is string => Boolean(path));
    if (paths.length) void getSupabaseClient().storage.from("misma-media").remove(paths).catch(() => undefined);
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
    const requestController = new AbortController();
    chatAbortControllerRef.current = requestController;

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
        signal: requestController.signal,
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
      if (!requestController.signal.aborted) {
        setChatError(cause instanceof Error ? cause.message : "Could not regenerate this response.");
        setFailedAction("regenerate");
      }
    } finally {
      regenerateInFlightRef.current = false;
      if (chatAbortControllerRef.current === requestController) {
        chatAbortControllerRef.current = null;
        setIsSending(false);
      }
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

  const handleSaveChannel = async (channel: "phone" | "whatsapp") => {
    if (!token || !workspace?.id || channelBusy) return;
    setChannelBusy(channel);
    try {
      const result = channel === "phone"
        ? await callWidgetFunction({ action: "save-channel", channel, workspaceId: workspace.id, phoneNumber: twilioPhoneNumber.trim(), displayName: "Twilio Phone" })
        : await callWidgetFunction({ action: "save-channel", channel, workspaceId: workspace.id, externalId: whatsappPhoneNumberId.trim(), phoneNumber: whatsappPhoneNumber.trim(), displayName: "WhatsApp Business" });
      setChannelConnections((items) => [...items.filter((item) => item.channel !== channel), result.connection]);
      alert("Connection details saved. Use Verify connection after adding the provider secrets.");
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not save this channel.");
    } finally { setChannelBusy(null); }
  };

  const handleTestChannel = async (channel: "phone" | "whatsapp") => {
    if (!token || !workspace?.id || channelBusy) return;
    setChannelBusy(channel + "-test");
    try {
      const result = await callWidgetFunction({ action: "test-channel", channel, workspaceId: workspace.id });
      setChannelConnections((items) => items.map((item) => item.channel === channel ? { ...item, status: "connected" } : item));
      alert(`${channel === "phone" ? "Twilio" : "WhatsApp"} verified successfully.`);
      if (result.details?.display_phone_number) setWhatsappPhoneNumber(result.details.display_phone_number);
      if (channel === "phone") setChannelEnvironment((v) => ({ ...v, phoneConfigured: true }));
      else setChannelEnvironment((v) => ({ ...v, whatsappConfigured: true }));
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not verify this channel.");
    } finally { setChannelBusy(null); }
  };

  const handleExtractKnowledgeFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !workspace?.id || !token || knowledgeUploadBusy) return;
    if (file.size > 2 * 1024 * 1024) { alert("Choose a text-based file under 2 MB."); return; }
    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (!["txt", "md", "csv", "json", "html", "htm", "xml"].includes(extension)) { alert("Supported knowledge files: TXT, Markdown, CSV, JSON, HTML, and XML. PDF text extraction is not enabled yet."); return; }
    setKnowledgeUploadBusy(true);
    try {
      const content = await file.text();
      const result = await callWidgetFunction({ action: "extract-knowledge", workspaceId: workspace.id, fileName: file.name, content, websiteId: knowledgeWebsiteId || null });
      alert(`Knowledge extraction complete. Saved ${result.knowledgeSaved || 0} FAQs and ${result.productSuggestions || 0} product/service suggestions for review.`);
      loadData();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not extract knowledge from this file.");
    } finally { setKnowledgeUploadBusy(false); }
  };

  // Knowledge handlers
  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newQuestion.trim() || !newAnswer.trim() || savingKnowledge)
      return;
    setSavingKnowledge(true);
    try {
      await addKnowledge({
        data: { token, question: newQuestion.trim(), answer: newAnswer.trim(), websiteConnectionId: knowledgeWebsiteId || null },
      });
      setNewQuestion("");
      setNewAnswer("");
      setKnowledgeWebsiteId("");
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
  const settingsNavItems = [{"id":"settings-profile","label":"Profile","icon":"profile"},{"id":"settings-accent","label":"Accent color","icon":"accent"},{"id":"settings-notifications","label":"Notifications","icon":"notifications"},{"id":"settings-voice","label":"Voice","icon":"voice"},{"id":"settings-privacy","label":"Privacy & Security","icon":"privacy"},{"id":"settings-history","label":"History & Data","icon":"history"},{"id":"settings-about","label":"About","icon":"about"},{"id":"settings-logout","label":"Log out","icon":"logout"}];
  const filteredSettingsNavItems = settingsNavItems.filter((item) =>
    !settingsSearchQuery.trim() || item.label.toLowerCase().includes(settingsSearchQuery.trim().toLowerCase()),
  );
  const activeConversation = conversations.find(
    (item: any) => Number(item.id) === Number(currentConversationId),
  );
  const isHumanHandoffConversation = Boolean(
    currentConversationId &&
    (
      humanHandoffs.some((request: any) =>
        Number(request.conversation_id) === Number(currentConversationId)
      ) ||
      (activeConversation?.status === "Needs you" && activeConversation?.channel !== "Dashboard")
    )
  );
  const displayedMessages = isHumanHandoffConversation
    ? messages.filter((message) => message.role === "customer" || message.role === "human")
    : messages;

  // Refresh only new messages and the short-lived visitor typing status while a
  // human-handoff conversation is open. This avoids the former 30-second inbox delay.
  useEffect(() => {
    if (!token || !dashboardDataLoaded || !workspace?.id || !currentConversationId ||
        !isHumanHandoffConversation ||
        String(activeConversation?.channel || "").toLowerCase() !== "website" ||
        activeTab !== "workspace") {
      setVisitorIsTyping(false);
      return;
    }

    let active = true;
    let timeoutId = 0;
    let requestInFlight = false;

    const poll = async () => {
      if (!active || requestInFlight) return;
      if (document.visibilityState !== "visible") {
        timeoutId = window.setTimeout(poll, 2500);
        return;
      }

      requestInFlight = true;
      const afterMessageId = messages.reduce(
        (max, message) => Math.max(max, Number(message.id) || 0),
        0,
      );
      try {
        const activity = await getConversationActivity({
          data: { token, workspaceId: workspace.id, conversationId: currentConversationId, afterMessageId },
        });
        if (!active) return;

        const typingUntil = activity.conversation.visitorTypingUntil
          ? Date.parse(activity.conversation.visitorTypingUntil)
          : 0;
        setVisitorIsTyping(
          activity.conversation.status === "Needs you" &&
          Number.isFinite(typingUntil) &&
          typingUntil > Date.now(),
        );

        if (activity.messages.length) {
          const additions = activity.messages.filter((message) =>
            message.role === "customer" || message.role === "human"
          );
          if (additions.length) {
            setMessages((current) => {
              const existingIds = new Set(current.map((message) => String(message.id)));
              const fresh = additions.filter((message) => !existingIds.has(String(message.id)));
              return fresh.length ? [...current, ...fresh] : current;
            });
            const latest = additions[additions.length - 1];
            setConversations((current) => current.map((conversation: any) =>
              Number(conversation.id) === currentConversationId
                ? {
                    ...conversation,
                    text: latest.text.slice(0, 200),
                    updated_at: latest.created_at,
                  }
                : conversation
            ));
            const newCustomerMessages = additions.filter((message) => message.role === "customer");
            if (newCustomerMessages.length) {
              setUnreadVisitorMessages((current) =>
                current.filter((item) => item.conversationId !== currentConversationId)
              );
              setUnreadVisitorCount((count) =>
                Math.max(0, count - newCustomerMessages.length)
              );
              void markVisitorMessagesRead({
                data: { token, conversationId: currentConversationId },
              }).catch((cause) => {
                console.warn("Could not mark live customer replies as read:", cause);
              });
            }
          }
        }
      } catch (cause) {
        // A transient poll failure should not interrupt the open conversation.
      } finally {
        requestInFlight = false;
        if (active) timeoutId = window.setTimeout(poll, 1200);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || !active) return;
      window.clearTimeout(timeoutId);
      void poll();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    void poll();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [token, dashboardDataLoaded, workspace?.id, currentConversationId, isHumanHandoffConversation, activeConversation?.channel, activeTab, messages]);

  const handleDeleteHumanRequest = (
    requestId: number | null,
    visitorName: string,
    notificationId: number | null = null,
  ) => {
    if (!token || humanRequestDeletingId !== null) return;
    if (requestId !== null && (!Number.isSafeInteger(requestId) || requestId <= 0)) return;
    if (notificationId !== null && (!Number.isSafeInteger(notificationId) || notificationId <= 0)) return;
    if (requestId === null && notificationId === null) return;
    setDeleteRequestError("");
    setDeleteRequestTarget({ requestId, notificationId, visitorName });
    setHumanRequestMenuId(null);
  };

  const confirmDeleteHumanRequest = async () => {
    const target = deleteRequestTarget;
    if (!token || !target || humanRequestDeletingId !== null) return;
    const busyId = target.requestId ?? -target.notificationId!;
    setHumanRequestDeletingId(busyId);
    setDeleteRequestError("");
    try {
      if (target.requestId !== null) {
        await deleteHumanRequest({ data: { token, requestId: target.requestId } });
        const relatedNotificationIds = allNotifications
          .filter((item) => Number(item.human_request_id) === target.requestId)
          .map((item) => Number(item.id));
        setHumanHandoffs((items) => items.filter((item) => Number(item.id) !== target.requestId));
        setAllNotifications((items) => items.filter((item) => Number(item.human_request_id) !== target.requestId));
        setSelectedHumanRequestNotificationId((current) =>
          current !== null && relatedNotificationIds.includes(current) ? null : current
        );
        setHumanRequestMenuId((current) => current === target.requestId ? null : current);
      } else if (target.notificationId !== null) {
        await deleteWorkspaceNotification({ data: { token, notificationId: target.notificationId } });
        setAllNotifications((items) => items.filter((item) => Number(item.id) !== target.notificationId));
        setSelectedHumanRequestNotificationId((current) => current === target.notificationId ? null : current);
        setHumanRequestMenuId(null);
      }
      setDeleteRequestTarget(null);
      loadData();
    } catch (cause) {
      setDeleteRequestError(cause instanceof Error ? cause.message : "Could not delete this request.");
    } finally {
      setHumanRequestDeletingId(null);
    }
  };

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
          <button
            type="button"
            className="aichat-mobile-newchat"
            title="New chat"
            aria-label="New chat"
            onClick={handleNewChat}
          >
            <span className="aichat-newchat-plus">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span>New chat</span>
          </button>
        </div>

        {/* New Chat Button */}
        {!staffMode && (
        <div className="aichat-newchat-wrap">
          <button
            type="button"
            className="aichat-newchat"
            onClick={handleNewChat}
           
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
        )}

        {/* Main sidebar navigation */}
        <nav className="aichat-primary-nav" aria-label="Main menu">
          {staffMode ? (
            <>
              <button type="button" className={`aichat-nav-btn${activeTab === "customers" ? " active" : ""}`} onClick={() => { setActiveTab("customers"); setMobileMenuOpen(false); }}>
                <span className="aichat-nav-icon"><DashboardNavIcon kind="manage" /></span><span className="aichat-nav-label">Customers</span>
              </button>
              <button type="button" className={`aichat-nav-btn${activeTab === "notifications" ? " active" : ""}`} onClick={() => { refreshVisitorNotifications(); setActiveTab("notifications"); setMobileMenuOpen(false); }}>
                <span className="aichat-nav-icon"><DashboardNavIcon kind="manage" /></span><span className="aichat-nav-label">Notifications</span>
                {unreadHumanRequestNotificationCount > 0 && <span className="aichat-nav-badge">{unreadHumanRequestNotificationCount}</span>}
              </button>
            </>
          ) : (
            <>

          <button type="button" className={`aichat-nav-btn${activeTab === "workspace" ? " active" : ""}`} onClick={() => setExpandedNavGroups((v) => ({ ...v, workspace: !v.workspace }))} aria-expanded={Boolean(expandedNavGroups.workspace)}>
            <span className="aichat-nav-icon"><DashboardNavIcon kind="workspace" /></span><span className="aichat-nav-label">Workspace</span><span className="aichat-nav-caret"><DashboardNavIcon kind={expandedNavGroups.workspace ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedNavGroups.workspace && <div className="aichat-nav-submenu">
            <button type="button" className={`aichat-nav-subbtn${activeTab === "website-statistics" ? " active" : ""}`} onClick={() => { setActiveTab("website-statistics"); setMobileMenuOpen(false); }}>Website statistics</button>
            <button type="button" className={`aichat-nav-subbtn${activeTab === "websites" ? " active" : ""}`} onClick={() => { setActiveTab("websites"); setMobileMenuOpen(false); }}>Websites <span>{connectedWebsites.length}</span></button>
          </div>}
          <button type="button" className={`aichat-nav-btn${activeTab === "images" ? " active" : ""}`} onClick={() => { setActiveTab("images"); setMobileMenuOpen(false); }} data-tooltip="Images">
            <span className="aichat-nav-icon"><DashboardNavIcon kind="images" /></span><span className="aichat-nav-label">Images</span>
          </button>
          <button type="button" className={`aichat-nav-btn${activeTab === "library" ? " active" : ""}`} onClick={() => { setActiveTab("library"); setMobileMenuOpen(false); }} data-tooltip="Library">
            <span className="aichat-nav-icon"><DashboardNavIcon kind="library" /></span><span className="aichat-nav-label">Library</span>
          </button>
          <button type="button" className="aichat-nav-btn" onClick={() => setExpandedNavGroups((v) => ({ ...v, manage: !v.manage }))} aria-expanded={Boolean(expandedNavGroups.manage)}>
            <span className="aichat-nav-icon"><DashboardNavIcon kind="manage" /></span><span className="aichat-nav-label">Manage</span><span className="aichat-nav-caret"><DashboardNavIcon kind={expandedNavGroups.manage ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedNavGroups.manage && <div className="aichat-nav-submenu">
            <button type="button" className={`aichat-nav-subbtn${activeTab === "customers" ? " active" : ""}`} onClick={() => { setActiveTab("customers"); setMobileMenuOpen(false); }}>Customers {humanHandoffs.length > 0 && <span>{humanHandoffs.length}</span>}</button>
            <button type="button" className={`aichat-nav-subbtn${activeTab === "notifications" ? " active" : ""}`} onClick={() => { refreshVisitorNotifications(); setActiveTab("notifications"); setMobileMenuOpen(false); }}>Notifications {unreadHumanRequestNotificationCount > 0 && <span>{unreadHumanRequestNotificationCount}</span>}</button>
          </div>}
          <button type="button" className="aichat-nav-btn" onClick={() => setExpandedNavGroups((v) => ({ ...v, build: !v.build }))} aria-expanded={Boolean(expandedNavGroups.build)}>
            <span className="aichat-nav-icon"><DashboardNavIcon kind="build" /></span><span className="aichat-nav-label">Build</span><span className="aichat-nav-caret"><DashboardNavIcon kind={expandedNavGroups.build ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedNavGroups.build && <div className="aichat-nav-submenu">
            <button type="button" className={`aichat-nav-subbtn${activeTab === "products" ? " active" : ""}`} onClick={() => { setActiveTab("products"); setMobileMenuOpen(false); }}>Products &amp; services</button>
            <button type="button" className={`aichat-nav-subbtn${activeTab === "knowledge" || activeTab === "build" ? " active" : ""}`} onClick={() => { setActiveTab("knowledge"); setMobileMenuOpen(false); }}>Business knowledge</button>
          </div>}
          <button type="button" className="aichat-nav-btn" onClick={() => setExpandedNavGroups((v) => ({ ...v, connect: !v.connect }))} aria-expanded={Boolean(expandedNavGroups.connect)}>
            <span className="aichat-nav-icon"><DashboardNavIcon kind="connect" /></span><span className="aichat-nav-label">Connect</span><span className="aichat-nav-caret"><DashboardNavIcon kind={expandedNavGroups.connect ? "chevron-down" : "chevron-right"} /></span>
          </button>
          {expandedNavGroups.connect && <div className="aichat-nav-submenu">
            <button type="button" className={`aichat-nav-subbtn${activeTab === "whatsapp" ? " active" : ""}`} onClick={() => { setActiveTab("whatsapp"); setMobileMenuOpen(false); }}>WhatsApp</button>
          </div>}
                
            </>
          )}
        </nav>

        {/* ── Chats and tasks widget (Cloud AI style) ── */}
        {!staffMode && (
        <div className="aichat-chats-widget">
          <div className="aichat-chats-widget-header">
            <button
              type="button"
              className="aichat-chats-widget-title-btn"
              onClick={() => setChatsExpanded((v) => !v)}
              aria-expanded={chatsExpanded}
            >
              <span className="aichat-chats-widget-title">Recents</span>
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
              title="Group and filter recent chats"
              aria-label="Group and filter recent chats"
              aria-expanded={chatGroupMenuOpen}
              onClick={() => setChatGroupMenuOpen((open) => !open)}
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
          {chatGroupMenuOpen && (
            <div className="aichat-chat-group-filter-menu" role="group" aria-label="Filter chats by group">
              <button type="button" className={chatGroupFilter === "all" ? "active" : ""} onClick={() => { setChatGroupFilter("all"); setChatGroupMenuOpen(false); }}>All chats</button>
              {conversationGroups.map((group) => (
                <button key={group} type="button" className={chatGroupFilter === group ? "active" : ""} onClick={() => { setChatGroupFilter(group); setChatGroupMenuOpen(false); }}>
                  {group}
                </button>
              ))}
              <button type="button" className={chatGroupFilter === "__ungrouped__" ? "active" : ""} onClick={() => { setChatGroupFilter("__ungrouped__"); setChatGroupMenuOpen(false); }}>Ungrouped</button>
            </div>
          )}
          {chatsExpanded && (
            <div className="aichat-chats-widget-list">
              {recentChats.length === 0 ? (
                <div className="aichat-chats-widget-empty">No chats yet.</div>
              ) : filteredRecentChats.length === 0 ? (
                <div className="aichat-chats-widget-empty">No chats in this group.</div>
              ) : (
                filteredRecentChats.slice(0, 5).map((c) => (
                  <div className="aichat-chat-list-item" key={c.id}>
                    <button
                      type="button"
                      className={`aichat-chats-widget-item${currentConversationId === c.id ? " active" : ""}`}
                      onClick={() => {
                        if (chatLongPressTriggeredRef.current) {
                          chatLongPressTriggeredRef.current = false;
                          return;
                        }
                        void selectConversation(c.id);
                      }}
                      onPointerDown={() => startChatLongPress(c.id)}
                      onPointerUp={cancelChatLongPress}
                      onPointerLeave={cancelChatLongPress}
                      onPointerMove={cancelChatLongPress}
                      onPointerCancel={cancelChatLongPress}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        cancelChatLongPress();
                        chatLongPressTriggeredRef.current = true;
                        setChatActionMenuId(c.id);
                      }}
                      title={c.name || "New chat"}
                    >
                      <span className="aichat-chats-widget-dot" aria-hidden="true" />
                      <span className="aichat-chats-widget-item-text">{c.name || "New chat"}</span>
                    </button>
                    {chatActionMenuId === c.id && (
                      <div className="aichat-chat-context-menu" role="menu">
                        <button type="button" role="menuitem" className="is-danger" onClick={() => {
                          setChatActionMenuId(null);
                          setDeleteChatTarget({ id: c.id, name: c.name || "New chat" });
                        }}>Delete chat</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        )}

        {/* User Profile Card */}
        <div className="aichat-side-user">
          {staffMode ? (
            <div className="aichat-user-profile aichat-staff-sidebar-profile" aria-label="Staff account">
              {profileImage ? (
                <img className="aichat-user-avatar" src={profileImage} alt="" />
              ) : (
                <span className="aichat-user-avatar">{profileName[0]?.toUpperCase() ?? "S"}</span>
              )}
              <span className="aichat-user-info">
                <b>{profileName}</b>
                <small>{staffTitle || "Customer support"}</small>
                <button type="button" className="aichat-staff-signout" onClick={() => void signOut()}>Sign out</button>
              </span>
            </div>
          ) : (
            <>
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
              <img className="aichat-user-avatar" src={profileImage} alt="" onError={() => { if (!profileImage.startsWith("blob:")) void refreshProfileAvatar(); }} />
            ) : (
              <span className="aichat-user-avatar">
                {profileName[0]?.toUpperCase() ?? "M"}
              </span>
            )}
            <span className="aichat-user-info">
              <b>{profileName}</b>
              <small>{workspace?.name || "Your business"}</small>
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
            </>
          )}
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main
        className={`aichat-main${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
      >
        {/* Keep the menu control available when the sidebar is closed. */}
        <header className="aichat-topbar">
          {canGoBack && (
            <button
              type="button"
              className="aichat-header-back"
              aria-label="Go back to previous page"
              title="Go back"
              onClick={handleDashboardBack}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
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
              aria-hidden="true"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            className={`aichat-notification-trigger${unreadHumanRequestNotificationCount > 0 ? " has-unread" : ""}`}
            onClick={() => { refreshVisitorNotifications(); setActiveTab("notifications"); setMobileMenuOpen(false); }}
            aria-label={unreadHumanRequestNotificationCount > 0 ? `Notifications, ${unreadHumanRequestNotificationCount} unread human requests` : "Human request notifications"}
            title="Website visitor notifications"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            {unreadHumanRequestNotificationCount > 0 && <span className="aichat-notification-count">{unreadHumanRequestNotificationCount > 99 ? "99+" : unreadHumanRequestNotificationCount}</span>}
          </button>
        </header>

        {loadError && (
          <p className="aichat-error-box" role="alert">
            {loadError}
          </p>
        )}

        {/* ── View 1: Workspace (ChatGPT-Style Interface) ── */}
        {activeTab === "workspace" && (
          <div
            className="aichat-scroll-area"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <div
              className="aichat-conversation-wrap"
              onTouchStart={(event) => {
                const target = event.target;
                if (target instanceof Element && !target.closest(".aichat-message-row.is-user") && !target.closest(".aichat-message-actions")) {
                  setMobileActionMessageId(null);
                }
              }}
            >
              {displayedMessages.length === 0 ? (
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
                    <h1>{isHumanHandoffConversation ? "Waiting for the customer" : `${greeting}, ${profileName}`}</h1>
                    {isHumanHandoffConversation && (
                      <p className="aichat-handoff-empty-hint">Customer messages appear on the left. Your replies appear on the right.</p>
                    )}
                  </div>
                </div>
              ) : (
                /* Message Stream */
                displayedMessages.map((msg) => {
                  const isCustomerMessage = isHumanHandoffConversation && msg.role === "customer";
                  const isUserMessage = isHumanHandoffConversation
                    ? msg.role === "human"
                    : msg.role === "human" || msg.role === "customer";
                  const isAiMessage = !isHumanHandoffConversation && msg.role === "ai";
                  const messageSide = isCustomerMessage ? "is-customer" : isUserMessage ? "is-user" : "is-ai";
                  const isLatestAiMessage = isAiMessage && msg.id === latestAiMessageId;
                  return (
                    <div
                      key={msg.id}
                      className={"aichat-message-row " + messageSide}
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
                        {isUserMessage && <MessageAttachmentViews
                          attachments={msg.attachments}
                          variant="user"
                          onDownload={(attachment) => void handleDownloadGeneratedMedia(attachment)}
                          onCrop={(attachment) => handleOpenImageCrop(attachment)}
                          onShare={(attachment) => void handleShareImage(attachment)}
                          onCopy={(attachment) => void handleCopyImage(attachment)}
                          onOpenImage={(attachment) => setLightboxAttachment(attachment)}
                        />}
                        {(!isUserMessage || Boolean(msg.text.trim()) || Boolean(msg.pendingMedia)) && <div
                          className="aichat-bubble"
                          onTouchStart={isUserMessage ? () => startMobileMessageLongPress(msg.id) : undefined}
                          onTouchMove={isUserMessage ? cancelMobileMessageLongPress : undefined}
                          onTouchEnd={isUserMessage ? cancelMobileMessageLongPress : undefined}
                          onTouchCancel={isUserMessage ? cancelMobileMessageLongPress : undefined}
                          onContextMenu={isUserMessage ? (event) => openMobileMessageActionsFromContextMenu(event, msg.id) : undefined}
                        >
                          {!isUserMessage && <MessageAttachmentViews
                            attachments={msg.attachments}
                            onDownload={(attachment) => void handleDownloadGeneratedMedia(attachment)}
                            onCrop={(attachment) => handleOpenImageCrop(attachment)}
                            onShare={(attachment) => void handleShareImage(attachment)}
                            onCopy={(attachment) => void handleCopyImage(attachment)}
                            onOpenImage={(attachment) => setLightboxAttachment(attachment)}
                          />}
                          {msg.pendingMedia === "image" ? (
                            <div
                              className="aichat-image-generation-loading"
                              role="progressbar"
                              aria-label="Estimated image creation progress"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={mediaProgressPercent}
                            >
                              <span className="aichat-image-generation-status">Sketching it out</span>
                              <div className="aichat-image-generation-grid" aria-hidden="true" />
                              <span className="aichat-image-progress-badge">{mediaProgressPercent}%</span>
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
                        </div>}
                        {!msg.pendingMedia && !isCustomerMessage && (
                        <div
                          className={`aichat-message-actions${isUserMessage && mobileActionMessageId === msg.id ? " is-mobile-open" : ""}`}
                          role="group"
                          aria-label={isUserMessage ? "Your message actions" : isCustomerMessage ? "Customer message actions" : "Misma response actions"}
                        >
                          {isUserMessage ? (
                            <>
                              <button type="button" className="aichat-message-action" title="Copy message" aria-label="Copy message" onClick={() => { void handleCopyMessage(msg); }}>
                                <ActionIcon name="copy" />
                              </button>
                              <button type="button" className="aichat-message-action" title="Share prompt" aria-label="Share prompt" onClick={() => { setMobileActionMessageId(null); void handleShareMessage(msg, "Misma prompt"); }}>
                                <ActionIcon name="share" />
                              </button>
                              <button type="button" className="aichat-message-action" title="Edit message" aria-label="Edit message" disabled={isSending} onClick={() => { setMobileActionMessageId(null); handleEditMessage(msg); }}>
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
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {isHumanHandoffConversation && visitorIsTyping && (
                <div className="aichat-message-row is-customer is-visitor-typing" role="status" aria-live="polite">
                  <div className="aichat-visitor-typing-bubble">
                    <span>Customer is typing</span>
                    <div className="aichat-thinking-dots" aria-hidden="true">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}

              {/* AI Thinking State */}
              {isSending && !isHumanHandoffConversation && (
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
                  {failedMediaRetry ? (
                    <button
                      type="button"
                      className="aichat-retry-btn"
                      onClick={() => void handleCreateMedia(failedMediaRetry.mode, failedMediaRetry.prompt, undefined, failedMediaRetry)}
                      disabled={isSending || isGeneratingMedia}
                    >
                      Try again
                    </button>
                  ) : failedAction === "regenerate" ? (
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
                    {mediaProgress && <span className="aichat-composer-progress">{mediaProgress}</span>}
                  </div>
                  {selectedFiles.length > 0 && (
                    <div className="aichat-composer-attachments" aria-label="Attached files" aria-live="polite">
                      {selectedFiles.map((file, index) => (
                        <ComposerAttachmentPreview
                          key={`${file.name}-${file.lastModified}-${index}`}
                          file={file}
                          previewUrl={composerPreviewUrlsRef.current.get(file) || null}
                          uploadStatus={composerUploadStatuses.get(file) || "uploading"}
                          uploadProgress={composerUploadProgress.get(file) || 0}
                          onRemove={() => removeSelectedComposerFile(index)}
                          onRetry={() => {
                            setChatError("");
                            setComposerUploadStatuses((current) => new Map(current).set(file, "uploading"));
                            setComposerUploadProgress((current) => new Map(current).set(file, 0));
                            void queueComposerAttachmentUpload([file]).catch((cause) => setChatError(cause instanceof Error ? cause.message : "Could not upload " + file.name + "."));
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="aichat-composer-input-row">
                    <VoiceInputBar
                      toolbarStart={
                        <>
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
                                <button type="button" role="menuitemcheckbox" aria-checked={thinkHarder} onClick={() => { setThinkHarder((value) => !value); setCreateMode(null); setPlusMenuOpen(false); }}>
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
                                <button type="button" role="menuitem" onClick={() => { setThinkHarder(false); setCreateMode("image"); setPlusMenuOpen(false); }}>
                                  <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
                                  <span><strong>Create image</strong></span>
                                </button>
                                <button type="button" role="menuitem" onClick={() => { setThinkHarder(false); setCreateMode("video"); setPlusMenuOpen(false); }}>
                                  <span className="aichat-plus-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></span>
                                  <span><strong>Create video</strong></span>
                                </button>
                              </div>
                            )}
                          </div>

                        </>
                      }
                      sendDisabled={selectedFiles.some((file) => composerUploadStatuses.get(file) !== "ready")}
                      voicePreset="woman"
                      inputValue={draft}
                      hasContent={Boolean(draft.trim() || createMode)}
                      hasAttachment={() => selectedFiles.length > 0}
                      isBusy={isSending || isGeneratingMedia}
                      disabled={isSending || isGeneratingMedia}
                      primaryActionLabel={createMode ? "Create " + createMode + " with Agnes" : "Send message"}
                      onPrimaryAction={() => {
                        if (isSending || isGeneratingMedia) stopMisma();
                        else if (createMode) void handleCreateMedia();
                        else void handleSend();
                      }}
                      onTranscript={(transcript) => {
                        setDraft(transcript);
                        setChatError("");
                      }}
                      onDictationDone={() => textareaRef.current?.focus()}
                      onSend={(transcript, signal, options) =>
                        handleSend(transcript, { signal, voice: options?.voice === true })
                      }
                    >
                      <>
                        {createMode ? (
                          <button type="button" className="aichat-mode-token is-create" onClick={() => setCreateMode(null)} aria-label={"Remove create " + createMode + " mode"}>
                            @create {createMode}<span aria-hidden="true">×</span>
                          </button>
                        ) : thinkHarder ? (
                          <button type="button" className="aichat-mode-token is-thinking" onClick={() => setThinkHarder(false)} aria-label="Remove thinking mode">
                            @thinking<span aria-hidden="true">×</span>
                          </button>
                        ) : null}
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          className="aichat-composer-textarea"
                          placeholder={composerFocused ? "" : createMode ? "Describe the " + createMode + " you want Agnes to create…" : thinkHarder ? "Ask Misma to think through this carefully…" : "Message Misma…"}
                          value={draft}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            const createMatch = nextValue.match(/^@create\s+(image|video)(?=\s|$)\s*/i);
                            if (createMatch) {
                              setCreateMode(createMatch[1].toLowerCase() as "image" | "video");
                              setThinkHarder(false);
                              setDraft(nextValue.slice(createMatch[0].length));
                              return;
                            }
                            const thinkingMatch = nextValue.match(/^@thinking(?=\s|$)\s*/i);
                            if (thinkingMatch) {
                              setThinkHarder(true);
                              setCreateMode(null);
                              setDraft(nextValue.slice(thinkingMatch[0].length));
                              return;
                            }
                            setDraft(nextValue);
                          }}
                          onKeyDown={handleKeyDown}
                          onPaste={handleComposerPaste}
                          onFocus={() => {
                            setComposerFocused(true);
                            if (window.innerWidth < 768) {
                              window.requestAnimationFrame(() => {
                                textareaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                              });
                            }
                          }}
                          onBlur={() => setComposerFocused(false)}
                          disabled={isSending}
                          aria-label="Message Misma"
                        />
                      </>
                    </VoiceInputBar>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.docx,.txt,.csv,.md,.json" hidden multiple onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={photoInputRef} type="file" accept="image/*" hidden multiple onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { addSelectedFiles(event.target.files); event.target.value = ""; }} />
                </form>
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
                  setThinkHarder(false); setCreateMode("image");
                  setPlusMenuOpen(false);
                  setMobileMenuOpen(false);
                  window.setTimeout(() => textareaRef.current?.focus(), 0);
                }}>＋ Create image</button>
              </div>
              {workspaceAssetsLoading ? (
                <div className="aichat-card aichat-assets-empty">
                  <div className="aichat-assets-empty-icon">◌</div>
                  <h3>Loading your images…</h3>
                  <p>Your saved images are loading from this workspace.</p>
                </div>
              ) : workspaceAssetsLoadError ? (
                <div className="aichat-card aichat-assets-empty">
                  <div className="aichat-assets-empty-icon">!</div>
                  <h3>Could not load your images</h3>
                  <p>{workspaceAssetsLoadError}</p>
                </div>
              ) : workspaceAssets.filter((asset) => asset.kind === "image" || asset.kind === "generated-image" || String(asset.mimeType || "").startsWith("image/")).length === 0 ? (
                <div className="aichat-card aichat-assets-empty">
                  <div className="aichat-assets-empty-icon">▧</div>
                  <h3>Your image library is ready</h3>
                  <p>Generated images and image uploads from your chats will appear here.</p>
                  <button type="button" className="aichat-action-btn" onClick={() => {
                    setActiveTab("workspace");
                    setThinkHarder(false); setCreateMode("image");
                    window.setTimeout(() => textareaRef.current?.focus(), 0);
                  }}>Create your first image</button>
                </div>
              ) : (
                <div className="aichat-assets-grid">
                  {workspaceAssets
                    .filter((asset) => asset.kind === "image" || asset.kind === "generated-image" || String(asset.mimeType || "").startsWith("image/"))
                    .map((asset) => (
                      <article className="aichat-asset-card" key={asset.id}>
                        <div className="aichat-asset-image-wrap">
                          <a href={asset.url} target="_blank" rel="noreferrer" className="aichat-asset-image-link">
                            <img src={asset.url} alt={asset.name || "Misma image"} loading="lazy" />
                          </a>
                          <GeneratedImageActions
                            onDownload={() => void handleDownloadGeneratedMedia(asset, asset.conversationId)}
                            onShare={() => void handleShareImage(asset, asset.conversationId)}
                            onCrop={() => handleOpenImageCrop(asset, asset.conversationId)}
                            onCopy={() => void handleCopyImage(asset, asset.conversationId)}
                          />
                        </div>
                        <div className="aichat-asset-card-footer">
                          <span title={asset.name}>{asset.name || (asset.kind === "generated-image" ? "Generated image" : "Image")}</span>
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
              <div className="aichat-tab-header aichat-library-heading">
                <div>
                  <h2>Library</h2>
                  <p>Find, upload, and manage files shared in your workspace.</p>
                </div>
                <button type="button" className="aichat-action-btn" disabled={libraryUploadBusy} onClick={() => libraryFileInputRef.current?.click()}>
                  {libraryUploadBusy ? "Uploading…" : "＋ Upload files"}
                </button>
              </div>
              <input ref={libraryFileInputRef} type="file" hidden multiple onChange={(event) => void handleLibraryUpload(event)} />
              <div className="aichat-card">
                <div className="aichat-library-toolbar">
                  <span>{workspaceAssetsLoaded ? workspaceAssets.length + " saved items" : workspaceAssetsLoading ? "Loading saved items…" : "Saved items"}</span>
                  <input className="aichat-input" type="search" placeholder="Search your library…" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} aria-label="Search library" />
                </div>
                {workspaceAssetsLoading ? (
                  <div className="aichat-assets-empty">
                    <div className="aichat-assets-empty-icon">◌</div>
                    <h3>Loading your files…</h3>
                    <p>Your saved files are loading from this workspace.</p>
                  </div>
                ) : workspaceAssetsLoadError ? (
                  <div className="aichat-assets-empty">
                    <div className="aichat-assets-empty-icon">!</div>
                    <h3>Could not load your files</h3>
                    <p>{workspaceAssetsLoadError}</p>
                  </div>
                ) : workspaceAssets.filter((asset) => `${asset.name} ${asset.kind} ${asset.mimeType}`.toLowerCase().includes(librarySearch.trim().toLowerCase())).length === 0 ? (
                  <div className="aichat-assets-empty">
                    <div className="aichat-assets-empty-icon">▤</div>
                    <h3>No library items found</h3>
                    <p>Upload an image or document, or save media from any Misma conversation.</p>
                    <button type="button" className="aichat-action-btn secondary" disabled={libraryUploadBusy} onClick={() => libraryFileInputRef.current?.click()}>
                      {libraryUploadBusy ? "Uploading…" : "Upload a file"}
                    </button>
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
                            <button
                              type="button"
                              className="aichat-library-item-main"
                              onClick={() => setLibraryPreviewAsset(asset)}
                              aria-label={"Open " + (asset.name || "workspace file")}
                            >
                              {isImage ? <img src={asset.url} alt={asset.name || "Library image"} loading="lazy" decoding="async" /> : <span className="aichat-library-file-icon">{isVideo ? "▶" : "▤"}</span>}
                              <span className="aichat-library-item-copy">
                                <strong title={asset.name}>{asset.name || "Workspace file"}</strong>
                                <small>{asset.mimeType || asset.kind} · {asset.created_at ? new Date(asset.created_at).toLocaleDateString() : "Saved item"}</small>
                              </span>
                            </button>
                            <a href={asset.url} target="_blank" rel="noreferrer" download={asset.name} className="aichat-library-open" aria-label={`Download ${asset.name || "file"}`} title="Download file"><ActionIcon name="download" /></a>
                            <div className="aichat-library-item-menu">
                              <button type="button" className="aichat-library-more" aria-label={`More actions for ${asset.name || "file"}`} aria-expanded={libraryAssetMenuId === asset.id} onClick={() => setLibraryAssetMenuId((current) => current === asset.id ? null : asset.id)}>⋯</button>
                              {libraryAssetMenuId === asset.id && (
                                <div className="aichat-library-item-menu-popover" role="menu">
                                  <button type="button" role="menuitem" className="is-danger" onClick={() => {
                                    setDeleteAssetTarget(asset);
                                    setLibraryAssetMenuId(null);
                                  }}>{asset.libraryFileId ? "Delete from Library" : "Delete from chat"}</button>
                                </div>
                              )}
                            </div>
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
        {(activeTab === "knowledge" || activeTab === "build") && (
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
                    <label htmlFor="knowledge-website-room">Knowledge room</label>
                    <select id="knowledge-website-room" className="aichat-input" value={knowledgeWebsiteId} onChange={(event) => setKnowledgeWebsiteId(event.target.value)}>
                      <option value="">General workspace knowledge (available across channels)</option>
                      {connectedWebsites.map((site) => <option key={site.id} value={site.id}>{site.name || site.domain} — website room</option>)}
                    </select>
                    <small>Choose a connected website to keep this knowledge inside that website's Core.01 room. General knowledge remains shared across the workspace. This selection also applies to imported knowledge files below.</small>
                  </div>
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
                <div className="aichat-knowledge-import">
                  <input ref={knowledgeFileInputRef} type="file" accept=".txt,.md,.csv,.json,.html,.htm,.xml,text/plain,text/markdown,text/csv,application/json,text/html,application/xml" hidden onChange={(event) => void handleExtractKnowledgeFile(event)} />
                  <div><strong>Import business knowledge</strong><small>Upload TXT, Markdown, CSV, JSON, HTML, or XML text files up to 2 MB. Misma extracts FAQs and inactive catalog suggestions for review.</small></div>
                  <button type="button" className="aichat-action-btn secondary" disabled={knowledgeUploadBusy} onClick={() => knowledgeFileInputRef.current?.click()}>{knowledgeUploadBusy ? "Extracting…" : "Upload knowledge file"}</button>
                </div>
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
        {!staffMode && activeTab === "settings" && (
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
                    {profileImage ? <img src={profileImage} alt="" onError={() => { if (!profileImage.startsWith("blob:")) void refreshProfileAvatar(); }} /> : <span>{profileNameDraft[0]?.toUpperCase() || "M"}</span>}
                    <span className="aichat-settings-avatar-edit" aria-hidden="true">✎</span>
                  </button>
                  <div>
                    <h3>Profile</h3>
                    <p>Update the name and picture used for your Misma account.</p>
                    <small>{profileEmail}</small>
                  </div>
                  <input ref={profileAvatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setProfileError("Profile photos must be 5 MB or smaller.");
                      return;
                    }
                    const selectionId = profileAvatarSelectionRef.current + 1;
                    profileAvatarSelectionRef.current = selectionId;
                    setProfileAvatarFile(null);
                    setProfileAvatarPreparing(true);
                    setProfileError("");
                    void prepareProfileAvatarForUpload(file).then(({ file: preparedFile, previewDataUrl }) => {
                      if (selectionId !== profileAvatarSelectionRef.current) return;
                      profileAvatarPreviewUrlRef.current = previewDataUrl;
                      setProfileAvatarFile(preparedFile);
                      setProfileImage(previewDataUrl);
                      setProfileAvatarPreparing(false);
                    }).catch((cause) => {
                      if (selectionId === profileAvatarSelectionRef.current) {
                        setProfileAvatarPreparing(false);
                        setProfileError(cause instanceof Error ? cause.message : "Could not prepare the selected profile photo.");
                      }
                    });
                  }} />
                </div>
                <div className="aichat-profile-edit-row">
                  <div className="aichat-input-group">
                    <label htmlFor="misma-profile-name">Profile name</label>
                    <input id="misma-profile-name" className="aichat-input" value={profileNameDraft} maxLength={80} onChange={(event) => setProfileNameDraft(event.target.value)} placeholder="Your name" />
                  </div>
                  <button type="button" className="aichat-action-btn" onClick={() => void saveAccountProfile()} disabled={profileSaving || profileAvatarPreparing}>
                    {profileSaving ? "Saving…" : profileAvatarPreparing ? "Preparing photo…" : "Save changes"}
                  </button>
                </div>
                <div className="aichat-profile-edit-row">
                  <div className="aichat-input-group">
                    <label htmlFor="misma-business-name">Business name</label>
                    <input id="misma-business-name" className="aichat-input" value={businessNameDraft} maxLength={120} onChange={(event) => setBusinessNameDraft(event.target.value)} placeholder="Your business name" />
                  </div>
                  <button type="button" className="aichat-action-btn" onClick={() => void saveBusinessName()} disabled={businessNameSaving}>
                    {businessNameSaving ? "Saving…" : "Save business name"}
                  </button>
                </div>
                {businessNameError && <p className="aichat-profile-error" role="alert">{businessNameError}</p>}
                {businessNameSaved && <p className="aichat-settings-status" role="status">Business name updated.</p>}
<section className="aichat-card aichat-settings-card aichat-staff-access-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 7a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4.5 5" /></svg></span>
                  <span><h3>Team access</h3><p>Create a restricted account for customer requests.</p></span>
                </div>
                <form className="aichat-staff-access-form" onSubmit={(event) => { event.preventDefault(); void createSupportAccount(); }}>
                  <div className="aichat-input-group">
                    <label htmlFor="misma-staff-role">Role / title</label>
                    <input id="misma-staff-role" className="aichat-input" maxLength={60} value={staffTitleDraft} onChange={(event) => setStaffTitleDraft(event.target.value)} placeholder="Customer support" required />
                  </div>
                  <div className="aichat-input-group">
                    <label htmlFor="misma-staff-name">Name</label>
                    <input id="misma-staff-name" className="aichat-input" maxLength={80} value={staffNameDraft} onChange={(event) => setStaffNameDraft(event.target.value)} placeholder="Staff name" autoComplete="name" required />
                  </div>
                  <div className="aichat-input-group">
                    <label htmlFor="misma-staff-email">Email</label>
                    <input id="misma-staff-email" className="aichat-input" type="email" maxLength={254} value={staffEmailDraft} onChange={(event) => setStaffEmailDraft(event.target.value)} placeholder="staff@example.com" autoComplete="email" required />
                  </div>
                  <div className="aichat-input-group">
                    <label htmlFor="misma-staff-password">Password</label>
                    <input id="misma-staff-password" className="aichat-input" type="password" minLength={8} maxLength={128} value={staffPasswordDraft} onChange={(event) => setStaffPasswordDraft(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
                  </div>
                  <p className="aichat-settings-hint">Staff can view and manage Customers and Notifications only. They cannot open Recents, change settings, or edit business information.</p>
                  {staffAccountError && <p className="aichat-profile-error" role="alert">{staffAccountError}</p>}
                  {staffAccountMessage && <p className="aichat-settings-status" role="status">{staffAccountMessage}</p>}
                  <button type="submit" className="aichat-action-btn" disabled={staffAccountBusy || !staffNameDraft.trim() || !staffEmailDraft.trim() || !staffPasswordDraft || !staffTitleDraft.trim()}>
                    {staffAccountBusy ? "Creating…" : "Create staff account"}
                  </button>
                </form>
              </section>
                <button type="button" className="aichat-settings-delete-account" onClick={() => { setAccountDeleteConfirmation(""); setAccountDeleteError(""); setAccountDeleteOpen(true); }}>
                  Delete account
                </button>
                {profileError && <p className="aichat-profile-error" role="alert">{profileError}</p>}
                {profileSaved && <p className="aichat-settings-status" role="status">Profile changes saved.</p>}
                {profileAvatarPreparing && <p className="aichat-settings-hint" role="status">Preparing profile photo…</p>}
                {profileAvatarFile && <p className="aichat-settings-hint">Profile photo ready. Save changes to upload it.</p>}
              </section>
              <section id="settings-accent" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">◐</span>
                  <span><h3>Accent color</h3><p>Choose the background color of your sent messages in chat.</p></span>
                </div>
                <div className="aichat-accent-options">
                  {[
                    { label: "Blue", value: "#8ab4ff" },
                    { label: "Dark blue", value: "#1e3a8a" },
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
                <SettingsToggle title="Chat activity" description="Receive a browser notification when a new visitor message arrives while Misma is in the background." checked={notificationPreferences.chatActivity} onToggle={() => void toggleChatActivityNotifications()} />
                <div className="aichat-settings-action-row">
                  <div><strong>Human assistance requests</strong><small>Send a push notification to this phone or desktop when a customer asks for a person, even while Misma is closed. In Chrome, allow notifications when prompted and enable each signed-in device separately.</small></div>
                  <button type="button" className="aichat-action-btn secondary" onClick={() => void toggleHumanRequestPushNotifications()} disabled={humanRequestPushBusy || !workspace?.id}>{humanRequestPushBusy ? "Updating..." : humanRequestPushEnabled ? "Disable on this device" : "Enable on this device"}</button>
                </div>
                {humanRequestPushMessage && <p className="aichat-settings-hint" role="status">{humanRequestPushMessage}</p>}
                {notificationPermissionMessage && <p className="aichat-settings-hint" role="status">{notificationPermissionMessage}</p>}
                <p className="aichat-settings-hint">Product update and security alert preferences are saved here. Their notification feeds will appear when those services are connected.</p>
              </section>

              <section id="settings-voice" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">♫</span>
                  <span><h3>Voice</h3><p>Choose the read-aloud voice. Live Speech Talk uses the same Siri-first woman voice, English accent selection, and speaking style as the Misma website widget.</p></span>
                </div>
                <MicrophoneAccessPanel />
                <div className="aichat-settings-voice-row">
                  <div className="aichat-input-group">
                    <label id="misma-voice-choice-label">Read-aloud voice</label>
                    <div className="aichat-voice-picker" onKeyDown={(event) => { if (event.key === "Escape") setVoiceMenuOpen(false); }}>
                      <button
                        type="button"
                        className="aichat-voice-picker-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={voiceMenuOpen}
                        aria-labelledby="misma-voice-choice-label"
                        onClick={() => setVoiceMenuOpen((open) => !open)}
                      >
                        <span>{selectedVoicePreset === "girl" ? "Girl" : "Woman"}</span>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      {voiceMenuOpen && (
                        <div className="aichat-voice-picker-menu" role="listbox" aria-labelledby="misma-voice-choice-label">
                          {([
                            { value: "girl", label: "Girl", detail: "Higher-pitched voice" },
                            { value: "woman", label: "Woman", detail: "Natural adult voice" },
                          ] as const).map((voice) => (
                            <button
                              key={voice.value}
                              type="button"
                              role="option"
                              aria-selected={selectedVoicePreset === voice.value}
                              className={`aichat-voice-picker-option${selectedVoicePreset === voice.value ? " is-selected" : ""}`}
                              onClick={() => {
                                setSelectedVoicePreset(voice.value);
                                setVoiceMenuOpen(false);
                              }}
                            >
                              <span><strong>{voice.label}</strong><small>{voice.detail}</small></span>
                              {selectedVoicePreset === voice.value && <span className="aichat-voice-picker-check" aria-hidden="true">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button type="button" className="aichat-action-btn secondary" onClick={testSelectedVoice}>Preview voice</button>
                </div>
                <SettingsToggle title="Read new replies aloud" description="Automatically speak each new text answer using the selected device voice." checked={autoSpeakReplies} onToggle={() => setAutoSpeakReplies((current) => !current)} />
                <p className="aichat-settings-hint">Misma uses your browser's speech recognition to turn microphone input into editable text. Only the transcript is sent when you submit your message; no audio recording is uploaded.</p>
              </section>

              <section id="settings-privacy" className="aichat-card aichat-settings-card">
                <div className="aichat-settings-section-heading">
                  <span className="aichat-settings-section-icon" aria-hidden="true">◇</span>
                  <span><h3>Privacy &amp; Security</h3><p>Review how Misma handles your account and conversation data.</p></span>
                </div>
                <div className="aichat-settings-info-row"><strong>Account access</strong><span>Workspace data is accessed using your signed-in Supabase session.</span></div>
                <div className="aichat-settings-info-row"><strong>Profile photo</strong><span>Stored in your Misma media bucket and displayed with a signed URL.</span></div>
                <div className="aichat-settings-info-row"><strong>Microphone test</strong><span>Settings microphone testing is analysed locally and is never recorded or uploaded.</span></div>
                <SettingsToggle title="Use recent conversation context" description="When enabled, Misma can use earlier messages in this chat for follow-up questions. Turn it off to send only the current request and workspace context." checked={privacyPreferences.useConversationHistory} onToggle={() => setPrivacyPreferences((current) => ({ ...current, useConversationHistory: !current.useConversationHistory }))} />
                <div className="aichat-settings-action-row">
                  <div><strong>Reset preferences on this device</strong><small>Restore the default voice, appearance, notifications, privacy, and assistant choices.</small></div>
                  <button type="button" className="aichat-action-btn secondary" onClick={() => {
                    ["misma_ai_settings", "misma_accent_color", "misma_notification_preferences", "misma_voice_preset", "misma_voice_uri", "misma_auto_speak_replies", "misma_privacy_preferences"].forEach((key) => localStorage.removeItem(key));
                    setAiSettings(DEFAULT_MISMA_AI_SETTINGS);
                    setAccentColor("#8ab4ff");
                    setNotificationPreferences({ productUpdates: true, securityAlerts: true, chatActivity: true });
                    setSelectedVoicePreset("woman");
                    setAutoSpeakReplies(false);
                    setPrivacyPreferences({ useConversationHistory: true });
                  }}>Reset preferences</button>
                </div>
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
                  <div><strong>Manage saved conversations</strong><small>Long-press any chat in Recents to delete it.</small></div>
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

        {activeTab === "website-statistics" && (
          <div className="aichat-tab-view"><div className="aichat-tab-content">
            <div className="aichat-tab-header"><h2>Website statistics</h2><p>Monitor the websites connected to this workspace.</p></div>
            <div className="aichat-metric-grid">
              <article className="aichat-card"><span>Connected websites</span><strong>{connectedWebsites.filter((site) => site.status === "connected").length}</strong></article>
              <article className="aichat-card"><span>Pending installations</span><strong>{connectedWebsites.filter((site) => site.status === "pending").length}</strong></article>
              <article className="aichat-card"><span>Human requests</span><strong>{humanHandoffs.filter((request) => request.status === "pending").length}</strong></article>
              <article className="aichat-card"><span>Unread notifications</span><strong>{allNotifications.filter((item) => !item.is_read).length}</strong></article>
            </div>
            <div className="aichat-card"><div className="aichat-panel-heading"><h3>Your websites</h3><button type="button" className="aichat-action-btn" onClick={() => setActiveTab("websites")}>Manage websites</button></div>
              {connectedWebsites.length === 0 ? <p>No websites have been added yet. Add a website to begin setup.</p> : connectedWebsites.map((site) => <div className="aichat-hub-row" key={site.id}><div><strong>{site.name || site.domain}</strong><small>{site.website_url}</small></div><span className={`aichat-status-pill is-${site.status}`}>{site.status}</span></div>)}
            </div>
          </div></div>
        )}

        {activeTab === "websites" && (
          <div className="aichat-tab-view aichat-websites-tab"><div className="aichat-tab-content">
            <div className="aichat-tab-header"><h2>Websites</h2><p>Connect a published website or register an unpublished draft, staging, or preview URL before launch.</p></div>
            <div className="aichat-card">
              <h3>Register a website or preview URL</h3>
              <form className="aichat-hub-form" onSubmit={async (event) => {
                event.preventDefault();
                if (!workspace?.id || !websiteDraftUrl.trim()) return;
                let parsed: URL;
                try { parsed = new URL(websiteDraftUrl.trim()); } catch { alert("Enter a valid website URL."); return; }
                if (!["http:", "https:"].includes(parsed.protocol)) { alert("Use an HTTP or HTTPS website URL."); return; }
                const normalizedUrl = parsed.origin;
                if (!token) return;
                try {
                  const sharedWidgetKey = sharedWebsiteWidget
                    ? (connectedWebsites.find((site) => site.widget_public_key)?.widget_public_key || connectedWebsites.find((site) => site.public_key)?.public_key)
                    : undefined;
                  const result = await createWebsiteConnection({ data: {
                    token, name: websiteDraftName.trim() || parsed.hostname, websiteUrl: normalizedUrl,
                    ...(sharedWidgetKey ? { sharedWidgetKey } : {}),
                  } });
                  setConnectedWebsites((items) => [result.website, ...items]);
                } catch (error) { alert(error instanceof Error ? error.message : "Could not add this website."); return; }
                setWebsiteDraftUrl(""); setWebsiteDraftName("");
              }}>
                <label>Website or preview URL<input className="aichat-input" type="url" placeholder="https://preview.example.com" value={websiteDraftUrl} onChange={(event) => setWebsiteDraftUrl(event.target.value)} required /></label>
                <label>Website name (optional)<input className="aichat-input" placeholder="My business website" value={websiteDraftName} onChange={(event) => setWebsiteDraftName(event.target.value)} /></label>
                <p className="aichat-website-setup-note">You do not need to publish the website first. Register its final domain or a preview/staging URL, then copy the general script below. For local testing, use <code>http://localhost:PORT</code>.</p>
                <button type="submit" className="aichat-action-btn secondary" disabled={!websiteDraftUrl.trim()}>Create connection &amp; get script</button>
              </form>
            </div>
            <div className="aichat-card">
              <div className="aichat-panel-heading">
                <button type="button" className="aichat-nav-btn" style={{ width: "100%", justifyContent: "space-between", textAlign: "left" }} aria-expanded={sharedWidgetExpanded} onClick={() => setSharedWidgetExpanded((value) => !value)}>
                  <span><strong>One widget across your websites</strong><small className="aichat-shared-widget-summary">All registered domains use the same widget key and workspace knowledge.<br />Visitor conversations remain separated by website.</small></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="aichat-status-pill is-connected">{sharedWebsiteWidget ? "Shared" : "Separate"}</span><span aria-hidden="true">{sharedWidgetExpanded ? "⌄" : "›"}</span></span>
                </button>
              </div>
              <div hidden={!sharedWidgetExpanded}>
                <p>Each domain is still validated against its registered hostname. Removing one domain does not remove the shared widget from other registered domains.</p>
                <button type="button" className="aichat-action-btn secondary" disabled={!connectedWebsites.length} onClick={async () => {
                  if (!token) return;
                  try {
                    const result = await shareWebsiteWidgetAcrossWorkspace({ data: { token } });
                    setSharedWebsiteWidget(true);
                    try { window.localStorage.setItem("misma_shared_website_widget", "true"); } catch { /* Keep session setting. */ }
                    await loadData();
                    alert("One widget is now shared across " + result.websiteCount + " connected websites.");
                  } catch (cause) { alert(cause instanceof Error ? cause.message : "Could not share the widget."); }
                }}>Use one widget for all connected websites</button>
                {everyWebsiteUsesSharedWidget && (
                  <div className="aichat-shared-script">
                    <label className="aichat-widget-script-label">General shared website script — paste this same script on every registered website</label>
                    <pre className="aichat-widget-script"><code>{`<script defer src="https://misma.onrender.com/assets/misma-widget.js?v=20261110-widget-theme-2" data-site-key="${sharedWidgetPublicKey}" data-endpoint="${supabaseApiBase}/functions/v1/misma-widget"></script>`}</code></pre>
                    <button type="button" className="aichat-action-btn" onClick={() => {
                      const script = `<script defer src="https://misma.onrender.com/assets/misma-widget.js?v=20261110-widget-theme-2" data-site-key="${sharedWidgetPublicKey}" data-endpoint="${supabaseApiBase}/functions/v1/misma-widget"></script>`;
                      void navigator.clipboard.writeText(script).then(() => alert("Shared website widget script copied."));
                    }}>Copy general script</button>
                  </div>
                )}
              </div>
            </div>
            <div className="aichat-card"><h3>Connected websites ({connectedWebsites.length})</h3>
              {connectedWebsites.length === 0 ? <p>Your websites will appear here after you add them.</p> : connectedWebsites.map((site) => <article className={`aichat-website-card${!expandedWebsiteIds.includes(site.id) ? " is-minimized" : ""}`} key={site.id}>
                <div className="aichat-website-row-heading">
                  <div className="aichat-website-heading-copy">
                    <div className="aichat-website-heading-main">
                      <strong title={site.name || site.domain}>{site.name || site.domain}</strong>
                      <span className={"aichat-status-pill is-" + site.status}>{site.status}</span>
                    </div>
                    <small title={site.website_url}>{site.website_url}</small>
                  </div>
                  <button
                    type="button"
                    className="aichat-website-expand"
                    aria-expanded={!!expandedWebsiteIds.includes(site.id)}
                    aria-label={!expandedWebsiteIds.includes(site.id) ? "Expand website details" : "Collapse website details"}
                    title={!expandedWebsiteIds.includes(site.id) ? "Expand website details" : "Collapse website details"}
                    onClick={() => setExpandedWebsiteIds((current) => current.includes(site.id) ? current.filter((id) => id !== site.id) : [...current, site.id])}
                  >
                    <svg className={!expandedWebsiteIds.includes(site.id) ? "" : "is-expanded"} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="aichat-website-card-details" hidden={!expandedWebsiteIds.includes(site.id)}>
                <WebsiteSocialSettings
                  site={site}
                  token={token || ""}
                  onSaved={(website) => setConnectedWebsites((items) => items.map((item) => item.id === website.id ? { ...item, ...website } : item))}
                />
                <button type="button" className="aichat-action-btn secondary" style={{ width: "100%", margin: "10px 0" }} onClick={() => navigate({ to: "/dashboard/websites/$siteId/customize", params: { siteId: site.id } })}>
                  <span aria-hidden="true">◈</span> Customize widget <span aria-hidden="true">›</span>
                </button>
                <label className="aichat-widget-script-label">General website installation script</label>
                <pre className="aichat-widget-script"><code>{`<script defer src="https://misma.onrender.com/assets/misma-widget.js?v=20261110-widget-theme-2" data-site-key="${site.widget_public_key || site.public_key}" data-endpoint="${supabaseApiBase}/functions/v1/misma-widget"></script>`}</code></pre>
                <div className="aichat-website-actions">
                  <button type="button" className="aichat-action-btn secondary" onClick={() => {
                    const snippet = `<script defer src="https://misma.onrender.com/assets/misma-widget.js?v=20261110-widget-theme-2" data-site-key="${site.widget_public_key || site.public_key}" data-endpoint="${supabaseApiBase}/functions/v1/misma-widget"></script>`;
                    void navigator.clipboard.writeText(snippet).then(() => alert("Widget installation script copied."));
                  }}>Copy script</button>
                  <button type="button" className="aichat-action-btn secondary" disabled={websiteActionId === site.id} onClick={async () => {
                    if (!workspace?.id) return;
                    const controller = new AbortController();
                    const timeoutId = window.setTimeout(() => controller.abort(), 390_000);
                    setWebsiteActionId(site.id);
                    setWebsiteScanFeedback((current) => ({ ...current, [site.id]: { kind: "info", message: "Scanning public pages and extracting business knowledge…" } }));
                    try {
                      const queued = await callWidgetFunction(
                        { action: "scan-website", workspaceId: workspace.id, websiteId: site.id, maxPages: 50, crawlDepth: 3 },
                        controller.signal,
                      );
                      const jobId = String(queued.jobId || "");
                      if (!jobId) throw new Error("Misma did not return a scan job ID.");
                      let finalJob: any = null;
                      for (let attempt = 0; attempt < 300; attempt += 1) {
                        await new Promise((resolve) => window.setTimeout(resolve, 1200));
                        const statusResult = await callWidgetFunction(
                          { action: "scan-status", workspaceId: workspace.id, jobId },
                          controller.signal,
                        );
                        const job = statusResult.job;
                        if (!job) throw new Error("The scan job could not be found.");
                        setWebsiteScanFeedback((current) => ({
                          ...current,
                          [site.id]: {
                            kind: "info",
                            message: job.status === "running"
                              ? `Scanning website: ${job.pages_scanned || 0}/${job.pages_total || "discovering"} pages discovered…`
                              : job.status === "queued"
                                ? `Scan queued / resuming: ${job.pages_scanned || 0}/${job.pages_total || "discovering"} pages saved…`
                                : "Preparing website scan…",
                          },
                        }));
                        if (job.status === "completed" || job.status === "failed") {
                          finalJob = job;
                          break;
                        }
                      }
                      if (!finalJob) {
                        setWebsiteScanFeedback((current) => ({
                          ...current,
                          [site.id]: { kind: "info", message: "The scan is still queued or running. Saved progress will resume automatically; refresh this card to see the latest report." },
                        }));
                        return;
                      }
                      if (finalJob.status === "failed") {
                        const reason = Array.isArray(finalJob.errors) ? finalJob.errors[0]?.message : "";
                        throw new Error(reason || "Website scan failed. Please retry.");
                      }
                      setWebsiteScanFeedback((current) => ({
                        ...current,
                        [site.id]: {
                          kind: "success",
                          message: `Scan complete: ${finalJob.pages_scanned || 0} pages scanned, ${finalJob.pages_skipped || 0} skipped. Platform: ${finalJob.detected_platform || "HTTP-rendered website"}.${Array.isArray(finalJob.errors) && finalJob.errors.length ? " Skipped details: " + finalJob.errors.slice(0, 3).map((item: any) => item.message).join("; ") : ""}`,
                        },
                      }));
                      loadData();
                    } catch (cause) {
                      const timedOut = controller.signal.aborted;
                      setWebsiteScanFeedback((current) => ({
                        ...current,
                        [site.id]: {
                          kind: "error",
                          message: timedOut
                            ? "This scan pass reached its time budget. Saved progress is queued and Misma will resume it automatically."
                            : cause instanceof Error
                              ? cause.message
                              : "The scan failed. Please try again.",
                        },
                      }));
                    } finally {
                      window.clearTimeout(timeoutId);
                      setWebsiteActionId((current) => current === site.id ? null : current);
                    }
                  }}>{websiteActionId === site.id ? "Scanning…" : "Scan website"}</button>
                  <button type="button" className="aichat-action-btn secondary" onClick={async () => {
                    if (!token || !window.confirm("Delete the connection for " + (site.domain || site.website_url) + "? This deactivates its widget key on this domain immediately, so the Misma launcher will no longer appear here. Other registered domains using the same shared key remain active. Visitor history is preserved.")) return;
                    try {
                      await deleteWebsiteConnection({ data: { token, websiteId: site.id } });
                      setConnectedWebsites((items) => items.filter((item) => item.id !== site.id));
                    } catch (cause) { alert(cause instanceof Error ? cause.message : "Could not remove the widget."); }
                  }}>Delete connection</button>
                </div>
                {websiteScanFeedback[site.id] && (
                  <p className={"aichat-website-scan-feedback is-" + websiteScanFeedback[site.id].kind} role="status" aria-live="polite">
                    {websiteScanFeedback[site.id].message}
                  </p>
                )}
                <small className="aichat-website-meta">Last activity: {site.last_seen_at ? new Date(site.last_seen_at).toLocaleString() : "Not verified yet"} · Last scanned: {site.last_scanned_at ? new Date(site.last_scanned_at).toLocaleString() : "Never"}{site.detected_platform ? " · Platform: " + site.detected_platform : ""}</small>
                <small className="aichat-website-meta">Add this same snippet to each page on the registered live, preview, or staging hostname before the closing &lt;/body&gt; tag. No platform-specific plugin is required. The widget only accepts the hostname you registered; use HTTPS for preview/staging sites or localhost for local testing. Keep the site key unchanged.</small>
                </div>
              </article>)}
            </div>
          </div></div>
        )}

        {activeTab === "customers" && (
          <div className="aichat-tab-view"><div className="aichat-tab-content">
            <div className="aichat-tab-header"><h2>Customers requesting a human</h2><p>Visitors who asked to speak with a person. Open a request to review the complete conversation.</p></div>
            <div className="aichat-card">
              {humanHandoffs.length === 0 ? <div className="aichat-notifications-empty"><h3>No human requests yet</h3><p>Requests from your connected channels appear here with their conversation history.</p></div> :
                humanHandoffs.map((request) => {
                  const requestId = Number(request.id);
                  const visitorName = request.visitor_name || request.contacts?.name || "Website visitor";
                  return <article className="aichat-handoff-card" key={request.id}>
                    <div className="aichat-handoff-menu">
                      <button
                        type="button"
                        className="aichat-handoff-more"
                        aria-label={`More options for ${visitorName}`}
                        title="More options"
                        aria-expanded={humanRequestMenuId === requestId}
                        disabled={humanRequestDeletingId === requestId}
                        onClick={() => setHumanRequestMenuId((current) => current === requestId ? null : requestId)}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                      </button>
                      {humanRequestMenuId === requestId && (
                        <div className="aichat-chat-context-menu" role="menu" aria-label={`Options for ${visitorName}`}>
                          <button type="button" role="menuitem" className="is-danger" disabled={humanRequestDeletingId === requestId} onClick={() => void handleDeleteHumanRequest(requestId, visitorName)}>
                            {humanRequestDeletingId === requestId ? "Deleting…" : "Delete request"}
                          </button>
                        </div>
                      )}
                    </div>
                    <button type="button" className="aichat-handoff-row" disabled={staffMode} onClick={() => void selectConversation(Number(request.conversation_id))}>
                      <span className="aichat-handoff-avatar"><HumanRequestIcon /></span>
                      <span className="aichat-handoff-copy">
                        <strong>{visitorName}</strong>
                        <small>{request.visitor_email || request.contacts?.email || "Contact details not provided"} · {request.visitor_phone || request.contacts?.phone || "No phone"} · {request.created_at ? new Date(request.created_at).toLocaleString() : "New request"}</small>
                        <span>{request.reason || "Visitor requested a human agent"}</span>
                        <small>Latest conversation: {request.conversations?.latest_text || "Open the conversation to review the full history"}</small>
                      </span>
                      <span className={`aichat-status-pill is-${request.status}`}>{request.status}</span>
                    </button>
                    {request.status !== "handled" && <button type="button" className="aichat-action-btn" onClick={async () => {
                      if (!token) return;
                      try { await updateHumanRequestStatus({ data: { token, requestId, status: "handled" } }); loadData(); }
                      catch (cause) { alert(cause instanceof Error ? cause.message : "Could not mark this request handled."); }
                    }}>Mark handled</button>}
                  </article>;
                })}
            </div>
          </div></div>
        )}

        {activeTab === "products" && (
          <div className="aichat-tab-view"><div className="aichat-tab-content">
            <div className="aichat-tab-header"><h2>Products &amp; services</h2><p>Create and manage what your business offers. Website scans and imported business documents create reviewable suggestions here.</p></div>
            <div className="aichat-card"><h3>Add a product or service</h3>
              <form className="aichat-hub-form" onSubmit={async (event) => {
                event.preventDefault(); if (!workspace?.id || !productDraft.name.trim()) return;
                if (!token) return;
                try {
                  const result = await createProductService({ data: { token, kind: productDraft.kind as "product" | "service", name: productDraft.name.trim(), description: productDraft.description.trim(), price: productDraft.price.trim() } });
                  setProductsServices((items) => [result.product, ...items]);
                  setProductDraft({ kind: "product", name: "", description: "", price: "" });
                } catch (error) { alert(error instanceof Error ? error.message : "Could not save this item."); }
              }}>
                <label>Type<select className="aichat-select" value={productDraft.kind} onChange={(event) => setProductDraft((value) => ({ ...value, kind: event.target.value }))}><option value="product">Product</option><option value="service">Service</option></select></label>
                <label>Name<input className="aichat-input" value={productDraft.name} onChange={(event) => setProductDraft((value) => ({ ...value, name: event.target.value }))} required /></label>
                <label>Description<textarea className="aichat-textarea" rows={3} value={productDraft.description} onChange={(event) => setProductDraft((value) => ({ ...value, description: event.target.value }))} /></label>
                <label>Price / pricing details<input className="aichat-input" placeholder="e.g. From 25,000 RWF" value={productDraft.price} onChange={(event) => setProductDraft((value) => ({ ...value, price: event.target.value }))} /></label>
                <button type="submit" className="aichat-action-btn" disabled={!productDraft.name.trim()}>Save product or service</button>
              </form>
            </div>
            <div className="aichat-card">
              <h3>AI recommendations from visitor demand</h3>
              <p>Misma reviews recent website, phone, and WhatsApp messages for repeated unmet needs and suggests new offerings. Suggestions stay inactive until you approve them.</p>
              <button type="button" className="aichat-action-btn secondary" disabled={recommendationBusy} onClick={async () => {
                if (!workspace?.id) return;
                setRecommendationBusy(true);
                try {
                  const result = await callWidgetFunction({ action: "recommend-products", workspaceId: workspace.id });
                  alert(`${result.productSuggestions || 0} product/service suggestions generated. ${result.summary || ""}`);
                  loadData();
                } catch (cause) {
                  alert(cause instanceof Error ? cause.message : "Could not generate product recommendations.");
                } finally { setRecommendationBusy(false); }
              }}>{recommendationBusy ? "Analysing customer requests…" : "Generate recommendations"}</button>
            </div>
            <div className="aichat-card"><h3>Catalog ({productsServices.length})</h3>{productsServices.length === 0 ? <p>No products or services have been added yet.</p> : productsServices.map((item) => <div className="aichat-hub-row" key={item.id}><div><strong>{item.name}</strong><small>{item.item_type} · {item.price_text || "Price not set"} · {item.created_from || "manual"}</small><p>{item.description}</p></div><div className="aichat-product-actions"><span className={`aichat-status-pill ${item.active ? "is-connected" : "is-pending"}`}>{item.active ? "Active" : ["website", "file_upload", "visitor_requests"].includes(item.created_from) ? "Review suggestion" : "Inactive"}</span>{!item.active && ["website", "file_upload", "visitor_requests"].includes(item.created_from) && <button type="button" className="aichat-action-btn" onClick={async () => { if (!token) return; try { await updateProductServiceStatus({ data: { token, productId: Number(item.id), active: true } }); loadData(); } catch (cause) { alert(cause instanceof Error ? cause.message : "Could not approve this suggestion."); } }}>Approve &amp; activate</button>}</div></div>)}</div>
          </div></div>
        )}

        {activeTab === "phone" && (
          <div className="aichat-tab-view"><div className="aichat-tab-content">
            <div className="aichat-tab-header"><h2>Connect a phone number</h2><p>Route incoming business calls through Twilio Voice to Misma. The number must belong to the configured Twilio account.</p></div>
            <div className="aichat-card">
              <div className="aichat-panel-heading"><h3>Twilio Voice</h3><span className={`aichat-status-pill ${channelConnections.find((item) => item.channel === "phone")?.status === "connected" ? "is-connected" : "is-pending"}`}>{channelConnections.find((item) => item.channel === "phone")?.status || "Not configured"}</span></div>
              <label>Twilio business phone number<input className="aichat-input" placeholder="+250…" value={twilioPhoneNumber || channelConnections.find((item) => item.channel === "phone")?.phone_number || ""} onChange={(event) => setTwilioPhoneNumber(event.target.value)} /></label>
              <div className="aichat-channel-setup">
                <strong>1. Add these secrets in Supabase → Edge Functions → Secrets</strong>
                <code>TWILIO_ACCOUNT_SID</code><code>TWILIO_AUTH_TOKEN</code>
                <strong>2. Set your Twilio number's Voice webhook</strong>
                <pre><code>{`${supabaseApiBase}/functions/v1/misma-widget?action=phone`}</code></pre>
                <small>HTTP method: POST · Optional secret: TWILIO_WEBHOOK_URL should equal the exact public webhook URL if Twilio signature validation sees a different proxy URL.</small>
                <small>Calls are answered using Twilio speech recognition and Misma's approved business knowledge. A caller can say “human” or “agent” to create a handoff.</small>
              </div>
              {!channelEnvironment.phoneConfigured && <p className="aichat-integration-warning">Twilio credentials are not detected in Supabase function secrets yet. Add them before verification.</p>}
              <div className="aichat-website-actions">
                <button type="button" className="aichat-action-btn" disabled={channelBusy === "phone" || !twilioPhoneNumber.trim()} onClick={() => void handleSaveChannel("phone")}>{channelBusy === "phone" ? "Saving…" : "Save phone number"}</button>
                <button type="button" className="aichat-action-btn secondary" disabled={channelBusy === "phone-test" || !channelEnvironment.phoneConfigured} onClick={() => void handleTestChannel("phone")}>{channelBusy === "phone-test" ? "Verifying…" : "Verify connection"}</button>
              </div>
            </div>
          </div></div>
        )}
        {activeTab === "website-connect" && (
          <div className="aichat-tab-view"><div className="aichat-tab-content"><div className="aichat-tab-header"><h2>Website connection</h2><p>Connect a published website or register an unpublished preview/staging URL before launch. Misma provides a general HTML script, so a live production site or CMS-specific plugin is not required.</p></div><div className="aichat-card"><h3>Install the general Misma script</h3><p>Register the exact domain or preview hostname, copy its generated script from Website connections, and paste it before the closing &lt;/body&gt; tag. The widget verifies the connection when that page first loads.</p><button type="button" className="aichat-action-btn" onClick={() => setActiveTab("websites")}>Open Website connections</button></div></div></div>
        )}
        {activeTab === "whatsapp" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>WhatsApp</h2>
                <p>Add a phone number and default message for each connected website.</p>
              </div>
              {connectedWebsites.length === 0 ? (
                <div className="aichat-card">
                  <h3>No website connected</h3>
                  <p>Connect a website first to add its WhatsApp contact details.</p>
                  <button type="button" className="aichat-action-btn" onClick={() => setActiveTab("websites")}>Open websites</button>
                </div>
              ) : connectedWebsites.map((site) => (
                <WhatsAppConnectionCard
                  key={site.id}
                  site={site}
                  token={token || ""}
                  onSaved={(updatedSite) => setConnectedWebsites((items) => items.map((item) => item.id === updatedSite.id ? updatedSite : item))}
                />
              ))}
            </div>
          </div>
        )}
        {activeTab === "notifications" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Human request notifications {unreadHumanRequestNotificationCount > 0 ? `(${unreadHumanRequestNotificationCount} unread)` : ""}</h2>
                <p>Each request is listed under the visitor's name. Open one to view the contact details and message they submitted.</p>
              </div>
              <div className="aichat-card">
                <h3>Human handoff requests ({allNotifications.length})</h3>
                {allNotifications.length === 0 ? (
                  <div className="aichat-notifications-empty">
                    <span className="aichat-notifications-empty-icon" aria-hidden="true">✓</span>
                    <h3>No human requests yet</h3>
                    <p>When a website visitor asks to speak with a person, their request will appear here.</p>
                  </div>
                ) : (
                  <div className="aichat-notifications-list">
                    {allNotifications.map((item) => {
                      const request = humanHandoffs.find((entry) => Number(entry.id) === Number(item.human_request_id));
                      const website = connectedWebsites.find((entry) => Number(entry.id) === Number(item.website_connection_id));
                      const visitorName = String(request?.visitor_name || (item.title && !/requested a human|human request/i.test(item.title) ? item.title : "Website visitor"));
                      const isExpanded = selectedHumanRequestNotificationId === Number(item.id);
                      const requestId = Number(item.human_request_id || request?.id || 0);
                      return (
                        <div key={item.id} className="aichat-human-request-entry">
                          <div className="aichat-human-request-list-row">
                            {Number(item.id) > 0 && (
                              <div className="aichat-human-request-list-menu">
                                <button
                                  type="button"
                                  className="aichat-handoff-more"
                                  aria-label={`More options for ${visitorName}`}
                                  title="More options"
                                  aria-expanded={humanRequestMenuId === requestId}
                                  disabled={humanRequestDeletingId === requestId}
                                  onClick={() => setHumanRequestMenuId((current) => current === requestId ? null : requestId)}
                                >
                                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                                </button>
                                {humanRequestMenuId === requestId && (
                                  <div className="aichat-chat-context-menu" role="menu" aria-label={`Options for ${visitorName}`}>
                                    <button type="button" role="menuitem" className="is-danger" disabled={humanRequestDeletingId === requestId} onClick={() => void handleDeleteHumanRequest(request ? requestId : null, visitorName, Number(item.id))}>
                                      {humanRequestDeletingId === requestId ? "Deleting…" : requestId > 0 ? "Delete request" : "Delete notification"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              className={`aichat-notification-item${item.is_read ? " is-read" : ""}`}
                              aria-expanded={isExpanded}
                              onClick={() => void openHumanRequestNotification(item)}
                            >
                              <span className="aichat-notification-item-icon"><HumanRequestIcon /></span>
                              <span className="aichat-notification-item-copy">
                                <strong>{visitorName}</strong>
                                <small>{website?.domain || website?.name || "Website visitor"} · {item.created_at ? new Date(item.created_at).toLocaleString() : "Human request"}</small>
                                <span>{request?.reason || "Requested to speak with a person"}</span>
                              </span>
                              <span className="aichat-notification-open">{item.is_read ? "Opened" : "New"}</span>
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="aichat-human-request-details">
                              <div><strong>Name</strong><span>{request?.visitor_name || visitorName}</span></div>
                              <div><strong>Email</strong><span>{request?.visitor_email || "Not provided"}</span></div>
                              <div><strong>Phone</strong><span>{request?.visitor_phone || "Not provided"}</span></div>
                              <div className="aichat-human-request-message"><strong>Message</strong><p>{request?.reason || "No message provided."}</p></div>
                              <div><strong>Website</strong><span>{website?.domain || website?.name || "Website visitor"}</span></div>
                              <div><strong>Requested</strong><span>{request?.created_at ? new Date(request.created_at).toLocaleString() : item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown"}</span></div>
                              <div><strong>Status</strong><span>{request?.status === "handled" ? "Handled" : "Pending"}</span></div>
                              {item.conversation_id && !staffMode && (
                                <button type="button" className="aichat-action-btn secondary" onClick={() => void selectConversation(Number(item.conversation_id))}>
                                  Open conversation
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {deleteRequestTarget && (
          <div className="aichat-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && humanRequestDeletingId === null) { setDeleteRequestTarget(null); setDeleteRequestError(""); } }}>
            <section className="aichat-confirm-dialog aichat-request-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="misma-delete-request-title">
              <h2 id="misma-delete-request-title">Delete request?</h2>
              <p>{deleteRequestTarget.requestId !== null
                ? "This removes the request and its notification. Chat history stays."
                : "This notification will be permanently removed."}</p>
              {deleteRequestError && <p className="aichat-request-delete-error" role="alert">{deleteRequestError}</p>}
              <div className="aichat-confirm-actions">
                <button type="button" className="aichat-request-confirm-button" disabled={humanRequestDeletingId !== null} onClick={() => { setDeleteRequestTarget(null); setDeleteRequestError(""); }}>Cancel</button>
                <button type="button" className="aichat-request-confirm-button" disabled={humanRequestDeletingId !== null} onClick={() => void confirmDeleteHumanRequest()}>{humanRequestDeletingId !== null ? "…" : "OK"}</button>
              </div>
            </section>
          </div>
        )}

        {accountDeleteOpen && (
          <div className="aichat-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountDeleting) setAccountDeleteOpen(false); }}>
            <section className="aichat-confirm-dialog aichat-account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="misma-delete-account-title">
              <h2 id="misma-delete-account-title">Delete account?</h2>
              <p>This permanently deletes your Misma workspace, customer records, conversations, websites, settings and stored files.</p>
              <label className="aichat-account-delete-confirm">
                Type DELETE to confirm
                <input className="aichat-input" value={accountDeleteConfirmation} onChange={(event) => setAccountDeleteConfirmation(event.target.value)} autoComplete="off" />
              </label>
              {accountDeleteError && <p className="aichat-request-delete-error" role="alert">{accountDeleteError}</p>}
              <div className="aichat-confirm-actions">
                <button type="button" className="aichat-request-confirm-button" disabled={accountDeleting} onClick={() => setAccountDeleteOpen(false)}>Cancel</button>
                <button type="button" className="aichat-request-confirm-button" disabled={accountDeleting || accountDeleteConfirmation.trim() !== "DELETE"} onClick={() => void deleteOwnerAccount()}>{accountDeleting ? "Deleting…" : "OK"}</button>
              </div>
            </section>
          </div>
        )}

        {deleteChatTarget && (
          <div className="aichat-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingChat) setDeleteChatTarget(null); }}>
            <section className="aichat-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="misma-delete-chat-title">
              <div className="aichat-confirm-icon is-danger"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m3 3v7m6-7v7" /></svg></div>
              <h2 id="misma-delete-chat-title">Delete chat?</h2>
              <p><strong>{deleteChatTarget.name}</strong> and all messages in this conversation will be permanently deleted. This action cannot be undone.</p>
              <div className="aichat-confirm-actions">
                <button type="button" className="aichat-action-btn secondary" disabled={deletingChat} onClick={() => setDeleteChatTarget(null)}>Cancel</button>
                <button type="button" className="aichat-confirm-danger" disabled={deletingChat} onClick={() => void handleDeleteConversation(deleteChatTarget.id)}>{deletingChat ? "Deleting…" : "Delete chat"}</button>
              </div>
            </section>
          </div>
        )}
        {libraryPreviewAsset && (
          <LibraryFilePreview asset={libraryPreviewAsset} onClose={() => setLibraryPreviewAsset(null)} />
        )}
        {deleteAssetTarget && (
          <div className="aichat-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingAsset) setDeleteAssetTarget(null); }}>
            <section className="aichat-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="misma-delete-media-title">
              <div className="aichat-confirm-icon is-danger"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m3 3v7m6-7v7" /></svg></div>
              <h2 id="misma-delete-media-title">{deleteAssetTarget.libraryFileId ? "Delete from Library?" : "Delete from chat?"}</h2>
              <p>{deleteAssetTarget.libraryFileId
                ? `“${deleteAssetTarget.name || "This file"}” will be removed from your Library and its stored file will be deleted.`
                : `“${deleteAssetTarget.name || "This media"}” will be removed from its original conversation. Other chat messages will remain.`}</p>
              <div className="aichat-confirm-actions">
                <button type="button" className="aichat-action-btn secondary" disabled={deletingAsset} onClick={() => setDeleteAssetTarget(null)}>Cancel</button>
                <button type="button" className="aichat-confirm-danger" disabled={deletingAsset} onClick={() => void handleDeleteLibraryAsset(deleteAssetTarget)}>{deletingAsset ? "Deleting…" : "Delete media"}</button>
              </div>
            </section>
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
        {lightboxAttachment && <AttachmentImageLightbox attachment={lightboxAttachment} onClose={() => setLightboxAttachment(null)} />}
        {mediaActionStatus && <div className="aichat-media-toast" role="status">{mediaActionStatus}</div>}
      </main>
    </div>
  );
}
