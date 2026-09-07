// ============================================================
// Daftar workspace ID dari workspace.md
// ============================================================
const WORKSPACE_IDS = [
  "df0cb75f-1e09-43c4-b973-043f6bfafcbd",
];

document.getElementById('joinBtn').addEventListener('click', () => {
  const statusBox = document.getElementById('statusBox');
  const progressBox = document.getElementById('progressBox');

  statusBox.style.display = 'none';
  progressBox.style.display = 'none';

  chrome.runtime.sendMessage({
    action: 'START_JOIN',
    workspaceIds: WORKSPACE_IDS
  }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('error', 'Error Koneksi', chrome.runtime.lastError.message);
      return;
    }
    if (response && !response.success) {
      showStatus('error', 'Peringatan', response.error);
    }
  });
});

document.getElementById('clearChatGPTDataBtn').addEventListener('click', handleClearChatGPTDataClick);
document.getElementById('startCollectMultiBtn').addEventListener('click', handleStartCollectMultiClick);
document.getElementById('collectCurrentBtn').addEventListener('click', handleCollectCurrentClick);
document.getElementById('downloadMultiAuthBtn').addEventListener('click', handleDownloadMultiAuthClick);
document.getElementById('clearMultiAuthBtn').addEventListener('click', handleClearMultiAuthClick);
document.getElementById('exportAuthBtn').addEventListener('click', handleExportAuthClick);
document.getElementById('downloadAuthBtn').addEventListener('click', handleDownloadAuthClick);
document.getElementById('selectSwitchAccountBtn').addEventListener('click', () => {
  document.getElementById('switchAccountFileInput').click();
});
document.getElementById('switchAccountFileInput').addEventListener('change', handleSwitchAccountFileSelected);

// Outlook Auto Login Listeners
document.getElementById('selectOutlookAccountBtn').addEventListener('click', () => {
  document.getElementById('outlookAccountFileInput').click();
});
document.getElementById('outlookAccountFileInput').addEventListener('change', handleOutlookFileSelected);
document.getElementById('startOutlookLoginBtn').addEventListener('click', handleStartOutlookLoginClick);

// Load current background processing status when popup opens
document.addEventListener('DOMContentLoaded', () => {
  const badgeEl = document.getElementById('targetBadge');
  if (badgeEl) {
    badgeEl.textContent = `${WORKSPACE_IDS.length} target${WORKSPACE_IDS.length > 1 ? 's' : ''}`;
  }

  checkCurrentUserSession();

  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (state) => {
    if (chrome.runtime.lastError) return;
    handleStatusUpdate(state);
  });

  chrome.runtime.sendMessage({ action: 'GET_COLLECT_MULTI_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) return;
    renderMultiAuthStatus(response.state, response.accountCount);
  });
});

async function checkCurrentUserSession() {
  const emailEl = document.getElementById('currentUserEmail');
  if (!emailEl) return;
  try {
    const res = await fetch("https://chatgpt.com/api/auth/session", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.user && data.user.email) {
        emailEl.textContent = `👤 Akun Login: ${data.user.email}`;
        return;
      }
    }
    emailEl.textContent = `⚠️ Belum login di chatgpt.com`;
  } catch (e) {
    emailEl.textContent = `⚠️ Gagal mengecek session login`;
  }
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.joinState) {
    handleStatusUpdate(changes.joinState.newValue);
  }
  if (area === 'local' && changes.collectState) {
    renderMultiAuthStatus(changes.collectState.newValue);
  }
});

