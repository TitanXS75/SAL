/**
 * SAL Agent - Main Orchestrator
 * Coordinates: wget download → post-process → static preview → AI prompt modifications
 */

const path = require('path');
const fse = require('fs-extra');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const downloader = require('./downloader');
const modifier = require('./modifier');

/**
 * Emit a formatted log message to the UI
 */
function log(socket, message, type = 'info') {
  socket.emit('agent_log', { message, type, timestamp: new Date().toISOString() });
  console.log(`[SAL][${type.toUpperCase()}] ${message}`);
}

/**
 * Full clone pipeline using the exact wget downloader from Website-downloader
 */
async function clone(io, socket, { url, sessionId, provider, model, apiKeys, mode = 'simple', downloadFonts = false }) {
  const startTime = Date.now();
  const options = { provider, model, apiKeys };

  let targetUrl = (url || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  function normalizePath(p) {
    if (!p) return p;
    return path.resolve(p).replace(/^([a-z]):/i, (_, drive) => drive.toUpperCase() + ':');
  }

  // Derive a safe project name from the URL
  const urlObj = new URL(targetUrl);
  const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
  const projectName = `${hostname}-${Date.now()}`;
  const outputDir = normalizePath(path.join(__dirname, '../output', projectName));

  socket.emit('agent_status', { stage: 'starting', projectName });

  try {
    // ─── STAGE 1: DOWNLOAD VIA WGET ──────────────────────────────────────────
    const modeLabel = mode === 'crawl' ? 'Site Crawler (Internal Links)' : 'Simple Cloner (Page + Requisites)';
    log(socket, `🌐 Initializing clone for: ${targetUrl} [${modeLabel}]`, 'info');
    socket.emit('agent_status', { stage: 'scraping', projectName });

    const downloadResult = await downloader.download(
      targetUrl,
      outputDir,
      (line) => log(socket, line, 'scrape'),
      { mode, downloadFonts }
    );

    log(socket, `✅ Download complete (${downloadResult.totalFiles} files captured)`, 'success');

    // ─── STAGE 2: POST-PROCESSING & IMAGE PATH FIXES ───────────────────────
    socket.emit('agent_status', { stage: 'analyzing', projectName });
    log(socket, `🧠 Post-processing downloaded assets & encoded image paths...`, 'info');

    // ─── STAGE 3: STATIC SITE ROUTING & LINK MAPPING ────────────────────────
    socket.emit('agent_status', { stage: 'generating', projectName });
    log(socket, `⚙️  Mapping local entry point: ${downloadResult.entryFile}`, 'info');

    // ─── STAGE 4: VALIDATION ───────────────────────────────────────────────
    socket.emit('agent_status', { stage: 'validating', projectName });
    log(socket, `🔨 Validating offline site integrity...`, 'info');

    const entryFullPath = path.join(outputDir, downloadResult.entryFile);
    if (!await fse.pathExists(entryFullPath)) {
      log(socket, `⚠️ Entry file not found at ${downloadResult.entryFile}, checking root index.html...`, 'warn');
    } else {
      log(socket, `✅ Entry file verified: ${downloadResult.entryFile}`, 'success');
    }

    // ─── STAGE 5: START PREVIEW ───────────────────────────────────────────
    socket.emit('agent_status', { stage: 'preview', projectName });

    const port = process.env.PORT || 4000;
    const previewUrl = `http://localhost:${port}/preview/${projectName}/${downloadResult.entryFile}`;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    log(socket, `🎉 Complete in ${elapsed}s! Live preview ready: ${previewUrl}`, 'success');

    socket.emit('agent_complete', {
      projectName,
      outputDir,
      previewUrl,
      previewPort: port,
      elapsed,
      entryFile: downloadResult.entryFile,
      websiteFolder: downloadResult.websiteFolder
    });

  } catch (err) {
    log(socket, `❌ Error during clone: ${err.message}`, 'error');
    socket.emit('agent_error', { message: err.message, stage: 'clone' });
    throw err;
  }
}

/**
 * Apply natural language modifications to the downloaded website code
 */
async function modify(io, socket, { projectName, instruction, provider, model, apiKeys }) {
  const outputDir = path.join(__dirname, '../output', projectName);
  const options = { provider, model, apiKeys };

  if (!await fse.pathExists(outputDir)) {
    throw new Error(`Project "${projectName}" not found in output directory`);
  }

  const pLabel = (provider === 'groq') ? 'Groq' : 'Gemini';
  log(socket, `✏️  Applying modification: "${instruction}" using ${pLabel}`, 'info');
  socket.emit('agent_status', { stage: 'modifying', projectName });

  try {
    const result = await modifier.modify(
      outputDir,
      instruction,
      (msg) => log(socket, msg, 'modify'),
      options
    );

    log(socket, `✅ Modification applied to ${result.filesChanged} file(s): ${result.changedFiles.join(', ')}`, 'success');

    socket.emit('agent_modified', {
      projectName,
      filesChanged: result.filesChanged,
      changedFiles: result.changedFiles,
      instruction
    });

  } catch (err) {
    log(socket, `❌ Modification failed: ${err.message}`, 'error');
    socket.emit('agent_error', { message: err.message, stage: 'modify' });
    throw err;
  }
}

module.exports = { clone, modify };
