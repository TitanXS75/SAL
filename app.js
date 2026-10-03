/* ============================================================
   SAL — Apple-Inspired Website Downloader & Studio Controller
   Works seamlessly both with local Node server and on GitHub Pages!
   ============================================================ */

// ── Application State ─────────────────────────────────────────
let engineMode = 'detecting'; // 'local_server' | 'client_browser'
let activeMainTab = 'download'; // 'download' | 'editor'
let socket = null;
let currentProjectName = null;
let currentZipDownloadUrl = null;
let currentZipBlob = null;
let currentPreviewUrl = null;
let currentTargetUrl = '';
let activeDevice = 'desktop';
let activeEditorDevice = 'desktop';
let activeEditorMode = 'preview';
let activeFilePath = '';
let activeFileContent = '';

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initEngineDetection();
  initLocalStorage();
  loadProjectsList();

  // Check URL hash or localStorage for tab
  const hash = window.location.hash.replace('#', '');
  if (hash === 'editor') {
    switchMainTab('editor');
  } else {
    switchMainTab('download');
  }
});

function initLocalStorage() {
  const savedUrl = localStorage.getItem('sal_last_url');
  if (savedUrl) {
    const input = document.getElementById('urlInput');
    if (input) input.value = savedUrl;
  }

  const savedGeminiKey = localStorage.getItem('sal_gemini_key');
  if (savedGeminiKey) {
    const keyInput = document.getElementById('geminiKeyInput');
    if (keyInput) keyInput.value = savedGeminiKey;
  }

  const savedGroqKey = localStorage.getItem('sal_groq_key');
  if (savedGroqKey) {
    const keyInput = document.getElementById('groqKeyInput');
    if (keyInput) keyInput.value = savedGroqKey;
  }

  const savedProvider = localStorage.getItem('sal_ai_provider');
  if (savedProvider) {
    const select = document.getElementById('providerSelect');
    if (select) select.value = savedProvider;
    const studioSelect = document.getElementById('studioProviderSelect');
    if (studioSelect) studioSelect.value = savedProvider;
  }
}

// ── Tab Management (Downloader vs Studio & Editor) ─────────────
function switchMainTab(tabId) {
  activeMainTab = tabId;
  try {
    window.location.hash = tabId;
  } catch (e) {}

  const btnDownload = document.getElementById('tabBtnDownload');
  const btnEditor = document.getElementById('tabBtnEditor');
  const contentDownload = document.getElementById('tabContentDownload');
  const contentEditor = document.getElementById('tabContentEditor');

  if (tabId === 'editor') {
    btnEditor.classList.add('active');
    btnDownload.classList.remove('active');
    contentEditor.classList.remove('hidden');
    contentDownload.classList.add('hidden');
    document.getElementById('editorDot').classList.add('hidden');

    if (!currentProjectName) {
      loadProjectsList();
    }
  } else {
    btnDownload.classList.add('active');
    btnEditor.classList.remove('active');
    contentDownload.classList.remove('hidden');
    contentEditor.classList.add('hidden');
  }
}

function openCurrentProjectInStudio() {
  switchMainTab('editor');
  if (currentProjectName) {
    onSelectProject(currentProjectName);
  }
}

