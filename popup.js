// Tab Lock - Popup Script v3 (Round 2)
// - sendMsg() wrapper: mọi sendMessage qua 1 chỗ, lỗi SW không treo button
// - Hiện lockout countdown khi bị rate-limit
// - "Lock now" + auto re-lock countdown
let currentDomain = '';
// Countdown cho auto re-lock (interval ref) và lockout (interval ref)
let relockTimer = null;
let lockoutTimer = null;

function stopRelockTimer() {
  if (relockTimer) { clearInterval(relockTimer); relockTimer = null; }
}
function stopLockoutTimer() {
  if (lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null; }
}

// Wrapper: sendMessage có lỗi rõ ràng thay vì unhandled rejection.
// Button chỉ được re-enable trong finally của caller.
async function sendMsg(message) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
    if (!res) throw new Error('Không nhận được phản hồi từ service worker — thử lại.');
    return res;
  } catch (e) {
    throw new Error(e?.message || 'Không liên lạc được service worker — thử lại.');
  }
}

async function withButton(btn, busyText, fn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const noTabEl = document.getElementById('no-tab');
  const mainEl = document.getElementById('main-content');

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch { tab = null; }

  // Restricted pages: không có hostname hợp lệ → hiện empty-state
  let hostname = null;
  try {
    const url = new URL(tab?.url || '');
    if (/^(https?:)$/.test(url.protocol) && url.hostname) hostname = url.hostname;
  } catch { hostname = null; }

  if (!hostname) {
    noTabEl.classList.remove('hidden');
    mainEl.classList.add('hidden');
    return;
  }

  currentDomain = hostname;
  noTabEl.classList.add('hidden');
  mainEl.classList.remove('hidden');

  document.getElementById('domain-text').textContent = currentDomain;
  document.getElementById('current-domain-display').textContent = currentDomain;
  // favicon letter
  const fav = document.getElementById('favicon');
  if (fav) fav.textContent = currentDomain.charAt(0).toUpperCase();

  setupUXEnhancements();
  await refreshStatus();
});

// UX: show/hide, strength, enter keys, listeners
function setupUXEnhancements() {
  // toggle visibility
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isPass = target.type === 'password';
      target.type = isPass ? 'text' : 'password';
      btn.textContent = isPass ? '🙈' : '👁️';
      btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  });

  // strength meter for new-password
  const newPassInput = document.getElementById('new-password');
  const bar = document.getElementById('strength-bar');
  const txt = document.getElementById('strength-text');
  if (newPassInput && bar) {
    newPassInput.addEventListener('input', () => {
      const v = newPassInput.value;
      bar.className = 'strength-bar';
      if (!v) { txt.textContent = ''; return; }
      if (v.length < 4) { bar.classList.add('strength-weak'); txt.textContent = 'Yếu'; txt.style.color = '#ef4444'; }
      else if (v.length < 8) { bar.classList.add('strength-mid'); txt.textContent = 'Trung bình'; txt.style.color = '#f59e0b'; }
      else { bar.classList.add('strength-strong'); txt.textContent = 'Mạnh'; txt.style.color = '#22c55e'; }
    });
  }

  // Enter key handlers
  const bindEnter = (inputId, btnId) => {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (input && btn) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); }});
  };
  bindEnter('new-password', 'btn-set-password');
  bindEnter('confirm-password', 'btn-set-password');
  bindEnter('unlock-password', 'btn-unlock');
  bindEnter('change-confirm-password', 'btn-change-password');

  // Buttons
  document.getElementById('btn-set-password').addEventListener('click', handleSetPassword);
  document.getElementById('btn-unlock').addEventListener('click', handleUnlock);
  document.getElementById('btn-remove-password').addEventListener('click', handleRemove);
  document.getElementById('btn-change-password').addEventListener('click', handleChange);
  document.getElementById('btn-lock-now').addEventListener('click', handleLockNow);
  document.getElementById('open-options').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  // Auto re-lock selector
  const select = document.getElementById('autolock-select');
  if (select) {
    select.addEventListener('change', async () => {
      const ms = Number(select.value);
      try {
        const res = await sendMsg({ type: 'SET_AUTOLOCK', autoLockMs: ms });
        if (!res.success) throw new Error(res.error || 'Không lưu được cài đặt');
        showMessage(ms === 0 ? 'Đã tắt auto re-lock' : 'Auto re-lock: ' + humanDuration(ms), 'success');
        await refreshStatus();
      } catch (e) {
        showMessage(e.message, 'error');
      }
    });
  }
}

