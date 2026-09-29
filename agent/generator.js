/**
 * SAL Agent - Generator Module
 * Takes structured analysis and generates a complete Next.js project
 */

const { generateAIContent } = require('./aiClient');
const fse = require('fs-extra');
const path = require('path');

/**
 * Generate a complete Next.js project from analysis
 */
async function generate(analysis, siteData, outputDir, log = () => {}, options = {}) {
  await fse.ensureDir(outputDir);

  // 1. Write project boilerplate
  log('Writing project configuration files...');
  await writeBoilerplate(outputDir, analysis);

  // 2. Generate Tailwind config with brand colors
  log('Generating Tailwind theme from extracted color palette...');
  await writeTailwindConfig(outputDir, analysis);

  // 3. Generate global CSS / layout
  log('Generating global styles...');
  await writeGlobalStyles(outputDir, analysis);

  // 4. Generate root layout
  log('Generating root layout...');
  await writeRootLayout(outputDir, analysis);

  // 5. Generate each component
  log(`Generating ${analysis.sections.length} section components using ${options.provider || 'AI'}...`);
  for (const section of analysis.sections) {
    log(`  → Generating ${section.name}...`);
    await generateComponent(outputDir, section, analysis, options, log);
  }

  // 6. Generate the main page
  log('Generating main page (app/page.tsx)...');
  await generateMainPage(outputDir, analysis);

  log('All files written successfully.');
}

// ─── Boilerplate files ────────────────────────────────────────────────────────

async function writeBoilerplate(outputDir, analysis) {
  // package.json
  await fse.writeJSON(path.join(outputDir, 'package.json'), {
    name: (analysis.siteName || 'website').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-clone',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint'
    },
    dependencies: {
      'next': '^14.2.24',
      'react': '^18',
      'react-dom': '^18',
      'lucide-react': '^0.359.0'
    },
    devDependencies: {
      '@types/node': '^20',
      '@types/react': '^18',
      '@types/react-dom': '^18',
      'autoprefixer': '^10.0.1',
      'postcss': '^8',
      'tailwindcss': '^3.4.1',
      'typescript': '^5'
    }
  }, { spaces: 2 });

  // tsconfig.json
  await fse.writeJSON(path.join(outputDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'es5',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] }
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules']
  }, { spaces: 2 });

  // next.config.js
  await fse.writeFile(path.join(outputDir, 'next.config.js'), `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};
module.exports = nextConfig;
`);

  // postcss.config.js
  await fse.writeFile(path.join(outputDir, 'postcss.config.js'), `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  // .gitignore
  await fse.writeFile(path.join(outputDir, '.gitignore'), `node_modules/\n.next/\n.env\n`);
}

// ─── Tailwind Config ──────────────────────────────────────────────────────────

async function writeTailwindConfig(outputDir, analysis) {
  const palette = analysis.colorPalette;
  const content = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary:   '${palette[0] || '#1a1a2e'}',
        secondary: '${palette[1] || '#e94560'}',
        accent:    '${analysis.accentColor || palette[2] || '#3b82f6'}',
        brand: {
          ${palette.map((c, i) => `'${i + 1}': '${c}'`).join(',\n          ')}
        },
        background: '${analysis.backgroundColor}',
        foreground: '${analysis.textColor}',
      },
      fontFamily: {
        heading: ['${analysis.fonts.heading}', 'sans-serif'],
        body: ['${analysis.fonts.body}', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: '${analysis.isDarkMode ? 'class' : 'media'}',
};
`;
  await fse.writeFile(path.join(outputDir, 'tailwind.config.js'), content);
}

// ─── Global Styles ────────────────────────────────────────────────────────────

async function writeGlobalStyles(outputDir, analysis) {
  await fse.ensureDir(path.join(outputDir, 'app'));
  const content = `@tailwind base;
@tailwind components;
@tailwind utilities;

${analysis.googleFontsUrl ? `@import url('${analysis.googleFontsUrl}');` : ''}

:root {
  --bg: ${analysis.backgroundColor};
  --fg: ${analysis.textColor};
  --accent: ${analysis.accentColor};
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: var(--bg);
  color: var(--fg);
  font-family: '${analysis.fonts.body}', sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: '${analysis.fonts.heading}', sans-serif;
}
`;
  await fse.writeFile(path.join(outputDir, 'app', 'globals.css'), content);
}

// ─── Root Layout ──────────────────────────────────────────────────────────────