// ── Dual Engine Detection (Local Server vs GitHub Pages) ───────
function initEngineDetection() {
  const statusPill = document.getElementById('engineStatusPill');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('engineStatusText');

  const isGitHubPages = window.location.hostname.includes('github.io');

  if (typeof io !== 'undefined' && !isGitHubPages) {
    try {
      socket = io({ timeout: 2500, reconnectionAttempts: 2 });

      socket.on('connect', () => {
        engineMode = 'local_server';
        statusDot.className = 'status-dot local';
        statusText.textContent = 'LOCAL ENGINE';
        statusPill.title = 'Connected to local SAL Agent (Wget + Node.js)';
        appendLog('Connected to local SAL Agent engine (Port 4000)', 'success');
      });

      socket.on('connect_error', () => {
        setupClientBrowserEngine();
      });

      socket.on('agent_log', ({ message, type }) => {
        appendLog(message, type);
      });

      socket.on('agent_status', ({ stage, projectName }) => {
        if (projectName) {
          currentProjectName = projectName;
          document.getElementById('editorDot').classList.remove('hidden');
        }
        updateProgressStage(stage);
      });

      socket.on('agent_complete', (data) => {
        handleServerComplete(data);
      });

      socket.on('agent_error', ({ message }) => {
        handleDownloadError(message);
      });

      socket.on('agent_modified', (data) => {
        handleServerModified(data);
      });

      // Safety fallback if socket doesn't connect within 2.5s
      setTimeout(() => {
        if (engineMode === 'detecting') {
          setupClientBrowserEngine();
        }
      }, 2500);

      return;
    } catch (e) {
      console.warn('[SAL] Socket.io init failed, falling back to Web Engine', e);
    }
  }

  setupClientBrowserEngine();
}

function setupClientBrowserEngine() {
  if (engineMode === 'local_server') return;
  engineMode = 'client_browser';
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('engineStatusText');
  const statusPill = document.getElementById('engineStatusPill');

  if (statusDot && statusText) {
    statusDot.className = 'status-dot client';
    statusText.textContent = 'WEB ENGINE';
    statusPill.title = 'Running in browser client mode (GitHub Pages ready)';
  }
  appendLog('Operating in Browser Web Engine mode (Standalone)', 'info');
}

// ── UI Actions ────────────────────────────────────────────────
function setUrl(url) {
  const input = document.getElementById('urlInput');
  if (input) {
    input.value = url;
    input.focus();
  }
}

function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'settingsModal') {
    closeSettingsModal();
  }
}

function saveSettings() {
  const gemini = document.getElementById('geminiKeyInput').value.trim();
  const groq = document.getElementById('groqKeyInput').value.trim();
  const provider = document.getElementById('providerSelect').value;

  localStorage.setItem('sal_gemini_key', gemini);
  localStorage.setItem('sal_groq_key', groq);
  localStorage.setItem('sal_ai_provider', provider);

  const studioSelect = document.getElementById('studioProviderSelect');
  if (studioSelect) studioSelect.value = provider;

  // If local server is running, sync to backend
  if (engineMode === 'local_server') {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: gemini, groqApiKey: groq, preferredProvider: provider })
    }).catch(() => {});
  }

  showToast('Settings saved successfully', 'success');
  closeSettingsModal();
}

function toggleTerminal() {
  const box = document.getElementById('terminalBox');
  const label = document.getElementById('terminalToggleText');
  const isHidden = box.classList.contains('hidden');

  if (isHidden) {
    box.classList.remove('hidden');
    label.textContent = 'Hide download log';
  } else {
    box.classList.add('hidden');
    label.textContent = 'Show download log';
  }
}

function setDeviceView(device) {
  activeDevice = device;
  const previewBody = document.getElementById('previewBody');
  const btns = {
    desktop: document.getElementById('btnDevDesktop'),
    tablet: document.getElementById('btnDevTablet'),
    mobile: document.getElementById('btnDevMobile')
  };

  Object.keys(btns).forEach(d => {
    if (btns[d]) btns[d].classList.toggle('active', d === device);
  });

  if (previewBody) {
    previewBody.className = `preview-body device-${device}`;
  }
}

