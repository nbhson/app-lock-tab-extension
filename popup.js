// ====================================================
// Tab Lock - Popup Script
// ====================================================

let currentDomain = '';

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    document.getElementById('no-tab').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    return;
  }

  document.getElementById('no-tab').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';

  try {
    const url = new URL(tab.url);
    currentDomain = url.hostname;
  } catch {
    document.getElementById('no-tab').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    return;
  }

  document.getElementById('domain-text').textContent = currentDomain;
  document.getElementById('current-domain-display').textContent = currentDomain;

  // Load status
  await refreshStatus();

  // --- Set password ---
  document.getElementById('btn-set-password').addEventListener('click', async () => {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;

    if (!newPass) {
      showMessage('Please enter a password', 'error');
      return;
    }
    if (newPass.length < 4) {
      showMessage('Password must be at least 4 characters', 'error');
      return;
    }
    if (newPass !== confirmPass) {
      showMessage('Passwords do not match', 'error');
      return;
    }

    await chrome.runtime.sendMessage({
      type: 'SET_PASSWORD',
      domain: currentDomain,
      password: newPass
    });

    showMessage('Password set successfully!', 'success');
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    await refreshStatus();
  });

  // --- Unlock for session ---
  document.getElementById('btn-unlock').addEventListener('click', async () => {
    const password = document.getElementById('unlock-password').value;
    if (!password) {
      showMessage('Please enter your password', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'VERIFY_PASSWORD',
      domain: currentDomain,
      password: password
    });

    if (response && response.valid) {
      showMessage('Domain unlocked for this session!', 'success');
      document.getElementById('unlock-password').value = '';
      await refreshStatus();
    } else {
      showMessage('Incorrect password', 'error');
    }
  });

  // --- Remove password ---
  document.getElementById('btn-remove-password').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to remove the password for this domain?')) return;

    await chrome.runtime.sendMessage({
      type: 'SET_PASSWORD',
      domain: currentDomain,
      password: ''
    });

    showMessage('Password removed successfully', 'success');
    await refreshStatus();
  });

  // --- Change password ---
  document.getElementById('btn-change-password').addEventListener('click', async () => {
    const currentPass = document.getElementById('change-current-password').value;
    const newPass = document.getElementById('change-new-password').value;
    const confirmPass = document.getElementById('change-confirm-password').value;

    if (!currentPass || !newPass) {
      showMessage('Please fill in all fields', 'error');
      return;
    }
    if (newPass.length < 4) {
      showMessage('New password must be at least 4 characters', 'error');
      return;
    }
    if (newPass !== confirmPass) {
      showMessage('New passwords do not match', 'error');
      return;
    }

    // Verify current password first
    const verifyResponse = await chrome.runtime.sendMessage({
      type: 'VERIFY_PASSWORD',
      domain: currentDomain,
      password: currentPass
    });

    if (!verifyResponse || !verifyResponse.valid) {
      showMessage('Current password is incorrect', 'error');
      return;
    }

    // Set new password
    await chrome.runtime.sendMessage({
      type: 'SET_PASSWORD',
      domain: currentDomain,
      password: newPass
    });

    showMessage('Password changed successfully!', 'success');
    document.getElementById('change-current-password').value = '';
    document.getElementById('change-new-password').value = '';
    document.getElementById('change-confirm-password').value = '';
    await refreshStatus();
  });

  // --- Open options page ---
  document.getElementById('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

// --- Refresh the UI status ---
async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_LOCK_STATUS',
    domain: currentDomain
  });

  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const sectionSet = document.getElementById('section-set-password');
  const sectionManage = document.getElementById('section-manage-password');

  if (response && response.hasPassword) {
    sectionSet.classList.add('hidden');
    sectionManage.classList.remove('hidden');

    // Check session lock status
    const sessionResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_SESSION',
      domain: currentDomain
    });

    if (sessionResponse && !sessionResponse.locked) {
      dot.className = 'status-dot unlocked';
      text.textContent = '🔓 Unlocked (this session)';
    } else {
      dot.className = 'status-dot locked';
      text.textContent = '🔒 Locked';
    }
  } else {
    sectionSet.classList.remove('hidden');
    sectionManage.classList.add('hidden');
    dot.className = 'status-dot no-password';
    text.textContent = '⚠️ No password set';
  }
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