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
  - Modals & Cards: Solid `#1e293b` (slate-800) or `#0f172a` (slate-900) in dark mode; solid `#ffffff` in light mode.
  - Inputs & Selects: Solid `#0f172a` (or `var(--input-bg)`) with a distinct solid border (`#334155` / `1px solid var(--border)`).
  - Selected Items / Active Cards: Distinct solid highlight background (e.g. `#1e3a8a` / `rgba(37,99,235,0.15)`) with sharp border (`#3b82f6`).
- **Typography & Contrast**:
  - Headings & Primary Text: Pure high-contrast (`#ffffff` / `#f8fafc`).
  - Secondary Text / Labels: Crisp `#94a3b8` (slate-400) or `#cbd5e1`.
  - Never place low-contrast dark blue text on dark backgrounds.
- **Buttons**:
  - Primary: Solid `#2563eb` / `#3b82f6` with clean `#ffffff` text.
  - Secondary / Cancel: Solid `#334155` border or background with crisp text.
