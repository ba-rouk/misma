import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  getMismaData,
  getConversationMessages,
  createConversation,
  deleteConversation,
  addKnowledge,
  deleteKnowledge,
  updateOrderStatus,
  saveWorkspaceProfile,
} from "../lib/api/misma.functions";
import { getSupabaseClient, getSupabaseConfig } from "../lib/supabase";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type TabId = "workspace" | "build" | "connect" | "manage" | "recent";

type Message = {
  id: string;
  role: "customer" | "ai" | "human" | "system";
  text: string;
  created_at?: string;
};

type ActionIconName =
  | "copy"
  | "share"
  | "edit"
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

  // Business and user data
  const [workspace, setWorkspace] = useState<any>(null);
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
  const [messageFeedback, setMessageFeedback] = useState<Record<string, "up" | "down">>({});
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

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

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

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
          setProfileName(
            displayName ?? s.user.email?.split("@")[0] ?? "Your account",
          );
          setProfileImage(image ?? "");
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
    setActiveTab("workspace");
    setMobileMenuOpen(false);
    shouldAutoScrollRef.current = true;
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
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

  // Sending message
  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? draft).trim();
    if (!textToSend || isSending || !token) return;

    // Optimistically show user message
    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      role: "human",
      text: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setDraft("");
    setChatError("");
    setFailedPrompt("");
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
        body: JSON.stringify({
          message: textToSend,
          conversationId: currentConversationId,
        }),
      });
      const res = (await response.json()) as {
        error?: string;
        conversationId?: number;
        aiMessage?: Message;
      };
      if (!response.ok)
        throw new Error(res.error || "Failed to connect to Misma AI.");
      if (!res.aiMessage)
        throw new Error("Misma AI returned an empty response.");
      const aiMessage = res.aiMessage;

      if (!currentConversationId && res.conversationId) {
        setCurrentConversationId(res.conversationId);
      }

      // Add real AI response
      setMessages((prev) => [...prev, aiMessage]);
      loadData();
    } catch (cause) {
      const errMsg =
        cause instanceof Error
          ? cause.message
          : "Failed to connect to Misma AI.";
      setChatError(errMsg);
      setFailedPrompt(textToSend);
      // Restore draft on failure
      setDraft(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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

        {/* 1. MAIN SIDEBAR PRIMARY NAVIGATION (Exact 5 Required Items in Order) */}
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

          {/* 2. Build */}
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
              {conversations.length === 0 ? (
                <div className="aichat-chats-widget-empty">No chats yet.</div>
              ) : (
                conversations.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`aichat-chats-widget-item${currentConversationId === c.id ? " active" : ""}`}
                    onClick={() => void selectConversation(c.id)}
                    title={c.text || c.name || "Conversation"}
                  >
                    <span
                      className="aichat-chats-widget-dot"
                      aria-hidden="true"
                    />
                    <span className="aichat-chats-widget-item-text">
                      {c.name
                        ? `${c.name}: ${c.text ? c.text.slice(0, 22) : "Chat"}`
                        : c.text
                          ? c.text.slice(0, 30)
                          : "Conversation"}
                    </span>
                  </button>
                ))
              )}
              {conversations.length > 0 && (
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
            className="aichat-user-profile"
            onClick={() => setProfileMenuOpen((v) => !v)}
            aria-label="Account profile"
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
          <div
            className="aichat-scroll-area"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <div className="aichat-conversation-wrap">
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
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`aichat-message-row ${msg.role === "human" || msg.role === "customer" ? "is-user" : "is-ai"}`}
                  >
                    {msg.role === "ai" && (
                      <div className="aichat-msg-avatar ai" title="Misma AI">
                        <svg viewBox="0 0 100 100" width="16" height="16">
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
                    )}
                    <div className="aichat-bubble">
                      <MarkdownContent content={msg.text} />
                    </div>
                    {(msg.role === "human" || msg.role === "customer") && (
                      <div className="aichat-msg-avatar user" title="You">
                        {profileName[0]?.toUpperCase() ?? "U"}
                      </div>
                    )}
                  </div>
                ))
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
                  {failedPrompt && (
                    <button
                      type="button"
                      className="aichat-retry-btn"
                      onClick={() => void handleSend(failedPrompt)}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Message Composer */}
            <div className="aichat-composer-container">
              <div className="aichat-composer-inner">
                <form
                  className="aichat-composer-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    className="aichat-composer-textarea"
                    placeholder="Message Misma…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                    aria-label="Message Misma"
                  />
                  <button
                    type="submit"
                    className={`aichat-composer-send-btn${draft.trim() && !isSending ? " can-send" : ""}`}
                    disabled={!draft.trim() || isSending}
                    title="Send message"
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </form>
                <p className="aichat-disclaimer-text">
                  Misma can make mistakes. Verify important business details.{" "}
                  <a href="#">Learn more</a>
                </p>
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
                          <th>Customer</th>
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

        {/* ── View 5: Recent Conversations ── */}
        {activeTab === "recent" && (
          <div className="aichat-tab-view">
            <div className="aichat-tab-content">
              <div className="aichat-tab-header">
                <h2>Recent Conversations ({conversations.length})</h2>
                <p>
                  Browse and reopen past customer conversations from all
                  connected channels.
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

                {conversations.length === 0 ? (
                  <p style={{ color: "#657180" }}>
                    No recorded conversations yet. Start chatting in Workspace!
                  </p>
                ) : (
                  <div className="aichat-table-wrap">
                    <table className="aichat-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Channel</th>
                          <th>Latest Message</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversations
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
                                {c.name || "Customer"}
                              </td>
                              <td>
                                <span className="aichat-header-badge">
                                  {c.channel || "Dashboard"}
                                </span>
                              </td>
                              <td>
                                {c.text ? c.text.slice(0, 50) : "No message"}
                              </td>
                              <td>{c.status || "AI"}</td>
                              <td
                                style={{
                                  textAlign: "right",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className="aichat-action-btn secondary"
                                  style={{
                                    height: 32,
                                    padding: "0 10px",
                                    fontSize: 13,
                                    marginRight: 8,
                                  }}
                                  onClick={() => void selectConversation(c.id)}
                                >
                                  Open Chat
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    color: "#ff7b72",
                                    background: "transparent",
                                    border: 0,
                                    padding: "4px 8px",
                                    fontSize: 13,
                                    cursor: "pointer",
                                  }}
                                  onClick={() =>
                                    void handleDeleteConversation(c.id)
                                  }
                                  title="Delete conversation"
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
      </main>
    </div>
  );
}
