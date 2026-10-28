// ====================================================
// Tab Lock - Background Service Worker
// ====================================================

const STORAGE_KEY = 'tabLock_passwords';
const LOCKED_TABS_KEY = 'tabLock_lockedTabs';
const ATTEMPTS_KEY = 'tabLock_attempts'; // { [domain]: { count, lockUntil, lockDuration } }
const MAX_ATTEMPTS = 5;
const INITIAL_LOCK_MS = 30_000;
const MAX_LOCK_MS = 300_000;

// In-memory tracking for overlay injection attempts per tab.
// Max 3 injection attempts per tab before giving up.
const _tabInjectionAttempts = new Map(); // tabId → { attempts, retryTimer }
const MAX_INJECTION_ATTEMPTS = 3;

// --- Password hashing ---
// PBKDF2-SHA256 + salt ngẫu nhiên per-domain (trước đây là SHA-256 trần:
// không salt, hash nhanh → rainbow-table/brute-force offline khi storage
// bị đọc; SHA-256 trần của password yếu bị bẻ trong giây lát).
const PBKDF2_ITERATIONS = 150_000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveHash(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// Verify: hỗ trợ cả bản ghi cũ (plain sha256 hex, không salt — migrate khi
// user set lại password) lẫn bản mới (salt:hash).
async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [saltHex, hashHex] = stored.split(':');
    const { hash } = await deriveHash(password, saltHex);
    return timingSafeEqual(hash, hashHex);
  }
  // Legacy format: SHA-256 trần
  const enc = new TextEncoder();
  const legacy = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return toHex(legacy) === stored;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Initialize default data ---
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: {} });
  }
  const locked = await chrome.storage.local.get(LOCKED_TABS_KEY);
  if (!locked[LOCKED_TABS_KEY]) {
    await chrome.storage.local.set({ [LOCKED_TABS_KEY]: {} });
  }
});

// --- Get domain from URL ---
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// --- Check if a domain is locked ---
async function isDomainLocked(domain) {
  if (!domain) return false;
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const passwords = data[STORAGE_KEY] || {};
  return !!passwords[domain];
}

// --- Check if a domain is currently locked (session) ---
// If no session state exists for the domain, it's considered locked by default
async function isDomainSessionLocked(domain) {
  const data = await chrome.storage.local.get(LOCKED_TABS_KEY);
  const lockedTabs = data[LOCKED_TABS_KEY] || {};
  // If the domain is not in the map, it's locked by default (undefined !== false)
  return lockedTabs[domain] !== false;
}

// --- Rate limiting helpers ---
async function getAttempts(domain) {
  const data = await chrome.storage.local.get(ATTEMPTS_KEY);
  const attempts = data[ATTEMPTS_KEY] || {};
  return attempts[domain] || null;
}
async function setAttempts(domain, val) {
  const data = await chrome.storage.local.get(ATTEMPTS_KEY);
  const attempts = data[ATTEMPTS_KEY] || {};
  if (val === null) {
    delete attempts[domain];
  } else {
    attempts[domain] = val;
  }
  await chrome.storage.local.set({ [ATTEMPTS_KEY]: attempts });
}
async function isDomainRateLocked(domain) {
  const a = await getAttempts(domain);
  if (!a || !a.lockUntil) return null; // no lock active
  if (Date.now() < a.lockUntil) return a;
  return null; // lock expired
}
async function recordWrongAttempt(domain) {
  const a = await getAttempts(domain);
  const count = (a?.count || 0) + 1;
  if (count >= MAX_ATTEMPTS) {
    // First lockout is 30s, doubling each time, capped at 5 minutes.
    const prev = a?.lockDuration ? a.lockDuration : INITIAL_LOCK_MS / 2;
    const lockDuration = Math.min(prev * 2, MAX_LOCK_MS);
    await setAttempts(domain, { count: 0, lockUntil: Date.now() + lockDuration, lockDuration });
  } else {
    await setAttempts(domain, { count, lockUntil: a?.lockUntil, lockDuration: a?.lockDuration || INITIAL_LOCK_MS });
  }
}
async function clearAttempts(domain) { await setAttempts(domain, null); }

// --- Show the lock overlay via content script (with capped retries) ---
async function injectLockOverlay(tabId, domain) {
  const entry = _tabInjectionAttempts.get(tabId) || { attempts: 0, retryTimer: null };
  if (entry.attempts >= MAX_INJECTION_ATTEMPTS) return;
  entry.attempts++;
  _tabInjectionAttempts.set(tabId, entry);

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_LOCK',
      domain: domain
    });
  } catch (e) {
    // Content script may not be ready yet; retry once after a short delay
    if (entry.attempts < MAX_INJECTION_ATTEMPTS && !entry.retryTimer) {
      entry.retryTimer = setTimeout(async () => {
        entry.retryTimer = null;
        _tabInjectionAttempts.set(tabId, entry);
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_LOCK',
            domain: domain
          });
        } catch (err) {
          console.error('Tab Lock: Could not inject lock overlay:', err);
        }
      }, 300);
    } else {
      console.error('Tab Lock: Could not inject lock overlay:', e);
    }
  }
}

// Clear injection tracking when tab closes
chrome.tabs.onRemoved.addListener(tabId => _tabInjectionAttempts.delete(tabId));

// --- On navigation complete, check if tab should be locked ---
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only handle main frames
  if (details.frameId !== 0) return;
  
  const domain = getDomain(details.url);
  if (!domain) return;
  
  const locked = await isDomainLocked(domain);
  if (!locked) return;
  
  const sessionLocked = await isDomainSessionLocked(domain);
  if (sessionLocked) {
    await injectLockOverlay(details.tabId, domain);
  }
});

