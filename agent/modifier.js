/**
 * SAL Agent - Modifier Module
 * Modifies downloaded website files (HTML, CSS, JS) according to natural language instructions
 * using Groq or Gemini with smart targeted chunking to stay well within free-tier TPM limits.
 */

const { generateAIContent } = require('./aiClient');
const fse = require('fs-extra');
const path = require('path');

/**
 * Apply a natural language modification instruction to a downloaded website project
 * @param {string} outputDir - Path to the project directory
 * @param {string} instruction - User prompt instruction
 * @param {function} log - Logging callback
 * @param {object} options - { provider, model, apiKeys }
 * @returns {Promise<{ filesChanged: number, changedFiles: string[] }>}
 */
async function modify(outputDir, instruction, log = () => {}, options = {}) {
  const provider = options.provider || 'groq';
  log(`[Modifier] Analyzing instruction: "${instruction}" using ${provider.toUpperCase()}...`);

  // 1. Build project file tree
  const fileTree = await buildFileTree(outputDir);
  log(`[Modifier] Discovered ${fileTree.length} code file(s) in project.`);

  if (fileTree.length === 0) {
    throw new Error('No HTML, CSS, or JS files found in the project to modify.');
  }

  // 2. Identify target file(s)
  const targetFiles = await identifyTargetFiles(fileTree, instruction, outputDir, options, log);
  log(`[Modifier] Selected ${targetFiles.length} file(s) to modify: ${targetFiles.map(f => f.relPath).join(', ')}`);

  // 3. Apply modification to each target file
  const changedFiles = [];
  for (const target of targetFiles) {
    log(`[Modifier] Modifying ${target.relPath}...`);
    const success = await applyModification(target, instruction, log, options);
    if (success) {
      changedFiles.push(target.relPath);
    }
  }

  if (changedFiles.length === 0) {
    throw new Error('Failed to apply modification. Please check the AI prompt and try again.');
  }

  log(`[Modifier] Successfully updated: ${changedFiles.join(', ')}`);
  return { filesChanged: changedFiles.length, changedFiles };
}

/**
 * Build a list of all HTML, CSS, and JS files in the project
 */
