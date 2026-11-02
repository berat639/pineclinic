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
- **Buttons & Badges**:
  - **STRICT RULE — NEVER BLACK TEXT INSIDE BLUE BUTTONS**: Nowhere in the application (in either Light or Dark mode) may a blue button (`#0284c7`, `#2563eb`, `#3b82f6`, `#075cff`, `#1d4ed8`, `.primary`, `.btn-primary`, `.btn-clinic-primary`, etc.) ever have black or dark text (`#000000`, `#060d1a`, `#0f172a`, `var(--foreground)`). Every blue button and all of its inner elements (`span`, `svg`, etc.) MUST ALWAYS have pure white (`#ffffff`) text and icons. Global light-theme text overrides must never crush white text inside blue buttons.
  - Primary: Solid `#2563eb` / `#0284c7` with clean `#ffffff` text.
  - Secondary / Outline (Light mode): Crisp white or soft sky blue (`#ffffff` / `#eff6ff`), medical blue border (`#93c5fd` / `#3b82f6`), deep medical blue text (`#0284c7` / `#1d4ed8`). NEVER black / dark boxes.
  - Secondary / Outline (Dark mode): Deep clinical blue (`#132238`), border (`#1e40af`), bright medical blue text (`#60a5fa`).
  - Action / Soft Success (Excel, Import): Soft mint background (`#f0fdf4` in light, `#0b2e20` in dark), green border (`#86efac` in light, `#059669` in dark), mint text (`#15803d` in light, `#34d399` in dark).
  - Count / Status Badges: Soft blue pill (`#e0f2fe` with `#0369a1` in light; `#172554` with `#93c5fd` in dark).

## 3. Strict Dual Theme (Light & Dark) Support
- **NEVER HARDCODE DARK-ONLY COLORS**: Writing hardcoded dark styles such as `background: '#1e293b'`, `background: '#0f172a'`, `color: '#ffffff'`, `border: '#334155'` directly into inline styles without theme variables is STRICTLY PROHIBITED.
- **ALWAYS USE CSS VARIABLES**: Use `var(--card-bg)`, `var(--input-bg)`, `var(--input-border)`, `var(--foreground)`, `var(--foreground-2)`, `var(--foreground-3)`, `var(--glass-border)`, `var(--card-inner)`, `var(--accent)`, `var(--danger)` etc.
- Every newly created or modified component (modal, popover, button, notification box, calendar cell, context menu) MUST look pixel-perfect and highly legible in BOTH dark mode and light mode.

## 4. Clinical & Health Color Palette Architecture
- **Healthcare Identity**: This is a medical & clinic management platform. Colors must evoke health, hygiene, trust, and freshness.
- **Core Clinical Palette**: Medical Blue (`#0284c7`, `#2563eb`), Sky/Ice Blue (`#e0f2fe`, `#eff6ff`), Mint Green (`#15803d`, `#34d399`), and Pure Opaque White (`#ffffff`).
- **FORBIDDEN IN LIGHT MODE**: Creating buttons with black, charcoal, or dark-slate backgrounds (`#1e293b`, `#0f172a`, `#000000`) and colored text is STRICTLY FORBIDDEN in light mode. Light mode must be clean, luminous, and clinical.
- **DARK MODE CLINICAL IDENTITY**: Dark mode must use deep medical night blues (`#0b1329`, `#0f172a`, `#132238`) with vibrant medical blue (`#38bdf8`, `#60a5fa`) and mint accents (`#34d399`), rather than flat muddy grays.

## 5. Neomorphism & Claymorphism Ratio (Tedavi Planlama / `PineTreatmentPlan.module.css` Standard)
- While strictly keeping all surfaces 100% opaque (no glassmorphism/blur), apply the exact Neomorphism + Claymorphism depth ratio used in `PineTreatmentPlan.module.css`:
  - **Neomorphism (`--pc-neo-card`, `--pc-neo-subcard`, `--pc-neo-inset`)**: Outer extruded tactile shadows on solid cards/subcards and clean inset shadows (`--pc-neo-inset`) on all `input`, `select`, search boxes, and segmented tab tracks.
  - **Claymorphism (`--pc-clay-btn`, `--pc-clay-pale`, `--pc-clay-primary`, `--pc-clay-total`)**: 3D inner-rim highlights and soft outer elevation on buttons, badges, pills, and interactive cells. Primary blue buttons (`#075cff` / `#2563eb`) use `--pc-clay-primary` with pure `#ffffff` text/icons.

