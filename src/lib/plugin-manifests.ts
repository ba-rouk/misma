export type PluginId = "github" | "vercel" | "render" | "netlify";
export type PluginStatus = "available" | "coming";
export type PluginAuthType = "github_app" | "vercel_marketplace_oauth" | "netlify_oauth" | "oauth_pending" | "coming";

export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  icon: "database" | "git-branch" | "file-code" | "git-pull-request" | "layers" | "link" | "activity" | "rocket" | "server" | "globe";
}

export interface PluginPreviewCard {
  id: string;
  title: string;
  description: string;
  kind: "repository" | "projects" | "services" | "sites";
}

export interface PluginManifest {
  id: PluginId;
  name: string;
  role: string;
  tagline: string;
  description: string;
  developer: string;
  website: string;
  version: string;
  privacyUrl: string;
  termsUrl: string;
  icon: PluginId;
  brandColor: string;
  skills: PluginSkill[];
  permissions: string[];
  previewCards: PluginPreviewCard[];
  status: PluginStatus;
  authType: PluginAuthType;
  category: "Code host" | "Hosting";
}

export const pluginManifests: Record<PluginId, PluginManifest> = {
  github: {
    id: "github",
    name: "GitHub",
    role: "Code host",
    tagline: "Connect repositories and prepare safe website changes.",
    description: "Misma connects through its GitHub App installation. It can inspect the repositories you authorize, prepare a Misma widget installation change on a dedicated branch, and open a pull request for your review. Misma does not push these changes directly to your production branch.",
    developer: "GitHub, Inc.",
    website: "https://github.com",
    version: "1.0.0",
    privacyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement",
    termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
    icon: "github",
    brandColor: "#f2f4f8",
    status: "available",
    authType: "github_app",
    category: "Code host",
    skills: [
      { id: "read-repository", name: "Read repository", description: "Inspect files and project structure in repositories selected for the Misma GitHub App.", icon: "database" },
      { id: "add-widget-script", name: "Prepare widget script", description: "Prepare an idempotent installation change on a dedicated feature branch.", icon: "file-code" },
      { id: "open-pull-request", name: "Open pull request", description: "Create a pull request so you can inspect and merge the change.", icon: "git-pull-request" },
    ],
    permissions: [
      "Read repository metadata for repositories selected in the GitHub App installation.",
      "Read repository contents needed to identify the framework and installation point.",
      "Create a dedicated branch and pull request for an approved widget change.",
      "Misma does not push widget changes directly to your production/default branch.",
      "Misma does not delete repositories, change repository visibility, or manage GitHub billing.",
    ],
    previewCards: [
      { id: "repository", title: "Repository access", description: "A connected repository and its default branch, ready for a scoped review.", kind: "repository" },
      { id: "pull-request", title: "Widget installation change", description: "A sample feature-branch diff and pull-request review flow.", kind: "repository" },
    ],
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    role: "Hosting",
    tagline: "Discover Vercel projects and associate them with your websites.",
    description: "Connect your Vercel account through the registered Vercel integration. Misma can discover projects accessible to the connected account and associate a selected hosting project with a registered Misma website. Deployment controls are not enabled in this release.",
    developer: "Vercel Inc.",
    website: "https://vercel.com",
    version: "1.0.0",
    privacyUrl: "https://vercel.com/legal/privacy-notice",
    termsUrl: "https://vercel.com/legal/terms",
    icon: "vercel",
    brandColor: "#f4f5f7",
    status: "available",
    authType: "vercel_marketplace_oauth",
    category: "Hosting",
    skills: [
      { id: "list-projects", name: "List projects", description: "Discover projects returned by the connected Vercel account.", icon: "layers" },
      { id: "associate-project", name: "Link hosting project", description: "Associate a selected project with a Misma website.", icon: "link" },
    ],
    permissions: [
      "Read the Vercel account and project information needed to list accessible projects.",
      "Read project metadata used to match a hosting project with a Misma website.",
      "Save the project-to-website association in your Misma workspace.",
      "Misma does not read or change project environment variables in this integration flow.",
      "Deployment triggering and redeploy controls are not enabled in this release.",
    ],
    previewCards: [
      { id: "projects", title: "Hosting projects", description: "A sample list of projects discovered from the connected Vercel account.", kind: "projects" },
      { id: "association", title: "Website association", description: "Choose which Vercel project belongs to a registered Misma website.", kind: "projects" },
    ],
  },
  render: {
    id: "render",
    name: "Render",
    role: "Hosting",
    tagline: "Connect Render services to the right Misma website.",
    description: "Misma's current Render REST integration uses customer-owned API keys, but the customer experience is being moved to provider sign-in. Render has not yet issued Misma a third-party OAuth client, so account authorization is not available. Misma will not ask you to paste a personal API key into this plugin page.",
    developer: "Render Services, Inc.",
    website: "https://render.com",
    version: "1.0.0",
    privacyUrl: "https://render.com/privacy",
    termsUrl: "https://render.com/terms",
    icon: "render",
    brandColor: "#9fd5ff",
    status: "available",
    authType: "oauth_pending",
    category: "Hosting",
    skills: [
      { id: "list-services", name: "List services", description: "Discover services after Render account authorization is enabled.", icon: "server" },
      { id: "associate-service", name: "Link hosting service", description: "Associate a selected Render service with a Misma website.", icon: "link" },
    ],
    permissions: [
      "No Render account permissions are requested until Render registers Misma as an OAuth client.",
      "The existing API-key adapter is not exposed as a customer-facing connection method.",
      "Misma will not ask you to paste a personal Render API key here.",
      "Deploy triggering and redeploy controls are not enabled in this release.",
    ],
    previewCards: [
      { id: "services", title: "Render services", description: "Example service rows only; real account discovery becomes available after OAuth approval.", kind: "services" },
      { id: "association", title: "Website association", description: "An example of matching a hosting service to a registered Misma website.", kind: "services" },
    ],
  },
  netlify: {
    id: "netlify",
    name: "Netlify",
    role: "Hosting",
    tagline: "Connect sites and inspect your Netlify projects.",
    description: "Misma connects through Netlify OAuth, securely stores the authorized access token in its encrypted credential vault, and discovers the sites available to your account. You can associate a Netlify site with a Misma website and use its project details in your workflow.",
    developer: "Netlify, Inc.",
    website: "https://www.netlify.com",
    version: "1.0.0",
    privacyUrl: "https://www.netlify.com/privacy/",
    termsUrl: "https://www.netlify.com/legal/terms-of-use/",
    icon: "netlify",
    brandColor: "#32c6c8",
    status: "available",
    authType: "netlify_oauth",
    category: "Hosting",
    skills: [
      { id: "discover-sites", name: "Discover sites", description: "List the Netlify sites available to the account you authorize.", icon: "globe" },
      { id: "read-site-metadata", name: "Read site details", description: "Inspect site names, domains, repository metadata and dashboard links.", icon: "activity" },
    ],
    permissions: ["Read sites and project metadata available to your Netlify account.", "Misma stores the access token encrypted and does not expose it to the browser."],
    previewCards: [
      { id: "sites", title: "Netlify sites", description: "Connect the projects you want to manage from Misma.", kind: "sites" },
    ],
  },
};

export const pluginList = Object.values(pluginManifests);
export function getPluginManifest(id: string): PluginManifest | null {
  return Object.prototype.hasOwnProperty.call(pluginManifests, id)
    ? pluginManifests[id as PluginId]
    : null;
}