function handleStatusUpdate(state) {
  const joinBtn = document.getElementById('joinBtn');
  const btnText = document.getElementById('btnText');
  const spinner = document.getElementById('spinner');
  const statusBox = document.getElementById('statusBox');
  const progressBox = document.getElementById('progressBox');

  if (!state) return;

  if (state.status === 'idle') {
    joinBtn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Ajukan Join Workspace';
    statusBox.style.display = 'none';
    progressBox.style.display = 'none';
  } else if (state.status === 'processing') {
    joinBtn.disabled = true;
    spinner.style.display = 'block';
    btnText.textContent = 'Memproses...';
    const counts = getJoinCounts(state);
    
    progressBox.style.display = 'block';
    progressBox.innerHTML = `
      <div class="progress-title">Sedang memproses ${state.progress.current} dari ${state.progress.total} workspace...</div>
      <div class="status-body">Joined: ${counts.joined} · Pending: ${counts.pending} · Failed: ${counts.failed}</div>
      ${renderJoinResults(state.results)}
    `;
    statusBox.style.display = 'none';
  } else if (state.status === 'completed') {
    joinBtn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Ajukan Join Workspace';

    const counts = getJoinCounts(state);
    const okCount = counts.joined;
    const failCount = counts.failed;
    const pendingCount = counts.pending;
    const total = counts.total;

    progressBox.style.display = 'block';
    progressBox.innerHTML = `
      <div class="progress-title">Selesai</div>
      <div class="status-body">Joined: ${okCount} · Pending: ${pendingCount} · Failed: ${failCount} · Total: ${total}</div>
      ${renderJoinResults(state.results)}
    `;

    if (okCount > 0) {
      showStatus('success', `${okCount} joined`, `${pendingCount} pending, ${failCount} failed dari ${total} workspace.`);
    } else if (pendingCount > 0) {
      showStatus('error', 'Request diterima, belum joined', `${pendingCount} pending approval, ${failCount} failed dari ${total} workspace.`);
    } else {
      showStatus('error', '✗ Semua request gagal', `Periksa login dan coba lagi.`);
    }
  } else if (state.status === 'error') {
    joinBtn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Ajukan Join Workspace';

    showStatus('error', 'Peringatan / Error', state.errorMsg);
    if (state.progress && state.progress.total > 0) {
      progressBox.style.display = 'block';
      progressBox.innerHTML = `
        <div class="progress-title">📊 Proses terhenti</div>
        <div class="status-body">Berhasil: ${state.progress.okCount} · Gagal: ${state.progress.failCount} · Total: ${state.progress.total}</div>
      `;
    } else {
      progressBox.style.display = 'none';
    }
  }
}

function getJoinCounts(state) {
  const progress = state && state.progress ? state.progress : {};
  const results = Array.isArray(state && state.results) ? state.results : [];

  const joined = progress.okCount ?? results.filter((item) => item && item.joined).length;
  const pending = progress.pendingCount ?? results.filter((item) => item && item.accepted && !item.joined).length;
  const failed = progress.failCount ?? results.filter((item) => item && !item.accepted).length;
  const total = progress.total || results.length || 0;

  return { joined, pending, failed, total };
}

function renderJoinResults(results) {
  if (!Array.isArray(results) || !results.length) return '';

  const items = results.slice(-12).map((item) => {
    const isRateLimited = item.status === 429;
    const state = item.joined ? 'joined' : item.accepted ? 'pending' : (isRateLimited ? 'rate limited' : 'failed');
    const status = item.status ? `HTTP ${item.status}` : 'HTTP 0';
    const verify = item.verifyStatus ? `verify ${item.verifyStatus}` : 'verify 0';
    const reason = item.verifyError
      ? ` · ${typeof item.verifyError === 'string' ? item.verifyError : JSON.stringify(item.verifyError)}`
      : (isRateLimited ? ' · Rate limit invite API (coba lagi nanti)' : '');

    return `
      <div class="result-item ${item.joined ? 'ok' : item.accepted ? '' : 'fail'}">
        <span>${state}</span>
        <span class="result-id">${escapeHtml(item.id || '')}</span>
        <span class="result-detail">${escapeHtml(`${status} · ${verify}${reason}`)}</span>
      </div>
    `;
  }).join('');

  return `<div class="result-list">${items}</div>`;
}

