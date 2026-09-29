/**
 * SAL Agent - Validator Module
 * Runs npm install + npm run build, detects errors, and uses Gemini to fix them.
 * Also manages the preview dev server.
 */

const { exec, spawn } = require('child_process');
const { generateAIContent } = require('./aiClient');
const fse = require('fs-extra');
const path = require('path');
const net = require('net');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MAX_FIX_RETRIES = parseInt(process.env.MAX_FIX_RETRIES) || 3;

// Track running preview servers: projectDir → { process, port }
const previewServers = {};

function getRunningPreview(outputDir) {
  return previewServers[outputDir] || null;
}

function getAllRunningPreviews() {
  return Object.entries(previewServers).map(([dir, info]) => ({
    dir,
    projectName: path.basename(dir),
    port: info.port,
    previewUrl: `http://localhost:${info.port}`
  }));
}

function normalizePath(p) {
  if (!p) return p;
  return path.resolve(p).replace(/^([a-z]):/i, (_, drive) => drive.toUpperCase() + ':');
}

/**
 * Validate a generated project — install, build, auto-fix errors
 */
async function validate(outputDir, log = () => {}, options = {}) {
  let fixedErrors = 0;
  const targetDir = normalizePath(outputDir);

  // ── Step 1: Dependencies setup (instant junction from cache if present) ──
  const projectModules = normalizePath(path.join(targetDir, 'node_modules'));
  const cacheModules = normalizePath(path.join(__dirname, '../templates/next-cache/node_modules'));

  if (await fse.pathExists(cacheModules) && !await fse.pathExists(projectModules)) {
    log('⚡ Linking pre-cached Next.js & Tailwind dependencies...');
    try {
      fse.symlinkSync(cacheModules, projectModules, 'junction');
      log('✅ Linked cached dependencies instantly (0.01s).');
    } catch (linkErr) {
      log(`Junction fallback (${linkErr.message}), running npm install...`);
      await runCommand('npm install --legacy-peer-deps --no-audit --prefer-offline', targetDir);
    }
  } else if (!await fse.pathExists(projectModules)) {
    log('Running npm install...');
    try {
      await runCommand('npm install --legacy-peer-deps --no-audit --prefer-offline', targetDir);
      log('npm install succeeded.');
    } catch (err) {
      log(`npm install failed: ${err.message}`);
      throw new Error('npm install failed — check network or package.json');
    }
  }

  // ── Step 2: Build with error-fix loop ────────────────────────────────────
  for (let attempt = 1; attempt <= MAX_FIX_RETRIES + 1; attempt++) {
    log(`Build attempt ${attempt}/${MAX_FIX_RETRIES + 1}...`);

    const { success, errors } = await runBuild(targetDir);

    if (success) {
      log(`Build successful on attempt ${attempt}.`);
      return { success: true, fixedErrors };
    }

    if (attempt > MAX_FIX_RETRIES) {
      log(`Build still failing after ${MAX_FIX_RETRIES} fix attempts. Continuing anyway...`);
      return { success: false, fixedErrors, finalErrors: errors };
    }

    // ── Auto-fix attempt ────────────────────────────────────────────────
    log(`Build errors detected. Asking AI to fix (attempt ${attempt})...`);
    try {
      const fixed = await fixErrors(targetDir, errors, log, options);
      if (fixed) {
        fixedErrors++;
        log(`Applied fix for ${fixed} file(s).`);
      }
    } catch (fixErr) {
      log(`Error during fix attempt: ${fixErr.message}`);
    }
  }

  return { success: false, fixedErrors };
}

/**
 * Start a Next.js dev preview server
 */
async function startPreview(outputDir, log = () => {}) {
  const targetDir = normalizePath(outputDir);

  // Kill existing server for this project if any
  if (previewServers[targetDir]) {
    try { previewServers[targetDir].process.kill(); } catch {}
  }

  const port = await findFreePort(3001);
  log(`Starting dev server on port ${port}...`);

  const child = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd: targetDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    shell: true,
    detached: false
  });

  previewServers[targetDir] = { process: child, port };

  child.stdout.on('data', (d) => log(d.toString().trim()));
  child.stderr.on('data', (d) => log(d.toString().trim()));

  // Wait for Next.js to be ready
  await waitForPort(port, 60000);

  return port;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function runBuild(outputDir) {
  return new Promise((resolve) => {
    exec('npm run build 2>&1', {
      cwd: outputDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 120000
    }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '');

      if (!err) {
        resolve({ success: true, errors: [] });
        return;
      }

      // Parse TypeScript / Next.js build errors
      const errors = parseErrors(output, outputDir);
      resolve({ success: false, errors });
    });
  });
}

