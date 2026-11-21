export type PluginId = "github" | "vercel" | "render" | "netlify";
export type PluginStatus = "available" | "coming";
export type PluginManifest = {
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
  brandColor: string;
  status: PluginStatus;
  authType: "github_app" | "oauth" | "render_oauth_pending" | "unavailable";
  category: "developer" | "hosting";
  skills: Array<{ name: string; icon: string }>;
  permissions: string[];
  never: string[];
  previewCards: Array<{ title: string; description: string; example: "repository" | "deployment" | "service" | "coming" }>;
};
export const PLUGIN_MANIFESTS: Record<PluginId, PluginManifest> = {
  github: {
    id: "github", name: "GitHub", role: "Code host",
    tagline: "Bring your repositories into Misma.",
    description: "Connect GitHub so Misma can inspect the repositories you authorize, prepare reviewed website changes, and open pull requests for your approval. Misma works with selected repositories through its GitHub App installation.",
    developer: "Misma", website: "https://github.com", version: "1.0.0",
    privacyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement", termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
    brandColor: "#aeb8c7", status: "available", authType: "github_app", category: "developer",
    skills: [{ name: "List authorized repositories", icon: "book-open" }, { name: "Prepare widget installation", icon: "code" }, { name: "Open pull request", icon: "git-pull-request" }],
    permissions: ["Read repository metadata and contents for repositories included in your GitHub App installation.", "Create a dedicated branch and pull request when you approve a proposed website change."],
    never: ["Misma does not push changes directly to your production branch.", "Misma does not access repositories you have not selected for the GitHub App installation."],
    previewCards: [{ title: "Repository context", description: "Understand the selected website codebase before proposing a change.", example: "repository" }, { title: "Reviewed changes", description: "Inspect a proposed widget installation before a pull request is opened.", example: "repository" }],
  },
  vercel: {
    id: "vercel", name: "Vercel", role: "Hosting",
    tagline: "See your Vercel projects and deployments.",
    description: "Connect your Vercel account to discover projects, associate a hosting project with a Misma website, inspect deployment status, and request a redeploy when you explicitly approve it.",
    developer: "Vercel", website: "https://vercel.com", version: "1.0.0",
    privacyUrl: "https://vercel.com/legal/privacy-policy", termsUrl: "https://vercel.com/legal/terms",
    brandColor: "#f5f7fa", status: "available", authType: "oauth", category: "hosting",
    skills: [{ name: "List projects", icon: "folder" }, { name: "View latest deployment", icon: "activity" }, { name: "Associate hosting project", icon: "link" }],
    permissions: ["Read the Vercel account and projects you authorize.", "Read deployment status and trigger a redeploy only after your approval."],
    never: ["Misma does not change project environment variables.", "Misma does not trigger a deployment without your approval."],
    previewCards: [{ title: "Project overview", description: "Review your connected Vercel projects and their deployment activity.", example: "deployment" }, { title: "Deployment status", description: "Check whether the latest deployment is ready or has failed.", example: "deployment" }],
  },
  render: {
    id: "render", name: "Render", role: "Hosting",
    tagline: "Connect your Render services to Misma.",
    description: "Misma's Render connection currently supports the existing customer API-key integration. A Render-issued OAuth client is not yet available to Misma, so browser-based account authorization is not enabled. This detail page will become the OAuth connection entry point once Render approves a client registration.",
    developer: "Render", website: "https://render.com", version: "1.0.0",
    privacyUrl: "https://render.com/privacy", termsUrl: "https://render.com/terms",
    brandColor: "#9ab6ff", status: "available", authType: "render_oauth_pending", category: "hosting",
    skills: [{ name: "List services", icon: "layers" }, { name: "Refresh service list", icon: "refresh-cw" }, { name: "Associate hosting service", icon: "link" }],
    permissions: ["When the approved connection method is available, Misma will request only the access needed to list services and inspect deployments.", "Deployment actions require explicit approval."],
    never: ["Misma will not request a shared Misma-owned Render API key from customers.", "Misma will not trigger deployments without explicit approval."],
    previewCards: [{ title: "Service overview", description: "See Render services associated with your Misma websites.", example: "service" }, { title: "Deployment activity", description: "Review deploy status before deciding what to do next.", example: "service" }],
  },
  netlify: {
    id: "netlify", name: "Netlify", role: "Hosting",
    tagline: "Netlify support is being prepared.",
    description: "The Netlify plugin will let you discover sites, associate a site with a Misma website, and inspect deployments after the customer authorization and deployment adapter are complete.",
    developer: "Netlify", website: "https://www.netlify.com", version: "Coming soon",
    privacyUrl: "https://www.netlify.com/privacy/", termsUrl: "https://www.netlify.com/legal/terms-of-use/",
    brandColor: "#69d5d0", status: "coming", authType: "unavailable", category: "hosting",
    skills: [{ name: "Site discovery", icon: "globe" }, { name: "Deployment status", icon: "activity" }],
    permissions: ["Permissions will be shown before Netlify connection becomes available."],
    never: ["Netlify access is not enabled yet."],
    previewCards: [{ title: "Coming soon", description: "Netlify features will appear here after the integration is ready.", example: "coming" }],
  },
};
export const PLUGIN_IDS = Object.keys(PLUGIN_MANIFESTS) as PluginId[];