function parseOutlookAccountLine(line) {
  if (!line || typeof line !== 'string') return null;
  const parts = line.trim().split('----');
  if (parts.length < 4) return null;
  return {
    email: parts[0].trim(),
    password: parts[1].trim(),
    clientId: parts[2].trim(),
    refreshToken: parts[3].trim()
  };
}

async function handleStartOutlookLoginClick() {
  const inputEl = document.getElementById('outlookAccountInput');
  const rawText = inputEl.value || '';
  const firstLine = rawText.split('\n').map(l => l.trim()).find(l => l.includes('----'));

  if (!firstLine) {
    showOutlookStatus('error', 'Format tidak sesuai', 'Masukkan setidaknya 1 baris dengan format: email----password----client_id----refresh_token');
    return;
  }

  const accountData = parseOutlookAccountLine(firstLine);
  if (!accountData) {
    showOutlookStatus('error', 'Format tidak sesuai', 'Gunakan format: email----password----client_id----refresh_token');
    return;
  }

  showOutlookStatus('success', 'Memulai Login...', `Akun: ${accountData.email}. Halaman login ChatGPT dibuka...`);

  chrome.runtime.sendMessage({
    action: 'START_OUTLOOK_AUTO_LOGIN',
    accountData,
    workspaceId: WORKSPACE_IDS[0]
  }, (response) => {
    if (chrome.runtime.lastError) {
      showOutlookStatus('error', 'Gagal memproses', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showOutlookStatus('error', 'Gagal memproses', (response && response.error) || 'Gagal memulai login.');
      return;
    }

    showOutlookStatus('success', '✓ Auto Login Berjalan', `Login untuk ${accountData.email} sedang berjalan di latar belakang. OTP akan diambil otomatis dari Xunmail API.`);
  });
}

function handleOutlookFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  file.text().then(text => {
    document.getElementById('outlookAccountInput').value = text;
    showOutlookStatus('success', 'File dimuat', `Berhasil memuat file: ${file.name}. Klik "Start Auto Login & Join" untuk memulai.`);
  }).catch(err => {
    showOutlookStatus('error', 'Gagal membaca file', err.message);
  });
}

function showOutlookStatus(type, title, body) {
  const statusBox = document.getElementById('outlookAutoLoginStatusBox');
  if (!statusBox) return;
  statusBox.className = `status-container ${type}`;
  statusBox.style.display = 'block';
  statusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}

