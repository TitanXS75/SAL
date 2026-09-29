/**
 * SAL Agent - Unified AI Client
 * Supports Google Gemini and Groq with seamless fallback and runtime API keys.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const path = require('path');
const fse = require('fs-extra');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Runtime API key storage (can be updated from Web UI without restarting)
const runtimeConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  preferredProvider: process.env.DEFAULT_AI_PROVIDER || (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_') ? 'groq' : 'gemini'),
  preferredGeminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  preferredGroqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
};

/**
 * Update runtime config from web request
 */
function setRuntimeConfig(newConfig = {}) {
  if (newConfig.geminiApiKey !== undefined) {
    runtimeConfig.geminiApiKey = newConfig.geminiApiKey.trim();
    process.env.GEMINI_API_KEY = runtimeConfig.geminiApiKey;
  }
  if (newConfig.groqApiKey !== undefined) {
    runtimeConfig.groqApiKey = newConfig.groqApiKey.trim();
    process.env.GROQ_API_KEY = runtimeConfig.groqApiKey;
  }
  if (newConfig.preferredProvider) {
    runtimeConfig.preferredProvider = newConfig.preferredProvider;
  }
  if (newConfig.preferredGeminiModel) {
    runtimeConfig.preferredGeminiModel = newConfig.preferredGeminiModel;
  }
  if (newConfig.preferredGroqModel) {
    runtimeConfig.preferredGroqModel = newConfig.preferredGroqModel;
  }
}

/**
 * Get current runtime config status (masked)
 */
function getRuntimeConfigStatus() {
  const mask = (k) => (!k || k === 'your_gemini_api_key_here' || k === 'your_groq_api_key_here')
    ? ''
    : (k.length > 8 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : '••••••••');

  const hasGemini = Boolean(runtimeConfig.geminiApiKey && runtimeConfig.geminiApiKey !== 'your_gemini_api_key_here');
  const hasGroq = Boolean(runtimeConfig.groqApiKey && runtimeConfig.groqApiKey !== 'your_groq_api_key_here');

  let preferred = runtimeConfig.preferredProvider;
  if (!hasGemini && hasGroq) preferred = 'groq';
  if (hasGemini && !hasGroq) preferred = 'gemini';

  return {
    hasGemini,
    hasGroq,
    geminiMasked: mask(runtimeConfig.geminiApiKey),
    groqMasked: mask(runtimeConfig.groqApiKey),
    preferredProvider: preferred,
    preferredGeminiModel: runtimeConfig.preferredGeminiModel,
    preferredGroqModel: runtimeConfig.preferredGroqModel,
  };
}

/**
 * Test an API key connectivity
 */
async function testApiKey(provider, apiKey) {
  const key = (apiKey || '').trim();
  if (!key) {
    return { success: false, error: 'API key is empty' };
  }

  if (provider === 'gemini') {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent('Ping. Respond with OK.');
      const text = result.response.text();
      return { success: true, message: `Connected to Gemini! Response: "${text.trim().substring(0, 30)}"` };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to authenticate with Gemini' };
    }
  } else if (provider === 'groq') {
    try {
      const groq = new Groq({ apiKey: key });

      const candidateModels = [
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b'
      ];

      let selectedModel = 'openai/gpt-oss-120b';
      try {
        const modelList = await groq.models.list();
        const ids = (modelList.data || []).map(m => m.id);
        const match = candidateModels.find(m => ids.includes(m));
        if (match) selectedModel = match;
      } catch {}

      const response = await groq.chat.completions.create({
        model: selectedModel,
        messages: [{ role: 'user', content: 'Ping. Respond with OK.' }],
        max_tokens: 10,
      });
      const text = response.choices?.[0]?.message?.content || '';
      return { success: true, message: `Connected to Groq (${selectedModel})! Response: "${text.trim().substring(0, 30)}"` };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to authenticate with Groq' };
    }
  } else {
    return { success: false, error: `Unknown provider: ${provider}` };
  }
}

/**
 * Get active key for a provider
 */
function getActiveKey(provider, overrideKey) {
  if (overrideKey && overrideKey.trim()) return overrideKey.trim();
  if (provider === 'gemini') {
    return runtimeConfig.geminiApiKey || process.env.GEMINI_API_KEY || '';
  }
  if (provider === 'groq') {
    return runtimeConfig.groqApiKey || process.env.GROQ_API_KEY || '';
  }
  return '';
}

