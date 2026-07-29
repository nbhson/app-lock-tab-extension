// ====================================================
// Tab Lock - Background Service Worker
// ====================================================

const STORAGE_KEY = 'tabLock_passwords';
const LOCKED_TABS_KEY = 'tabLock_lockedTabs';

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

// --- Get the domain from a URL ---
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

// --- Show the lock overlay via content script ---
async function injectLockOverlay(tabId, domain) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_LOCK',
      domain: domain
    });
  } catch (e) {
    // Content script may not be ready yet; retry after a short delay
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_LOCK',
          domain: domain
        });
      } catch (err) {
        console.error('Tab Lock: Could not inject lock overlay:', err);
      }
    }, 300);
  }
}

// --- On navigation complete, check if tab should be locked ---
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only handle main frames
  if (details.frameId !== 0) return;
  
  const domain = getDomain(details.url);
  if (!domain) return;
  
  const locked = await isDomainLocked(domain);
  if (!locked) return;
  
  const tabLocked = await isDomainSessionLocked(domain);
  if (!tabLocked) {
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
  
  const tabLocked = await isDomainSessionLocked(domain);
  if (!tabLocked) {
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
        // Hash the password
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        passwords[domain] = hashHex;
        
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
      
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const valid = hashHex === storedHash;
      
      if (valid) {
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
      }
      
      sendResponse({ valid });
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