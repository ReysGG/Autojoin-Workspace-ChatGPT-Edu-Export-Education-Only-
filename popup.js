// ============================================================
// Daftar workspace ID dari workspace.md (26-07-06 dan seterusnya)
// Sudah di-deduplicate, skip yang rusak (炸车/灵车)
// ============================================================
const WORKSPACE_IDS = [
  "1e595494-2426-4946-b688-58ba75604bcc",
  "cf8e512d-1f3b-4603-950c-3d9758a8b435",
  "444437a7-c08b-423e-a2c8-65c17383ba24",
  "a0a16bc9-e1b1-45f0-b269-812b53f60121",
  "696cc59b-a475-44b0-b206-4e03593e658f",
  "42822f8a-b530-4649-97ea-83aac42ecf6d",
  "47336c9d-7607-4478-b37c-018049af1e46",
  "59208eb6-ec43-4d87-9289-dbd9e250bdd6",
  "2c82c020-e1bc-4363-9502-a6794405f793",
  "9901799e-e832-48b1-9278-9abe73168708",
  "83bec9de-395a-44e6-9a30-189508c22b99",
  "eb6642e8-b4a6-4652-9c18-67099f2781cc",
  "ff598c4d-ccaf-40c1-bfaa-cb94565764b1", // Beulah Middle School
  "b49cd6d8-b52d-4c21-93d7-89cc19b5e18e",
  "5e4c9b31-1b4e-4887-839b-607597928d7c", // Team-K12
  "a65ebb2e-dd7c-4fdb-9a5d-6ccaf6ad00a3",
  "52fb9943-aa13-4959-92bc-fe5e81c9e7f0",
  "8064da55-e484-4ba0-a0bc-db05ee84462b",
  "885440cb-01f9-4927-b2da-c7734cde849d",
  "d3c40646-82b0-42a5-a9e6-01819e5f66b2",
  "a4ed7848-dc98-4510-b4f8-ee170aad52ce",
  "0c0a3db9-ada3-44c0-8a15-f39a24c903f0",
  "c4d1df5b-81cd-445d-a5ea-4131a0fbb9d2",
  "1a4f5089-cab2-4f46-8073-6c8bb13f6aff",
  "44a5d4e6-e463-4412-88f3-0c98290027b7",
  "73fb6c1c-cac8-4285-99ec-44c6fe854f70",
  "7e443923-cb5f-45f4-a8a1-682de043f351",
  "52dcb028-8f47-4fab-b7e1-d827125b8687",
  "81597c95-7832-4fdc-a1e8-0835bdba7fb3",
  "4fdf7f85-38d1-4eea-aeb9-f50939ffb9d8",
  "8c27eb04-d736-4548-af16-662dde1dc6e9",
  "e1fbfed6-86a4-49b0-868d-17c396358d57",
  "191c2ca9-06fe-45ff-ac6a-de4ec8fefee9",
  "ab9141b4-9090-4dbd-bb93-074e485f0f03",
  "39dd4d8c-1162-4c44-9275-0b7e53a3fcf9",
  "255de4a6-96a4-430a-b660-358954424e79",
  "631e1603-06cf-4f0b-b79b-d09fbfcfe98d",
  "c72dcdb4-63a0-40b7-b0bb-ccce3ca54984",
  "2b636e76-a87b-4222-b536-2dc4a545109f",
  "4779b1d7-3109-4ecb-957f-80262f4d7161",
  "ae67aa09-f3d3-4895-977d-9ca44ed1d996",
  "6daa08c1-59c8-4e06-9bc8-9d7246a63057",
  "521ffc8f-9612-4950-84ed-95773138eca6",
];