/**
 * Unified generation method
 */
async function generateAIContent({
  provider,
  model,
  prompt,
  systemPrompt = '',
  imageBase64 = null,
  jsonMode = false,
  apiKeys = {},
  log = () => {}
}) {
  const geminiKey = getActiveKey('gemini', apiKeys.gemini);
  const groqKey = getActiveKey('groq', apiKeys.groq);

  const hasValidGemini = Boolean(geminiKey && geminiKey.trim() && geminiKey !== 'your_gemini_api_key_here');
  const hasValidGroq = Boolean(groqKey && groqKey.trim() && groqKey !== 'your_groq_api_key_here');

  let chosenProvider = provider || runtimeConfig.preferredProvider || 'groq';

  // Smart fallback if chosen provider is not configured
  if (chosenProvider === 'gemini' && !hasValidGemini) {
    if (hasValidGroq) {
      log('⚠️ Gemini API key not configured. Seamlessly routing to Groq engine...');
      chosenProvider = 'groq';
    } else {
      throw new Error(
        'Gemini API key is not configured. Please add your API key in the SAL UI Settings (or SAL/.env). Get a free key at https://aistudio.google.com/app/apikey'
      );
    }
  } else if (chosenProvider === 'groq' && !hasValidGroq) {
    if (hasValidGemini) {
      log('⚠️ Groq API key not configured. Seamlessly routing to Gemini engine...');
      chosenProvider = 'gemini';
    } else {
      throw new Error(
        'Groq API key is not configured. Please add your API key in the SAL UI Settings (or SAL/.env). Get a free key at https://console.groq.com/keys'
      );
    }
  }

  // ── Gemini Execution ──
  if (chosenProvider === 'gemini') {
    const chosenModel = model || runtimeConfig.preferredGeminiModel || 'gemini-1.5-flash';
    const genAI = new GoogleGenerativeAI(geminiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: chosenModel,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {})
    });

    const parts = [];
    if (prompt) parts.push(prompt);
    if (imageBase64) {
      parts.push({
        inlineData: {
          data: imageBase64,
          mimeType: 'image/png'
        }
      });
    }

    const result = await geminiModel.generateContent(parts);
    return result.response.text();
  }

  // ── Groq Execution ──
  if (chosenProvider === 'groq') {
    const groq = new Groq({ apiKey: groqKey });
    const groqCandidates = [
      model,
      runtimeConfig.preferredGroqModel,
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant'
    ].filter(Boolean);

    // Remove duplicates preserving order
    const uniqueCandidates = [...new Set(groqCandidates)];

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Pass text prompt cleanly
    messages.push({ role: 'user', content: prompt });

    let lastError = null;

    for (const testModel of uniqueCandidates) {
      const params = {
        model: testModel,
        messages,
        max_tokens: 4096,
        temperature: 0.2,
      };

      if (jsonMode) {
        params.response_format = { type: 'json_object' };
      }

      try {
        const response = await groq.chat.completions.create(params);
        return response.choices?.[0]?.message?.content || '';
      } catch (err) {
        lastError = err;
        const isNotFound = err.message?.includes('model_not_found') || err.status === 404;
        const isRateLimit = err.status === 413 || err.status === 429 || err.message?.includes('rate_limit') || err.message?.includes('tokens per minute') || err.message?.includes('TPM');
        if (isNotFound || isRateLimit) {
          log(`⚠️ Model "${testModel}" hit ${isRateLimit ? 'token limit' : 'unavailable'}. Trying alternative model...`);
          continue;
        }
        break;
      }
    }

    // If Groq models all failed and Gemini is available, attempt fallback
    if (hasValidGemini) {
      log(`⚠️ Groq request encountered error (${lastError?.message}). Retrying with Gemini...`);
      return generateAIContent({
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        prompt,
        systemPrompt,
        imageBase64,
        jsonMode,
        apiKeys,
        log
      });
    }

    throw lastError || new Error('Groq generation failed across all available models');
  }

  throw new Error(`Unsupported provider: ${chosenProvider}`);
}

module.exports = {
  setRuntimeConfig,
  getRuntimeConfigStatus,
  testApiKey,
  generateAIContent,
  getActiveKey,
};