function scrollToPreview() {
  const container = document.getElementById('previewContainer');
  if (container) {
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleAiDrawer() {
  const drawer = document.getElementById('aiDrawer');
  if (!drawer) return;
  drawer.classList.toggle('hidden');
  scrollToPreview();
  if (!drawer.classList.contains('hidden')) {
    const input = document.getElementById('aiPromptInput');
    if (input) input.focus();
  }
}

// ── Download Workflow ─────────────────────────────────────────
async function startDownload() {
  const input = document.getElementById('urlInput');
  let url = (input.value || '').trim();

  if (!url) {
    showToast('Please enter a website URL', 'error');
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
    input.value = url;
  }

  try {
    new URL(url);
  } catch (e) {
    showToast('Please enter a valid URL (e.g. https://apple.com)', 'error');
    return;
  }

  currentTargetUrl = url;
  localStorage.setItem('sal_last_url', url);

  // Prepare UI
  setButtonLoading(true);
  hideCards(['successCard']);
  showProgressCard();
  clearTerminal();
  appendLog(`Starting website download: ${url}`, 'info');

  if (engineMode === 'local_server' && socket && socket.connected) {
    // ── Local Server Execution ──
    const provider = localStorage.getItem('sal_ai_provider') || 'gemini';
    const geminiKey = localStorage.getItem('sal_gemini_key') || '';
    const groqKey = localStorage.getItem('sal_groq_key') || '';

    socket.emit('clone_request', {
      url,
      provider,
      apiKeys: { gemini: geminiKey, groq: groqKey },
      mode: 'simple',
      downloadFonts: false
    });
  } else {
    // ── Browser Web Engine Execution (GitHub Pages) ──
    await runBrowserDownloadEngine(url);
  }
}

function setButtonLoading(isLoading) {
  const btn = document.getElementById('downloadBtn');
  const btnText = document.getElementById('downloadBtnText');
  if (!btn || !btnText) return;

  btn.disabled = isLoading;
  btnText.textContent = isLoading ? 'Downloading...' : 'Download Website';
}

function showProgressCard() {
  const card = document.getElementById('progressCard');
  if (card) {
    card.classList.remove('hidden');
    setProgress(15, 'Connecting to website...', 'CONNECTING');
  }
}

function setProgress(percent, text, badge = 'IN PROGRESS') {
  const fill = document.getElementById('progressBarFill');
  const stepText = document.getElementById('progressStepText');
  const pctText = document.getElementById('progressPercent');
  const badgeEl = document.getElementById('progressBadge');

  if (fill) fill.style.width = `${percent}%`;
  if (stepText) stepText.textContent = text;
  if (pctText) pctText.textContent = `${percent}%`;
  if (badgeEl) badgeEl.textContent = badge;
}

function updateProgressStage(stage) {
  switch (stage) {
    case 'starting':
      setProgress(20, 'Initializing site connection...', 'STARTING');
      break;
    case 'scraping':
      setProgress(50, 'Capturing HTML, stylesheets, scripts & images...', 'CAPTURING');
      break;
    case 'analyzing':
      setProgress(75, 'Fixing asset paths & local links...', 'PROCESSING');
      break;
    case 'generating':
      setProgress(85, 'Packaging offline .ZIP archive...', 'PACKAGING');
      break;
    case 'preview':
      setProgress(95, 'Preparing live preview...', 'FINALIZING');
      break;
  }
}

function handleServerComplete(data) {
  const { projectName, previewUrl, downloadUrl, elapsed } = data;
  currentProjectName = projectName;
  currentPreviewUrl = previewUrl;
  currentZipDownloadUrl = downloadUrl || `/api/projects/${projectName}/download`;

  setProgress(100, 'Website captured & bundled!', 'COMPLETE');
  setButtonLoading(false);

  // Update success card
  const filename = `${projectName}.zip`;
  document.getElementById('metaFileName').textContent = filename;
  document.getElementById('metaFilesCount').textContent = 'Full assets captured';
  document.getElementById('metaElapsed').textContent = `${elapsed}s`;
  document.getElementById('successCard').classList.remove('hidden');

  // Auto-download to device
  const autoDownload = document.getElementById('autoDownloadCheck').checked;
  if (autoDownload) {
    triggerBrowserDownload(currentZipDownloadUrl, filename);
    showToast('Website downloaded to your device!', 'success');
  } else {
    showToast('Website archive ready!', 'success');
  }

  // Live preview
  const autoPreview = document.getElementById('autoPreviewCheck').checked;
  if (autoPreview && previewUrl) {
    loadPreviewInIframe(previewUrl, currentTargetUrl);
  }

  // Refresh editor projects list
  loadProjectsList(projectName);
}

function handleDownloadError(message) {
  setButtonLoading(false);
  setProgress(100, `Failed: ${message}`, 'ERROR');
  appendLog(`Download error: ${message}`, 'error');
  showToast(`Error: ${message}`, 'error');
}

// ── Client-Side Browser Download Engine (GitHub Pages) ────────
async function runBrowserDownloadEngine(targetUrl) {
  const startTime = Date.now();
  const urlObj = new URL(targetUrl);
  const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
  const filename = `${hostname}-website.zip`;

  try {
    setProgress(25, `Fetching HTML for ${urlObj.hostname}...`, 'FETCHING');
    appendLog(`[Web Engine] Fetching HTML from ${targetUrl}`, 'info');

    // 1. Fetch target HTML through CORS proxy cascade
    const html = await fetchWithCorsFallback(targetUrl);
    if (!html) throw new Error('Could not retrieve HTML content from this website');

    setProgress(45, 'Parsing document and discovering assets...', 'PARSING');
    appendLog('[Web Engine] Parsing HTML DOM and extracting linked assets', 'info');

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const zip = new JSZip();
    const assetsFolder = zip.folder('assets');

    const baseEl = doc.querySelector('base');
    const baseUrl = baseEl && baseEl.href ? baseEl.href : targetUrl;

    function resolveUrl(relative) {
      try {
        return new URL(relative, baseUrl).href;
      } catch (e) {
        return null;
      }
    }

    function safeFilename(urlStr, defaultExt = '.bin') {
      try {
        const u = new URL(urlStr);
        let name = u.pathname.split('/').filter(Boolean).pop() || `asset-${Date.now()}`;
        name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!name.includes('.')) name += defaultExt;
        return name;
      } catch (e) {
        return `asset-${Date.now()}${defaultExt}`;
      }
    }

    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"], link[rel="icon"], link[rel="shortcut icon"]'));
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    const images = Array.from(doc.querySelectorAll('img[src], source[srcset]'));

    const totalToFetch = Math.min(links.length + scripts.length + images.length, 30);
    let fetchedCount = 0;

    setProgress(60, `Downloading styles, scripts and images (0/${totalToFetch})...`, 'DOWNLOADING');

    // Fetch and rewrite links
    for (const link of links.slice(0, 15)) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const absUrl = resolveUrl(href);
      if (!absUrl) continue;

      const assetName = safeFilename(absUrl, '.css');
      try {
        const content = await fetchWithCorsFallback(absUrl);
        if (content) {
          assetsFolder.file(assetName, content);
          link.setAttribute('href', `./assets/${assetName}`);
          fetchedCount++;
          setProgress(60 + Math.round((fetchedCount / totalToFetch) * 25), `Captured ${assetName}...`, 'DOWNLOADING');
        }
      } catch (e) {}
    }

    // Fetch and rewrite scripts
    for (const script of scripts.slice(0, 10)) {
      const src = script.getAttribute('src');
      if (!src) continue;
      const absUrl = resolveUrl(src);
      if (!absUrl) continue;

      const assetName = safeFilename(absUrl, '.js');
      try {
        const content = await fetchWithCorsFallback(absUrl);
        if (content) {
          assetsFolder.file(assetName, content);
          script.setAttribute('src', `./assets/${assetName}`);
          fetchedCount++;
        }
      } catch (e) {}
    }

    if (baseEl) baseEl.remove();

    const processedHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    zip.file('index.html', processedHtml);
    zip.file('README.txt', `Website cloned with SAL\nSource: ${targetUrl}\nDownloaded: ${new Date().toISOString()}`);

    setProgress(90, 'Packaging offline .ZIP file...', 'PACKAGING');

    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      setProgress(90 + Math.round(metadata.percent * 0.08), `Compressing ZIP (${Math.round(metadata.percent)}%)...`, 'COMPRESSING');
    });

    currentZipBlob = zipBlob;
    currentZipDownloadUrl = URL.createObjectURL(zipBlob);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    setProgress(100, 'Website saved to device!', 'COMPLETE');
    setButtonLoading(false);

    document.getElementById('metaFileName').textContent = filename;
    document.getElementById('metaFilesCount').textContent = `${fetchedCount + 1} files captured`;
    document.getElementById('metaElapsed').textContent = `${elapsed}s`;
    document.getElementById('successCard').classList.remove('hidden');

    const autoDownload = document.getElementById('autoDownloadCheck').checked;
    if (autoDownload) {
      triggerBrowserDownload(currentZipDownloadUrl, filename);
      showToast('Website downloaded to your device!', 'success');
    } else {
      showToast('Website ready to download!', 'success');
    }

    const autoPreview = document.getElementById('autoPreviewCheck').checked;
    if (autoPreview) {
      const htmlBlob = new Blob([processedHtml], { type: 'text/html' });
      const htmlBlobUrl = URL.createObjectURL(htmlBlob);
      loadPreviewInIframe(htmlBlobUrl, targetUrl);
    }

  } catch (err) {
    console.error('[Web Engine Error]', err);
    handleDownloadError(err.message || 'Failed to download website');
  }
}

