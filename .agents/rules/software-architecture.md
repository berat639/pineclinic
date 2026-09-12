# Software Architecture & Engineering Standards

This rule applies to ALL Python, JavaScript, and backend/frontend logic written in this workspace.

## 1. Advanced & Performant Architecture
- Always research and implement the most modern, advanced, and highly performant architectural patterns for the given language or framework.
- Use asynchronous programming (e.g., `asyncio` in Python) where blocking operations would cause latency.
- Prefer event-driven, modular, and decoupled component designs.

## 2. Clean Code & Reliability (Zero-Bug Tolerance)
- Write flawless, clean, and highly readable code following SOLID principles.
- Apply DRY (Don't Repeat Yourself) and KISS (Keep It Simple, Stupid) strictly.
- Never write spaghetti code. Encapsulate logic appropriately into classes or functions.
- Prioritize robustness. Every modification must be meticulously verified to ensure existing systems are not broken. Do not introduce regressions.
- Always handle exceptions gracefully and provide meaningful error logging.

## 3. Strict UI Enforcement (No Transparency)
- Under NO circumstances should transparent or semi-transparent ("glassmorphism", `rgba(..., 0.X)`, `backdrop-filter: blur`) UI designs be used.
- All UI components must use solid, opaque backgrounds with clear, high-contrast borders and text.
