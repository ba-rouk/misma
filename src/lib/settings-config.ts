export type SettingsItem = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  group: string;
  searchKeywords: string[];
};

export type SettingsGroup = {
  label: string;
  items: SettingsItem[];
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Profile",
    items: [{
      id: "settings-profile", slug: "profile", label: "Profile", icon: "profile",
      group: "Profile", searchKeywords: ["profile", "name", "email", "avatar", "picture", "photo", "personal details"],
    }],
  },
  {
    label: "Business",
    items: [{
      id: "settings-business", slug: "business", label: "Business profile & team", icon: "manage",
      group: "Business", searchKeywords: ["business", "company", "workspace", "team", "staff", "members", "business name", "permissions"],
    }],
  },
  {
    label: "Account",
    items: [{
      id: "settings-account", slug: "account", label: "Account", icon: "profile",
      group: "Account", searchKeywords: ["account", "email", "identity", "delete account", "sign in", "security"],
    }],
  },
  {
    label: "Data controls",
    items: [
      {
        id: "settings-data-controls", slug: "data-controls", label: "Data controls", icon: "privacy",
        group: "Data controls", searchKeywords: ["data", "privacy", "export", "delete", "conversation history", "chat history", "retention", "personal information"],
      },
      {
        id: "settings-memory", slug: "memory", label: "Misma Memory", icon: "history",
        group: "Data controls", searchKeywords: ["memory", "saved facts", "remember", "past conversations", "context", "recall", "saved information"],
      },
    ],
  },
  {
    label: "App",
    items: [
      {
        id: "settings-accent", slug: "appearance", label: "Appearance", icon: "accent",
        group: "App", searchKeywords: ["appearance", "theme", "dark mode", "light mode", "background", "color", "font size", "contrast", "motion"],
      },
      {
        id: "settings-notifications", slug: "notifications", label: "Notifications", icon: "notifications",
        group: "App", searchKeywords: ["notifications", "push", "alerts", "browser", "human requests", "chat activity", "product updates"],
      },
      {
        id: "settings-voice", slug: "voice", label: "Voice", icon: "voice",
        group: "App", searchKeywords: ["voice", "speech", "read aloud", "microphone", "mic", "speak", "transcription", "dictation"],
      },
      {
        id: "settings-about", slug: "about", label: "About Misma", icon: "about",
        group: "App", searchKeywords: ["about", "version", "application", "misma", "terms", "privacy policy"],
      },
    ],
  },
  {
    label: "Support",
    items: [{
      id: "settings-help-center", slug: "help-center", label: "Help Center", icon: "help",
      group: "Support", searchKeywords: ["help", "support", "contact", "feedback", "report a problem", "guides", "articles"],
    }],
  },
];

export const SETTINGS_ITEMS = SETTINGS_GROUPS.flatMap((group) => group.items);
export const SETTINGS_ITEM_BY_ID = Object.fromEntries(SETTINGS_ITEMS.map((item) => [item.id, item])) as Record<string, SettingsItem>;

export function getSettingsItemBySlug(slug: string): SettingsItem | undefined {
  return SETTINGS_ITEMS.find((item) => item.slug === slug);
}

export function getSettingsItemById(id: string): SettingsItem | undefined {
  return SETTINGS_ITEM_BY_ID[id];
}

export function getSettingsRoute(itemOrId: SettingsItem | string): string {
  const item = typeof itemOrId === "string" ? getSettingsItemById(itemOrId) : itemOrId;
  return item ? "/dashboard/settings/" + item.slug : "/dashboard/settings/profile";
}