function humanDuration(ms) {
  if (ms % 3_600_000 === 0) return (ms / 3_600_000) + ' giờ';
  return (ms / 60_000) + ' phút';
}

// --- Handlers: mọi handler dùng sendMsg + try/catch để không treo button ---

async function handleSetPassword() {
  const newPass = document.getElementById('new-password').value;
  const confirmPass = document.getElementById('confirm-password').value;
  if (!newPass) return showMessage('Vui lòng nhập mật khẩu', 'error');
  if (newPass.length < 4) return showMessage('Mật khẩu phải ≥ 4 ký tự', 'error');
  if (newPass !== confirmPass) return showMessage('Mật khẩu không khớp', 'error');
  const btn = document.getElementById('btn-set-password');
  await withButton(btn, 'Đang lưu...', async () => {
    try {
      await sendMsg({ type: 'SET_PASSWORD', domain: currentDomain, password: newPass });
      showMessage('Đã đặt mật khẩu!', 'success');
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      const bar = document.getElementById('strength-bar'); if (bar) bar.className = 'strength-bar';
      document.getElementById('strength-text').textContent = '';
      await refreshStatus();
    } catch (e) {
      showMessage(e.message, 'error');
    }
  });
}

async function handleUnlock() {
  const password = document.getElementById('unlock-password').value;
  if (!password) return showMessage('Vui lòng nhập mật khẩu', 'error');
  const btn = document.getElementById('btn-unlock');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang kiểm tra...';
  let lockout = false;
  try {
    const response = await sendMsg({ type: 'VERIFY_PASSWORD', domain: currentDomain, password });
    if (response && response.valid) {
      showMessage('Đã mở khóa cho phiên này!', 'success');
      document.getElementById('unlock-password').value = '';
      await refreshStatus();
    } else if (response && response.error === 'locked' && response.retryAfter) {
      lockout = true;
      showPopupLockout(response.retryAfter);
    } else {
      const left = typeof response?.attemptsLeft === 'number' && response.attemptsLeft > 0
        ? ` (còn ${response.attemptsLeft} lần thử)` : '';
      showMessage('Sai mật khẩu' + left, 'error');
    }
  } catch (e) {
    showMessage(e.message, 'error');
  } finally {
    btn.disabled = lockout; // nếu đang lockout thì giữ disabled
    btn.textContent = orig;
  }
}

// Rate-limited: countdown trong popup, khóa input + button tới khi hết
function showPopupLockout(seconds) {
  const btn = document.getElementById('btn-unlock');
  const input = document.getElementById('unlock-password');
  const el = document.getElementById('message');
  stopLockoutTimer();
  if (btn) btn.disabled = true;
  if (input) input.disabled = true;
  const tick = () => {
    if (seconds <= 0) {
      stopLockoutTimer();
      if (btn) btn.disabled = false;
      if (input) { input.disabled = false; input.focus(); }
      showMessage('Có thể thử lại bây giờ', 'success');
      return;
    }
    el.className = 'message error';
    el.style.display = 'flex';
    el.textContent = '⏳ Quá nhiều lần thử sai. Thử lại sau ' + seconds + 's';
    seconds--;
  };
  tick();
  lockoutTimer = setInterval(tick, 1000);
}

async function handleRemove() {
  if (!confirm(`Gỡ mật khẩu cho ${currentDomain}?`)) return;
  const btn = document.getElementById('btn-remove-password');
  await withButton(btn, 'Đang gỡ...', async () => {
    try {
      await sendMsg({ type: 'SET_PASSWORD', domain: currentDomain, password: '' });
      showMessage('Đã gỡ mật khẩu', 'success');
      await refreshStatus();
    } catch (e) {
      showMessage(e.message, 'error');
    }
  });
}