// ── Multi-Proxy Fetcher with Automatic Fallback ───────────────
async function fetchWithCorsFallback(url) {
  try {
    const directRes = await fetch(url, { mode: 'cors' });
    if (directRes.ok) return await directRes.text();
  } catch (e) {}

  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
  ];

  for (const proxyFn of proxies) {
    try {
      const proxyUrl = proxyFn(url);
      const res = await fetch(proxyUrl, { headers: { 'Accept': '*/*' } });
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {}
  }

  return null;
}

// ── Download Helpers ──────────────────────────────────────────
function triggerBrowserDownload(urlOrBlobUrl, filename = 'website.zip') {
  const a = document.createElement('a');
  a.href = urlOrBlobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (e) {}
  }, 100);
}

function triggerDownloadAgain() {
  if (currentZipBlob) {
    const filename = document.getElementById('metaFileName').textContent || 'website.zip';
    triggerBrowserDownload(URL.createObjectURL(currentZipBlob), filename);
    showToast('Downloading .ZIP again...', 'success');
  } else if (currentZipDownloadUrl) {
    const filename = document.getElementById('metaFileName').textContent || 'website.zip';
    triggerBrowserDownload(currentZipDownloadUrl, filename);
    showToast('Downloading .ZIP again...', 'success');
  } else {
    showToast('No active download found', 'error');
  }
}

