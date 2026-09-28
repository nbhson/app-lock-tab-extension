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

let allDomains = [];

// --- Load all locked domains ---
async function loadDomains() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOMAINS' });
  const list = document.getElementById('domains-list');
  const emptyState = document.getElementById('empty-state');
  const countBadge = document.getElementById('count-badge');
  const statCount = document.getElementById('stat-count');

  allDomains = (response && response.domains) ? response.domains : [];
  if (countBadge) countBadge.textContent = allDomains.length;
  if (statCount) statCount.textContent = allDomains.length;

  renderDomains(allDomains);
}

function renderDomains(domains) {
  const list = document.getElementById('domains-list');
  const emptyState = document.getElementById('empty-state');
  const filter = (document.getElementById('search')?.value || '').toLowerCase().trim();
  const filtered = filter ? domains.filter(d => d.toLowerCase().includes(filter)) : domains;

  if (domains.length === 0) {
    list.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.innerHTML = `<div class="icon">🔓</div><h3>No domains locked yet</h3><p>Add a domain above to protect it with a password. Each domain is locked per session.</p>`;
    return;
  }
  if (filtered.length === 0) {
    list.innerHTML = '';
    emptyState.style.display = 'block';
    emptyState.innerHTML = `<div class="icon">🔍</div><h3>No results</h3><p>No domains match “${escapeHtml(filter)}”</p>`;
    return;
  }

  emptyState.style.display = 'none';
  list.innerHTML = '';

  filtered.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'domain-item';
    const letter = domain.charAt(0).toUpperCase();
    item.innerHTML = `
      <div class="domain-left">
        <div class="domain-icon">${letter}</div>
        <div>
          <div class="domain-name">${escapeHtml(domain)}</div>
          <div class="domain-meta">🔒 Password protected • session unlock</div>
        </div>
      </div>
      <div class="domain-actions">
        <button class="btn btn-danger" data-domain="${domain}">Remove</button>
      </div>
    `;
    list.appendChild(item);
  });

  document.querySelectorAll('.btn-danger[data-domain]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      if (!confirm(`Remove password for "${domain}"?`)) return;
      await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', domain, password: '' });
      showMessage(`Removed "${domain}"`, 'success');
      await loadDomains();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// search binding
document.addEventListener('DOMContentLoaded', () => {
  const s = document.getElementById('search');
  if (s) s.addEventListener('input', () => renderDomains(allDomains));
});

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