async function buildFileTree(outputDir) {
  const files = [];

  async function walk(dir, rel = '') {
    if (!await fse.pathExists(dir)) return;
    const entries = await fse.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entRel = rel ? `${rel}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip git, node_modules, temp
        if (['node_modules', '.git', '.next'].includes(entry.name)) continue;
        await walk(fullPath, entRel);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.htm', '.css', '.js', '.mjs'].includes(ext)) {
          const stat = await fse.stat(fullPath);
          files.push({
            name: entry.name,
            relPath: entRel.replace(/\\/g, '/'),
            fullPath,
            size: stat.size,
            ext
          });
        }
      }
    }
  }

  await walk(outputDir);

  // Sort files: main index.html first, then other html files, then css, then js
  files.sort((a, b) => {
    const isIndexA = a.name.toLowerCase() === 'index.html' ? 0 : 1;
    const isIndexB = b.name.toLowerCase() === 'index.html' ? 0 : 1;
    if (isIndexA !== isIndexB) return isIndexA - isIndexB;

    const extOrder = { '.html': 0, '.htm': 0, '.css': 1, '.js': 2, '.mjs': 3 };
    const orderA = extOrder[a.ext] ?? 4;
    const orderB = extOrder[b.ext] ?? 4;
    return orderA - orderB;
  });

  return files;
}

/**
 * Identify target files using AI or smart heuristics
 */
async function identifyTargetFiles(fileTree, instruction, outputDir, options = {}, log = () => {}) {
  const htmlFiles = fileTree.filter(f => f.ext === '.html' || f.ext === '.htm');
  const indexHtml = htmlFiles.find(f => f.name.toLowerCase() === 'index.html') || htmlFiles[0];

  const lower = instruction.toLowerCase();
  const isStyleOnly = (lower.includes('css') || lower.includes('stylesheet')) && !lower.includes('text') && !lower.includes('title');

  if (!isStyleOnly && indexHtml && fileTree.length <= 5) {
    return [indexHtml];
  }

  // Quick fallback if indexHtml exists
  if (indexHtml) return [indexHtml];
  return fileTree.slice(0, 1);
}

/**
 * Find targeted snippet for large files to stay well within TPM / token limits
 */
function findTargetSnippet(fileContent, instruction) {
  const lowerInst = instruction.toLowerCase();

  // 1. Semantic Tag Detection
  if (lowerInst.includes('footer')) {
    const match = fileContent.match(/<footer\b[\s\S]*?<\/footer>/i);
    if (match) return { snippet: match[0], type: 'footer', isSection: true };
  }

  if (lowerInst.includes('navbar') || lowerInst.includes('navigation') || lowerInst.includes('nav ') || lowerInst.endsWith('nav')) {
    const navMatch = fileContent.match(/<nav\b[\s\S]*?<\/nav>/i) || fileContent.match(/<header\b[\s\S]*?<\/header>/i);
    if (navMatch) return { snippet: navMatch[0], type: 'nav', isSection: true };
  }

  if (lowerInst.includes('header') && !lowerInst.includes('headline')) {
    const headerMatch = fileContent.match(/<header\b[\s\S]*?<\/header>/i);
    if (headerMatch) return { snippet: headerMatch[0], type: 'header', isSection: true };
  }

  if (lowerInst.includes('hero') || lowerInst.includes('banner')) {
    const heroMatch = fileContent.match(/<(?:section|div|header)[^>]*(?:hero|banner)[^>]*>[\s\S]*?<\/(?:section|div|header)>/i);
    if (heroMatch) return { snippet: heroMatch[0], type: 'hero', isSection: true };
  }

  if (lowerInst.includes('head') || lowerInst.includes('title') || lowerInst.includes('meta')) {
    const headMatch = fileContent.match(/<head\b[\s\S]*?<\/head>/i);
    if (headMatch) return { snippet: headMatch[0], type: 'head', isSection: true };
  }

  if (lowerInst.includes('about')) {
    const aboutMatch = fileContent.match(/<(?:section|div)[^>]*(?:about)[^>]*>[\s\S]*?<\/(?:section|div)>/i);
    if (aboutMatch) return { snippet: aboutMatch[0], type: 'about', isSection: true };
  }

  if (lowerInst.includes('contact')) {
    const contactMatch = fileContent.match(/<(?:section|div)[^>]*(?:contact)[^>]*>[\s\S]*?<\/(?:section|div)>/i);
    if (contactMatch) return { snippet: contactMatch[0], type: 'contact', isSection: true };
  }

  if (lowerInst.includes('services') || lowerInst.includes('service')) {
    const svcMatch = fileContent.match(/<(?:section|div)[^>]*(?:service)[^>]*>[\s\S]*?<\/(?:section|div)>/i);
    if (svcMatch) return { snippet: svcMatch[0], type: 'services', isSection: true };
  }

  if (lowerInst.includes('testimonial')) {
    const testMatch = fileContent.match(/<(?:section|div)[^>]*(?:testimonial)[^>]*>[\s\S]*?<\/(?:section|div)>/i);
    if (testMatch) return { snippet: testMatch[0], type: 'testimonials', isSection: true };
  }

  // 2. Exact needle detection from quotes (e.g. Change "Something" to "Other")
  const quoteMatches = instruction.match(/["']([^"']{3,})["']/g);
  if (quoteMatches) {
    for (const q of quoteMatches) {
      const needle = q.replace(/["']/g, '');
      const idx = fileContent.indexOf(needle);
      if (idx !== -1) {
        const start = Math.max(0, fileContent.lastIndexOf('\n', Math.max(0, idx - 1200)));
        const end = Math.min(fileContent.length, fileContent.indexOf('\n', Math.min(fileContent.length, idx + needle.length + 1200)));
        const snippet = fileContent.substring(start, end !== -1 ? end : fileContent.length);
        return { snippet, type: 'needle', needle };
      }
    }
  }

  // 3. Significant word detection
  const words = instruction
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !['change', 'modify', 'remove', 'delete', 'update', 'replace', 'make', 'with', 'from', 'this', 'that', 'section', 'part', 'code', 'please'].includes(w.toLowerCase()));

  for (const word of words) {
    const idx = fileContent.toLowerCase().indexOf(word.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, fileContent.lastIndexOf('\n', Math.max(0, idx - 1200)));
      const end = Math.min(fileContent.length, fileContent.indexOf('\n', Math.min(fileContent.length, idx + word.length + 1200)));
      const snippet = fileContent.substring(start, end !== -1 ? end : fileContent.length);
      return { snippet, type: 'word', word };
    }
  }

  return null;
}

/**
 * Apply modification to a single target file
 */
async function applyModification(target, instruction, log, options = {}) {
  try {
    let currentCode = await fse.readFile(target.fullPath, 'utf8');
    const isLargeFile = currentCode.length > 15000; // ~4000 tokens

    // Check if we can extract a targeted snippet
    const targetSnippet = findTargetSnippet(currentCode, instruction);

    if (targetSnippet) {
      log(`[Modifier] Located targeted ${targetSnippet.type} section (${(targetSnippet.snippet.length / 1024).toFixed(1)} KB) in ${target.name}`);

      const isRemoval = /\b(remove|delete|eliminate|hide|drop)\b/i.test(instruction);

      const prompt = `You are an expert web developer modifying a website snippet.

## User Instruction:
"${instruction}"

## Target Snippet (${targetSnippet.type}):
\`\`\`${target.ext.replace('.', '')}
${targetSnippet.snippet}
\`\`\`

## Rules:
1. Apply the user's requested changes directly to this snippet.
2. ${isRemoval ? 'If the user wants to remove or delete this section, return ONLY: <!-- ' + targetSnippet.type + ' removed --> or empty.' : 'Return ONLY the updated replacement snippet code.'}
3. Maintain all existing valid links, classes, and structure.
4. Do NOT output conversational preambles or explanations. Return ONLY the code or replacement block.`;

      let response = await generateAIContent({
        provider: options.provider || 'groq',
        model: options.model,
        prompt,
        apiKeys: options.apiKeys,
        log
      });

      // Strip markdown code fences
      let updatedSnippet = response.replace(/^```[a-z0-9_-]*\r?\n/i, '').replace(/\r?\n```\s*$/i, '').trim();

      // If removal was requested and response is very short or comment, replace cleanly
      if (isRemoval && (!updatedSnippet || updatedSnippet.includes('removed') || updatedSnippet.length < 50)) {
        currentCode = currentCode.replace(targetSnippet.snippet, updatedSnippet || `<!-- ${targetSnippet.type} removed -->`);
        await fse.writeFile(target.fullPath, currentCode, 'utf8');
        log(`[Modifier] Successfully removed ${targetSnippet.type} section from ${target.name}`);
        return true;
      }

      // If updated snippet provided, replace
      if (updatedSnippet && updatedSnippet.length > 5) {
        currentCode = currentCode.replace(targetSnippet.snippet, updatedSnippet);
        await fse.writeFile(target.fullPath, currentCode, 'utf8');
        log(`[Modifier] Successfully modified ${targetSnippet.type} section in ${target.name}`);
        return true;
      }
    }

    // If file is large and no target snippet found, notify or try search/replace
    if (isLargeFile) {
      log(`[Modifier] File is large (${(currentCode.length / 1024).toFixed(1)} KB). Requesting targeted search-and-replace...`);
      // Extract top and bottom outline to help AI locate
      const headExcerpt = currentCode.substring(0, 3000);
      const tailExcerpt = currentCode.substring(Math.max(0, currentCode.length - 3000));

      const prompt = `You are an expert web developer modifying a large HTML file.
User Instruction: "${instruction}"

File Header Preview:
${headExcerpt}

...

File Footer Preview:
${tailExcerpt}

Provide a SEARCH and REPLACE block targeting the exact code to change:
<<<<<<< SEARCH
[exact lines to replace]
=======
[replacement lines]
>>>>>>>`;

      let response = await generateAIContent({
        provider: options.provider || 'groq',
        model: options.model,
        prompt,
        apiKeys: options.apiKeys,
        log
      });

      const searchReplaceRegex = /<{4,}\s*SEARCH\r?\n([\s\S]*?)\r?\n={4,}\r?\n([\s\S]*?)\r?\n>{4,}/gi;
      let match;
      let applied = false;
      let patched = currentCode;

      while ((match = searchReplaceRegex.exec(response)) !== null) {
        const searchBlock = match[1].trim();
        const replaceBlock = match[2];
        const idx = patched.indexOf(searchBlock);
        if (idx !== -1) {
          patched = patched.substring(0, idx) + replaceBlock + patched.substring(idx + searchBlock.length);
          applied = true;
        }
      }

      if (applied) {
        await fse.writeFile(target.fullPath, patched, 'utf8');
        log(`[Modifier] Applied targeted patch to ${target.name}`);
        return true;
      }
    }

    // Default: for files within normal token limits (<15KB)
    const prompt = `You are an expert web developer modifying a website file.

## User Instruction:
"${instruction}"

## File: ${target.relPath}
\`\`\`${target.ext.replace('.', '')}
${currentCode}
\`\`\`

Return ONLY the updated file content (or search-and-replace block). No conversational markdown.`;

    let response = await generateAIContent({
      provider: options.provider || 'groq',
      model: options.model,
      prompt,
      apiKeys: options.apiKeys,
      log
    });

    const searchReplaceRegex = /<{4,}\s*SEARCH\r?\n([\s\S]*?)\r?\n={4,}\r?\n([\s\S]*?)\r?\n>{4,}/gi;
    let match;
    let appliedAnyPatch = false;
    let patchedCode = currentCode;

    while ((match = searchReplaceRegex.exec(response)) !== null) {
      const searchBlock = match[1].trim();
      const replaceBlock = match[2];
      const idx = patchedCode.indexOf(searchBlock);
      if (idx !== -1) {
        patchedCode = patchedCode.substring(0, idx) + replaceBlock + patchedCode.substring(idx + searchBlock.length);
        appliedAnyPatch = true;
      }
    }

    if (appliedAnyPatch) {
      await fse.writeFile(target.fullPath, patchedCode, 'utf8');
      log(`[Modifier] Successfully applied search-and-replace patches to ${target.name}`);
      return true;
    }

    let updatedCode = response.replace(/^```[a-z0-9_-]*\r?\n/i, '').replace(/\r?\n```\s*$/i, '').trim();
    if (!updatedCode || updatedCode.length < 20) {
      log(`[Modifier] AI response was empty or too short. Modification skipped.`);
      return false;
    }

    await fse.writeFile(target.fullPath, updatedCode, 'utf8');
    log(`[Modifier] Updated full content of ${target.name} (${(updatedCode.length / 1024).toFixed(1)} KB)`);
    return true;

  } catch (err) {
    log(`[Modifier] Error modifying ${target.name}: ${err.message}`);
    return false;
  }
}

module.exports = {
  modify,
  buildFileTree,
  findTargetSnippet
};
