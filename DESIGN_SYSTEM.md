# Misma Design System

All new Misma dashboard pages and components must use the shared tokens in `src/misma-design-system.css` and the shared primitives in `src/components/misma-glass.tsx`.

## Visual language
- Use the Misma palette: `--misma-bg`, `--misma-surface`, `--misma-glass-surface`, `--misma-glass-border`, `--misma-green`, `--misma-text`, and `--misma-muted`.
- Glass surfaces use a translucent white 5% fill, a 1px white 10% border, a subtle inset top highlight, 20–24px radius, a soft large shadow, and a 22px blur with 140% saturation.
- Always provide a solid dark fallback when `backdrop-filter` is unavailable.
- Dialog scrims use rgba(5,7,10,.6) plus a 6px blur. Modal panels are tinted with Misma's dark background and have accessible labels and escape/backdrop dismissal.
- Use Source Serif 4 for display titles and Inter for body copy. Keep body text at 16px, sidebar labels at 16px, Recent items at 15px, helper/meta text at least 14px, and no new text below 13px unless it is an icon-only control with an accessible label.
- Use mobile-first layouts. Below 768px, side navigation remains a proper slide-in drawer; do not squeeze desktop columns into the viewport.

## Required primitives
Use `GlassCard`, `GlassModal`, `GlassRow`, `Button`, `Badge`, `Chip`, `Input`, `Toggle`, `SectionHeader`, and `StickyActionBar` from `src/components/misma-glass.tsx` where appropriate.
- `SettingsCard`, `SettingsRow`, `SettingsHome`, `SettingsDetail`, `SettingsLayout`, and `SettingsSearch` live in `src/components/settings-mobile.tsx`. Settings sections and metadata are defined once in `src/lib/settings-config.ts`; use that config for desktop navigation, mobile rows, route slugs, and search keywords.
- `BackButton` and `PageHeader` live in `src/components/misma-page-header.tsx`. Use the shared circular back control on nested pages and omit it from the first/root page.
- `MismaColorPicker` in `src/components/misma-color-picker.tsx` is the shared color control for Appearance. It provides saturation/brightness, hue, opacity, HEX/RGB/HSL entry, and locally saved swatches; use it instead of browser-native color inputs.

## Accessibility
- Interactive controls need keyboard operation, focus-visible states, labels, and semantic roles.
- Maintain at least 4.5:1 contrast for standard text.
- Use buttons for actions and anchors for navigation. Never encode status by color alone.
- Respect reduced-motion preferences and mobile safe-area insets. Mobile Settings search tracks the visual viewport so it remains above the on-screen keyboard.

## Plugin pages
Plugin information comes from `src/lib/plugin-manifests.ts`. Do not advertise a skill, permission, authentication method, or deployment action until the corresponding backend capability exists and is verified. Provider credentials must never be rendered in browser UI or browser logs.
