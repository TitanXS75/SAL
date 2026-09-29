/**
 * SAL Agent - Scraper Module
 * Uses Puppeteer to extract full visual + structural data from a URL
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fse = require('fs-extra');
const os = require('os');

const SCREENSHOT_WIDTH = parseInt(process.env.SCREENSHOT_WIDTH) || 1280;
const SCREENSHOT_HEIGHT = parseInt(process.env.SCREENSHOT_HEIGHT) || 800;

/**
 * Main scrape function
 * @param {string} url - Target website URL
 * @param {function} log - Progress logging callback
 * @returns {object} - Structured site data
 */
async function scrape(url, log = () => {}) {
  log(`Launching headless browser...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  const page = await browser.newPage();

  try {
    // Set viewport
    await page.setViewport({ width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT });

    // Set realistic user agent to avoid bot blocks
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait a bit for any lazy-loaded content
    await new Promise(r => setTimeout(r, 2000));

    log(`Capturing full-page screenshot...`);
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    log(`Extracting HTML structure...`);
    const html = await page.content();

    log(`Extracting computed styles & metadata...`);
    const metadata = await page.evaluate(() => {
      // ── Color extraction ───────────────────────────────────────────────
      const colorSet = new Set();
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const color = style.color;
        const border = style.borderColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') colorSet.add(bg);
        if (color && color !== 'rgba(0, 0, 0, 0)') colorSet.add(color);
        if (border && border !== 'rgba(0, 0, 0, 0)') colorSet.add(border);
      });

      // ── Font extraction ────────────────────────────────────────────────
      const fontSet = new Set();
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const font = style.fontFamily;
        if (font) fontSet.add(font.split(',')[0].trim().replace(/['"]/g, ''));
      });

      // ── Navigation links ──────────────────────────────────────────────
      const navLinks = [];
      const navEls = document.querySelectorAll('nav a, header a');
      navEls.forEach(a => {
        if (a.innerText.trim()) {
          navLinks.push({ text: a.innerText.trim(), href: a.getAttribute('href') || '#' });
        }
      });

      // ── Images ────────────────────────────────────────────────────────
      const images = [];
      document.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.startsWith('data:')) {
          images.push({ src: img.src, alt: img.alt || '' });
        }
      });

      // ── Section detection ─────────────────────────────────────────────
      const sections = [];
      const sectionEls = document.querySelectorAll(
        'section, [class*="hero"], [class*="feature"], [class*="pricing"], ' +
        '[class*="testimonial"], [class*="cta"], [class*="footer"], footer, header, nav'
      );
      sectionEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.height > 50) {
          sections.push({
            tag: el.tagName.toLowerCase(),
            className: el.className.toString().substring(0, 200),
            id: el.id || '',
            textContent: el.innerText?.substring(0, 500) || '',
            hasImage: el.querySelector('img') !== null,
          });
        }
      });

      // ── Meta tags ─────────────────────────────────────────────────────
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el ? el.getAttribute('content') || '' : '';
      };

      // ── Heading hierarchy ─────────────────────────────────────────────
      const headings = [];
      document.querySelectorAll('h1, h2, h3').forEach(h => {
        headings.push({ level: h.tagName, text: h.innerText?.trim() || '' });
      });

      return {
        title: document.title,
        description: getMeta('description') || getMeta('og:description'),
        colors: Array.from(colorSet).slice(0, 30),
        fonts: Array.from(fontSet).slice(0, 10),
        navLinks: navLinks.slice(0, 20),
        images: images.slice(0, 30),
        sections,
        headings: headings.slice(0, 30),
        url: window.location.href,
      };
    });

    log(`Extracting stylesheets...`);
    const styleSheets = await extractStylesheets(page);

    log(`Scraping complete. Found ${metadata.sections.length} sections, ${metadata.images.length} images.`);

    return {
      url,
      screenshot: screenshotBuffer,
      screenshotBase64: screenshotBuffer.toString('base64'),
      html: cleanHtml(html),
      styleSheets,
      metadata,
      sections: metadata.sections || [],
      images: metadata.images || []
    };

  } finally {
    await browser.close();
  }
}

/**
 * Extract inline and external stylesheets
 */
async function extractStylesheets(page) {
  const sheets = [];

  // Get all external stylesheet links
  const links = await page.$$eval('link[rel="stylesheet"]', els =>
    els.map(el => el.href).filter(Boolean)
  );

  // Get inline styles
  const inlineStyles = await page.$$eval('style', els =>
    els.map(el => el.textContent || '').filter(Boolean)
  );

  sheets.push(...inlineStyles);
  return sheets;
}

/**
 * Clean HTML for LLM consumption — remove scripts, reduce noise
 */
function cleanHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '[STYLES REMOVED]')
    .replace(/\s+/g, ' ')
    .substring(0, 50000); // Limit to 50k chars for LLM context
}

module.exports = { scrape };
