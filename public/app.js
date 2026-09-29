/* ============================================================
   SAL — Client-side Agent Controller & Studio
   Full Multi-Provider AI (Groq & Gemini) & Visual Editor
   ============================================================ */

const socket = io();

// ── State ──────────────────────────────────────────────────────────────────
let currentProjectName = null;
let currentPreviewUrl = null;
let currentProjectPath = null;
let activeTab = 'clone';
let activeDevice = 'desktop';
let activeEditorMode = 'preview';
let activeFileContent = '';
let activeFilePath = '';

let configState = {
  hasGemini: false,
  hasGroq: false,
  geminiMasked: '',
  groqMasked: '',
  preferredProvider: 'gemini',
  preferredGeminiModel: 'gemini-1.5-flash',
  preferredGroqModel: 'llama-3.1-8b-instant',
};

// ── Initialization ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLocalKeys();
  loadConfig();
  loadProjectsList();
});

// ── Tab Management ─────────────────────────────────────────────────────────
function switchTab(tabId) {
  activeTab = tabId;

  const btnClone = document.getElementById('tabBtnClone');
  const btnEditor = document.getElementById('tabBtnEditor');
  const contentClone = document.getElementById('tabContentClone');
  const contentEditor = document.getElementById('tabContentEditor');

  if (tabId === 'clone') {
    btnClone.classList.add('active');
    btnClone.setAttribute('aria-selected', 'true');
    btnEditor.classList.remove('active');
    btnEditor.setAttribute('aria-selected', 'false');

    contentClone.classList.remove('hidden');
    contentEditor.classList.add('hidden');
  } else {
    btnEditor.classList.add('active');
    btnEditor.setAttribute('aria-selected', 'true');
    btnClone.classList.remove('active');
    btnClone.setAttribute('aria-selected', 'false');

    contentEditor.classList.remove('hidden');
    contentClone.classList.add('hidden');

    // Remove notification dot
    document.getElementById('editorHasProjectDot').classList.add('hidden');

    // If current project exists, ensure it is selected
    if (currentProjectName) {
      const select = document.getElementById('editorProjectSelect');
      if (select.value !== currentProjectName) {
        select.value = currentProjectName;
        onSelectProject(currentProjectName);
      }
    } else {
      // Refresh list to pick the latest project
      loadProjectsList();
    }
  }
}

function openInEditorTab() {
  switchTab('editor');
  if (currentProjectName) {
    onSelectProject(currentProjectName);
  }
}

// ── API Keys & Config Management ───────────────────────────────────────────
function initLocalKeys() {
  // If stored in localStorage, sync
  const saved = localStorage.getItem('sal_keys');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.geminiKey) document.getElementById('geminiKeyInput').value = parsed.geminiKey;
      if (parsed.groqKey) document.getElementById('groqKeyInput').value = parsed.groqKey;
    } catch {}
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    configState = { ...configState, ...data };
    updateConfigUI();
  } catch (err) {
    console.warn('Failed to load server config:', err);
  }
}

