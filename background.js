// Default state schema
const DEFAULT_STATE = {
  status: 'idle', // 'idle' | 'processing' | 'completed' | 'error'
  progress: {
    current: 0,
    total: 0,
    okCount: 0,
    failCount: 0
  },
  results: [],
  errorMsg: '',
  activeTabId: null,
  startedAt: null
};

const STALE_PROCESSING_MS = 15 * 60 * 1000;

const DEFAULT_COLLECT_STATE = {
  status: 'idle',
  progress: {
    current: 0,
    total: 0,
    collectedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    duplicateCount: 0
  },
  currentTargetId: '',
  errorMsg: '',
  startedAt: null
};

let fallbackCollectedAccounts = [];

// Retrieve state from storage
async function getStoredState() {
  const data = await chrome.storage.local.get('joinState');
  const state = data.joinState || DEFAULT_STATE;

  if (isStaleProcessingState(state)) {
    const idleState = { ...DEFAULT_STATE };
    await setStoredState(idleState);
    return idleState;
  }

  return state;
}

function isStaleProcessingState(state) {
  if (!state || state.status !== 'processing') return false;
  if (!state.startedAt) return true;

  const startedAt = Date.parse(state.startedAt);
  if (Number.isNaN(startedAt)) return true;

  return Date.now() - startedAt > STALE_PROCESSING_MS;
}

// Persist state to storage
async function setStoredState(state) {
  await chrome.storage.local.set({ joinState: state });
}

async function getCollectState() {
  const data = await chrome.storage.local.get('collectState');
  return data.collectState || { ...DEFAULT_COLLECT_STATE, progress: { ...DEFAULT_COLLECT_STATE.progress } };
}

async function setCollectState(state) {
  await chrome.storage.local.set({ collectState: state });
}

async function resetCollectState() {
  await setCollectState({ ...DEFAULT_COLLECT_STATE, progress: { ...DEFAULT_COLLECT_STATE.progress } });
}

async function getCollectedAccounts() {
  if (chrome.storage && chrome.storage.session) {
    const data = await chrome.storage.session.get('collectedAuthAccounts');
    return data.collectedAuthAccounts || [];
  }
  return fallbackCollectedAccounts;
}

async function setCollectedAccounts(accounts) {
  if (chrome.storage && chrome.storage.session) {
    await chrome.storage.session.set({ collectedAuthAccounts: accounts });
    return;
  }
  fallbackCollectedAccounts = accounts;
}

async function clearCollectedAccounts() {
  if (chrome.storage && chrome.storage.session) {
    await chrome.storage.session.remove('collectedAuthAccounts');
  }
  fallbackCollectedAccounts = [];
}

async function addCollectedAccountWithDedupe(account) {
  const accounts = await getCollectedAccounts();
  const accountId = account && account.providerSpecificData && account.providerSpecificData.chatgptAccountId;

  if (!accountId) {
    return { status: 'failed', accounts };
  }

  const exists = accounts.some((item) => item.providerSpecificData && item.providerSpecificData.chatgptAccountId === accountId);
  if (exists) {
    return { status: 'duplicate', accounts };
  }

  const nextAccounts = [...accounts, account];
  await setCollectedAccounts(nextAccounts);
  return { status: 'collected', accounts: nextAccounts };
}

// Tab closure listener to abort gracefully if user closes the ChatGPT tab
async function onTabRemovedListener(tabId, removeInfo) {
  const state = await getStoredState();
  if (state.activeTabId && tabId === state.activeTabId && state.status === 'processing') {
    state.status = 'error';
    state.errorMsg = 'Halaman ChatGPT ditutup sebelum semua proses selesai.';
    await setStoredState(state);
    showNotification(state);
    cleanupTabListener();
  }
}

function setupTabListener() {
  chrome.tabs.onRemoved.addListener(onTabRemovedListener);
}

function cleanupTabListener() {
  chrome.tabs.onRemoved.removeListener(onTabRemovedListener);
}