function parseErrors(output, outputDir) {
  const errors = [];

  // TypeScript errors: ./components/X.tsx:10:5 - error TS2345:
  const tsErrorPattern = /\.\/([\w/.-]+\.tsx?):(\d+):(\d+) - error (TS\d+): (.+)/g;
  let match;
  while ((match = tsErrorPattern.exec(output)) !== null) {
    errors.push({
      file: path.join(outputDir, match[1]),
      relPath: match[1],
      line: parseInt(match[2]),
      col: parseInt(match[3]),
      code: match[4],
      message: match[5]
    });
  }

  // If no structured errors found, include raw output
  if (errors.length === 0) {
    errors.push({ file: null, message: output.substring(0, 3000), raw: true });
  }

  return errors;
}

async function fixErrors(outputDir, errors, log, options = {}) {
  // Group errors by file
  const byFile = {};
  errors.forEach(err => {
    if (err.raw) return;
    if (!byFile[err.file]) byFile[err.file] = [];
    byFile[err.file].push(err);
  });

  let fixedCount = 0;

  for (const [filePath, fileErrors] of Object.entries(byFile)) {
    if (!await fse.pathExists(filePath)) continue;

    const currentCode = await fse.readFile(filePath, 'utf8');
    const errorSummary = fileErrors.map(e => `Line ${e.line}: ${e.code} — ${e.message}`).join('\n');

    const prompt = `You are a TypeScript/Next.js expert. Fix the following build errors in this file.

## File: ${path.basename(filePath)}
## Errors:
${errorSummary}

## Current Code:
\`\`\`tsx
${currentCode}
\`\`\`

Return ONLY the complete fixed file content (no explanations, no markdown fences):`;

    try {
      let fixed = await generateAIContent({
        provider: options.provider || 'gemini',
        model: options.model,
        prompt,
        apiKeys: options.apiKeys,
        log
      });
      fixed = fixed.replace(/^```(?:tsx?|typescript)?\n?/gm, '').replace(/^```\n?/gm, '').trim();

      if (fixed && fixed.length > 50) {
        await fse.writeFile(filePath, fixed, 'utf8');
        log(`  Fixed: ${path.basename(filePath)}`);
        fixedCount++;
      }
    } catch (err) {
      log(`  Could not fix ${path.basename(filePath)}: ${err.message}`);
    }
  }

  // Handle raw errors (no file reference)
  const rawErrors = errors.filter(e => e.raw);
  if (rawErrors.length > 0) {
    // Try to find and fix the most recently modified component
    const componentDir = path.join(outputDir, 'components');
    if (await fse.pathExists(componentDir)) {
      const files = await fse.readdir(componentDir);
      for (const file of files.filter(f => f.endsWith('.tsx')).slice(0, 3)) {
        const filePath = path.join(componentDir, file);
        const currentCode = await fse.readFile(filePath, 'utf8');

        const prompt = `Fix TypeScript/React errors in this Next.js component. Make it compile cleanly.

## Build Error Context:
${rawErrors[0].message.substring(0, 1000)}

## Current Code:
\`\`\`tsx
${currentCode}
\`\`\`

Return ONLY the complete fixed file (no markdown fences):`;

        try {
          let fixed = await generateAIContent({
            provider: options.provider || 'gemini',
            model: options.model,
            prompt,
            apiKeys: options.apiKeys,
            log
          });
          fixed = fixed.replace(/^```(?:tsx?|typescript)?\n?/gm, '').replace(/^```\n?/gm, '').trim();
          if (fixed && fixed.length > 50) {
            await fse.writeFile(filePath, fixed, 'utf8');
            fixedCount++;
          }
        } catch {}
      }
    }
  }

  return fixedCount;
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${command} failed: ${stderr || stdout || err.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(startPort + 1)));
  });
}

async function waitForPort(port, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const open = await isPortOpen(port);
    if (open) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false; // Timeout — return anyway
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

module.exports = { validate, startPreview, getRunningPreview, getAllRunningPreviews };
