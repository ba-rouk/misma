# Misma design system

All new dashboard routes and UI must use the shared tokens and primitives in `src/styles.css`, `src/plugins-system.css`, and `src/components/glass-ui.tsx`. Do not introduce one-off palettes or typography scales.

## Visual language
- Dark canvas: `#07111d`; elevated dashboard surface: `#0d1a29`.
- Glass surfaces: white at 5% opacity, 1px white at 10% opacity, 20–24px blur with 140% saturation, subtle inner top highlight, soft large shadow, and 20–24px corner radius.
- Scrim: `rgba(5,7,10,.6)` with 6px blur. Panels retain the dashboard's navy tint.
- Accent: Misma blue for interactive controls and green for positive/connected status only.
- Titles use Source Serif 4; body and controls use Inter.
- Unsupported backdrop filters must fall back to solid navy surfaces.
- Respect reduced motion, keyboard focus, accessible names, and 4.5:1 text contrast.

## Primitives
Use `GlassCard`, `GlassModal`, `GlassRow`, `Button`, `Badge`, `Chip`, `Input`, and `SectionHeader` from `src/components/glass-ui.tsx`. Extend this file rather than duplicating surface primitives. Bottom sheets use the same `GlassModal` shell with a mobile bottom-aligned modifier.

## Typography
Use the central CSS tokens. Body text is 16px; sidebar labels 16px; Recents 15px; helper and metadata text at least 14px. Do not introduce text smaller than 13px in dashboard interfaces.

## Responsive layout
At widths below 768px use a mobile drawer and single-column content. Do not squeeze desktop navigation into the viewport. Every modal must fit within the safe viewport and scroll internally.

## Plugin registry
Plugin identity, skills, scopes, information links, status, and previews belong in `src/lib/plugin-registry.ts`. Detail pages must render only capabilities that are implemented or explicitly labelled as unavailable/coming later. A manifest is descriptive metadata, not authorization. Server-side capability checks remain authoritative.
