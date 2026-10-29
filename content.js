// ====================================================
// Tab Lock - Content Script
// ====================================================

let lockOverlay = null;
let currentDomain = null;
// Timer/interval tracking — phải clear khi overlay bị remove giữa chừng,
// nếu không interval chạy tiếp trên DOM node đã detach (leak + flicker).
let lockTimers = [];

function trackTimer(id, isInterval) {
  lockTimers.push({ id, isInterval });
  return id;
}
function clearLockTimers() {
  for (const t of lockTimers) {
    if (t.isInterval) clearInterval(t.id); else clearTimeout(t.id);
  }
  lockTimers = [];
}

// --- Listen for messages from background ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SHOW_LOCK':
      currentDomain = message.domain;
      showLockOverlay(currentDomain);
      sendResponse({ success: true });
      break;
    case 'UNLOCK':
      hideLockOverlay();
      sendResponse({ success: true });
      break;
  }
});

// --- Remove any existing lock overlay when page unloads ---
window.addEventListener('beforeunload', () => {
  clearLockTimers();
  hideLockOverlay();
});

// --- Create and show the lock overlay ---
function showLockOverlay(domain) {
  // Don't show if already locked
  if (lockOverlay) return;
  
  // Create overlay container
  lockOverlay = document.createElement('div');
  lockOverlay.id = 'tab-lock-overlay';
  lockOverlay.innerHTML = `
    <div id="tab-lock-container">
      <div id="tab-lock-icon">🔒</div>
      <h2 id="tab-lock-title">Tab Locked</h2>
      <div id="tab-lock-domain">${escapeHtml(domain)}</div>
      <p id="tab-lock-message">Nhập mật khẩu để tiếp tục truy cập trang này</p>
      <div id="tab-lock-input-group">
        <input type="password" id="tab-lock-password" placeholder="Nhập mật khẩu" autofocus />
        <button id="tab-lock-unlock-btn">Mở khóa →</button>
      </div>
      <p id="tab-lock-error" style="display:none"></p>
      <p id="tab-lock-attempts" style="display:none"></p>
      <div id="tab-lock-hint">Nhấn Enter để mở khóa • Mật khẩu được lưu cục bộ</div>
    </div>
  `;
  
  // Styles - Improved UX
  const style = document.createElement('style');
  style.textContent = `
    #tab-lock-overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(1200px 600px at 50% -10%, rgba(239,68,68,0.18), transparent 60%), linear-gradient(135deg, #0f0f17 0%, #1a1a2e 50%, #0f3460 100%);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: tl-fadeIn 0.35s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes tl-fadeIn { from { opacity:0 } to { opacity:1 } }
    #tab-lock-container {
      background: rgba(30,30,46,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 36px 32px;
      text-align: center;
      max-width: 380px;
      width: 90%;
      backdrop-filter: blur(16px) saturate(1.1);
      box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset;
      animation: tl-scaleIn 0.4s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes tl-scaleIn { from { opacity:0; transform: scale(0.96) translateY(8px) } to { opacity:1; transform: scale(1) translateY(0) } }
    #tab-lock-icon {
      width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 14px;
      background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.06));
      border: 1px solid rgba(239,68,68,0.18); border-radius: 16px; font-size: 30px;
    }
    #tab-lock-title {
      color: #f8fafc;
      font-size: 22px;
      margin: 0 0 6px 0;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    #tab-lock-domain {
      color: #94a3b8;
      font-size: 12px;
      margin: 0 0 6px 0;
      font-family: ui-monospace, monospace;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); padding: 4px 10px; border-radius: 999px; display: inline-block;
    }
    #tab-lock-message {
      color: rgba(248,250,252,0.72);
      font-size: 14px;
      margin: 16px 0 20px 0;
      line-height: 1.5;
    }
    #tab-lock-input-group {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
    }
    #tab-lock-password {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 12px;
      padding: 12px 14px;
      color: #fff;
      font-size: 14px;
      width: 200px;
      outline: none;
      transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
    }
    #tab-lock-password:focus {
      border-color: rgba(239,68,68,0.40);
      background: rgba(255,255,255,0.08);
      box-shadow: 0 0 0 3px rgba(239,68,68,0.15);
    }
    #tab-lock-password::placeholder { color: rgba(255,255,255,0.32); }
    #tab-lock-unlock-btn {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border: none;
      border-radius: 12px;
      padding: 12px 20px;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
      box-shadow: 0 2px 10px rgba(239,68,68,0.3);
      white-space: nowrap;
    }
    #tab-lock-unlock-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(239,68,68,0.35); }
    #tab-lock-unlock-btn:active { transform: scale(0.98); }
    #tab-lock-unlock-btn:disabled, #tab-lock-password:disabled { opacity: 0.45; cursor: not-allowed; }
    #tab-lock-error {
      margin-top: 14px;
      background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.18); color: #fca5a5;
      padding: 8px 12px; border-radius: 10px; font-size: 13px;
    }
    #tab-lock-attempts {
      margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.45); text-align: center;
    }
    #tab-lock-hint { margin-top: 14px; font-size: 11px; color: rgba(255,255,255,0.35); }
  `;
  document.head.appendChild(style);
  document.body.appendChild(lockOverlay);
  
  // Prevent all user interaction with the page below
  lockOverlay.addEventListener('click', (e) => e.stopPropagation());
  lockOverlay.addEventListener('keydown', (e) => e.stopPropagation());
  
  // Focus the password input
  const input = document.getElementById('tab-lock-password');
  const unlockBtn = document.getElementById('tab-lock-unlock-btn');
  const errorEl = document.getElementById('tab-lock-error');
  const attemptsEl = document.getElementById('tab-lock-attempts');

  if (input) {
    // Auto-focus after a short delay
    trackTimer(setTimeout(() => input.focus(), 100), false);

    // Submit on Enter
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        await attemptUnlock(input, errorEl, attemptsEl);
      }
      e.stopPropagation();
    });

    // Also prevent propagation of regular keyboard events to the page
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
  }

  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      await attemptUnlock(input, errorEl, attemptsEl);
    });
  }
}

