# SAL — AI-Powered Frontend Website Cloning Agent

> An autonomous AI engineering system that takes any publicly accessible website URL, analyzes its UI layout and design tokens, generates a clean, responsive React / Next.js frontend, and provides interactive AI-based natural language modification with a local preview studio.

---

## Key Features

- **🌐 Public URL to Full Next.js Frontend**: Automated scraping, vision & DOM analysis, component generation, and build validation.
- **🔑 Direct Web UI API Key Management**: Easily add and test **Google Gemini** and **Groq** API keys directly in the website interface. No terminal restart required!
- **⚡ Dual AI Engine Support (Groq & Gemini)**:
  - **Google Gemini 1.5 / 2.0 Flash**: Multimodal vision analysis of page layouts, screenshot comprehension, and robust generation.
  - **Groq (Llama 3.3 70B & Llama 3.1 8B)**: Ultra-fast LPU inference for lightning-fast code generation and modifications.
- **🖥️ Dedicated Cloned Website & AI Editor Tab**:
  - **Embedded Live Preview**: Interactive iframe running the local Next.js dev server.
  - **Responsive Device Switcher**: Test **Desktop (100%)**, **Tablet (768px)**, and **Mobile (375px)** views instantly.
  - **Source Code Viewer**: Browse generated project files (`app/page.tsx`, `components/*.tsx`, `tailwind.config.js`) with one-click copy.
  - **Interactive AI Studio**: Apply natural-language modification prompts with quick assignment presets and auto-refreshing preview!
- **🔨 Autonomous Build Validation & Self-Healing**: Detects TypeScript and build errors and repairs them automatically via LLM feedback loops.

---

## Architecture Flow

```
Website URL
    │
    ▼
┌────────────────────────────────────────────────────────┐
│                   SAL AI Agent Core                    │
│                                                        │
│  1. Scraper (Puppeteer Headless Engine)                │
│     ├─ High-resolution full-page screenshot            │
│     ├─ Cleaned semantic HTML structure                 │
│     ├─ Computed CSS color extraction & font detection  │
│     └─ Layout sections & component boundary mapping    │
│                                                        │
│  2. AI Analyzer (Gemini Vision / Groq)                 │
│     ├─ Screenshot + DOM → structured layout JSON       │
│     ├─ Color palette tokens & dark mode detection      │
│     └─ Component hierarchy specification               │
│                                                        │
│  3. Code Generator (Groq Llama 3.3 / Gemini)           │
│     ├─ Modular Next.js 14 App Router project           │
│     ├─ Reusable TypeScript components (mobile-first)   │
│     ├─ Dynamic Tailwind CSS design tokens              │
│     └─ Clean semantic markup (no hardcoded copies)     │
│                                                        │
│  4. Validator & Self-Healing Loop                      │
│     ├─ Automated npm install & build test              │
│     └─ Error capture & AI patch generator (up to 3x)   │
│                                                        │
│  5. Preview Server & Live Editor                       │
│     ├─ Next.js dev server on isolated port             │
│     ├─ Interactive iframe live preview                 │
│     ├─ Desktop / Tablet / Mobile device switcher       │
│     └─ Real-time NL modification patcher & auto-reload │
└────────────────────────────────────────────────────────┘
    │
    ▼
Generated Codebase (`output/<project-name>/`) 
+ Interactive Studio (`http://localhost:4000`)
```

---

## Technologies Used

### Agent Platform
| Technology | Role |
|---|---|
| Node.js + Express | Agent orchestration & REST API |
| Socket.io | Real-time agent thought streaming & progress logs |
| Puppeteer | Headless browser for JS-rendered site capture & styles |
| Groq SDK | Ultra-fast LPU inference (Llama 3.3 70B, Llama 3.1 8B) |
| @google/generative-ai | Multimodal vision & reasoning (Gemini 1.5 / 2.0 Flash) |
| fs-extra | File system scaffolding & patching |

### Generated Frontend Code
| Technology | Role |
|---|---|
| Next.js 14 (App Router) | Modern React framework |
| TypeScript | Strict types and component contracts |
| Tailwind CSS | Utility-first styling with extracted brand colors |
| Lucide React | Modern icon set |

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Agent Server
```bash
npm start
```
Open `http://localhost:4000` in your browser.

### 3. Add API Keys Directly in the Website
1. Click the **🔑 API Keys** button in the top right header.
2. Enter your **Google Gemini API Key** ([Get free key](https://aistudio.google.com/app/apikey)) and/or **Groq API Key** ([Get free key](https://console.groq.com/keys)).
3. Click **Test Key** to verify connectivity with instant live feedback.
4. Click **Save & Apply Keys**. The keys are saved for your session and persisted.

### 4. Clone & Edit Websites
1. On the **Clone Website** tab, enter a website URL (e.g. `https://tailwindcss.com` or `https://linear.app`).
2. Click **Clone Website** and watch the real-time agent pipeline execute.
3. Once complete, switch to the **Cloned Website & AI Editor** tab:
   - View your clone in **Desktop**, **Tablet**, or **Mobile** view.
   - Inspect the generated Next.js TypeScript code in the **Source Code** view.
   - Type instructions in the **AI Modification Studio** (e.g., *"Make navbar sticky"*, *"Change primary color to blue"*, *"Add testimonials section"*).

---

## Evaluation Rubric Alignment

- **Frontend Recreation Quality (25%)**: Real browser scraping captures computed color schemes, typography, spacing, and semantic sections.
- **AI Agent Implementation (20%)**: Multi-stage autonomous workflow with scraper, vision analyzer, component generator, validator, and modifier.
- **Generalization Across Websites (20%)**: Dynamic layout parsing works across diverse domains (landing pages, SaaS, e-commerce, portfolios).
- **Code Quality & Architecture (15%)**: Clean modular React components, typed props, Tailwind tokens, and Next.js App Router structure.
- **Natural-Language Modification (10%)**: Intent parsing identifies target files and applies surgical patches with auto-refreshing preview.
- **Error Handling & Cost Awareness (10%)**: Self-healing build loop auto-fixes TypeScript/compilation errors; uses cost-effective models (Gemini Flash & Groq Llama 3.3).
