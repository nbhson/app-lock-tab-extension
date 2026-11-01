# Tab Lock 🔒

[![CI](https://github.com/nbhson/app-lock-tab-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/nbhson/app-lock-tab-extension/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Chrome extension that lets you lock browser tabs with password protection per domain.

## Features

- **🔐 Lock by domain**: Set a password for any website domain
- **🔓 Session-based unlocking**: Once you enter the correct password, the domain stays unlocked until you close the tab/browser
- **⏱️ Auto re-lock**: Optionally re-lock a domain automatically 15m/1h/4h/24h after the last unlock
- **🔒 Lock now**: Re-lock a domain immediately from the popup
- **⚙️ Settings page**: View and manage all locked domains
- **🔄 Change password**: Update your password anytime
- **🛡️ Secure storage**: Passwords are hashed with PBKDF2-SHA256 (150k iterations, per-domain salt) before storage

## How to Use

### Setting a password:
1. Navigate to the website you want to lock
2. Click the Tab Lock icon in the toolbar
3. Enter and confirm your password, click "Set Password & Lock"
4. The page will lock immediately — reload or navigate to see the lock screen

### Unlocking a tab:
1. On a locked page, enter the password in the lock overlay
2. Click "Unlock" or press Enter
3. The domain stays unlocked for the current session (until browser restart)

### Managing passwords:
- Click the extension icon → "⚙️ Manage all domains" to see all locked sites
- Remove passwords or add new ones from the settings page
- Change existing passwords from the popup

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `tab-lock` folder
5. The extension is now installed!

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration |
| `background.js` | Service worker - handles messaging, storage, navigation events, and injects the content script on demand |
| `content.js` | Injected on demand into pages that need the lock screen - shows/hides lock overlay |
| `popup.html` / `popup.js` | Extension popup UI |
| `options.html` / `options.js` | Settings page for all domains |
| `icons/` | Extension icons |

## Permissions

Tab Lock follows a least-privilege model: it does **not** have access to all
sites by default.

| Permission | Why it's needed |
|------------|-----------------|
| `storage` | Store password hashes (PBKDF2), lock state and settings locally |
| `tabs` | Read tab URLs to match a tab to its locked domain |
| `webNavigation` | Detect page loads to re-show the lock screen after a reload |
| `alarms` | Schedule auto re-lock timers |
| `scripting` | Inject the lock-screen content script into a tab on demand (`chrome.scripting.executeScript`) |
| `activeTab` | Temporary access to the tab you invoked the extension on (e.g. clicking the popup) |

**Host access** (`*://*/*`) is an *optional* permission: it is requested
per-domain (`*://example.com/*`) when you lock that domain from the popup or
settings page. Chrome shows a permission prompt the first time; the grant
persists so the lock screen keeps reappearing after page reloads. If you
decline, the domain is still saved but the lock screen cannot be displayed —
the popup shows a banner with a "Cấp quyền" (Grant access) button so you can
grant it later.

## Security Notes

- Passwords are hashed with PBKDF2-SHA256 (150,000 iterations, per-domain random salt) via the Web Crypto API
- No passwords are sent over the network — everything stays local
- Session unlock state persists only for the current browser session (stored in `chrome.storage.session` where available)