async function handleStartCollectMultiClick() {
  setMultiAuthButtonsDisabled(true);
  showMultiAuthStatus('success', 'Auto collect dimulai', 'Mengambil daftar workspace dari endpoint accounts/check...');

  chrome.runtime.sendMessage({ action: 'START_COLLECT_MULTI_AUTH', targets: WORKSPACE_IDS }, (response) => {
    setMultiAuthButtonsDisabled(false);

    if (chrome.runtime.lastError) {
      showMultiAuthStatus('error', 'Auto collect gagal', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showMultiAuthStatus('error', 'Auto collect gagal', (response && response.error) || 'Tidak ada response dari background script.');
      if (response && response.state) renderMultiAuthStatus(response.state);
      return;
    }

    renderMultiAuthStatus(response.state, response.accountCount);
  });
}

async function handleCollectCurrentClick() {
  setMultiAuthButtonsDisabled(true);
  showMultiAuthStatus('success', 'Collect current', 'Mengambil auth dari workspace ChatGPT yang sedang aktif...');

  chrome.runtime.sendMessage({ action: 'COLLECT_CURRENT_AUTH_SESSION' }, (response) => {
    setMultiAuthButtonsDisabled(false);

    if (chrome.runtime.lastError) {
      showMultiAuthStatus('error', 'Collect gagal', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showMultiAuthStatus('error', 'Collect gagal', (response && response.error) || 'Tidak ada response dari background script.');
      return;
    }

    renderMultiAuthStatus(response.state, response.accountCount);
  });
}

async function handleDownloadMultiAuthClick() {
  setMultiAuthButtonsDisabled(true);
  showMultiAuthStatus('success', 'Menyiapkan download', 'Membuat merged convert-auth.json...');

  chrome.runtime.sendMessage({ action: 'DOWNLOAD_COLLECT_MULTI_AUTH' }, async (response) => {
    setMultiAuthButtonsDisabled(false);

    if (chrome.runtime.lastError) {
      showMultiAuthStatus('error', 'Download gagal', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showMultiAuthStatus('error', 'Download gagal', (response && response.error) || 'Belum ada auth account yang terkumpul.');
      return;
    }

    try {
      await downloadJsonFile('convert-auth.json', response.convertAuthJson);
      showMultiAuthStatus('success', 'Download dimulai', `${response.accountCount} account digabung ke convert-auth.json.`);
    } catch (err) {
      showMultiAuthStatus('error', 'Download gagal', err.message || String(err));
    }
  });
}

async function handleClearMultiAuthClick() {
  setMultiAuthButtonsDisabled(true);

  chrome.runtime.sendMessage({ action: 'CLEAR_COLLECT_MULTI_AUTH' }, (response) => {
    setMultiAuthButtonsDisabled(false);

    if (chrome.runtime.lastError) {
      showMultiAuthStatus('error', 'Clear gagal', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showMultiAuthStatus('error', 'Clear gagal', (response && response.error) || 'Tidak ada response dari background script.');
      return;
    }

    showMultiAuthStatus('success', 'Collection dibersihkan', 'Temporary multi-auth collection sudah dikosongkan.');
  });
}

function setMultiAuthButtonsDisabled(disabled) {
  document.getElementById('startCollectMultiBtn').disabled = disabled;
  document.getElementById('collectCurrentBtn').disabled = disabled;
  document.getElementById('downloadMultiAuthBtn').disabled = disabled;
  document.getElementById('clearMultiAuthBtn').disabled = disabled;
}

function renderMultiAuthStatus(state, accountCount) {
  if (!state) return;
  const progress = state.progress || {};
  const status = state.status || 'idle';
  const type = status === 'error' ? 'error' : 'success';
  const title = status === 'processing' ? 'Collect Multi Auth berjalan'
    : status === 'completed' ? 'Collect Multi Auth selesai'
    : status === 'error' ? 'Collect Multi Auth error'
    : 'Collect Multi Auth siap';
  const body = [
    `Terkumpul: ${accountCount ?? progress.collectedCount ?? 0}`,
    `Collected baru: ${progress.collectedCount || 0}`,
    `Duplicate: ${progress.duplicateCount || 0}`,
    `Skipped: ${progress.skippedCount || 0}`,
    `Failed: ${progress.failedCount || 0}`,
    `Progress: ${progress.current || 0}/${progress.total || 0}`,
    state.currentTargetId ? `Target: ${state.currentTargetId}` : '',
    state.errorMsg ? `Error: ${state.errorMsg}` : ''
  ].filter(Boolean).join(' · ');

  showMultiAuthStatus(type, title, body);
}

function showMultiAuthStatus(type, title, body) {
  const multiAuthStatusBox = document.getElementById('multiAuthStatusBox');
  multiAuthStatusBox.className = `status-container ${type}`;
  multiAuthStatusBox.style.display = 'block';
  multiAuthStatusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}

async function handleClearChatGPTDataClick() {
  const clearBtn = document.getElementById('clearChatGPTDataBtn');
  clearBtn.disabled = true;
  showClearDataStatus('success', 'Membersihkan data', 'Menghapus cookie, localStorage, IndexedDB, cache, dan service worker untuk chatgpt.com...');

  chrome.runtime.sendMessage({ action: 'CLEAR_CHATGPT_SITE_DATA' }, (response) => {
    clearBtn.disabled = false;

    if (chrome.runtime.lastError) {
      showClearDataStatus('error', 'Clear gagal', chrome.runtime.lastError.message);
      return;
    }

    if (!response || !response.success) {
      showClearDataStatus('error', 'Clear gagal', (response && response.error) || 'Tidak ada response dari background script.');
      return;
    }

    showClearDataStatus('success', 'Data ChatGPT dibersihkan', 'Sekarang tutup tab loop, buka https://chatgpt.com lagi, lalu login ulang.');
  });
}

function showClearDataStatus(type, title, body) {
  const clearDataStatusBox = document.getElementById('clearDataStatusBox');
  clearDataStatusBox.className = `status-container ${type}`;
  clearDataStatusBox.style.display = 'block';
  clearDataStatusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}

async function handleExportAuthClick() {
  if (!window.showDirectoryPicker) {
    showAuthStatus('error', 'Folder picker tidak tersedia', 'Pakai tombol Download Instead untuk menyimpan file.');
    return;
  }

  setAuthButtonsDisabled(true);
  hideAuthPreview();
  showAuthStatus('success', 'Menunggu folder', 'Pilih folder project extension...');

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    showAuthStatus('success', 'Mengambil session', 'Membaca session ChatGPT aktif...');

    const response = await requestAuthExportPayload();
    if (!response.success) {
      showAuthStatus('error', 'Export gagal', response.error);
      return;
    }

    const authFileName = await writeJsonFile(directoryHandle, 'auth.json', response.authJson);
    const convertAuthFileName = await writeJsonFile(directoryHandle, 'convert-auth.json', response.convertAuthJson);

    renderAuthPreview(response.preview);
    showAuthStatus('success', 'Auth files tersimpan', `Berhasil membuat ${authFileName} dan ${convertAuthFileName}.`);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showAuthStatus('error', 'Export dibatalkan', 'Folder tidak dipilih.');
    } else {
      showAuthStatus('error', 'Export gagal', err.message || String(err));
    }
  } finally {
    setAuthButtonsDisabled(false);
  }
}

async function handleDownloadAuthClick() {
  setAuthButtonsDisabled(true);
  hideAuthPreview();
  showAuthStatus('success', 'Mengambil session', 'Membaca session ChatGPT aktif...');

  try {
    const response = await requestAuthExportPayload();
    if (!response.success) {
      showAuthStatus('error', 'Download gagal', response.error);
      return;
    }

    await downloadJsonFile('auth.json', response.authJson);
    await downloadJsonFile('convert-auth.json', response.convertAuthJson);

    renderAuthPreview(response.preview);
    showAuthStatus('success', 'Download dimulai', 'File auth.json dan convert-auth.json tersimpan di Downloads.');
  } catch (err) {
    showAuthStatus('error', 'Download gagal', err.message || String(err));
  } finally {
    setAuthButtonsDisabled(false);
  }
}

function requestAuthExportPayload() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'EXPORT_AUTH_SESSION' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'Tidak ada response dari background script.' });
    });
  });
}

