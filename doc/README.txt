================================================================================
SAL — AI-POWERED FRONTEND WEBSITE CLONING & MODIFICATION AGENT
Project Overview & Technical Reference Guide
================================================================================

1. SETUP INSTRUCTIONS
--------------------------------------------------------------------------------
Prerequisites:
  - Node.js (v18.0.0 or higher recommended)
  - npm (v9.0.0 or higher)
  - Git

Step-by-Step Setup:
  1. Clone Repository & Enter Directory:
     git clone https://github.com/TitanXS75/SAL.git
     cd SAL

  2. Install Dependencies:
     npm install

  3. Configure API Keys (Two Options):
     Option A (via Web UI - Recommended):
       - Start the app and click the "API KEYS" button in the top-right header.
       - Enter your Google Gemini API key and/or Groq API key.
       - Click "Test Key" to verify, then click "Save & Apply Keys".
     Option B (via .env file):
       - Copy .env.example to .env:
           cp .env.example .env   (or Copy-Item .env.example .env on Windows)
       - Fill in:
           GEMINI_API_KEY=your_gemini_api_key_here
           GROQ_API_KEY=your_groq_api_key_here
           PORT=4000

  4. Start the Application:
     npm start          # Runs standard production server
     # OR
     npm run dev        # Runs dev server with hot reload (nodemon)

  5. Open Studio in Browser:
     Navigate to: http://localhost:4000


2. ARCHITECTURE
--------------------------------------------------------------------------------
The SAL system is built around an autonomous multi-stage pipeline:

  Target URL Input
       │
       ▼
  ┌────────────────────────────────────────────────────────┐
  │                      AGENT PIPELINE                    │
  │                                                        │
  │  [Stage 1: SCRAPER & ASSET ENGINE]                     │
  │    - Headless Puppeteer browser launches target page   │
  │    - Captures high-res screenshot & DOM layout tree    │
  │    - Native Wget engine mirrors HTML, CSS, JS & images │
  │                                                        │
  │  [Stage 2: VISION & TOKEN ANALYZER]                    │
  │    - Gemini Vision / Groq multimodal layout analysis   │
  │    - Extracts design tokens: palette, typography, gap  │
  │                                                        │
  │  [Stage 3: CODE RECONSTITUTION & SCAFFOLDING]          │
  │    - Normalizes local asset paths and relative links   │
  │    - Injects viewport and preview responsive meta      │
  │    - Emits project output into `output/<project-name>/`│
  │                                                        │
  │  [Stage 4: VALIDATION & HEALTH CHECK]                  │
  │    - Validates file tree, entrypoints, and assets      │
  │                                                        │
  │  [Stage 5: DEDICATED PREVIEW & AI STUDIO]              │
  │    - Spawns local preview server on isolated port      │
  │    - Streams logs & live updates via Socket.io         │
  │    - Embedded multi-device preview chassis             │
  │    - Natural Language AI code modification engine      │
  └────────────────────────────────────────────────────────┘
       │
       ▼
  Live Cloned Site + AI Editing Studio (http://localhost:4000/#editor)


3. TECHNOLOGIES & MODELS USED
--------------------------------------------------------------------------------
Core Platform:
  - Node.js & Express: Orchestration backend and REST API server.
  - Socket.io: Real-time bi-directional pipeline streaming and console logs.
  - Puppeteer: Headless Chrome for DOM extraction and page screenshots.
  - Wget Binary Engine: High-fidelity recursive asset downloading.
  - fs-extra & chokidar: Safe filesystem scaffolding and file watching.

AI Models & Providers:
  - Google Gemini:
      * gemini-1.5-flash / gemini-2.0-flash
      * Multimodal vision analysis of screenshots and layout geometry.
  - Groq Cloud (LPU Inference):
      * llama-3.3-70b-versatile & llama-3.1-8b-instant
      * Sub-second latency for code analysis and prompt-based modifications.

Frontend Client:
  - Modern Vanilla JS (ES6+) with state persistence (localStorage & URL hash).
  - Custom Swiss-Style Design System (Dark mode, Outfit/JetBrains fonts, responsive chassis).
  - Sandboxed iframe with dynamic viewport toggling (Desktop 100%, Tablet 768px, Mobile 375px).


4. KEY IMPLEMENTATION DECISIONS
--------------------------------------------------------------------------------
1. True Asset Reconstitution vs. LLM "Hallucination":
   - Instead of asking an LLM to generate approximate CSS from scratch (which
     frequently misses custom SVGs, precise font weightings, and animations),
     SAL directly harvests the real CSS stylesheets, images, and fonts via Wget
     and Puppeteer, then uses AI to analyze and modify the structure.
   - Result: 1:1 pixel fidelity with instant cloning.

2. Dual AI Engine Strategy:
   - Users can seamlessly choose between Gemini (excelling at multimodal
     vision reasoning) and Groq (excelling at ultra-fast LPU code patching).

3. Client State Persistence:
   - User state—including active tab (Clone vs. Editor), active project,
     device preview mode, editor mode (Preview vs. Code), and URL inputs—is
     persisted via localStorage and URL hash routes (`#clone`, `#editor`).
   - Reloading or refreshing the page retains the exact view and active project.

4. In-App Key Management:
   - API keys can be managed, tested live, and persisted straight from the
     header modal without requiring terminal restarts or server interruptions.

5. Isolated Preview Sandboxing:
   - Cloned projects run on dynamic ports (e.g., 4001, 4002...) with proper
     header sandboxing so they don't conflict with the main studio host.


5. LIMITATIONS
--------------------------------------------------------------------------------
1. Highly Dynamic SPAs & Gated Content:
   - Pages requiring user authentication (logins, private dashboards) or
     protected by advanced bot blockers (Cloudflare Turnstile, CAPTCHA) cannot
     be crawled autonomously without session cookies.

2. Server-Side Dynamic Endpoints:
   - The agent clones frontend presentation, markup, styling, and client scripts.
     Private backend databases and proprietary API responses are not recreated.

3. Complex Canvas / WebGL Renders:
   - Heavy WebGL shaders or canvas-drawn graphics (like Three.js scenes) are
     captured as client-side code if bundled, but dynamic asset streaming
     from private CDNs may require manual asset whitelisting.

4. Heavy Third-Party Cross-Origin Trackers:
   - Scripts that enforce strict cross-origin restrictions (like third-party ad
     trackers or analytics) may log CORS warnings in the sandboxed preview iframe.
================================================================================
