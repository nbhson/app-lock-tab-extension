// ====================================================
// Tab Lock - Content Script
// ====================================================

let lockOverlay = null;
let currentDomain = null;

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
      <p id="tab-lock-domain">${escapeHtml(domain)}</p>
      <p id="tab-lock-message">Enter password to access this site</p>
      <div id="tab-lock-input-group">
        <input type="password" id="tab-lock-password" placeholder="Enter password" autofocus />
        <button id="tab-lock-unlock-btn">Unlock</button>
      </div>
      <p id="tab-lock-error" style="display:none;color:#e74c3c;font-size:14px;"></p>
    </div>
  `;
  
  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #tab-lock-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #tab-lock-container {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 48px;
      text-align: center;
      max-width: 400px;
      width: 90%;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    #tab-lock-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }
    #tab-lock-title {
      color: #fff;
      font-size: 28px;
      margin: 0 0 8px 0;
      font-weight: 600;
    }
    #tab-lock-domain {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      margin: 0 0 24px 0;
      font-family: monospace;
    }
    #tab-lock-message {
      color: rgba(255, 255, 255, 0.7);
      font-size: 16px;
      margin: 0 0 24px 0;
    }
    #tab-lock-input-group {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    #tab-lock-password {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 12px 16px;
      color: #fff;
      font-size: 16px;
      width: 200px;
      outline: none;
      transition: border-color 0.2s;
    }
    #tab-lock-password:focus {
      border-color: #e74c3c;
    }
    #tab-lock-password::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
    #tab-lock-unlock-btn {
      background: #e74c3c;
      border: none;
      border-radius: 10px;
      padding: 12px 24px;
      color: #fff;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    #tab-lock-unlock-btn:hover {
      background: #c0392b;
    }
    #tab-lock-error {
      margin-top: 16px;
    }
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
  
  if (input) {
    // Auto-focus after a short delay
    setTimeout(() => input.focus(), 100);
    
    // Submit on Enter
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        await attemptUnlock(input, errorEl, domain);
      }
      e.stopPropagation();
    });
    
    // Also prevent propagation of regular keyboard events to the page
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
  }
  
  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      await attemptUnlock(input, errorEl, domain);
    });
  }
}

// --- Attempt to unlock ---
async function attemptUnlock(input, errorEl, domain) {
  const password = input.value.trim();
  if (!password) {
    showError(errorEl, 'Please enter a password');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'VERIFY_PASSWORD',
      domain: domain,
      password: password
    });
    
    if (response && response.valid) {
      hideLockOverlay();
    } else {
      showError(errorEl, 'Incorrect password');
      input.value = '';
      input.focus();
    }
  } catch (e) {
    showError(errorEl, 'Error verifying password');
  }
}

// --- Show error message ---
function showError(el, message) {
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

// --- Hide overlay ---
function hideLockOverlay() {
  if (lockOverlay) {
    lockOverlay.remove();
    lockOverlay = null;
  }
}

// --- Simple HTML escape ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}