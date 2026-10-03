require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const { ZipArchive } = require('archiver');
const agent = require('./agent/index');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Serve generated project preview (proxied or static)
app.use('/preview', express.static(path.join(__dirname, 'output')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const fse = require('fs-extra');
const aiClient = require('./agent/aiClient');

// REST endpoint: get API keys and provider status
app.get('/api/config', (req, res) => {
  res.json(aiClient.getRuntimeConfigStatus());
});

// REST endpoint: save API keys & preferences
app.post('/api/config', (req, res) => {
  const { geminiApiKey, groqApiKey, preferredProvider, preferredGeminiModel, preferredGroqModel } = req.body;
  aiClient.setRuntimeConfig({ geminiApiKey, groqApiKey, preferredProvider, preferredGeminiModel, preferredGroqModel });

  // Persist valid keys to .env
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = fse.existsSync(envPath) ? fse.readFileSync(envPath, 'utf8') : '';
    if (geminiApiKey && geminiApiKey.trim() && geminiApiKey !== 'your_gemini_api_key_here') {
      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${geminiApiKey.trim()}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${geminiApiKey.trim()}`;
      }
    }
    if (groqApiKey && groqApiKey.trim() && groqApiKey !== 'your_groq_api_key_here') {
      if (envContent.includes('GROQ_API_KEY=')) {
        envContent = envContent.replace(/GROQ_API_KEY=.*/, `GROQ_API_KEY=${groqApiKey.trim()}`);
      } else {
        envContent += `\nGROQ_API_KEY=${groqApiKey.trim()}`;
      }
    }
    fse.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  } catch (e) {
    console.warn('[Server] Could not update .env:', e.message);
  }

  res.json({ success: true, config: aiClient.getRuntimeConfigStatus() });
});

// REST endpoint: test API key connectivity
app.post('/api/test-key', async (req, res) => {
  const { provider, apiKey } = req.body;
  try {
    const result = await aiClient.testApiKey(provider, apiKey);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Helper to find entry HTML file in a project folder
function findEntryHtml(dir, rel = '') {
  if (!fse.existsSync(dir)) return null;
  try {
    const items = fse.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && item.name.toLowerCase() === 'index.html') {
        return rel ? `${rel}/${item.name}` : item.name;
      }
    }
    for (const item of items) {
      if (item.isDirectory() && !['node_modules', '.git'].includes(item.name)) {
        const subRel = rel ? `${rel}/${item.name}` : item.name;
        const found = findEntryHtml(path.join(dir, item.name), subRel);
        if (found) return found;
      }
    }
    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.html')) {
        return rel ? `${rel}/${item.name}` : item.name;
      }
    }
  } catch {}
  return null;
}

// REST endpoint: get detailed list of cloned projects
app.get('/api/projects', (req, res) => {
  const outputDir = path.join(__dirname, 'output');
  if (!fse.existsSync(outputDir)) return res.json([]);
  const dirs = fse.readdirSync(outputDir).filter(f => {
    try {
      return fse.statSync(path.join(outputDir, f)).isDirectory();
    } catch {
      return false;
    }
  });

  const projects = dirs.map(name => {
    const projectDir = path.join(outputDir, name);
    const stat = fse.statSync(projectDir);
    const entry = findEntryHtml(projectDir) || 'index.html';
    const previewUrl = `http://localhost:${PORT}/preview/${name}/${entry}`;
    return {
      name,
      createdAt: stat.birthtime || stat.mtime,
      isRunning: true,
      previewPort: PORT,
      previewUrl,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(projects);
});

// REST endpoint: download full project as ZIP directly into user's device
app.get('/api/projects/:projectName/download', async (req, res) => {
  const { projectName } = req.params;
  const projectDir = path.join(__dirname, 'output', projectName);
  if (!await fse.pathExists(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[Archive Error]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(projectDir, false);
  archive.finalize();
});

// REST endpoint: get source file tree for a project
app.get('/api/projects/:projectName/files', async (req, res) => {
  const { projectName } = req.params;
  const projectDir = path.join(__dirname, 'output', projectName);
  if (!await fse.pathExists(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const files = [];
  async function scan(dir, rel = '') {
    const entries = await fse.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (['node_modules', '.next', '.git'].includes(ent.name)) continue;
      const entRel = path.join(rel, ent.name).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        await scan(path.join(dir, ent.name), entRel);
      } else {
        files.push(entRel);
      }
    }
  }
  await scan(projectDir);
  res.json({ projectName, files });
});

// REST endpoint: get content of a specific source file
app.get('/api/projects/:projectName/file', async (req, res) => {
  const { projectName } = req.params;
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path required' });

  const safeRel = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(__dirname, 'output', projectName, safeRel);

  if (!await fse.pathExists(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const content = await fse.readFile(fullPath, 'utf8');
    res.json({ path: filePath, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST endpoint: start or check preview for a project
app.post('/api/projects/:projectName/start-preview', async (req, res) => {
  const { projectName } = req.params;
  const projectDir = path.join(__dirname, 'output', projectName);
  if (!await fse.pathExists(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const entry = findEntryHtml(projectDir) || 'index.html';
  const previewUrl = `http://localhost:${PORT}/preview/${projectName}/${entry}`;
  res.json({ success: true, previewUrl, port: PORT });
});

// Convenience route: /preview/:projectName redirects to the entry HTML
app.get('/preview/:projectName', (req, res) => {
  const { projectName } = req.params;
  const projectDir = path.join(__dirname, 'output', projectName);
  if (!fse.existsSync(projectDir)) {
    return res.status(404).send('Project not found');
  }
  const entry = findEntryHtml(projectDir);
  if (entry) {
    return res.redirect(`/preview/${projectName}/${entry}`);
  }
  res.status(404).send('No HTML entry found in project');
});

// Socket.io — main agent communication channel
io.on('connection', (socket) => {
  console.log(`[SAL] Client connected: ${socket.id}`);

  // Start cloning flow
  socket.on('clone_request', async (data) => {
    console.log(`[SAL] Clone request for: ${data.url} (Provider: ${data.provider || 'default'})`);
    try {
      await agent.clone(io, socket, data);
    } catch (err) {
      console.error('[SAL] Clone error:', err.message);
      socket.emit('agent_error', { message: err.message });
    }
  });

  // Natural-language modification
  socket.on('modify_request', async (data) => {
    console.log(`[SAL] Modify request: "${data.instruction}" on project: ${data.projectName} (Provider: ${data.provider || 'default'})`);
    try {
      await agent.modify(io, socket, data);
    } catch (err) {
      console.error('[SAL] Modify error:', err.message);
      socket.emit('agent_error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SAL] Client disconnected: ${socket.id}`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use by another process.`);
    console.error(`   To free port ${PORT} in PowerShell, run:`);
    console.error(`   Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force\n`);
  } else {
    console.error('\n❌ Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n🚀 SAL Agent running at http://localhost:${PORT}\n`);
});
