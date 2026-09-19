---
name: ui-design
description: UI Design Standards and Aesthetics Constraints
trigger: always_on
---

# UI Design Standards & Constraints

## 1. Strictly Prohibit Glassmorphism
- **FORBIDDEN**: Do NOT use glassmorphism, transparent frosted glass effects, `backdrop-filter: blur(...)`, or semi-transparent milky backgrounds (e.g. `rgba(255,255,255,0.03)`).
- **REQUIRED**: All cards, modals, dropdowns, popovers, and containers MUST use solid, opaque backgrounds.

## 2. Solid & High-Contrast Flat / Modern Surface Architecture
- **Surfaces**:
  - Modals & Cards: Solid `#1e293b` (slate-800) or `#0f172a` (slate-900) in dark mode; solid `#ffffff` in light mode. Always use `var(--card-bg, #1e293b)`.
  - Inputs & Selects: Solid `#0f172a` in dark mode; solid `#ffffff` in light mode. Always use `var(--input-bg, #0f172a)` with a distinct solid border `var(--input-border, #334155)`.
  - Selected Items / Active Cards: Distinct solid highlight background (e.g. `#1e3a8a` in dark, `#dbeafe` in light) with sharp border (`#3b82f6`).
- **Typography & Contrast**:
  - Headings & Primary Text: Pure high-contrast (`var(--foreground, #ffffff)` in dark; `#060d1a` in light).
  - Secondary Text / Labels: Crisp `var(--foreground-2, #94a3b8)` in dark; `#334155` / `#475569` in light.
  - Never place low-contrast dark blue text on dark backgrounds or light white text on light backgrounds.
- **Buttons**:
  - Primary: Solid `#2563eb` / `#3b82f6` with clean `#ffffff` text.
  - Secondary / Cancel: Solid `var(--card-inner, #334155)` or `var(--input-border, #334155)` with `var(--foreground, #ffffff)` text.

## 3. Strict Dual Theme (Light & Dark) Support
- **NEVER HARDCODE DARK-ONLY COLORS**: Writing hardcoded dark styles such as `background: '#1e293b'`, `background: '#0f172a'`, `color: '#ffffff'`, `border: '#334155'` directly into inline styles without theme variables is STRICTLY PROHIBITED.
- **ALWAYS USE CSS VARIABLES**: Use `var(--card-bg)`, `var(--input-bg)`, `var(--input-border)`, `var(--foreground)`, `var(--foreground-2)`, `var(--foreground-3)`, `var(--glass-border)`, `var(--card-inner)`, `var(--accent)`, `var(--danger)` etc.
- Every newly created or modified component (modal, popover, button, notification box, calendar cell, context menu) MUST look pixel-perfect and highly legible in BOTH dark mode and light mode.

