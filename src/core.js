/* Zippy AI Tools — shared helpers (no dependencies) */
window.Zippy = (function () {
  'use strict';

  var KEYS = {
    image: 'zippy.key.image',
    imageBase: 'zippy.key.imageBase',
    video: 'zippy.key.video'
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2600);
  }

  function getKey(name) {
    try { return localStorage.getItem(KEYS[name]) || ''; } catch (e) { return ''; }
  }
  function setKey(name, value) {
    try {
      if (value) localStorage.setItem(KEYS[name], value);
      else localStorage.removeItem(KEYS[name]);
    } catch (e) { /* private mode */ }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadDataUrl(dataUrl, filename) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* Wrap text into lines that fit maxWidth, honouring explicit \n. */
  function wrapText(ctx, text, maxWidth) {
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      if (para === '') { out.push(''); return; }
      var words = para.split(/\s+/);
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width <= maxWidth || !line) {
          line = test;
        } else {
          out.push(line);
          line = words[i];
        }
      }
      if (line) out.push(line);
    });
    return out.length ? out : [''];
  }

  /* Deterministic 32-bit hash, used for demo-mode visuals. */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  return {
    KEYS: KEYS,
    uid: uid,
    clamp: clamp,
    esc: esc,
    toast: toast,
    getKey: getKey,
    setKey: setKey,
    downloadBlob: downloadBlob,
    downloadDataUrl: downloadDataUrl,
    wrapText: wrapText,
    hash: hash
  };
})();