function updateConfigUI() {
  const geminiIndicator = document.getElementById('geminiHeaderIndicator');
  const groqIndicator = document.getElementById('groqHeaderIndicator');
  const geminiBadge = document.getElementById('geminiStatusBadge');
  const groqBadge = document.getElementById('groqStatusBadge');
  const activeLabel = document.getElementById('activeProviderText');
  const missingBanner = document.getElementById('missingKeyBanner');

  // Header indicators
  if (configState.hasGemini) {
    geminiIndicator.classList.add('configured');
    geminiIndicator.title = 'Gemini: Configured ✓';
    geminiBadge.textContent = 'Configured ✓';
    geminiBadge.className = 'key-badge valid';
  } else {
    geminiIndicator.classList.remove('configured');
    geminiBadge.textContent = 'Not Configured';
    geminiBadge.className = 'key-badge';
  }

  if (configState.hasGroq) {
    groqIndicator.classList.add('configured');
    groqIndicator.title = 'Groq: Configured ✓';
    groqBadge.textContent = 'Configured ✓';
    groqBadge.className = 'key-badge valid';
  } else {
    groqIndicator.classList.remove('configured');
    groqBadge.textContent = 'Not Configured';
    groqBadge.className = 'key-badge';
  }

  // Active provider banner
  const p = configState.preferredProvider === 'groq' ? 'Groq (LPU Inference)' : 'Gemini 1.5 Flash';
  if (activeLabel) activeLabel.textContent = `AI Engine: ${p}`;

  // Studio dropdown sync
  const studioSelect = document.getElementById('studioProviderSelect');
  if (studioSelect && configState.preferredProvider) {
    studioSelect.value = configState.preferredProvider;
  }

  // Missing banner (if present)
  if (missingBanner) {
    if (!configState.hasGemini && !configState.hasGroq) {
      missingBanner.classList.remove('hidden');
    } else {
      missingBanner.classList.add('hidden');
    }
  }

  // Radios in modal
  if (configState.preferredProvider === 'groq') {
    document.getElementById('providerGroqRadio').checked = true;
  } else {
    document.getElementById('providerGeminiRadio').checked = true;
  }
  updateProviderCardStyles();

  if (configState.preferredGeminiModel) {
    document.getElementById('geminiModelSelect').value = configState.preferredGeminiModel;
  }
  if (configState.preferredGroqModel) {
    document.getElementById('groqModelSelect').value = configState.preferredGroqModel;
  }
}

function openKeysModal() {
  document.getElementById('apiKeysModal').classList.remove('hidden');
  // If inputs are empty and server has masked keys, keep placeholders
  if (!document.getElementById('geminiKeyInput').value && configState.geminiMasked) {
    document.getElementById('geminiKeyInput').placeholder = `Configured (${configState.geminiMasked})`;
  }
  if (!document.getElementById('groqKeyInput').value && configState.groqMasked) {
    document.getElementById('groqKeyInput').placeholder = `Configured (${configState.groqMasked})`;
  }
}

function closeKeysModal() {
  document.getElementById('apiKeysModal').classList.add('hidden');
  clearKeyFeedbacks();
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'apiKeysModal') {
    closeKeysModal();
  }
}

function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updateProviderCardStyles() {
  const isGroq = document.getElementById('providerGroqRadio').checked;
  const cardGemini = document.getElementById('radioCardGemini');
  const cardGroq = document.getElementById('radioCardGroq');

  if (isGroq) {
    cardGroq.classList.add('selected');
    cardGemini.classList.remove('selected');
  } else {
    cardGemini.classList.add('selected');
    cardGroq.classList.remove('selected');
  }
}

