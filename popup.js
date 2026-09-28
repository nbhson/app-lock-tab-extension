// Tab Lock - Popup Script v2 (Improved UX)
let currentDomain = '';

document.addEventListener('DOMContentLoaded', async () => {
  const noTabEl = document.getElementById('no-tab');
  const mainEl = document.getElementById('main-content');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
    noTabEl.classList.remove('hidden');
    mainEl.classList.add('hidden');
    return;
  }

  try {
    const url = new URL(tab.url);
    if (!url.hostname) throw new Error('no hostname');
    currentDomain = url.hostname;
  } catch {
    noTabEl.classList.remove('hidden');
    mainEl.classList.add('hidden');
    return;
  }

  noTabEl.classList.add('hidden');
  mainEl.classList.remove('hidden');

  document.getElementById('domain-text').textContent = currentDomain;
  document.getElementById('current-domain-display').textContent = currentDomain;
  // favicon letter
  const fav = document.getElementById('favicon');
  if (fav) fav.textContent = currentDomain.charAt(0).toUpperCase();

  await refreshStatus();
  setupUXEnhancements();
});

// UX: show/hide, strength, enter keys
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

  // Set password
  document.getElementById('btn-set-password').addEventListener('click', handleSetPassword);
  document.getElementById('btn-unlock').addEventListener('click', handleUnlock);
  document.getElementById('btn-remove-password').addEventListener('click', handleRemove);
  document.getElementById('btn-change-password').addEventListener('click', handleChange);
  document.getElementById('open-options').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
}

async function handleSetPassword() {
  const newPass = document.getElementById('new-password').value;
  const confirmPass = document.getElementById('confirm-password').value;
  if (!newPass) return showMessage('Vui lòng nhập mật khẩu', 'error');
  if (newPass.length < 4) return showMessage('Mật khẩu phải ≥ 4 ký tự', 'error');
  if (newPass !== confirmPass) return showMessage('Mật khẩu không khớp', 'error');
  const btn = document.getElementById('btn-set-password');
  btn.disabled = true; btn.textContent = 'Đang lưu...';
  await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', domain: currentDomain, password: newPass });
  showMessage('Đã đặt mật khẩu!', 'success');
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  const bar = document.getElementById('strength-bar'); if (bar) bar.className = 'strength-bar';
  document.getElementById('strength-text').textContent = '';
  btn.disabled = false; btn.textContent = '🔐 Set Password & Lock';
  await refreshStatus();
}

async function handleUnlock() {
  const password = document.getElementById('unlock-password').value;
  if (!password) return showMessage('Vui lòng nhập mật khẩu', 'error');
  const btn = document.getElementById('btn-unlock');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Đang kiểm tra...';
  const response = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', domain: currentDomain, password });
  if (response && response.valid) {
    showMessage('Đã mở khóa cho phiên này!', 'success');
    document.getElementById('unlock-password').value = '';
    await refreshStatus();
  } else {
    showMessage('Sai mật khẩu', 'error');
  }
  btn.disabled = false; btn.textContent = orig;
}

async function handleRemove() {
  if (!confirm(`Gỡ mật khẩu cho ${currentDomain}?`)) return;
  await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', domain: currentDomain, password: '' });
  showMessage('Đã gỡ mật khẩu', 'success');
  await refreshStatus();
}

async function handleChange() {
  const currentPass = document.getElementById('change-current-password').value;
  const newPass = document.getElementById('change-new-password').value;
  const confirmPass = document.getElementById('change-confirm-password').value;
  if (!currentPass || !newPass) return showMessage('Vui lòng điền đầy đủ', 'error');
  if (newPass.length < 4) return showMessage('Mật khẩu mới ≥ 4 ký tự', 'error');
  if (newPass !== confirmPass) return showMessage('Mật khẩu mới không khớp', 'error');
  const verifyResponse = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', domain: currentDomain, password: currentPass });
  if (!verifyResponse || !verifyResponse.valid) return showMessage('Mật khẩu hiện tại sai', 'error');
  await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', domain: currentDomain, password: newPass });
  showMessage('Đã đổi mật khẩu!', 'success');
  document.getElementById('change-current-password').value = '';
  document.getElementById('change-new-password').value = '';
  document.getElementById('change-confirm-password').value = '';
  await refreshStatus();
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_LOCK_STATUS', domain: currentDomain });
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const chip = document.getElementById('status-chip');
  const sectionSet = document.getElementById('section-set-password');
  const sectionManage = document.getElementById('section-manage-password');
  const sectionChange = document.getElementById('section-change-password');

  if (response && response.hasPassword) {
    sectionSet.classList.add('hidden');
    sectionManage.classList.remove('hidden');
    if (sectionChange) sectionChange.style.display = 'flex';
    const sessionResponse = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION', domain: currentDomain });
    if (sessionResponse && !sessionResponse.locked) {
      dot.className = 'status-dot unlocked';
      text.textContent = '🔓 Unlocked (this session)';
      chip.textContent = 'Unlocked';
      chip.className = 'status-chip unlocked';
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
