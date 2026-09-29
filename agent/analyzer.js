/**
 * SAL Agent - Analyzer Module
 * Uses Gemini Vision to analyze scraped site data and produce a structured
 * layout/component description for the code generator.
 */

const { generateAIContent } = require('./aiClient');

/**
 * Analyze scraped site data using Vision LLM (Gemini or Groq Vision)
 * @param {object} siteData - Output from scraper.js
 * @param {function} log - Progress logging callback
 * @param {object} options - Optional provider, model, apiKeys
 * @returns {object} - Structured analysis JSON
 */
async function analyze(siteData, log = () => {}, options = {}) {
  log(`Sending screenshot + HTML to AI Vision (${options.provider || 'default'})...`);

  const prompt = buildAnalysisPrompt(siteData);

  const responseText = await generateAIContent({
    provider: options.provider || 'gemini',
    model: options.model,
    prompt,
    imageBase64: siteData.screenshotBase64,
    jsonMode: true,
    apiKeys: options.apiKeys,
    log
  });

  log('Parsing AI analysis response...');

  const analysis = parseAnalysisResponse(responseText, siteData);

  log(`Analysis: ${analysis.sections.length} sections, palette: ${analysis.colorPalette.slice(0, 3).join(', ')}`);

  return analysis;
}

/**
 * Build the analysis prompt
 */
function buildAnalysisPrompt(siteData) {
  const metadata = siteData.metadata || {};
  const navLinks = metadata.navLinks || [];
  const headings = metadata.headings || [];
  const sections = metadata.sections || [];
  const colors = metadata.colors || [];
  const fonts = metadata.fonts || [];

  return `You are an expert frontend developer and UI analyst.

Analyze this website screenshot and HTML structure, then return a structured JSON description for recreating the UI as a Next.js frontend.

## Website Info
- URL: ${metadata.url || siteData.url || 'Unknown'}
- Title: ${metadata.title || 'Untitled'}
- Description: ${metadata.description || 'No description provided'}

## Detected Navigation Links
${navLinks.length > 0 ? navLinks.map(l => `- ${l.text}: ${l.href}`).join('\n') : 'None detected'}

## Detected Headings
${headings.length > 0 ? headings.map(h => `${h.level}: ${h.text}`).join('\n') : 'None detected'}

## Detected Sections (from DOM)
${sections.length > 0 ? sections.slice(0, 15).map((s, i) => `${i+1}. <${s.tag}> class="${(s.className || '').substring(0, 80)}" — text: "${(s.textContent || '').substring(0, 150)}"`).join('\n') : 'Standard layout'}

## Detected Colors (computed)
${colors.length > 0 ? colors.slice(0, 20).join(', ') : 'Default dark/light palette'}

## Detected Fonts
${fonts.length > 0 ? fonts.join(', ') : 'Inter, system-ui'}

## HTML Snippet (first 8000 chars)
\`\`\`html
${siteData.html.substring(0, 8000)}
\`\`\`

---

Return ONLY a valid JSON object (no markdown fences, no explanation) following this exact schema:
{
  "siteName": "string - website brand name",
  "tagline": "string - main value proposition or subtitle",
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "backgroundColor": "#hex",
  "textColor": "#hex",
  "accentColor": "#hex",
  "fonts": {
    "heading": "font family name",
    "body": "font family name"
  },
  "layout": "string - brief description of overall layout",
  "sections": [
    {
      "type": "navbar|hero|features|about|pricing|testimonials|cta|footer|custom",
      "name": "string - component name e.g. Navbar, HeroSection",
      "description": "string - what this section contains and looks like",
      "content": {
        "heading": "string or null",
        "subheading": "string or null",
        "cta": "string or null",
        "items": ["list of items if applicable"],
        "navLinks": ["list of nav links if navbar"]
      },
      "hasBackground": true/false,
      "backgroundStyle": "gradient|solid|image|transparent"
    }
  ],
  "components": ["list of reusable component names e.g. Button, Card, Badge"],
  "isResponsive": true,
  "isDarkMode": true/false,
  "hasAnimation": true/false,
  "googleFontsUrl": "full Google Fonts import URL or null"
}`;
}

