// ---- Hash routing ----
const views = ['home', 'thumbnail', 'image', 'video'];

function showView(name) {
  if (!views.includes(name)) name = 'home';
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('active', v === name);
  });
  document.querySelectorAll('.nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === name);
  });
  window.scrollTo(0, 0);
  if (name === 'image') updateImageKeyNotice();
  if (name === 'video') updateVideoKeyNotice();
}

function handleRoute() {
  const hash = location.hash.replace(/^#\//, '') || 'home';
  showView(hash);
}
window.addEventListener('hashchange', handleRoute);

// ---- Toast ----
let toastTimer = null;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---- Settings modal ----
const settingsModal = document.getElementById('settingsModal');

function openSettings() {
  document.getElementById('keyImage').value = localStorage.getItem('zippy.imgKey') || '';
  document.getElementById('keyImageBase').value = localStorage.getItem('zippy.imgBase') || 'https://image.pollinations.ai';
  document.getElementById('keyVideo').value = localStorage.getItem('zippy.vidKey') || '';
  settingsModal.hidden = false;
  document.getElementById('keyImage').focus();
}

function closeSettings() {
  settingsModal.hidden = true;
  document.getElementById('settingsBtn').focus();
}

function saveSettings() {
  const imgKey = document.getElementById('keyImage').value.trim();
  const imgBase = document.getElementById('keyImageBase').value.trim() || 'https://image.pollinations.ai';
  const vidKey = document.getElementById('keyVideo').value.trim();

  if (imgKey) localStorage.setItem('zippy.imgKey', imgKey);
  else localStorage.removeItem('zippy.imgKey');
  
  localStorage.setItem('zippy.imgBase', imgBase);
  
  if (vidKey) localStorage.setItem('zippy.vidKey', vidKey);
  else localStorage.removeItem('zippy.vidKey');

  toast('✅ Settings saved.');
  closeSettings();
  updateImageKeyNotice();
  updateVideoKeyNotice();
}

function clearSettings() {
  ['zippy.imgKey', 'zippy.imgBase', 'zippy.vidKey'].forEach(k => localStorage.removeItem(k));
  document.getElementById('keyImage').value = '';
  document.getElementById('keyImageBase').value = 'https://image.pollinations.ai';
  document.getElementById('keyVideo').value = '';
  toast('🗑️ All keys cleared.');
  updateImageKeyNotice();
  updateVideoKeyNotice();
}

// ---- Password toggles ----
document.querySelectorAll('[data-toggle-pw]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.togglePw);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁 show' : '🙈 hide';
  });
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  handleRoute();
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('saveKeys').addEventListener('click', saveSettings);
  document.getElementById('clearKeys').addEventListener('click', clearSettings);

  settingsModal.addEventListener('click', e => {
    if (e.target === settingsModal) closeSettings();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
  });

  settingsModal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = settingsModal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  document.querySelectorAll('[data-open-settings]').forEach(b => {
    b.addEventListener('click', openSettings);
  });

  initImageCreator();
  initVideoStudio();
});