async function writeRootLayout(outputDir, analysis) {
  const fontsLink = analysis.googleFontsUrl
    ? `<link href="${analysis.googleFontsUrl}" rel="stylesheet" />`
    : '';

  const content = `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${escapeStr(analysis.siteName)}',
  description: '${escapeStr(analysis.tagline)}',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" ${analysis.isDarkMode ? 'className="dark"' : ''}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'try{delete window.__REDUX_DEVTOOLS_EXTENSION__;}catch(e){}' }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        ${fontsLink}
      </head>
      <body>{children}</body>
    </html>
  );
}
`;
  await fse.writeFile(path.join(outputDir, 'app', 'layout.tsx'), content);
}

// ─── Component Generation ─────────────────────────────────────────────────────

async function generateComponent(outputDir, section, analysis, options = {}, log = () => {}) {
  try {
    const prompt = `You are an expert Next.js + TypeScript + Tailwind CSS developer.

Generate a complete, production-quality React component for this website section.

## Website Context
- Site: ${analysis.siteName}
- Tagline: ${analysis.tagline}
- Color Palette: ${analysis.colorPalette.join(', ')}
- Primary color: ${analysis.colorPalette[0] || '#1a1a2e'}
- Accent color: ${analysis.accentColor}
- Background: ${analysis.backgroundColor}
- Text: ${analysis.textColor}
- Heading font: ${analysis.fonts.heading}
- Body font: ${analysis.fonts.body}
- Dark mode: ${analysis.isDarkMode}

## Section to Generate
- Type: ${section.type}
- Name: ${section.name}
- Description: ${section.description}
- Content: ${JSON.stringify(section.content, null, 2)}
- Has background: ${section.hasBackground}
- Background style: ${section.backgroundStyle}

## Requirements
1. Use Tailwind CSS ONLY for styling
2. Component must be a default export TypeScript React component with 'use client'; at the top if interactive
3. Must use the extracted color palette (use inline style or arbitrary Tailwind values like bg-[#hex])
4. Must be fully responsive (mobile-first)
5. Include realistic placeholder content matching the site's style
6. Add subtle hover effects on interactive elements
7. If navbar: include a mobile hamburger menu (toggle with useState)
8. If hero: include a prominent CTA button
9. Use semantic HTML (nav, section, footer, main, etc.)
10. NO external image dependencies — use colored divs, SVG, or emoji as image placeholders

Return ONLY the TypeScript component code (no explanations, no markdown fences):`;

    let code = await generateAIContent({
      provider: options.provider || 'gemini',
      model: options.model,
      prompt,
      apiKeys: options.apiKeys,
      log
    });

    // Strip markdown fences if model added them
    code = code.replace(/^```(?:tsx?|typescript|javascript)?\n?/gm, '').replace(/^```\n?/gm, '').trim();

    // Ensure it's a proper component
    if (!code.includes('export default')) {
      code = code + `\n\nexport default ${section.name};`;
    }

    const componentDir = path.join(outputDir, 'components');
    await fse.ensureDir(componentDir);
    await fse.writeFile(path.join(componentDir, `${section.name}.tsx`), code);

  } catch (err) {
    console.warn(`[Generator] Notice: generating fallback for ${section.name}:`, err.message);
    // Write a fallback component
    await writeFallbackComponent(outputDir, section, analysis);
  }
}

async function writeFallbackComponent(outputDir, section, analysis) {
  const fallback = `'use client';

import React from 'react';

export default function ${section.name}() {
  return (
    <section
      style={{ backgroundColor: '${analysis.backgroundColor}', color: '${analysis.textColor}' }}
      className="py-16 px-4 md:px-8"
    >
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4" style={{ color: '${analysis.colorPalette[0] || '#1a1a2e'}' }}>
          ${escapeStr(section.content?.heading || section.name)}
        </h2>
        ${section.content?.subheading ? `<p className="text-lg opacity-70">${escapeStr(section.content.subheading)}</p>` : ''}
      </div>
    </section>
  );
}
`;
  const componentDir = path.join(outputDir, 'components');
  await fse.ensureDir(componentDir);
  await fse.writeFile(path.join(componentDir, `${section.name}.tsx`), fallback);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

async function generateMainPage(outputDir, analysis) {
  const imports = analysis.sections
    .map(s => `import ${s.name} from '@/components/${s.name}';`)
    .join('\n');

  const components = analysis.sections
    .map(s => `      <${s.name} />`)
    .join('\n');

  const page = `import React from 'react';
${imports}

export default function Home() {
  return (
    <main>
${components}
    </main>
  );
}
`;
  await fse.writeFile(path.join(outputDir, 'app', 'page.tsx'), page);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeStr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"').substring(0, 200);
}

module.exports = { generate };