// Also listen for tab updates (e.g. SPA navigations)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  
  const domain = getDomain(tab.url);
  if (!domain) return;
  
  const locked = await isDomainLocked(domain);
  if (!locked) return;
  
  const sessionLocked = await isDomainSessionLocked(domain);
  if (sessionLocked) {
    await injectLockOverlay(tabId, domain);
  }
});

// --- Listen for messages from content script / popup ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = {
    // Popup: get lock status for a domain
    async 'GET_LOCK_STATUS'() {
      const domain = message.domain;
      const locked = await isDomainLocked(domain);
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const passwords = data[STORAGE_KEY] || {};
      sendResponse({ locked, hasPassword: !!passwords[domain] });
    },
    
    // Popup: set password for domain
    async 'SET_PASSWORD'() {
      const { domain, password } = message;
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const passwords = data[STORAGE_KEY] || {};
      
      if (password) {
        // Hash the password (PBKDF2 + per-domain salt)
        const { hash, salt } = await deriveHash(password);
        passwords[domain] = `${salt}:${hash}`;
        
        // Lock the session for this domain immediately
        const lockedData = await chrome.storage.local.get(LOCKED_TABS_KEY);
        const lockedTabs = lockedData[LOCKED_TABS_KEY] || {};
        delete lockedTabs[domain]; // Remove unlock state so it becomes locked by default
        await chrome.storage.local.set({ [LOCKED_TABS_KEY]: lockedTabs });
        
        // Inject lock overlay on all open tabs with this domain
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url) {
            try {
              const tabDomain = getDomain(tab.url);
              if (tabDomain === domain) {
                await injectLockOverlay(tab.id, domain);
              }
            } catch (e) {
              // Tab might not be accessible
            }
          }
        }
      } else {
        delete passwords[domain];
        // Also clear session lock for this domain
        const lockedData = await chrome.storage.local.get(LOCKED_TABS_KEY);
        const lockedTabs = lockedData[LOCKED_TABS_KEY] || {};
        delete lockedTabs[domain];
        await chrome.storage.local.set({ [LOCKED_TABS_KEY]: lockedTabs });
      }
      
      await chrome.storage.local.set({ [STORAGE_KEY]: passwords });
      sendResponse({ success: true });
    },
    
    // Popup: get all stored passwords (domains only, not hashes)
    async 'GET_ALL_DOMAINS'() {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const passwords = data[STORAGE_KEY] || {};
      const domains = Object.keys(passwords);
      sendResponse({ domains });
    },
    
    // Content script: verify password
    async 'VERIFY_PASSWORD'() {
      const { domain, password } = message;
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const passwords = data[STORAGE_KEY] || {};
      const storedHash = passwords[domain];

      if (!storedHash) {
        sendResponse({ valid: false, error: 'No password set for this domain' });
        return;
      }

      // Check rate lock
      const lock = await isDomainRateLocked(domain);
      if (lock) {
        const retryAfter = Math.ceil((lock.lockUntil - Date.now()) / 1000);
        sendResponse({ valid: false, error: 'locked', retryAfter, attemptsLeft: 0 });
        return;
      }

      const valid = await verifyPassword(password, storedHash);

      if (valid) {
        await clearAttempts(domain);

        // Mark this tab as unlocked for the session
        const lockedData = await chrome.storage.local.get(LOCKED_TABS_KEY);
        const lockedTabs = lockedData[LOCKED_TABS_KEY] || {};
        lockedTabs[domain] = false; // false = unlocked
        await chrome.storage.local.set({ [LOCKED_TABS_KEY]: lockedTabs });

        // Tell the tab to unlock
        if (sender.tab && sender.tab.id) {
          try {
            await chrome.tabs.sendMessage(sender.tab.id, { type: 'UNLOCK' });
          } catch (e) {
            // Tab might have been closed
          }
        }
        sendResponse({ valid });
      } else {
        const a = await getAttempts(domain);
        const count = (a?.count || 0) + 1;
        const remaining = Math.max(0, MAX_ATTEMPTS - count);
        await recordWrongAttempt(domain);
        sendResponse({ valid: false, attemptsLeft: remaining, error: 'Incorrect password' });
      }
    },
    
    // Popup: unlock a specific tab temporarily
    async 'UNLOCK_DOMAIN'() {
      const { domain } = message;
      const lockedData = await chrome.storage.local.get(LOCKED_TABS_KEY);
      const lockedTabs = lockedData[LOCKED_TABS_KEY] || {};
      lockedTabs[domain] = false;
      await chrome.storage.local.set({ [LOCKED_TABS_KEY]: lockedTabs });
      sendResponse({ success: true });
    },
    
    // Popup: re-lock a domain
    async 'LOCK_DOMAIN'() {
      const { domain } = message;
      const lockedData = await chrome.storage.local.get(LOCKED_TABS_KEY);
      const lockedTabs = lockedData[LOCKED_TABS_KEY] || {};
      lockedTabs[domain] = true;
      await chrome.storage.local.set({ [LOCKED_TABS_KEY]: lockedTabs });
      sendResponse({ success: true });
    },
    
    // Content script: check lock state when injected
    async 'CHECK_SESSION'() {
      const domain = message.domain;
      const tabLocked = await isDomainSessionLocked(domain);
      sendResponse({ locked: tabLocked !== false });
    }
  };
  
  const action = handler[message.type];
  if (action) {
    action();
    return true; // Keep message channel open for async response
  }
});