async function testKey(provider) {
  const input = provider === 'gemini' ? document.getElementById('geminiKeyInput') : document.getElementById('groqKeyInput');
  const feedback = provider === 'gemini' ? document.getElementById('geminiFeedback') : document.getElementById('groqFeedback');
  const btn = provider === 'gemini' ? document.getElementById('testGeminiBtn') : document.getElementById('testGroqBtn');

  const apiKey = input.value.trim();
  if (!apiKey && !(provider === 'gemini' ? configState.hasGemini : configState.hasGroq)) {
    feedback.className = 'key-feedback error';
    feedback.textContent = 'Please enter an API key first.';
    return;
  }

  feedback.className = 'key-feedback loading';
  feedback.textContent = `Connecting to ${provider === 'gemini' ? 'Gemini' : 'Groq'}...`;
  btn.disabled = true;

  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey })
    });
    const data = await res.json();

    if (data.success) {
      feedback.className = 'key-feedback success';
      feedback.textContent = `✓ ${data.message || 'Connected successfully!'}`;
      showToast(`${provider.toUpperCase()} key is valid!`, 'success');
    } else {
      feedback.className = 'key-feedback error';
      feedback.textContent = `✕ Error: ${data.error || 'Connection failed'}`;
      showToast(`Test failed: ${data.error || 'Connection failed'}`, 'error');
    }
  } catch (err) {
    feedback.className = 'key-feedback error';
    feedback.textContent = `✕ Network error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function saveApiKeys() {
  const geminiApiKey = document.getElementById('geminiKeyInput').value.trim();
  const groqApiKey = document.getElementById('groqKeyInput').value.trim();
  const preferredProvider = document.querySelector('input[name="defaultProvider"]:checked').value;
  const preferredGeminiModel = document.getElementById('geminiModelSelect').value;
  const preferredGroqModel = document.getElementById('groqModelSelect').value;

  const btn = document.getElementById('saveKeysBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey,
        groqApiKey,
        preferredProvider,
        preferredGeminiModel,
        preferredGroqModel,
      })
    });
    const data = await res.json();

    if (data.success) {
      configState = { ...configState, ...data.config };
      updateConfigUI();

      // Store locally so it restores on reload
      localStorage.setItem('sal_keys', JSON.stringify({
        geminiKey: geminiApiKey || '',
        groqKey: groqApiKey || '',
      }));

      showToast('API Keys & settings saved successfully!', 'success');
      closeKeysModal();
    } else {
      showToast('Failed to save settings', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Save & Apply Keys';
  }
}

function clearKeyFeedbacks() {
  document.getElementById('geminiFeedback').textContent = '';
  document.getElementById('geminiFeedback').className = 'key-feedback';
  document.getElementById('groqFeedback').textContent = '';
  document.getElementById('groqFeedback').className = 'key-feedback';
}

function getActiveApiKeys() {
  const gemini = document.getElementById('geminiKeyInput').value.trim();
  const groq = document.getElementById('groqKeyInput').value.trim();
  return { gemini, groq };
}

// ── Socket Event Handlers ──────────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[Socket] Connected to SAL server:', socket.id);
  enableCloneBtn();
});

socket.on('disconnect', () => {
  console.warn('[Socket] Disconnected from SAL server');
  enableCloneBtn();
  enableModifyBtn();
  enableStudioModifyBtn();
});

socket.on('agent_log', ({ message, type, timestamp }) => {
  appendLog(message, type, timestamp);
});

socket.on('agent_status', ({ stage, projectName }) => {
  if (projectName) {
    currentProjectName = projectName;
    document.getElementById('editorHasProjectDot').classList.remove('hidden');
  }
  updateStage(stage);

  // Update pipeline header live badge
  const liveBadge = document.getElementById('pipelineLiveBadge');
  const liveText = document.getElementById('pipelineLiveText');
  if (liveBadge && liveText) {
    liveBadge.className = 'pipeline-live-indicator active';
    liveText.textContent = stage.toUpperCase();
  }
});

socket.on('agent_analysis', ({ analysis }) => {
  showAnalysis(analysis);
});

socket.on('agent_complete', ({ projectName, outputDir, previewUrl, previewPort, elapsed }) => {
  currentPreviewUrl = previewUrl;
  currentProjectPath = outputDir;
  currentProjectName = projectName;

  // Update pipeline header live badge to done
  const liveBadge = document.getElementById('pipelineLiveBadge');
  const liveText = document.getElementById('pipelineLiveText');
  if (liveBadge && liveText) {
    liveBadge.className = 'pipeline-live-indicator done';
    liveText.textContent = 'COMPLETE';
  }

  showSuccessCard(previewUrl, outputDir, elapsed);
  enableModifyPanel();
  enableCloneBtn();

  // Play audio chime and trigger notifications
  playSuccessChime();
  sendDesktopNotification('SAL Website Cloner', `Website cloned successfully in ${elapsed}s! Click to view in AI Studio.`);
  showToast(`🎉 Reconstruction complete in ${elapsed}s! Next.js project is ready.`, 'success');

  // Load project in editor dropdown and frame
  loadProjectsList(projectName);
  setIframeUrl(previewUrl);
  updateEditorServerStatus(true, previewPort || 3001);
});

socket.on('agent_modified', ({ projectName, filesChanged, changedFiles, instruction }) => {
  appendLog(`✅ Modified ${filesChanged} file(s): ${changedFiles.join(', ')}`, 'success');
  enableModifyBtn();
  enableStudioModifyBtn();
  showToast(`Applied: "${instruction}" → ${changedFiles.join(', ')}`, 'success');

  // Add to studio history
  addStudioHistoryItem(instruction, changedFiles, true);

  // Reload iframe preview automatically so the user sees the live update!
  reloadPreviewIframe();

  // If in code mode, reload current file
  if (activeEditorMode === 'code' && activeFilePath) {
    loadFileContent(currentProjectName, activeFilePath);
  }
});

socket.on('agent_error', ({ message, stage }) => {
  appendLog(`❌ Error${stage ? ` [${stage}]` : ''}: ${message}`, 'error');
  markStageFailed(stage);
  enableCloneBtn();
  enableModifyBtn();
  enableStudioModifyBtn();
  showToast(`Error: ${message}`, 'error');

  const liveBadge = document.getElementById('pipelineLiveBadge');
  const liveText = document.getElementById('pipelineLiveText');
  if (liveBadge && liveText) {
    liveBadge.className = 'pipeline-live-indicator error';
    liveText.textContent = 'FAILED';
  }

  if (stage === 'modify') {
    addStudioHistoryItem('Modification failed', [message], false);
  }
});

function clearTerminal() {
  clearLog();
}

// ── Engine Mode Selection ───────────────────────────────────────────────
let selectedEngineMode = 'simple';

function selectEngineMode(mode) {
  selectedEngineMode = mode;
  const pillSimple = document.getElementById('pillSimple');
  const pillCrawl = document.getElementById('pillCrawl');
  if (pillSimple && pillCrawl) {
    if (mode === 'crawl') {
      pillCrawl.classList.add('active');
      pillSimple.classList.remove('active');
    } else {
      pillSimple.classList.add('active');
      pillCrawl.classList.remove('active');
    }
  }
}

// ── Clone Flow ─────────────────────────────────────────────────────────────
function startClone() {
  try {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) {
      showToast('Please enter a website URL', 'error');
      return;
    }

    // Validate URL structure
    try {
      new URL(url.startsWith('http') ? url : 'https://' + url);
    } catch {
      showToast('Please enter a valid URL (e.g. https://tailwindcss.com)', 'error');
      return;
    }

    // Request browser desktop notification permission on user action
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Reset UI
    resetPipeline();
    clearLog();
    showProgressCard();
    hideCards(['successCard', 'analysisCard', 'modifyCard']);
    disableCloneBtn();
    currentProjectName = null;

    const liveBadge = document.getElementById('pipelineLiveBadge');
    const liveText = document.getElementById('pipelineLiveText');
    if (liveBadge && liveText) {
      liveBadge.className = 'pipeline-live-indicator active';
      liveText.textContent = 'INITIALIZING...';
    }

    const provider = configState.preferredProvider || 'groq';
    const downloadFonts = Boolean(document.getElementById('fontDownloadToggle')?.checked);
    const mode = selectedEngineMode || 'simple';
    const modeName = mode === 'crawl' ? 'Site Crawler' : 'Simple Cloner';

    appendLog(`🚀 Starting ${modeName} for: ${url} using ${provider.toUpperCase()}`, 'info');

    socket.emit('clone_request', {
      url,
      sessionId: getSessionId(),
      provider,
      model: provider === 'groq' ? configState.preferredGroqModel : configState.preferredGeminiModel,
      apiKeys: getActiveApiKeys(),
      mode,
      downloadFonts
    });
  } catch (err) {
    console.error('startClone error:', err);
    enableCloneBtn();
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ── Modification Flow (Tab 1 Inline) ───────────────────────────────────────
function applyModification() {
  const instruction = document.getElementById('modifyInput').value.trim();
  if (!instruction) {
    showToast('Please describe the modification', 'error');
    return;
  }
  if (!currentProjectName) {
    showToast('No project loaded. Clone a website first.', 'error');
    return;
  }

  disableModifyBtn();
  const provider = configState.preferredProvider || 'gemini';
  appendLog(`✏️ Applying: "${instruction}" with ${provider.toUpperCase()}`, 'modify');

  socket.emit('modify_request', {
    projectName: currentProjectName,
    instruction,
    sessionId: getSessionId(),
    provider,
    model: provider === 'groq' ? configState.preferredGroqModel : configState.preferredGeminiModel,
    apiKeys: getActiveApiKeys()
  });

  document.getElementById('modifyInput').value = '';
}

// ── Modification Studio (Tab 2 Dedicated) ──────────────────────────────────
function setStudioPrompt(text) {
  const input = document.getElementById('studioPromptInput');
  input.value = text;
  input.focus();
}

function applyStudioModification() {
  const instruction = document.getElementById('studioPromptInput').value.trim();
  if (!instruction) {
    showToast('Please enter a prompt instruction', 'error');
    return;
  }

  const select = document.getElementById('editorProjectSelect');
  const project = select.value || currentProjectName;
  if (!project) {
    showToast('Please select a cloned project first.', 'error');
    return;
  }

  const provider = document.getElementById('studioProviderSelect').value;
  disableStudioModifyBtn();

  addStudioHistoryItem(instruction, ['Thinking...'], 'pending');

  socket.emit('modify_request', {
    projectName: project,
    instruction,
    sessionId: getSessionId(),
    provider,
    model: provider === 'groq' ? configState.preferredGroqModel : configState.preferredGeminiModel,
    apiKeys: getActiveApiKeys()
  });

  document.getElementById('studioPromptInput').value = '';
}

function addStudioHistoryItem(prompt, files, status) {
  const box = document.getElementById('studioHistoryBox');
  const placeholder = box.querySelector('.history-placeholder');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = 'history-item';

  let tagClass = 'edit';
  let tagText = 'EDIT';
  if (status === true) {
    tagClass = 'success';
    tagText = 'UPDATED';
  } else if (status === false) {
    tagClass = 'error';
    tagText = 'FAILED';
  } else if (status === 'pending') {
    tagClass = 'edit';
    tagText = 'PROCESSING...';
  }

  item.innerHTML = `
    <span class="tag ${tagClass}">${tagText}</span>
    <strong>"${escapeHtml(prompt)}"</strong> — <span style="opacity:0.8">${escapeHtml(files.join(', '))}</span>
  `;

  box.prepend(item);
}

// ── Project Management & Live Preview ──────────────────────────────────────
async function loadProjectsList(selectedName) {
  try {
    const res = await fetch('/api/projects');
    const projects = await res.json();
    const select = document.getElementById('editorProjectSelect');
    select.innerHTML = '';

    if (projects.length === 0) {
      select.innerHTML = '<option value="">(No cloned projects yet)</option>';
      showEmptyPreviewState(true);
      return;
    }

    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.name} ${p.isRunning ? '🟢 (live)' : ''}`;
      select.appendChild(opt);
    });

    const targetProject = selectedName || currentProjectName || projects[0]?.name;
    if (targetProject) {
      select.value = targetProject;
      onSelectProject(targetProject);
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

async function onSelectProject(projectName) {
  if (!projectName) {
    showEmptyPreviewState(true);
    return;
  }

  currentProjectName = projectName;
  showEmptyPreviewState(false);

  // Check or start preview server
  updateEditorServerStatus('loading');
  try {
    const res = await fetch(`/api/projects/${projectName}/start-preview`, { method: 'POST' });
    const data = await res.json();

    if (data.success && data.previewUrl) {
      currentPreviewUrl = data.previewUrl;
      setIframeUrl(data.previewUrl);
      updateEditorServerStatus(true, data.port);
    } else {
      updateEditorServerStatus(false);
    }
  } catch (err) {
    console.warn('Could not launch preview server:', err);
    updateEditorServerStatus(false);
  }

  // If in code mode, load file list
  if (activeEditorMode === 'code') {
    loadProjectFiles(projectName);
  }
}

function setIframeUrl(url) {
  const iframe = document.getElementById('previewIframe');
  const addressText = document.getElementById('browserAddressText');
  const externalLink = document.getElementById('editorExternalLink');

  if (iframe) iframe.src = url;
  if (addressText) addressText.textContent = url;
  if (externalLink) externalLink.href = url;
}

function reloadPreviewIframe() {
  const iframe = document.getElementById('previewIframe');
  if (iframe && iframe.src && iframe.src !== 'about:blank') {
    try {
      const u = new URL(iframe.src);
      u.searchParams.set('_t', Date.now());
      iframe.src = u.toString();
    } catch {
      iframe.src = iframe.src;
    }
    showToast('Reloading preview with updates...', 'info');
  }
}

function showEmptyPreviewState(show) {
  const empty = document.getElementById('previewEmptyState');
  if (empty) {
    empty.style.display = show ? 'flex' : 'none';
  }
}

function updateEditorServerStatus(isRunning, port) {
  const pill = document.getElementById('editorServerPill');
  const text = document.getElementById('editorServerStatusText');
  const dot = document.getElementById('editorServerDot');

  if (isRunning === 'loading') {
    dot.className = 'status-circle status-yellow';
    text.textContent = 'Launching dev server...';
  } else if (isRunning) {
    dot.className = 'status-circle status-green';
    text.textContent = `Preview Live: :${port}`;
  } else {
    dot.className = 'status-circle status-red';
    text.textContent = 'Server Offline';
  }
}

// ── Responsive Viewport Switcher ───────────────────────────────────────────
function setDeviceView(device) {
  activeDevice = device;
  const chassis = document.getElementById('deviceChassis');
  const tag = document.getElementById('viewportSizeTag');

  ['btnDeviceDesktop', 'btnDeviceTablet', 'btnDeviceMobile'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });

  chassis.className = `iframe-device-chassis device-${device}`;

  if (device === 'desktop') {
    document.getElementById('btnDeviceDesktop').classList.add('active');
    tag.textContent = 'Desktop (100%)';
  } else if (device === 'tablet') {
    document.getElementById('btnDeviceTablet').classList.add('active');
    tag.textContent = 'Tablet (768px)';
  } else if (device === 'mobile') {
    document.getElementById('btnDeviceMobile').classList.add('active');
    tag.textContent = 'Mobile (375px)';
  }
}

