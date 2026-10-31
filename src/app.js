/* Zippy AI Tools — app shell: hash router, settings modal, boot */
(function () {
  'use strict';

  var ROUTES = ['home', 'thumbnail', 'image', 'video'];
  var booted = {};

  function el(id) { return document.getElementById(id); }

  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '').trim();
    return ROUTES.indexOf(h) >= 0 ? h : 'home';
  }

  function show(route) {
    ROUTES.forEach(function (r) {
      var view = el('view-' + r);
      if (view) view.classList.toggle('active', r === route);
    });

    document.querySelectorAll('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === route);
    });

    /* lazy-init each tool the first time it is opened */
    if (route === 'thumbnail' && !booted.thumbnail) {
      booted.thumbnail = true;
      if (window.ThumbnailStudio) ThumbnailStudio.init();
    }
    if (route === 'image' && !booted.image) {
      booted.image = true;
      if (window.ImageCreator) ImageCreator.init();
    }
    if (route === 'video' && !booted.video) {
      booted.video = true;
      if (window.VideoStudio) VideoStudio.init();
    }

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function route() { show(currentRoute()); }

  /* ---------------- settings ---------------- */

  function openSettings() {
    var m = el('settingsModal');
    if (!m) return;
    el('keyImage').value = Zippy.getKey('image');
    el('keyImageBase').value = Zippy.getKey('imageBase');
    el('keyVideo').value = Zippy.getKey('video');
    m.hidden = false;
    el('keyImage').focus();
  }

  function closeSettings() {
    var m = el('settingsModal');
    if (m) m.hidden = true;
  }

  function saveKeys() {
    Zippy.setKey('image', el('keyImage').value.trim());
    Zippy.setKey('imageBase', el('keyImageBase').value.trim());
    Zippy.setKey('video', el('keyVideo').value.trim());
    if (window.ImageCreator) ImageCreator.refreshNotice();
    closeSettings();
    Zippy.toast('Settings saved in this browser');
  }

  function clearKeys() {
    if (!confirm('Remove all saved API keys from this browser?')) return;
    Zippy.setKey('image', '');
    Zippy.setKey('imageBase', '');
    Zippy.setKey('video', '');
    el('keyImage').value = '';
    el('keyImageBase').value = '';
    el('keyVideo').value = '';
    if (window.ImageCreator) ImageCreator.refreshNotice();
    Zippy.toast('Keys cleared');
  }

  /* ---------------- boot ---------------- */

  function init() {
    window.addEventListener('hashchange', route);

    var sb = el('settingsBtn');
    if (sb) sb.onclick = openSettings;

    var close = el('closeSettings');
    if (close) close.onclick = closeSettings;

    var save = el('saveKeys');
    if (save) save.onclick = saveKeys;

    var clr = el('clearKeys');
    if (clr) clr.onclick = clearKeys;

    document.querySelectorAll('[data-open-settings]').forEach(function (b) {
      b.onclick = openSettings;
    });

    var modal = el('settingsModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeSettings();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSettings();
    });

    if (!location.hash) location.replace('#/home');
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
