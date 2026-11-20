# Misma in-chat execution foundation

## Current workflow

The dashboard sends ordinary chat messages through the existing `misma-chat` function. When the customer has enabled the GitHub plugin and asks to install the Misma widget, the dashboard first offers the message to `misma-execution`. The execution function returns `handled: false` for ordinary messages, which continue through the usual AI provider route.

The initial workflow is deliberately approval-gated:

1. Authenticate the user and require workspace owner/admin membership.
2. Resolve a connected GitHub App installation scoped to the selected workspace.
3. Resolve the active Misma website. When more than one website is connected, ask the customer to select one.
4. List repositories accessible to that GitHub App installation.
5. Inspect the chosen repository tree and choose a known entry point.
6. Store a server-side patch plan and show the exact entry point to the customer.
7. Wait for an explicit `APPROVE` message or `CANCEL`.
8. Re-check the original file SHA, create a dedicated branch, commit only the widget entry-point patch, and open a pull request.
9. Keep the execution in `awaiting_merge`. The assistant does not claim that the website is live.

## Supported verified entry points in this foundation

- Next.js App Router root layout (TSX/JSX/JS).
- Next.js Pages Router custom document.
- Angular `src/index.html`.
- SvelteKit `src/app.html`.
- Astro `src/layouts/Layout.astro`.
- Laravel `resources/views/layouts/app.blade.php` or `resources/views/layout.blade.php`.
- Django `templates/base.html`.
- PHP `index.php` when it is a full HTML document.
- Static/Vite/React/Vue HTML shell `index.html` or `public/index.html`.

Detection is conservative. If no verified shared entry point exists, Misma stops and explains why rather than editing an arbitrary file. Framework detection is not equivalent to universal support for every framework or template structure.

## Security and persistence

- GitHub App installation tokens are generated server-side and optionally restricted to the selected repository.
- The browser never receives a GitHub installation token or the GitHub App private key.
- Execution plans, patch contents, approvals, steps, logs, repository installation links and deployment records are stored in service-role-only tables.
- The plan is bound to the workspace, conversation, repository, website and original Git blob SHA.
- Approval requires a new authenticated owner/admin chat turn in the same conversation.
- The file SHA is re-checked before writing. If it changed, the workflow stops instead of overwriting concurrent work.
- Every approved installation uses a dedicated branch and pull request. The production branch is not written directly.

## Not yet enabled

This increment establishes the chat execution workflow and a first set of verified widget adapters. It does not yet provide a resumable background worker for Vercel/Render/Netlify deployment verification, automatic post-merge deployment health checks, Netlify customer authorization, or direct natural-language execution of arbitrary repository changes. Hosting project connection and deployment tables are included as the persistence foundation; they do not by themselves enable deployment automation.
