# Gemini Live Test Isolation Rules

This rule applies whenever you are asked to work on or look at the `gemini-live-test` folder.

1. **Total Isolation from Voice AI**:
   - `gemini-live-test` is a COMPLETELY INDEPENDENT PROJECT from the parent `voiceai` project.
   - You MUST NOT use or reference components, rules, state, or designs from the `voiceai` project while working in this directory.
   - Development of `gemini-live-test` must never be "parallel" with `voiceai`. The features and architecture are distinct.

2. **Technology Stack**:
   - Backend: Python `asyncio`, Google Gemini AI (`google-genai`), and fallback architectures (Soniox & Gemini TTS).
   - Frontend: Vanilla JS with WebSocket communication.
   - Concurrency: The project relies on non-blocking async architecture (e.g., `asyncio.Queue` for TTS background workers). Do not regress to synchronous blocking calls for LLM or TTS.

3. **TTS Rules**:
   - **Edge TTS is STRICTLY FORBIDDEN**: Do NOT ever suggest, include as an option, or implement Edge TTS. If Edge TTS code remains anywhere, it MUST be removed immediately.

4. **UI Rules**:
   - **No Glassmorphism**: Avoid `backdrop-filter: blur`, semi-transparent backgrounds, etc.
   - Use solid backgrounds (`#ffffff` for light, `#1e293b` / `#0f172a` for dark mode). Ensure high contrast.