document.getElementById('joinBtn').addEventListener('click', () => {
  const statusBox = document.getElementById('statusBox');
  const progressBox = document.getElementById('progressBox');

  // Reset display states before launching requests
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

// Load current background processing status when popup opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (state) => {
    if (chrome.runtime.lastError) {
      return;
    }
    handleStatusUpdate(state);
  });

  chrome.runtime.sendMessage({ action: 'GET_COLLECT_MULTI_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) return;
    renderMultiAuthStatus(response.state, response.accountCount);
  });
});

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
    
    progressBox.style.display = 'block';
    progressBox.innerHTML = `
      <div class="progress-title">⏳ Sedang memproses ${state.progress.current} dari ${state.progress.total} workspace...</div>
      <div class="status-body">Berhasil: ${state.progress.okCount} · Gagal: ${state.progress.failCount}</div>
    `;
    statusBox.style.display = 'none';
  } else if (state.status === 'completed') {
    joinBtn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Ajukan Join Workspace';

    const okCount = state.progress.okCount;
    const failCount = state.progress.failCount;
    const total = state.progress.total;

    progressBox.style.display = 'block';
    progressBox.innerHTML = `
      <div class="progress-title">📊 Selesai</div>
      <div class="status-body">Berhasil: ${okCount} · Gagal: ${failCount} · Total: ${total}</div>
    `;

    if (okCount > 0) {
      showStatus('success', `✓ ${okCount} berhasil`, `${failCount} gagal dari ${total} workspace.`);
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

async function handleStartCollectMultiClick() {
  setMultiAuthButtonsDisabled(true);
  showMultiAuthStatus('success', 'Auto collect dimulai', 'Mengambil daftar workspace dari endpoint accounts/check, lalu exchange session per workspace aktif...');

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
      showMultiAuthStatus('success', 'Download dimulai', `${response.accountCount} account digabung ke convert-auth.json. Kalau file sudah ada, Chrome otomatis membuat nama (1), (2), dan seterusnya.`);
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

    showClearDataStatus('success', 'Data ChatGPT dibersihkan', 'Sekarang tutup tab loop, buka https://chatgpt.com lagi, lalu login ulang jika diminta.');
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
    showAuthStatus('error', 'Folder picker tidak tersedia', 'Pakai tombol Download Instead untuk menyimpan file lewat dialog download Chrome.');
    return;
  }

  setAuthButtonsDisabled(true);
  hideAuthPreview();
  showAuthStatus('success', 'Menunggu folder', 'Pilih folder project extension, lalu auth.json dan convert-auth.json akan dibuat di sana.');

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    showAuthStatus('success', 'Mengambil session', 'Membaca session ChatGPT aktif dari tab yang sedang dibuka...');

    const response = await requestAuthExportPayload();
    if (!response.success) {
      showAuthStatus('error', 'Export gagal', response.error);
      return;
    }

    const authFileName = await writeJsonFile(directoryHandle, 'auth.json', response.authJson);
    const convertAuthFileName = await writeJsonFile(directoryHandle, 'convert-auth.json', response.convertAuthJson);

    renderAuthPreview(response.preview);
    showAuthStatus('success', 'Auth files tersimpan', `Berhasil membuat ${authFileName} dan ${convertAuthFileName} di folder yang dipilih.`);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showAuthStatus('error', 'Export dibatalkan', 'Folder tidak dipilih, jadi tidak ada file yang dibuat.');
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
  showAuthStatus('success', 'Mengambil session', 'Membaca session ChatGPT aktif dari tab yang sedang dibuka...');

  try {
    const response = await requestAuthExportPayload();
    if (!response.success) {
      showAuthStatus('error', 'Download gagal', response.error);
      return;
    }

    await downloadJsonFile('auth.json', response.authJson);
    await downloadJsonFile('convert-auth.json', response.convertAuthJson);

    renderAuthPreview(response.preview);
    showAuthStatus('success', 'Download dimulai', 'File auth.json dan convert-auth.json akan tersimpan ke folder Downloads default Chrome. Kalau sudah ada, Chrome otomatis membuat nama (1), (2), dan seterusnya.');
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