async function writeJsonFile(directoryHandle, fileName, data) {
  const availableFileName = await getAvailableFileName(directoryHandle, fileName);
  const fileHandle = await directoryHandle.getFileHandle(availableFileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
  return availableFileName;
}

async function getAvailableFileName(directoryHandle, fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex);

  for (let index = 0; index < 1000; index++) {
    const candidate = index === 0 ? fileName : `${baseName} (${index})${extension}`;
    try {
      await directoryHandle.getFileHandle(candidate, { create: false });
    } catch (err) {
      if (err && err.name === 'NotFoundError') return candidate;
      throw err;
    }
  }

  throw new Error(`Nama file penuh untuk ${fileName}.`);
}

function downloadJsonFile(fileName, data) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));

    chrome.downloads.download({
      url,
      filename: fileName,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      URL.revokeObjectURL(url);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

function setAuthButtonsDisabled(disabled) {
  document.getElementById('exportAuthBtn').disabled = disabled;
  document.getElementById('downloadAuthBtn').disabled = disabled;
}

function showAuthStatus(type, title, body) {
  const authStatusBox = document.getElementById('authStatusBox');
  authStatusBox.className = `status-container ${type}`;
  authStatusBox.style.display = 'block';
  authStatusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}

function renderAuthPreview(preview) {
  if (!preview) return;

  const authPreviewBox = document.getElementById('authPreviewBox');
  authPreviewBox.className = 'status-container success';
  authPreviewBox.style.display = 'block';
  authPreviewBox.innerHTML = `
    <div class="status-title">Preview aman</div>
    <div class="auth-preview">
      <span class="auth-preview-label">Email</span><span class="auth-preview-value">${escapeHtml(preview.email || '-')}</span>
      <span class="auth-preview-label">Nama</span><span class="auth-preview-value">${escapeHtml(preview.name || '-')}</span>
      <span class="auth-preview-label">Account</span><span class="auth-preview-value">${escapeHtml(preview.accountId || '-')}</span>
      <span class="auth-preview-label">Plan</span><span class="auth-preview-value">${escapeHtml(preview.planType || '-')}</span>
      <span class="auth-preview-label">Expires</span><span class="auth-preview-value">${escapeHtml(preview.expires || '-')}</span>
      <span class="auth-preview-label">Refresh</span><span class="auth-preview-value">${escapeHtml(preview.lastRefresh || '-')}</span>
    </div>
  `;
}

function hideAuthPreview() {
  const authPreviewBox = document.getElementById('authPreviewBox');
  authPreviewBox.style.display = 'none';
  authPreviewBox.innerHTML = '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showStatus(type, title, body) {
  const statusBox = document.getElementById('statusBox');
  statusBox.className = `status-container ${type}`;
  statusBox.style.display = 'block';
  statusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}

async function handleSwitchAccountFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const btn = document.getElementById('selectSwitchAccountBtn');
  btn.disabled = true;
  showSwitchAccountStatus('success', 'Membaca file...', file.name);

  try {
    const text = await file.text();
    let authData;
    try {
      authData = JSON.parse(text);
    } catch (e) {
      throw new Error('File yang dipilih bukan JSON yang valid.');
    }

    showSwitchAccountStatus('success', 'Mengganti akun & Auto-Join...', 'Mengatur token, membuka ChatGPT, dan memulai request join...');

    chrome.runtime.sendMessage({ action: 'SWITCH_ACCOUNT_JSON', authData }, (response) => {
      btn.disabled = false;
      event.target.value = '';

      if (chrome.runtime.lastError) {
        showSwitchAccountStatus('error', 'Gagal ganti akun', chrome.runtime.lastError.message);
        return;
      }

      if (!response || !response.success) {
        showSwitchAccountStatus('error', 'Gagal ganti akun', (response && response.error) || 'Gagal memproses file JSON.');
        return;
      }

      const acc = response.account || {};
      const detail = [acc.email, acc.name, acc.planType].filter(Boolean).join(' · ');
      showSwitchAccountStatus('success', '✓ Akun Berhasil Diganti & Auto-Join Dimulai!', `${detail || file.name}. Request join ke workspace target otomatis berjalan.`);
    });
  } catch (err) {
    btn.disabled = false;
    event.target.value = '';
    showSwitchAccountStatus('error', 'Gagal membaca file', err.message || String(err));
  }
}

function showSwitchAccountStatus(type, title, body) {
  const switchAccountStatusBox = document.getElementById('switchAccountStatusBox');
  if (!switchAccountStatusBox) return;
  switchAccountStatusBox.className = `status-container ${type}`;
  switchAccountStatusBox.style.display = 'block';
  switchAccountStatusBox.innerHTML = `
    <div class="status-title">${escapeHtml(title)}</div>
    <div class="status-body">${escapeHtml(body)}</div>
  `;
}