/**
 * Parse and validate the LLM response
 */
function parseAnalysisResponse(responseText, siteData) {
  const { metadata } = siteData;

  try {
    // Extract JSON from response (handle cases where model adds text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure required fields have defaults
    return {
      siteName: parsed.siteName || metadata.title || 'Website Clone',
      tagline: parsed.tagline || metadata.description || '',
      colorPalette: parsed.colorPalette || extractFallbackColors(metadata.colors),
      backgroundColor: parsed.backgroundColor || '#ffffff',
      textColor: parsed.textColor || '#1a1a1a',
      accentColor: parsed.accentColor || '#3b82f6',
      fonts: parsed.fonts || { heading: 'Inter', body: 'Inter' },
      layout: parsed.layout || 'Standard landing page layout',
      sections: parsed.sections || buildFallbackSections(metadata),
      components: parsed.components || ['Button', 'Card', 'Section'],
      isResponsive: parsed.isResponsive !== false,
      isDarkMode: parsed.isDarkMode || false,
      hasAnimation: parsed.hasAnimation || false,
      googleFontsUrl: parsed.googleFontsUrl || buildGoogleFontsUrl(parsed.fonts),
      // Pass through original metadata for generator
      originalUrl: metadata.url,
      originalNavLinks: metadata.navLinks,
      originalImages: metadata.images,
    };
  } catch (err) {
    console.error('[Analyzer] Failed to parse LLM response, using fallback:', err.message);
    return buildFallbackAnalysis(metadata);
  }
}

/**
 * Convert computed CSS colors to hex palette
 */
function extractFallbackColors(cssColors) {
  const hexColors = [];
  cssColors.forEach(color => {
    const hex = rgbToHex(color);
    if (hex && !hexColors.includes(hex)) hexColors.push(hex);
  });
  return hexColors.slice(0, 5).length ? hexColors.slice(0, 5) : ['#1a1a2e', '#e94560', '#ffffff', '#0f3460', '#16213e'];
}

function rgbToHex(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  if (r === 255 && g === 255 && b === 255) return null; // skip white
  if (r === 0 && g === 0 && b === 0) return null; // skip black
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function buildGoogleFontsUrl(fonts) {
  if (!fonts) return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  const families = [fonts.heading, fonts.body].filter(Boolean).map(f => f.replace(/ /g, '+'));
  return `https://fonts.googleapis.com/css2?family=${[...new Set(families)].join('&family=')}&display=swap`;
}

function buildFallbackSections(metadata) {
  return [
    {
      type: 'navbar',
      name: 'Navbar',
      description: 'Navigation bar with logo and links',
      content: {
        navLinks: metadata.navLinks.map(l => l.text)
      },
      hasBackground: true,
      backgroundStyle: 'solid'
    },
    {
      type: 'hero',
      name: 'HeroSection',
      description: 'Hero section with main heading and CTA',
      content: {
        heading: metadata.headings[0]?.text || metadata.title,
        subheading: metadata.description,
        cta: 'Get Started'
      },
      hasBackground: true,
      backgroundStyle: 'gradient'
    },
    {
      type: 'footer',
      name: 'Footer',
      description: 'Footer with links and copyright',
      content: {
        heading: null,
        navLinks: metadata.navLinks.map(l => l.text).slice(0, 5)
      },
      hasBackground: true,
      backgroundStyle: 'solid'
    }
  ];
}

function buildFallbackAnalysis(metadata) {
  return {
    siteName: metadata.title || 'Website Clone',
    tagline: metadata.description || '',
    colorPalette: ['#1a1a2e', '#e94560', '#ffffff', '#0f3460', '#f5f5f5'],
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    accentColor: '#3b82f6',
    fonts: { heading: 'Inter', body: 'Inter' },
    layout: 'Standard landing page',
    sections: buildFallbackSections(metadata),
    components: ['Button', 'Card', 'Section'],
    isResponsive: true,
    isDarkMode: false,
    hasAnimation: false,
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    originalUrl: metadata.url,
    originalNavLinks: metadata.navLinks,
    originalImages: metadata.images,
  };
}

module.exports = { analyze };