// ── Quick Live Preview in Tab 1 ───────────────────────────────
function loadPreviewInIframe(previewUrl, originalUrl) {
  const container = document.getElementById('previewContainer');
  const iframe = document.getElementById('previewIframe');
  const addressText = document.getElementById('safariAddressText');
  const extBtn = document.getElementById('openExternalBtn');

  if (container) container.classList.remove('hidden');
  if (addressText) addressText.textContent = originalUrl || 'https://example.com';
  if (iframe) iframe.src = previewUrl;
  if (extBtn) extBtn.href = previewUrl;

  scrollToPreview();
}

// ── TAB 2: STUDIO & EDITOR LOGIC ──────────────────────────────
async function loadProjectsList(selectProjectName) {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const projects = await res.json();
    const select = document.getElementById('editorProjectSelect');
    if (!select) return;

    select.innerHTML = '<option value="">(Select a cloned website)</option>';

    if (!Array.isArray(projects) || projects.length === 0) {
      return;
    }

    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.name} (${new Date(p.createdAt).toLocaleDateString()})`;
      select.appendChild(opt);
    });

    const targetProject = selectProjectName || currentProjectName || projects[0]?.name;
    if (targetProject) {
      select.value = targetProject;
      onSelectProject(targetProject);
    }
  } catch (err) {
    console.warn('Could not load projects list:', err);
  }
}

async function onSelectProject(projectName) {
  if (!projectName) {
    document.getElementById('editorEmptyState').classList.remove('hidden');
    return;
  }

  currentProjectName = projectName;
  document.getElementById('editorEmptyState').classList.add('hidden');

  const previewUrl = `/preview/${projectName}`;
  currentPreviewUrl = previewUrl;

  const iframe = document.getElementById('editorMainIframe');
  if (iframe) iframe.src = previewUrl;

  const addressText = document.getElementById('editorAddressBarText');
  if (addressText) addressText.textContent = `http://localhost:4000/preview/${projectName}`;

  const openLink = document.getElementById('editorOpenWindowLink');
  if (openLink) openLink.href = previewUrl;

  // Load project file tree
  loadProjectFileTree(projectName);
}

