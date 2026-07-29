// ====================================================
// Tab Lock - Options Page Script
// ====================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadDomains();

  // --- Add domain ---
  document.getElementById('btn-add-domain').addEventListener('click', async () => {
    const domain = document.getElementById('new-domain').value.trim().toLowerCase();
    const password = document.getElementById('new-domain-password').value;
    const confirm = document.getElementById('new-domain-confirm').value;

    // Validate domain format
    if (!domain) {
      showMessage('Please enter a domain', 'error');
      return;
    }

    // Remove protocol and path if user pasted full URL
    let cleanDomain = domain;
    try {
      if (domain.startsWith('http://') || domain.startsWith('https://')) {
        cleanDomain = new URL(domain).hostname;
      }
    } catch {
      // Keep as-is
    }

    if (!cleanDomain.includes('.')) {
      showMessage('Please enter a valid domain (e.g., example.com)', 'error');
      return;
    }

    if (!password || password.length < 4) {
      showMessage('Password must be at least 4 characters', 'error');
      return;
    }
    if (password !== confirm) {
      showMessage('Passwords do not match', 'error');
      return;
    }

    await chrome.runtime.sendMessage({
      type: 'SET_PASSWORD',
      domain: cleanDomain,
      password: password
    });

    showMessage(`Domain "${cleanDomain}" locked successfully!`, 'success');
    document.getElementById('new-domain').value = '';
    document.getElementById('new-domain-password').value = '';
    document.getElementById('new-domain-confirm').value = '';
    await loadDomains();
  });

  // --- Back link ---
  document.getElementById('back-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });
});

// --- Load all locked domains ---
async function loadDomains() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOMAINS' });
  const list = document.getElementById('domains-list');
  const emptyState = document.getElementById('empty-state');

  if (!response || !response.domains || response.domains.length === 0) {
    list.innerHTML = '';
    list.appendChild(emptyState);
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  list.innerHTML = '';

  response.domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `
      <span class="domain-name">🔒 ${domain}</span>
      <div class="domain-actions">
        <button class="btn btn-danger" data-domain="${domain}">Remove</button>
      </div>
    `;
    list.appendChild(item);
  });

  // Add event listeners to remove buttons
  document.querySelectorAll('.btn-danger[data-domain]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      if (!confirm(`Remove password for "${domain}"?`)) return;

      await chrome.runtime.sendMessage({
        type: 'SET_PASSWORD',
        domain: domain,
        password: ''
      });

      showMessage(`Password removed for "${domain}"`, 'success');
      await loadDomains();
    });
  });
}

// --- Show message ---
function showMessage(msg, type) {
  const el = document.getElementById('message');
  el.textContent = msg;
  el.className = 'message ' + type;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}