// Show desktop notifications
function showNotification(state) {
  let title = 'Workspace Join Selesai';
  let message = '';

  if (state.status === 'completed') {
    title = '✓ Workspace Join Selesai!';
    message = `Berhasil: ${state.progress.okCount}, Gagal: ${state.progress.failCount} dari ${state.progress.total} workspace.`;
  } else if (state.status === 'error') {
    title = '✗ Proses Join Terhenti';
    message = state.errorMsg || 'Terjadi kesalahan saat memproses workspace.';
  } else {
    return;
  }

  chrome.notifications.create('join-notification', {
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 2
  });
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_STATUS') {
    getStoredState().then(state => {
      sendResponse(state);
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'EXPORT_AUTH_SESSION') {
    exportAuthSession(sendResponse);
    return true;
  }

  if (message.action === 'CLEAR_CHATGPT_SITE_DATA') {
    clearChatGPTSiteData(sendResponse);
    return true;
  }

  if (message.action === 'GET_COLLECT_MULTI_STATUS') {
    getCollectStatus(sendResponse);
    return true;
  }

  if (message.action === 'COLLECT_CURRENT_AUTH_SESSION') {
    collectCurrentAuthSession(sendResponse);
    return true;
  }

  if (message.action === 'START_COLLECT_MULTI_AUTH') {
    startCollectMultiAuth(message.targets || [], sendResponse);
    return true;
  }

  if (message.action === 'DOWNLOAD_COLLECT_MULTI_AUTH') {
    downloadCollectMultiAuth(sendResponse);
    return true;
  }

  if (message.action === 'CLEAR_COLLECT_MULTI_AUTH') {
    clearCollectMultiAuth(sendResponse);
    return true;
  }

  if (message.action === 'START_JOIN') {
    getStoredState().then(async (state) => {
      if (state.status === 'processing') {
        sendResponse({ success: false, error: 'Proses join sedang berjalan di latar belakang.' });
        return;
      }

      const { workspaceIds } = message;
      if (!workspaceIds || workspaceIds.length === 0) {
        sendResponse({ success: false, error: 'Daftar workspace kosong.' });
        return;
      }

      await startProcessing(workspaceIds, sendResponse);
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'JOIN_PROGRESS') {
    getStoredState().then(async (state) => {
      if (state.status !== 'processing') return;

      const { result, index, total } = message;
      state.progress.current = index;
      state.progress.total = total;
      if (result.ok) {
        state.progress.okCount++;
      } else {
        state.progress.failCount++;
      }
      state.results.push(result);

      await setStoredState(state);
    });
    return true;
  }

  if (message.action === 'JOIN_COMPLETED') {
    getStoredState().then(async (state) => {
      if (state.status !== 'processing') return;

      state.status = 'completed';
      await setStoredState(state);
      showNotification(state);
      cleanupTabListener();
    });
    return true;
  }

  if (message.action === 'JOIN_ERROR') {
    getStoredState().then(async (state) => {
      if (state.status !== 'processing') return;

      state.status = 'error';
      state.errorMsg = message.error;
      await setStoredState(state);
      showNotification(state);
      cleanupTabListener();
    });
    return true;
  }
});

async function getCollectStatus(sendResponse) {
  try {
    const state = await getCollectState();
    const accounts = await getCollectedAccounts();
    sendResponse({ success: true, state, accountCount: accounts.length });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function collectCurrentAuthSession(sendResponse) {
  try {
    const sessionData = await fetchSessionFromActiveChatGPTTab();
    validateSessionForExport(sessionData);

    const authJson = buildAuthJson(sessionData);
    const account = buildConvertAuthAccount(authJson, sessionData);
    const result = await addCollectedAccountWithDedupe(account);
    const state = await updateCollectStateAfterAdd(result.status, getSessionAccountId(sessionData));
    const preview = buildAuthPreview(sessionData, authJson);

    sendResponse({ success: true, status: result.status, state, preview, accountCount: result.accounts.length });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function startCollectMultiAuth(targets, sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    if (!tab || !tab.url || !tab.url.startsWith('https://chatgpt.com/')) {
      sendResponse({ success: false, error: 'Silakan buka halaman ChatGPT (https://chatgpt.com) terlebih dahulu.' });
      return;
    }

    const startedState = {
      status: 'processing',
      progress: {
        current: 0,
        total: 0,
        collectedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        duplicateCount: 0
      },
      currentTargetId: '',
      errorMsg: '',
      startedAt: new Date().toISOString()
    };
    await setCollectState(startedState);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectSessionsFromAccountsEndpoint
    });

    const pageResult = results && results[0] && results[0].result;
    if (!pageResult || !pageResult.success) {
      throw new Error((pageResult && pageResult.error) || 'Gagal mengambil daftar workspace dari endpoint accounts/check.');
    }

    const sessions = pageResult.sessions || [];
    const skipped = pageResult.skipped || [];
    let state = {
      ...startedState,
      progress: {
        ...startedState.progress,
        total: sessions.length + skipped.length,
        skippedCount: skipped.length
      }
    };
    await setCollectState(state);

    for (let i = 0; i < sessions.length; i++) {
      const item = sessions[i];
      state.progress.current = i + 1;
      state.currentTargetId = item.label || '';

      try {
        validateSessionForExport(item.sessionData);
        const authJson = buildAuthJson(item.sessionData);
        const account = buildConvertAuthAccount(authJson, item.sessionData);
        const result = await addCollectedAccountWithDedupe(account);

        if (result.status === 'collected') state.progress.collectedCount++;
        else if (result.status === 'duplicate') state.progress.duplicateCount++;
        else state.progress.failedCount++;
      } catch (err) {
        state.progress.failedCount++;
      }

      await setCollectState(state);
    }

    state.status = 'completed';
    state.currentTargetId = '';
    state.progress.current = state.progress.total;
    await setCollectState(state);

    const accounts = await getCollectedAccounts();
    sendResponse({ success: true, state, accountCount: accounts.length });
  } catch (err) {
    const state = await getCollectState();
    state.status = 'error';
    state.errorMsg = err.message;
    await setCollectState(state);
    sendResponse({ success: false, error: err.message, state });
  }
}

async function downloadCollectMultiAuth(sendResponse) {
  try {
    const accounts = await getCollectedAccounts();
    if (!accounts.length) {
      sendResponse({ success: false, error: 'Belum ada auth account yang terkumpul.' });
      return;
    }

    await clearCollectedAccounts();
    await resetCollectState();
    sendResponse({ success: true, convertAuthJson: { accounts }, accountCount: accounts.length });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function clearCollectMultiAuth(sendResponse) {
  try {
    await clearCollectedAccounts();
    await resetCollectState();
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function updateCollectStateAfterAdd(status, accountId) {
  const state = await getCollectState();
  if (status === 'collected') state.progress.collectedCount++;
  else if (status === 'duplicate') state.progress.duplicateCount++;
  else state.progress.failedCount++;
  state.status = 'completed';
  state.progress.current = state.progress.current || 1;
  state.progress.total = Math.max(state.progress.total || 1, state.progress.current);
  state.currentTargetId = maskId(accountId);
  await setCollectState(state);
  return state;
}

async function fetchSessionFromActiveChatGPTTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.url || !tab.url.startsWith('https://chatgpt.com/')) {
    throw new Error('Silakan buka halaman ChatGPT (https://chatgpt.com) terlebih dahulu.');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fetchChatGPTSessionFromPage
  });

  const result = results && results[0] && results[0].result;
  if (!result || !result.success) {
    throw new Error((result && result.error) || 'Session ChatGPT tidak ditemukan.');
  }

  return result.sessionData;
}

function clearChatGPTSiteData(sendResponse) {
  try {
    chrome.browsingData.remove({
      origins: ['https://chatgpt.com']
    }, {
      cache: true,
      cacheStorage: true,
      cookies: true,
      fileSystems: true,
      indexedDB: true,
      localStorage: true,
      serviceWorkers: true,
      webSQL: true
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      setStoredState({ ...DEFAULT_STATE })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// Export the current ChatGPT browser session as local auth file payloads
async function exportAuthSession(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    if (!tab || !tab.url || !tab.url.startsWith('https://chatgpt.com/')) {
      sendResponse({ success: false, error: 'Silakan buka halaman ChatGPT (https://chatgpt.com) terlebih dahulu.' });
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchChatGPTSessionFromPage
    }, (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: `Gagal mengambil session: ${chrome.runtime.lastError.message}` });
        return;
      }

      const result = results && results[0] && results[0].result;
      if (!result || !result.success) {
        sendResponse({ success: false, error: (result && result.error) || 'Session ChatGPT tidak ditemukan.' });
        return;
      }

      try {
        const sessionData = result.sessionData;
        validateSessionForExport(sessionData);

        const authJson = buildAuthJson(sessionData);
        const convertAuthJson = buildConvertAuthJson(authJson, sessionData);
        const preview = buildAuthPreview(sessionData, authJson);

        sendResponse({ success: true, authJson, convertAuthJson, preview });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function collectSessionsFromAccountsEndpoint() {
  const getAccountIdFromAccessToken = (accessToken) => {
    try {
      const payloadPart = String(accessToken || '').split('.')[1];
      if (!payloadPart) return '';
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = decodeURIComponent(atob(padded).split('').map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`).join(''));
      const payload = JSON.parse(json);
      const auth = payload['https://api.openai.com/auth'] || {};
      return auth.chatgpt_account_id || '';
    } catch (err) {
      return '';
    }
  };

  const getAccountIdFromSession = (sessionData) => {
    return getAccountIdFromAccessToken(sessionData && sessionData.accessToken)
      || (sessionData && sessionData.chatgptAccountId)
      || (sessionData && sessionData.account && sessionData.account.id)
      || (sessionData && sessionData.accountId)
      || (sessionData && sessionData.user && sessionData.user.accountId)
      || '';
  };

  const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return await res.json();
  };

  const getAccountCount = (payload) => {
    const accounts = payload && payload.accounts;
    if (Array.isArray(accounts)) return accounts.length;
    if (accounts && typeof accounts === 'object') return Object.keys(accounts).length;
    return 0;
  };

  const listAccounts = async (accessToken) => {
    const timezoneOffset = new Date().getTimezoneOffset();
    const path = `/backend-api/accounts/check/v4-2023-04-27?timezone_offset_min=${encodeURIComponent(timezoneOffset)}`;
    let credentialsPayload = null;
    let credentialsError = null;

    try {
      credentialsPayload = await fetchJson(path);
    } catch (err) {
      credentialsError = err;
    }

    if (accessToken) {
      try {
        const bearerPayload = await fetchJson(path, {
          headers: { authorization: `Bearer ${accessToken}` }
        });

        if (getAccountCount(bearerPayload) >= getAccountCount(credentialsPayload)) {
          return bearerPayload;
        }
      } catch (err) {
        if (!credentialsPayload && credentialsError) throw credentialsError;
      }
    }

    if (credentialsPayload) return credentialsPayload;
    throw credentialsError || new Error('accounts/check gagal.');
  };

  const normalizeAccounts = (accountsPayload) => {
    const accounts = accountsPayload && accountsPayload.accounts;
    const ordering = accountsPayload && accountsPayload.account_ordering;
    if (!accounts || typeof accounts !== 'object') return [];

    if (Array.isArray(accounts)) {
      return accounts.map((wrapper, index) => {
        const account = (wrapper && wrapper.account) || wrapper || {};
        const accountId = account.account_id || account.id || String(index);
        return {
          id: accountId,
          name: account.name || account.display_name || accountId,
          isDeactivated: Boolean(account.is_deactivated || account.deactivated),
          eligibleForReactivation: Boolean(account.eligible_for_reactivation),
          workspaceType: account.workspace_type || account.workspaceType || '',
          role: account.account_user_role || account.role || ''
        };
      }).filter((item) => item.id);
    }

    const orderedIds = Array.isArray(ordering) ? ordering : [];
    const accountIds = Object.keys(accounts);
    const ids = [...new Set([...orderedIds, ...accountIds])];
    return ids.map((id) => {
      const wrapper = accounts[id] || {};
      const account = wrapper.account || wrapper;
      const accountId = account.account_id || account.id || id;
      return {
        id: accountId,
        name: account.name || account.display_name || accountId,
        isDeactivated: Boolean(account.is_deactivated || account.deactivated),
        eligibleForReactivation: Boolean(account.eligible_for_reactivation),
        workspaceType: account.workspace_type || account.workspaceType || '',
        role: account.account_user_role || account.role || ''
      };
    }).filter((item) => item.id);
  };

  try {
    const currentSession = await fetchJson('/api/auth/session');
    const accessToken = currentSession && currentSession.accessToken;
    const accountsPayload = await listAccounts(accessToken);
    const accounts = normalizeAccounts(accountsPayload);

    if (!accounts.length) {
      return { success: false, error: 'Endpoint accounts/check tidak mengembalikan daftar workspace.' };
    }

    const sessions = [];
    const skipped = [];

    for (const account of accounts) {
      if (account.isDeactivated) {
        skipped.push({ label: account.name, accountId: account.id, reason: 'deactivated' });
        continue;
      }

      try {
        const exchangePath = `/api/auth/session?exchange_workspace_token=true&workspace_id=${encodeURIComponent(account.id)}&reason=account_switcher`;
        let sessionData;
        try {
          sessionData = await fetchJson(exchangePath);
        } catch (err) {
          if ((err.status === 401 || err.status === 403) && accessToken) {
            sessionData = await fetchJson(exchangePath, {
              headers: { authorization: `Bearer ${accessToken}` }
            });
          } else {
            throw err;
          }
        }
        const error = sessionData && sessionData.workspaceTokenExchangeError;
        const sessionAccountId = getAccountIdFromSession(sessionData);
        if (sessionData && sessionAccountId) {
          sessionData.chatgptAccountId = sessionAccountId;
        }

        if (error) {
          skipped.push({ label: account.name, accountId: account.id, reason: error.code || 'exchange_error' });
          continue;
        }

        if (!sessionData || !sessionData.accessToken) {
          skipped.push({ label: account.name, accountId: account.id, reason: 'no_token' });
          continue;
        }

        if (sessionAccountId && sessionAccountId !== account.id) {
          skipped.push({ label: account.name, accountId: account.id, reason: 'account_mismatch' });
          continue;
        }

        sessions.push({ label: account.name, sessionData });
      } catch (err) {
        skipped.push({ label: account.name, accountId: account.id, reason: 'error' });
      }
    }

    return { success: true, sessions, skipped, detectedCount: accounts.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function collectSessionsFromVisibleWorkspaceMenu() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const normalizeText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  const clickProfileMenu = async () => {
    const clickAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const target = el && (el.closest('button,[role="button"],[tabindex],a') || el);
      if (!target || !isVisible(target)) return false;
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      target.click();
      return true;
    };

    // First try the exact bottom-left account/profile area shown in ChatGPT's sidebar.
    const coordinateClicks = [
      [150, window.innerHeight - 45],
      [150, window.innerHeight - 80],
      [45, window.innerHeight - 45]
    ];

    for (const [x, y] of coordinateClicks) {
      if (clickAt(x, y)) {
        await wait(700);
        return true;
      }
    }

    const candidates = [...document.querySelectorAll('button,[role="button"],[tabindex],div')]
      .filter(isVisible)
      .map((el) => ({ el, rect: el.getBoundingClientRect(), text: normalizeText(el.innerText || el.textContent || '') }))
      .filter((item) => item.rect.left < 330 && item.rect.top > window.innerHeight - 120)
      .filter((item) => /personal account|@|Ribka/i.test(item.text));

    candidates.sort((a, b) => a.rect.top - b.rect.top);
    const target = candidates[0] && (candidates[0].el.closest('button,[role="button"],[tabindex]') || candidates[0].el);

    if (target && isVisible(target)) {
      target.click();
      await wait(700);
      return true;
    }

    return false;
  };

  const isWorkspaceLabel = (text) => {
    const value = normalizeText(text);
    if (!value || value.length < 2 || value.length > 80) return false;
    if (value.includes('@')) return false;
    if (/deactivated/i.test(value)) return false;
    if (/^(ChatGPT|New chat|Search chats|Library|Projects|Apps|More|Personalization|Profile|Settings|Help|Log out|Personal account)$/i.test(value)) return false;
    return true;
  };

  const findMenuContainer = () => {
    const candidates = [...document.querySelectorAll('div,section,[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper]')]
      .filter(isVisible)
      .map((el) => ({ el, rect: el.getBoundingClientRect(), text: normalizeText(el.innerText || el.textContent || '') }))
      .filter((item) => item.rect.width >= 220 && item.rect.width <= 520 && item.rect.height >= 120 && item.rect.left <= 900)
      .filter((item) => /deactivated|@|Beulah|mktaylor|Class|galway|STEM/i.test(item.text));

    candidates.sort((a, b) => (b.text.length + b.rect.height) - (a.text.length + a.rect.height));
    return candidates[0] && candidates[0].el;
  };

  const openWorkspaceMenu = async () => {
    let container = findMenuContainer();
    if (container) return container;

    const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(isVisible);
    const trigger = buttons.find((button) => normalizeText(button.innerText || button.textContent).startsWith('ChatGPT'))
      || buttons.find((button) => /ChatGPT/.test(normalizeText(button.innerText || button.textContent)));

    if (trigger) {
      trigger.click();
      await wait(700);
    }

    return findMenuContainer();
  };

  const getWorkspaceRows = (container) => {
    const rowMap = new Map();
    const elements = [...container.querySelectorAll('button,[role="menuitem"],a,[tabindex],div,span')].filter(isVisible);

    for (const el of elements) {
      const text = normalizeText(el.innerText || el.textContent || '');
      if (!isWorkspaceLabel(text)) continue;

      const row = el.closest('button,[role="menuitem"],a,[tabindex]') || el.closest('div') || el;
      if (!row || !isVisible(row)) continue;

      const rowText = normalizeText(row.innerText || row.textContent || text);
      const label = isWorkspaceLabel(rowText) ? rowText : text;
      if (!isWorkspaceLabel(label)) continue;
      if (!rowMap.has(label)) rowMap.set(label, row);
    }

    return [...rowMap.entries()].map(([label, row]) => ({ label, row }));
  };

  const fetchSession = async () => {
    const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
      method: 'GET',
      credentials: 'include'
    });

    if (!sessionRes.ok) throw new Error('session fetch failed');
    return await sessionRes.json();
  };

  try {
    await clickProfileMenu();
    const initialContainer = await openWorkspaceMenu();
    if (!initialContainer) {
      return { success: false, error: 'Dropdown workspace tidak ditemukan. Buka dropdown workspace ChatGPT dulu.' };
    }

    const labels = getWorkspaceRows(initialContainer).map((item) => item.label);
    if (labels.length === 0) {
      return { success: false, error: 'Tidak ada workspace aktif yang bisa diklik di dropdown.' };
    }

    const sessions = [];
    const skipped = [];

    for (const label of labels) {
      try {
        const container = await openWorkspaceMenu();
        if (!container) {
          skipped.push({ label, reason: 'menu_closed' });
          continue;
        }

        const rows = getWorkspaceRows(container);
        const item = rows.find((row) => row.label === label);
        if (!item) {
          skipped.push({ label, reason: 'row_missing' });
          continue;
        }

        item.row.click();
        await wait(2200);

        if (/\/workspace\/deactivated/i.test(location.pathname)) {
          skipped.push({ label, reason: 'deactivated' });
          history.back();
          await wait(1200);
          continue;
        }

        const sessionData = await fetchSession();
        if (!sessionData || !sessionData.accessToken) {
          skipped.push({ label, reason: 'no_token' });
          continue;
        }

        sessions.push({ label, sessionData });
      } catch (err) {
        skipped.push({ label, reason: 'error' });
      }
    }

    return { success: true, sessions, skipped };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchChatGPTSessionFromPage() {
  try {
    const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
      method: 'GET',
      credentials: 'include'
    });

    if (!sessionRes.ok) {
      return { success: false, error: 'Gagal mengambil session auth. Pastikan Anda sudah login.' };
    }

    const sessionData = await sessionRes.json();
    return { success: true, sessionData };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function validateSessionForExport(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') {
    throw new Error('Data session tidak valid.');
  }

  if (!sessionData.accessToken) {
    throw new Error('AccessToken tidak ditemukan. Pastikan Anda sudah login di ChatGPT.');
  }

  if (!getSessionAccountId(sessionData)) {
    throw new Error('Account ID tidak ditemukan di session ChatGPT.');
  }
}

function buildAuthJson(sessionData) {
  const accountId = getSessionAccountId(sessionData);
  const output = cloneJson(sessionData);

  output.accessToken = sessionData.accessToken;
  output.idToken = sessionData.idToken || createSyntheticIdToken(sessionData);
  output.refreshToken = sessionData.refreshToken || '';
  output.auth_mode = 'chatgpt';
  output.OPENAI_API_KEY = null;
  output.tokens = {
    id_token: output.idToken,
    access_token: sessionData.accessToken,
    refresh_token: output.refreshToken,
    account_id: accountId
  };
  output.last_refresh = new Date().toISOString();

  return output;
}

function buildConvertAuthJson(authJson, sessionData) {
  return {
    accounts: [buildConvertAuthAccount(authJson, sessionData)]
  };
}

function buildConvertAuthAccount(authJson, sessionData) {
  const accountId = authJson.tokens.account_id;
  return {
    accessToken: authJson.tokens.access_token,
    idToken: authJson.tokens.id_token,
    name: getSessionDisplayName(sessionData, accountId),
    providerSpecificData: {
      authMethod: sessionData.authProvider || 'chatgpt',
      chatgptAccountId: accountId
    }
  };
}

function createSyntheticIdToken(sessionData) {
  const now = Math.floor(Date.now() / 1000);
  const parsedExpiry = Date.parse(sessionData.expires || '');
  const exp = Number.isNaN(parsedExpiry) ? now + (90 * 24 * 60 * 60) : Math.max(now + 60, Math.floor(parsedExpiry / 1000));
  const accountId = getSessionAccountId(sessionData);
  const user = sessionData.user || {};
  const account = sessionData.account || {};

  const header = {
    alg: 'none',
    typ: 'JWT',
    cpa_synthetic: true
  };
  const payload = {
    iat: now,
    exp,
    email: user.email || '',
    name: user.name || '',
    'https://api.openai.com/auth': {
      chatgpt_account_id: accountId,
      chatgpt_plan_type: account.planType || account.workspaceType || '',
      chatgpt_user_id: user.id || '',
      user_id: user.id || ''
    }
  };

  return `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}.synthetic`;
}

function base64UrlEncodeJson(value) {
  const json = JSON.stringify(value);
  const utf8 = unescape(encodeURIComponent(json));
  const base64 = btoa(utf8);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildAuthPreview(sessionData, authJson) {
  const accountId = authJson.tokens.account_id;
  return {
    email: (sessionData.user && sessionData.user.email) || '',
    name: (sessionData.user && sessionData.user.name) || '',
    accountId: maskId(accountId),
    planType: (sessionData.account && (sessionData.account.planType || sessionData.account.workspaceType)) || '',
    expires: sessionData.expires || '',
    lastRefresh: authJson.last_refresh
  };
}

function getAccountIdFromAccessToken(accessToken) {
  try {
    const payloadPart = String(accessToken || '').split('.')[1];
    if (!payloadPart) return '';
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`).join(''));
    const payload = JSON.parse(json);
    const auth = payload['https://api.openai.com/auth'] || {};
    return auth.chatgpt_account_id || '';
  } catch (err) {
    return '';
  }
}

function getSessionAccountId(sessionData) {
  if (!sessionData) return '';
  return getAccountIdFromAccessToken(sessionData.accessToken)
    || sessionData.chatgptAccountId
    || (sessionData.account && sessionData.account.id)
    || sessionData.accountId
    || (sessionData.user && sessionData.user.accountId)
    || '';
}

function getSessionDisplayName(sessionData, accountId) {
  const user = sessionData.user || {};
  return user.email || user.name || accountId || 'ChatGPT';
}

function maskId(value) {
  if (!value || value.length <= 12) return value || '';
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// Start processing the workspace joins
async function startProcessing(workspaceIds, sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    if (!tab || !tab.url || !tab.url.includes('chatgpt.com')) {
      sendResponse({ success: false, error: 'Silakan buka halaman ChatGPT (https://chatgpt.com) terlebih dahulu.' });
      return;
    }

    const newState = {
      status: 'processing',
      progress: { current: 0, total: workspaceIds.length, okCount: 0, failCount: 0 },
      results: [],
      errorMsg: '',
      activeTabId: tab.id,
      startedAt: new Date().toISOString()
    };
    await setStoredState(newState);

    // Send positive start acknowledgement to popup
    sendResponse({ success: true });

    // Start listening for active tab closure
    setupTabListener();

    // Inject batch processing script into active ChatGPT tab
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: performBatchWorkspaceJoin,
      args: [workspaceIds]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error("[Workspace Joiner] Script injection error:", chrome.runtime.lastError.message);
        getStoredState().then(async (state) => {
          state.status = 'error';
          state.errorMsg = `Gagal menginjeksi script: ${chrome.runtime.lastError.message}`;
          await setStoredState(state);
          showNotification(state);
          cleanupTabListener();
        });
      }
    });

  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// =============================================================
// Function injected into the active ChatGPT page context
// =============================================================
async function performBatchWorkspaceJoin(workspaceIds) {
  const safeSendMessage = (msg) => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {}
  };

  try {
    const sessionRes = await fetch("https://chatgpt.com/api/auth/session", {
      method: "GET",
      credentials: "include"
    });

    if (!sessionRes.ok) {
      safeSendMessage({ action: 'JOIN_ERROR', error: "Gagal mengambil session auth. Pastikan Anda sudah login." });
      return;
    }

    const sessionData = await sessionRes.json();
    const accessToken = sessionData.accessToken;

    if (!accessToken) {
      safeSendMessage({ action: 'JOIN_ERROR', error: "AccessToken tidak ditemukan. Pastikan Anda sudah login di ChatGPT." });
      return;
    }

    for (let i = 0; i < workspaceIds.length; i++) {
      const id = workspaceIds[i];
      try {
        const res = await fetch(`https://chatgpt.com/backend-api/accounts/${id}/invites/request`, {
          method: "POST",
          headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "authorization": `Bearer ${accessToken}`,
            "cache-control": "no-cache",
            "content-type": "application/json",
            "oai-language": "en-US",
            "pragma": "no-cache",
            "sec-ch-ua-arch": "\"x86\"",
            "sec-ch-ua-bitness": "\"64\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": "\"\"",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-ch-ua-platform-version": "\"13.5.1\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin"
          },
          referrer: "https://chatgpt.com/k12-verification",
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify({}),
          mode: "cors",
          credentials: "include"
        });

        const status = res.status;
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { data = text; }

        safeSendMessage({
          action: 'JOIN_PROGRESS',
          result: { id, ok: res.ok, status, data },
          index: i + 1,
          total: workspaceIds.length
        });

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        safeSendMessage({
          action: 'JOIN_PROGRESS',
          result: { id, ok: false, status: 0, data: err.message },
          index: i + 1,
          total: workspaceIds.length
        });
        await new Promise(r => setTimeout(r, 300));
      }
    }

    safeSendMessage({ action: 'JOIN_COMPLETED' });

  } catch (error) {
    console.error("[Workspace Joiner] Error:", error);
    safeSendMessage({ action: 'JOIN_ERROR', error: error.message });
  }
}
