# Reusable UI Design Styles Guide

Use this as a design decision guide for KHELOGO and future websites. Choose styles based on the audience, content, device performance, and accessibility needs; do not force all styles into one screen.

## The 15 styles from the reference

1. **Minimalism** — remove nonessential decoration; use when clarity and task completion matter most.
2. **Maximalism** — layered colour, patterns, and expressive composition; reserve for creative campaigns and brand moments.
3. **Glassmorphism** — translucent, blurred surfaces; use selectively for overlays, navigation, and hero accents, never for dense body text.
4. **Neumorphism** — soft raised/inset surfaces; use sparingly and keep visible borders, labels, and focus indicators.
5. **Claymorphism** — soft, inflated, playful surfaces; useful for friendly consumer experiences and playful illustrations.
6. **Brutalism** — raw typography, visible structure, minimal polish; best for intentionally bold editorial or art-led projects.
7. **Neo-Brutalism** — strong outlines, high contrast, bold blocks, playful shadows; use when a distinctive, energetic identity is desired.
8. **Skeuomorphism** — familiar real-world material/controls; use only when the physical metaphor improves understanding.
9. **Flat Design** — simple surfaces and explicit colour; a strong baseline for fast, readable, information-heavy pages.
10. **Material Design** — consistent elevation, components, motion, and interaction states; useful for mobile-first products and dashboards.
11. **Bento UI** — modular cards with varied sizes; good for feature showcases, dashboards, and scannable game libraries.
12. **Y2K Design** — early-digital gloss, chrome, playful futuristic details; best for a deliberate retro-tech brand.
13. **Retro Design** — period-specific type, palettes, and textures; use when nostalgia is part of the brand.
14. **Cyberpunk** — neon, dark surfaces, high-energy contrast; appropriate for game/tech branding, but keep text readable.
15. **Editorial Design** — strong typography, whitespace, hierarchy, and image-led storytelling; good for long-form content and brand stories.

## Production rules

- Start with information architecture and a small design-token system (colour, spacing, radius, typography, elevation) before decorating.
- Combine styles intentionally. A reliable production default is **flat/semi-flat structure + bento layout + restrained glass accents**. Use cyberpunk accents only where they reinforce the game brand.
- Keep readable content on solid or nearly solid surfaces. Do not place small text on busy gradients or translucent backgrounds.
- Keep contrast strong, visible keyboard focus, semantic headings, labels on controls, and reduced-motion support.
- Build mobile-first; test narrow screens and low/mid-range Android devices. Prefer CSS transitions over heavy animation libraries.
- Do not sacrifice navigation, load performance, accessibility, or task completion for visual trends.
- Never imply a backend capability from UI alone. Wallets, referrals, payments, account changes, and reward credits require trusted server-side validation and database rules.
- Use real data only when its source and permissions are verified. If a feature is not implemented, label it accurately rather than implying it is live.

## Current KHELOGO direction

- **Foundation:** dark flat/semi-flat surfaces, consistent typography, strong contrast, clear interaction states.
- **Layout:** bento-inspired responsive game cards and compact account summary panels.
- **Accents:** restrained glass effect on hero/overlay surfaces, cyan/purple/pink brand accents, subtle motion.
- **Data safety:** signed-in wallet and referral fields are read-only in the website. Browser arcade scores do not modify the wallet.
- **Do not ship as real-money functionality** until server-authoritative game rounds, wallet ledger, anti-abuse checks, rules, and required legal/payment reviews are in place.