// ── Source Code Explorer ───────────────────────────────────────────────────
function setEditorMode(mode) {
  activeEditorMode = mode;
  const btnPrev = document.getElementById('btnModePreview');
  const btnCode = document.getElementById('btnModeCode');
  const previewWrap = document.getElementById('previewContainer');
  const codeWrap = document.getElementById('codeContainer');

  if (mode === 'preview') {
    btnPrev.classList.add('active');
    btnCode.classList.remove('active');
    previewWrap.classList.remove('hidden');
    codeWrap.classList.add('hidden');
  } else {
    btnCode.classList.add('active');
    btnPrev.classList.remove('active');
    codeWrap.classList.remove('hidden');
    previewWrap.classList.add('hidden');

    if (currentProjectName) {
      loadProjectFiles(currentProjectName);
    }
  }
}

async function loadProjectFiles(projectName) {
  const treeList = document.getElementById('codeFileList');
  treeList.innerHTML = '<div class="tree-loading">Loading project files...</div>';

  try {
    const res = await fetch(`/api/projects/${projectName}/files`);
    const data = await res.json();
    treeList.innerHTML = '';

    if (!data.files || data.files.length === 0) {
      treeList.innerHTML = '<div class="tree-loading">No files found</div>';
      return;
    }

    // Sort files to put index.html and HTML files on top
    const sorted = [...data.files].sort((a, b) => {
      const isIndexA = a.toLowerCase().endsWith('index.html');
      const isIndexB = b.toLowerCase().endsWith('index.html');
      if (isIndexA && !isIndexB) return -1;
      if (!isIndexA && isIndexB) return 1;
      const isHtmlA = a.endsWith('.html') || a.endsWith('.htm');
      const isHtmlB = b.endsWith('.html') || b.endsWith('.htm');
      if (isHtmlA && !isHtmlB) return -1;
      if (!isHtmlA && isHtmlB) return 1;
      return a.localeCompare(b);
    });

    sorted.forEach((f, idx) => {
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.textContent = f;
      item.onclick = () => {
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        loadFileContent(projectName, f);
      };
      treeList.appendChild(item);

      // Auto select first file
      if (idx === 0) {
        item.classList.add('active');
        loadFileContent(projectName, f);
      }
    });
  } catch (err) {
    treeList.innerHTML = `<div class="tree-loading error">Failed: ${err.message}</div>`;
  }
}

