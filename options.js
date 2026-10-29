// ====================================================
// Tab Lock - Options Page Script (Round 2)
// - Domain list dựng bằng createElement/setAttribute (không innerHTML
//   với dữ liệu động — chống attribute-breakout XSS)
// - Validate domain chặt (hostname thật, không khoảng trắng/quote)
// - Mọi sendMessage có try/catch + hiển thị lỗi
// ====================================================

let allDomains = [];
let messageTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadDomains();

  // --- Add domain ---
  document.getElementById('btn-add-domain').addEventListener('click', async () => {
    const raw = document.getElementById('new-domain').value.trim().toLowerCase();
    const password = document.getElementById('new-domain-password').value;
    const confirm = document.getElementById('new-domain-confirm').value;

    if (!raw) {
      showMessage('Please enter a domain', 'error');
      return;
    }

    // Extract hostname nếu user dán full URL
    let cleanDomain = raw;
    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        cleanDomain = new URL(raw).hostname;
      }
    } catch {
      // Keep as-is
    }

    // Validate hostname chặt: chỉ chữ, số, dấu chấm, gạch ngang.
    // Chặn `a.b" onmouseover=...` và mọi ký tự đặc biệt ngay từ đầu.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleanDomain)) {
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

    const btn = document.getElementById('btn-add-domain');
    btn.disabled = true;
    try {
      const res = await sendMessage({ type: 'SET_PASSWORD', domain: cleanDomain, password });
      if (res && res.success === false) throw new Error(res.error || 'Failed to set password');
      showMessage(`Domain "${cleanDomain}" locked successfully!`, 'success');
      document.getElementById('new-domain').value = '';
      document.getElementById('new-domain-password').value = '';
      document.getElementById('new-domain-confirm').value = '';
      await loadDomains();
    } catch (e) {
      showMessage(e?.message || 'Could not reach the extension — please retry', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // --- Back link ---
  document.getElementById('back-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  // --- Search binding ---
  const s = document.getElementById('search');
  if (s) s.addEventListener('input', () => renderDomains(allDomains));
});

// sendMessage wrapper với error rõ ràng
async function sendMessage(message) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
    return res;
  } catch (e) {
    throw new Error(e?.message || 'Could not reach the extension service worker');
  }
}

// --- Load all locked domains ---
async function loadDomains() {
  try {
    const response = await sendMessage({ type: 'GET_ALL_DOMAINS' });
    allDomains = (response && response.domains) ? response.domains : [];
  } catch (e) {
    allDomains = [];
    showMessage(e?.message || 'Could not load domains', 'error');
  }
  const countBadge = document.getElementById('count-badge');
  const statCount = document.getElementById('stat-count');
  if (countBadge) countBadge.textContent = allDomains.length;
  if (statCount) statCount.textContent = allDomains.length;
  renderDomains(allDomains);
}

// --- Render domain list bằng DOM API (không innerHTML với dữ liệu động) ---
function renderDomains(domains) {
  const list = document.getElementById('domains-list');
  const emptyState = document.getElementById('empty-state');
  const filter = (document.getElementById('search')?.value || '').toLowerCase().trim();
  const filtered = filter ? domains.filter(d => d.toLowerCase().includes(filter)) : domains;

  list.textContent = '';
  if (domains.length === 0) {
    emptyState.style.display = 'block';
    setEmptyState('🔓', 'No domains locked yet', 'Add a domain above to protect it with a password. Each domain is locked per session.');
    return;
  }
  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    setEmptyState('🔍', 'No results', `No domains match "${filter}"`);
    return;
  }

  emptyState.style.display = 'none';

  for (const domain of filtered) {
    const item = document.createElement('div');
    item.className = 'domain-item';

    const left = document.createElement('div');
    left.className = 'domain-left';

    const icon = document.createElement('div');
    icon.className = 'domain-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = domain.charAt(0).toUpperCase();

    const meta = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'domain-name';
    name.textContent = domain;
    const metaLine = document.createElement('div');
    metaLine.className = 'domain-meta';
    metaLine.textContent = '🔒 Password protected • session unlock';
    meta.append(name, metaLine);

    left.append(icon, meta);

    const actions = document.createElement('div');
    actions.className = 'domain-actions';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.dataset.domain = domain;
    removeBtn.addEventListener('click', () => handleRemoveDomain(domain));
    actions.appendChild(removeBtn);

    item.append(left, actions);
    list.appendChild(item);
  }
}

function setEmptyState(iconText, title, body) {
  const emptyState = document.getElementById('empty-state');
  emptyState.textContent = '';
  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconText;
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  emptyState.append(icon, h, p);
}

async function handleRemoveDomain(domain) {
  if (!confirm(`Remove password for "${domain}"?`)) return;
  try {
    await sendMessage({ type: 'SET_PASSWORD', domain, password: '' });
    showMessage(`Removed "${domain}"`, 'success');
    await loadDomains();
  } catch (e) {
    showMessage(e?.message || 'Could not remove domain', 'error');
  }
}

// --- Show message (timer tracked để error liên tiếp không nhấp nháy) ---
function showMessage(msg, type) {
  const el = document.getElementById('message');
  el.textContent = msg;
  el.className = 'message ' + type;
  el.style.display = 'flex';
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    el.style.display = 'none';
    messageTimer = null;
  }, 3000);
}
