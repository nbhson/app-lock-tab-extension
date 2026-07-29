# Tab Lock 🔒

A Chrome extension that lets you lock browser tabs with password protection per domain.

## Features

- **🔐 Lock by domain**: Set a password for any website domain
- **🔓 Session-based unlocking**: Once you enter the correct password, the domain stays unlocked until you close the tab/browser
- **⚙️ Settings page**: View and manage all locked domains
- **🔄 Change password**: Update your password anytime
- **🛡️ Secure storage**: Passwords are hashed with SHA-256 before storage

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
| `background.js` | Service worker - handles messaging, storage, navigation events |
| `content.js` | Injected into pages - shows/hides lock overlay |
| `popup.html` / `popup.js` | Extension popup UI |
| `options.html` / `options.js` | Settings page for all domains |
| `icons/` | Extension icons |

## Security Notes

- Passwords are hashed using the Web Crypto API (SHA-256)
- No passwords are sent over the network — everything stays local
- Session unlock state persists only for the current browser session