async function handleChange() {
  const currentPass = document.getElementById('change-current-password').value;
  const newPass = document.getElementById('change-new-password').value;
  const confirmPass = document.getElementById('change-confirm-password').value;
  if (!currentPass || !newPass) return showMessage('Vui lòng điền đầy đủ', 'error');
  if (newPass.length < 4) return showMessage('Mật khẩu mới ≥ 4 ký tự', 'error');
  if (newPass !== confirmPass) return showMessage('Mật khẩu mới không khớp', 'error');
  const btn = document.getElementById('btn-change-password');
  await withButton(btn, 'Đang đổi...', async () => {
    try {
      const verifyResponse = await sendMsg({ type: 'VERIFY_PASSWORD', domain: currentDomain, password: currentPass });
      if (!verifyResponse || !verifyResponse.valid) {
        showMessage('Mật khẩu hiện tại sai', 'error');
        return;
      }
      await sendMsg({ type: 'SET_PASSWORD', domain: currentDomain, password: newPass });
      showMessage('Đã đổi mật khẩu!', 'success');
      document.getElementById('change-current-password').value = '';
      document.getElementById('change-new-password').value = '';
      document.getElementById('change-confirm-password').value = '';
      await refreshStatus();
    } catch (e) {
      showMessage(e.message, 'error');
    }
  });
}

// "Lock now": khóa lại domain ngay lập tức (overlay đổ lại các tab đang mở)
async function handleLockNow() {
  const btn = document.getElementById('btn-lock-now');
  await withButton(btn, 'Đang khóa...', async () => {
    try {
      await sendMsg({ type: 'LOCK_DOMAIN', domain: currentDomain });
      showMessage('Đã khóa lại domain', 'success');
      await refreshStatus();
    } catch (e) {
      showMessage(e.message, 'error');
    }
  });
}

// --- Status + auto re-lock countdown ---
async function refreshStatus() {
  stopRelockTimer();
  let response;
  try {
    response = await sendMsg({ type: 'GET_LOCK_STATUS', domain: currentDomain });
  } catch (e) {
    showMessage(e.message, 'error');
    return;
  }

  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const chip = document.getElementById('status-chip');
  const sectionSet = document.getElementById('section-set-password');
  const sectionManage = document.getElementById('section-manage-password');
  const sectionChange = document.getElementById('section-change-password');
  const lockNowRow = document.getElementById('lock-now-row');
  const select = document.getElementById('autolock-select');

  // Auto-lock selector (chỉ set nếu user chưa đổi trong phiên mở popup này)
  if (select && response && document.activeElement !== select) {
    select.value = String(response.autoLockMs || 0);
  }

  if (!response) {
    dot.className = 'status-dot no-password';
    text.textContent = 'Không đọc được trạng thái';
    return;
  }

  if (response.hasPassword) {
    sectionSet.classList.add('hidden');
    sectionManage.classList.remove('hidden');
    if (sectionChange) sectionChange.style.display = 'flex';
    if (lockNowRow) lockNowRow.classList.remove('hidden');

    if (!response.sessionLocked) {
      dot.className = 'status-dot unlocked';
      chip.textContent = 'Unlocked';
      chip.className = 'status-chip unlocked';
      // Auto re-lock countdown (nếu bật)
      if (response.autoLockMs > 0 && response.unlockedAt) {
        const deadline = response.unlockedAt + response.autoLockMs;
        const tick = () => {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            stopRelockTimer();
            text.textContent = '⏳ Auto re-locked';
            refreshStatus();
            return;
          }
          const totalSec = Math.ceil(remainingMs / 1000);
          const m = Math.floor(totalSec / 60);
          const s = totalSec % 60;
          text.textContent = `🔓 Unlocked • khóa lại sau ${m}m ${String(s).padStart(2, '0')}s`;
        };
        tick();
        relockTimer = setInterval(tick, 1000);
      } else {
        text.textContent = '🔓 Unlocked (this session)';
      }
    } else {
      dot.className = 'status-dot locked';
      text.textContent = '🔒 Locked';
      chip.textContent = 'Locked';
      chip.className = 'status-chip locked';
    }
  } else {
    sectionSet.classList.remove('hidden');
    sectionManage.classList.add('hidden');
    if (sectionChange) sectionChange.style.display = 'none';
    if (lockNowRow) lockNowRow.classList.add('hidden');
    dot.className = 'status-dot no-password';
    text.textContent = '⚠️ No password set';
    chip.textContent = 'No password';
    chip.className = 'status-chip no-password';
  }
}

function showMessage(msg, type) {
  const el = document.getElementById('message');
  el.textContent = (type === 'success' ? '✅ ' : '⚠️ ') + msg;
  el.className = 'message ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'message'; el.textContent = ''; }, 3200);
}