// --- Attempt to unlock ---
async function attemptUnlock(input, errorEl, attemptsEl) {
  const password = input.value.trim();
  if (!password) {
    showError(errorEl, 'Please enter a password');
    return;
  }
  if (input.disabled) return; // locked out

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'VERIFY_PASSWORD',
      domain: currentDomain, // TRƯỚC ĐÂY là `domain` — biến không tồn tại →
                             // ReferenceError, unlock KHÔNG BAO GIỜ hoạt động
      password: password
    });

    if (response && response.valid) {
      hideLockOverlay();
    } else if (response && response.error === 'locked' && response.retryAfter) {
      // Rate limited — disable input, show countdown
      showError(errorEl, 'Too many failed attempts');
      showLockout(attemptsEl, response.retryAfter);
      input.value = '';
      input.disabled = true;
      const btn = document.getElementById('tab-lock-unlock-btn');
      if (btn) btn.disabled = true;
    } else {
      showError(errorEl, 'Incorrect password');
      if (attemptsEl) {
        if (typeof response?.attemptsLeft === 'number') {
          showAttempts(attemptsEl, response.attemptsLeft);
        } else {
          attemptsEl.style.display = 'none';
        }
      }
      input.value = '';
      input.focus();
    }
  } catch (e) {
    showError(errorEl, 'Error verifying password');
  }
}

// --- Show error / attempts message ---
function showError(el, message, duration) {
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
    // Clear error timer trước đó (nếu có) — tránh error mới bị timeout cũ
    // ẩn đi ngay lập tức.
    if (el._hideTimer) clearTimeout(el._hideTimer);
    el._hideTimer = trackTimer(setTimeout(() => { el.style.display = 'none'; el._hideTimer = null; }, duration || 3000), false);
  }
}

function showAttempts(el, remaining) {
  if (el) {
    el.textContent = remaining > 0 ? `${remaining} attempt${remaining > 1 ? 's' : ''} remaining` : 'No attempts remaining';
    el.style.display = 'block';
  }
}

function showLockout(el, seconds) {
  if (!el) return;
  el.textContent = `Too many attempts. Try again in ${seconds}s.`;
  el.style.display = 'block';
  el.style.color = 'rgba(251,191,36,0.9)';
  if (el._interval) clearInterval(el._interval); // safety
  const interval = trackTimer(setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(interval);
      el.style.display = 'none';
      el.style.color = '';
      const input = document.getElementById('tab-lock-password');
      if (input) { input.disabled = false; input.focus(); }
      const btn = document.getElementById('tab-lock-unlock-btn');
      if (btn) { btn.disabled = false; }
    } else {
      el.textContent = `Too many attempts. Try again in ${seconds}s.`;
    }
  }, 1000), true);
  el._interval = interval;
}

// --- Hide overlay ---
function hideLockOverlay() {
  clearLockTimers();
  if (lockOverlay) {
    lockOverlay.remove();
    lockOverlay = null;
  }
}

// --- Simple HTML escape ---
// Đủ 5 entities: bản textContent-trick không escape quotes — nếu dữ liệu
// được nội suy vào attribute sẽ breakout được.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}