async function loadFileContent(projectName, filePath) {
  activeFilePath = filePath;
  const fileNameEl = document.getElementById('activeFileName');
  const codeContentEl = document.getElementById('codeViewerContent');

  fileNameEl.textContent = filePath;
  codeContentEl.textContent = 'Loading content...';

  try {
    const res = await fetch(`/api/projects/${projectName}/file?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    activeFileContent = data.content || '';
    codeContentEl.textContent = activeFileContent;
  } catch (err) {
    codeContentEl.textContent = `Error loading file: ${err.message}`;
  }
}

function copyCurrentCode() {
  if (activeFileContent) {
    navigator.clipboard.writeText(activeFileContent).then(() => {
      showToast('File content copied to clipboard!', 'success');
    });
  }
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function setUrl(url) {
  document.getElementById('urlInput').value = url;
  document.getElementById('urlInput').focus();
}

function setModify(text) {
  document.getElementById('modifyInput').value = text;
  document.getElementById('modifyInput').focus();
}

function clearLog() {
  const box = document.getElementById('logBox');
  if (box) box.innerHTML = '';
}

function copyPath() {
  if (currentProjectPath) {
    navigator.clipboard.writeText(currentProjectPath).then(() => {
      showToast('Project path copied to clipboard!');
    });
  }
}

// ── Stage Management ───────────────────────────────────────────────────────
const STAGES = ['scraping', 'analyzing', 'generating', 'validating', 'preview'];

function resetPipeline() {
  STAGES.forEach(s => {
    const el = document.getElementById(`stage-${s}`);
    if (el) el.className = 'stage';
  });
}

function updateStage(currentStage) {
  STAGES.forEach((s) => {
    const el = document.getElementById(`stage-${s}`);
    if (!el) return;

    const currentIdx = STAGES.indexOf(currentStage);
    const stageIdx = STAGES.indexOf(s);

    if (s === currentStage) {
      el.className = 'stage active';
    } else if (stageIdx < currentIdx) {
      el.className = 'stage done';
    }
  });
}

function markStageFailed(stage) {
  if (!stage) return;
  const el = document.getElementById(`stage-${stage}`);
  if (el) el.className = 'stage error';
}

// ── Card Visibility ────────────────────────────────────────────────────────
function showProgressCard() {
  const el = document.getElementById('progressCard');
  if (el) el.classList.remove('hidden');
}

function showAnalysis(analysis) {
  const card = document.getElementById('analysisCard');
  const grid = document.getElementById('analysisGrid');

  grid.innerHTML = '';

  addAnalysisItem(grid, 'SITE NAME', analysis.siteName);

  // Color palette
  const colorDiv = document.createElement('div');
  colorDiv.className = 'analysis-item';
  colorDiv.innerHTML = `
    <div class="analysis-item-label">COLOR PALETTE</div>
    <div class="color-swatches">
      ${(analysis.colorPalette || []).map(c => `<div class="swatch" style="background:${c}" title="${c}" onclick="copyToClipboard('${c}')"></div>`).join('')}
    </div>
  `;
  grid.appendChild(colorDiv);

  addAnalysisItem(grid, 'FONTS', `${analysis.fonts?.heading || 'Inter'} / ${analysis.fonts?.body || 'Inter'}`);

  // Sections
  const sectDiv = document.createElement('div');
  sectDiv.className = 'analysis-item';
  sectDiv.style.gridColumn = '1 / -1';
  sectDiv.innerHTML = `
    <div class="analysis-item-label">DETECTED SECTIONS (${(analysis.sections || []).length})</div>
    <div class="sections-list">
      ${(analysis.sections || []).map(s => `<span class="section-tag">${escapeHtml(s.name)}</span>`).join('')}
    </div>
  `;
  grid.appendChild(sectDiv);

  addAnalysisItem(grid, 'DARK MODE', analysis.isDarkMode ? '🌙 Yes' : '☀️ Light');
  addAnalysisItem(grid, 'LAYOUT', (analysis.layout || 'Standard responsive layout').substring(0, 80));

  card.classList.remove('hidden');
}

function addAnalysisItem(grid, label, value) {
  const div = document.createElement('div');
  div.className = 'analysis-item';
  div.innerHTML = `
    <div class="analysis-item-label">${label}</div>
    <div class="analysis-item-value">${escapeHtml(value)}</div>
  `;
  grid.appendChild(div);
}

function showSuccessCard(previewUrl, outputDir, elapsed) {
  const card = document.getElementById('successCard');
  document.getElementById('previewLink').href = previewUrl;
  document.getElementById('successSub').textContent =
    `Generated Next.js project in ${elapsed}s · Live Preview: ${previewUrl}`;
  card.classList.remove('hidden');

  STAGES.forEach(s => {
    const el = document.getElementById(`stage-${s}`);
    if (el) el.className = 'stage done';
  });
}

function enableModifyPanel() {
  document.getElementById('modifyCard').classList.remove('hidden');
}

function hideCards(ids) {
  ids.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

// ── Button State Controls ──────────────────────────────────────────────────
function disableCloneBtn() {
  const btn = document.getElementById('cloneBtn');
  if (!btn) return;
  btn.disabled = true;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'CLONING...';
}
function enableCloneBtn() {
  const btn = document.getElementById('cloneBtn');
  if (!btn) return;
  btn.disabled = false;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'CLONE WEBSITE';
}
function disableModifyBtn() {
  const btn = document.getElementById('modifyBtn');
  if (!btn) return;
  btn.disabled = true;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'APPLYING...';
}
function enableModifyBtn() {
  const btn = document.getElementById('modifyBtn');
  if (!btn) return;
  btn.disabled = false;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'APPLY';
}
function disableStudioModifyBtn() {
  const btn = document.getElementById('studioApplyBtn');
  if (!btn) return;
  btn.disabled = true;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'APPLYING EDIT...';
}
function enableStudioModifyBtn() {
  const btn = document.getElementById('studioApplyBtn');
  if (!btn) return;
  btn.disabled = false;
  const span = btn.querySelector('span');
  if (span) span.textContent = 'APPLY AI EDIT';
}

// ── Log Display ────────────────────────────────────────────────────────────
function appendLog(message, type = 'info', timestamp) {
  const box = document.getElementById('logBox');
  if (!box) return;
  const entry = document.createElement('span');
  entry.className = `log-entry ${type}`;

  const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="ts">${ts}</span>${escapeHtml(message)}`;

  box.appendChild(entry);
  if (box.children.length > 300) {
    box.removeChild(box.firstChild);
  }
  box.scrollTop = box.scrollHeight;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function getSessionId() {
  if (!localStorage.salSessionId) {
    localStorage.salSessionId = 'sal-' + Math.random().toString(36).substring(2, 12);
  }
  return localStorage.salSessionId;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast(`Copied: ${text}`));
}

let toastTimeout;
function showToast(message, type = 'info') {
  let toast = document.getElementById('sal-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sal-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      padding: 12px 18px; border-radius: 2px; font-size: 12px; font-weight: 600;
      font-family: 'JetBrains Mono', monospace; letter-spacing: 0.5px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15); max-width: 380px; line-height: 1.4;
      transition: opacity 0.2s, transform 0.2s;
    `;
    document.body.appendChild(toast);
  }

  const colors = {
    info: 'background: #111317; color: #FFFFFF; border-left: 4px solid #0047FF; border: 1px solid #282C35; border-left-width: 4px; border-left-color: #0047FF;',
    error: 'background: #111317; color: #FFFFFF; border: 1px solid #282C35; border-left: 4px solid #D92D20;',
    success: 'background: #111317; color: #FFFFFF; border: 1px solid #282C35; border-left: 4px solid #0C824B;',
  };

  toast.style.cssText += colors[type] || colors.info;
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
  }, 4500);
}

// ── Notification Helpers ───────────────────────────────────────────────────
function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Gentle melodic 3-tone arpeggio: C5 -> E5 -> G5
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.12);
    osc.frequency.setValueAtTime(783.99, now + 0.24);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.55);
  } catch (e) {
    // AudioContext blocked by browser policy, ignore
  }
}

function sendDesktopNotification(title, body) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico'
      });
    } catch (e) {
      // Ignored
    }
  }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeKeysModal();
  }
  if (e.key === 'Enter' && document.activeElement === document.getElementById('urlInput')) {
    startClone();
  }
  if (e.key === 'Enter' && document.activeElement === document.getElementById('modifyInput')) {
    applyModification();
  }
  if (e.key === 'Enter' && document.activeElement === document.getElementById('studioPromptInput')) {
    applyStudioModification();
  }
});