function setEditorDevice(device) {
  activeEditorDevice = device;
  const chassis = document.getElementById('editorIframeChassis');
  const sizeTag = document.getElementById('editorSizeTag');
  const btns = {
    desktop: document.getElementById('btnEditorDesktop'),
    tablet: document.getElementById('btnEditorTablet'),
    mobile: document.getElementById('btnEditorMobile')
  };

  Object.keys(btns).forEach(d => {
    if (btns[d]) btns[d].classList.toggle('active', d === device);
  });

  if (chassis) {
    chassis.className = `editor-iframe-chassis device-${device}`;
  }

  if (sizeTag) {
    if (device === 'tablet') sizeTag.textContent = '768px TABLET';
    else if (device === 'mobile') sizeTag.textContent = '390px MOBILE';
    else sizeTag.textContent = '100% WIDE';
  }
}

function setEditorMode(mode) {
  activeEditorMode = mode;
  const previewBox = document.getElementById('editorPreviewBox');
  const codeBox = document.getElementById('editorCodeBox');
  const btnPrev = document.getElementById('btnModePreview');
  const btnCode = document.getElementById('btnModeCode');

  if (mode === 'code') {
    previewBox.classList.add('hidden');
    codeBox.classList.remove('hidden');
    btnCode.classList.add('active');
    btnPrev.classList.remove('active');

    if (currentProjectName) {
      loadProjectFileTree(currentProjectName);
    }
  } else {
    codeBox.classList.add('hidden');
    previewBox.classList.remove('hidden');
    btnPrev.classList.add('active');
    btnCode.classList.remove('active');
  }
}

async function loadProjectFileTree(projectName) {
  const treeList = document.getElementById('codeTreeList');
  if (!treeList) return;

  try {
    const res = await fetch(`/api/projects/${projectName}/files`);
    if (!res.ok) throw new Error('Files not found');
    const data = await res.json();

    treeList.innerHTML = '';
    if (!data.files || data.files.length === 0) {
      treeList.innerHTML = '<div style="font-size:12px; color:var(--apple-text-tertiary);">No source files</div>';
      return;
    }

    data.files.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'tree-file-item' + (idx === 0 ? ' active' : '');
      item.textContent = file;
      item.onclick = () => {
        document.querySelectorAll('.tree-file-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        loadFileContent(projectName, file);
      };
      treeList.appendChild(item);
    });

    if (data.files[0]) {
      loadFileContent(projectName, data.files[0]);
    }
  } catch (err) {
    treeList.innerHTML = `<div style="font-size:12px; color:var(--apple-red);">${err.message}</div>`;
  }
}