## 6. Standard Modal & Drawer Architecture ("Yeni Randevu" / `QuickCreatePopover` Standard)
- Every form/action modal (except full-screen workspaces like Odontogram/Treatment Planning and right-side drawers like `Mesai Planla` / `ShiftEditorSidebar`) MUST match the exact dimensions, colors, and backdrop of **Yeni Randevu (`QuickCreatePopover.tsx`)**:
  - **Backdrop**: Fixed `inset: 0`, `background: var(--modal-overlay)` (`rgba(15, 23, 42, 0.6)`), never transparent or missing.
  - **Shadow (No Bright White Halo)**: Never use white outer shadows (`-3px -3px 8px #ffffff`) on modals, drawers, or popovers over dark overlays. Always use `boxShadow: var(--pc-modal-shadow)`.
  - **Modal Container**: `width: min(460px, calc(100vw - 24px))`, `maxWidth: 460px`, `maxHeight: 90vh`, `borderRadius: 14px`, solid `background: var(--card-bg)`, `border: 1.5px solid var(--input-border)`, `boxShadow: var(--pc-modal-shadow)`.
  - **Cohesive Deep Clinical Blue**: All primary buttons, active tabs, and selected pills must use the same deep clinical blue (`linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)`, border `#1d4ed8`, text `#ffffff`).
  - **Custom DatePicker & Interactive Slider HourPicker**: Avoid raw browser-native `<input type="date">` and long `<select>` hour dropdowns; use custom `DayPicker` popovers and dual-thumb 24-hour range sliders + hour grid popovers (`InteractiveTimeRangePicker`).

## 7. Treatment Planning, Odontogram, Session Scheduling & Context Menu Standards (Anti-Regression Rules)
- **Procedure Color Picker & Cross-View Color Synchronization**:
  - When adding or editing a procedure in the Treatment Planning modal (`InlineCatalogForm.tsx` / `PineTreatmentPlanView.tsx`), a **Clinical Procedure Color Picker** must always be present; the redundant `Diş / Çene / Tüm ağız` (`catalogScope`) select box must NOT be included there.
  - The selected procedure color must be rendered with identical color identity across the Treatments catalog, Treatment Plan table, the top indicator bar/dots of Odontogram teeth, the right-panel Treatment Plan cards (`CalendarTab.tsx`), and the Daily Calendar Session Scheduling modal (`FastScheduleModal.tsx`).
- **Odontogram Assigned Tooth Appearance (Round Color Dots), Completed Procedure Edit Warning & Right-Click Context Menu**:
  - In the Odontogram, tooth background color must reflect ONLY selection state (`var(--card-bg)` when unselected, `var(--pc-blue)` when selected); unselected teeth with assigned procedures must NOT be painted dark navy (`#1e293b` / `#1e3a5f`).
  - Assigned procedures on a tooth must be displayed as **round colored dots (`8px × 8px`, `border-radius: 50%`)** at the top of the tooth (never a full-width bar) so multiple procedures on the same tooth appear side by side clearly.
  - In Edit (`Düzenle`) mode, previously **completed (`completed`)** procedures must remain editable and deletable (both in the table and in the right-click context menu), triggering a warning toast on change/delete and a confirmation modal (`ConfirmModal`) before saving.
  - The right-click context menu on a tooth (`PlanToothTools.tsx`) must cleanly provide only individual deletion of assigned procedures (**"Atanan İşlemler (Sil)"**) and adding procedures/indications (**"İşlem Ekle" / "Endikasyon Ekle"**).
- **Context Menu Viewport Locking (No Drift on Page Scroll)**:
  - All right-click context menus across the application (`PlanToothContextMenu`, `ShiftContextMenu`, `eventContextMenu`, etc.) must use a full-screen fixed capture backdrop (`position: fixed; inset: 0`) and lock background scrolling (`wheel` prevention) while open, strictly preventing the context menu from detaching and drifting away from its target element when the page or modal scrolls.
- **Long Descriptions in Dropdowns & Forms Inside Info Tooltips (`ⓘ`)**:
  - In popovers/dropdowns such as treatment reminder notifications (TDB checkup intervals, etc.), long explanatory texts and recommendation rationales must not be stacked directly inside the box; instead, they must be displayed inside an opaque, high-contrast **tooltip** triggered by an `ⓘ` info icon next to the title.
- **Session Scheduling (`FastScheduleModal.tsx`) 1-Minute Granularity, Pastel Colors & Conflict Rules**:
  - Treatment time scheduling must not be forced into rigid 15/30-minute steps; it must support smooth dragging and resizing at **1-minute flexible resolution** with high FPS (`pointermove`).
  - The selection box must never be dark blue with black text; it must use soft clinical pastel tones matching other appointment cards and synchronized with the procedure color.
  - A doctor cannot treat **two different patients** at the same time (dragging/dropping onto another patient's appointment is locked); however, multiple procedures for the **same patient** can be grouped into a single session or merged by dragging onto an existing session of that patient.