async function loadFileContent(projectName, filePath) {
  activeFilePath = filePath;
  const filenameLabel = document.getElementById('codeCurrentFilename');
  const codeDisplay = document.getElementById('codeText');

  if (filenameLabel) filenameLabel.textContent = filePath;
  if (codeDisplay) codeDisplay.textContent = 'Loading source code...';

  try {
    const res = await fetch(`/api/projects/${projectName}/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error('Could not read file');
    const data = await res.json();
    activeFileContent = data.content || '';
    if (codeDisplay) codeDisplay.textContent = activeFileContent;
  } catch (err) {
    if (codeDisplay) codeDisplay.textContent = `// Error loading file: ${err.message}`;
  }
}

function copyCurrentCode() {
  if (!activeFileContent) {
    showToast('No code content to copy', 'error');
    return;
  }
  navigator.clipboard.writeText(activeFileContent).then(() => {
    showToast('Code copied to clipboard!', 'success');
  });
}

function downloadSelectedProjectZip() {
  if (!currentProjectName) {
    showToast('Please select a project first', 'error');
    return;
  }
  const downloadUrl = `/api/projects/${currentProjectName}/download`;
  triggerBrowserDownload(downloadUrl, `${currentProjectName}.zip`);
  showToast(`Downloading ${currentProjectName}.zip...`, 'success');
}

function reloadEditorIframe() {
  const iframe = document.getElementById('editorMainIframe');
  if (iframe && currentPreviewUrl) {
    iframe.src = currentPreviewUrl + '?t=' + Date.now();
    showToast('Preview reloaded', 'info');
  }
}

function setStudioPrompt(prompt) {
  const input = document.getElementById('studioPromptInput');
  if (input) {
    input.value = prompt;
    input.focus();
  }
}

async function applyStudioModification() {
  const input = document.getElementById('studioPromptInput');
  const instruction = (input.value || '').trim();
  const btn = document.getElementById('studioApplyBtn');

  if (!instruction) {
    showToast('Please enter an instruction for the AI', 'error');
    return;
  }

  if (!currentProjectName) {
    showToast('Please select a project first', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Applying AI Edit...';

  const provider = document.getElementById('studioProviderSelect')?.value || 'gemini';
  const geminiKey = localStorage.getItem('sal_gemini_key') || '';
  const groqKey = localStorage.getItem('sal_groq_key') || '';

  if (socket && socket.connected) {
    socket.emit('modify_request', {
      projectName: currentProjectName,
      instruction,
      provider,
      apiKeys: { gemini: geminiKey, groq: groqKey }
    });
  } else {
    showToast('Connect to local server to apply AI code edits', 'error');
    btn.disabled = false;
    btn.textContent = 'Apply AI Edit';
  }
}

function handleServerModified(data) {
  const btn = document.getElementById('studioApplyBtn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Apply AI Edit';
  }

  showToast(`AI modification applied to ${data.filesChanged} file(s)!`, 'success');

  // Add to studio history list
  const historyList = document.getElementById('studioHistoryList');
  if (historyList) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<span style="color:var(--apple-green); font-weight:600;">✓</span> <span>"${data.instruction}"</span><div style="font-size:10px; color:var(--apple-text-tertiary); margin-top:2px;">Files: ${data.changedFiles.join(', ')}</div>`;
    historyList.prepend(item);
  }

  reloadEditorIframe();

  // If in code mode, reload file content
  if (activeEditorMode === 'code' && activeFilePath) {
    loadFileContent(currentProjectName, activeFilePath);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function appendLog(message, type = 'info') {
  const box = document.getElementById('terminalBox');
  if (!box) return;

  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function clearTerminal() {
  const box = document.getElementById('terminalBox');
  if (box) box.innerHTML = '';
}

function hideCards(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span style="color: ${type === 'success' ? '#30d158' : type === 'error' ? '#ff453a' : '#0071e3'}; font-weight: bold;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
