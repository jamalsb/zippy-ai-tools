/* Zippy AI Tools — AI Image Creator
   Real generation when the user supplies their own key (stored in localStorage).
   Otherwise a deterministic demo renderer so the whole UI is testable.
*/
window.ImageCreator = (function () {
  'use strict';

  var RATIOS = {
    '1:1': { w: 1024, h: 1024 },
    '16:9': { w: 1280, h: 720 },
    '9:16': { w: 720, h: 1280 }
  };

  var STYLE_HINTS = {
    none: '',
    photographic: 'photorealistic, natural lighting, 50mm lens, high detail',
    cinematic: 'cinematic still, anamorphic, dramatic lighting, film grain',
    illustration: 'digital illustration, clean linework, vibrant palette',
    '3d-render': '3D render, soft studio lighting, subsurface scattering, octane',
    'flat-vector': 'flat vector illustration, bold shapes, minimal palette',
    watercolor: 'watercolour painting, soft washes, paper texture'
  };

  var booted = false;
  var busy = false;
  var lastResult = null;

  function el(id) { return document.getElementById(id); }

  function refreshNotice() {
    var box = el('imageKeyNotice');
    if (!box) return;
    var key = Zippy.getKey('image');
    if (key) {
      box.className = 'notice ok';
      box.textContent = 'API key detected — Generate will call your configured image API.';
    } else {
      box.className = 'notice warn';
      box.textContent = 'No API key set. Generate runs in Demo mode and produces a placeholder graphic. Add your own key in Settings (⚙️) to generate real images.';
    }
  }

  function setStatus(msg, kind) {
    var s = el('imgStatus');
    if (!s) return;
    s.textContent = msg || '';
    s.style.color = kind === 'err' ? '#f0a3b2' : kind === 'ok' ? '#8fe0b4' : '';
  }

  function setBusy(on) {
    busy = on;
    var btn = el('imgGenerate');
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? '⏳ Generating…' : '✨ Generate image';
  }

  /* ---------- demo renderer ---------- */

  function demoImage(prompt, ratio, style) {
    var dim = RATIOS[ratio] || RATIOS['16:9'];
    var c = document.createElement('canvas');
    c.width = dim.w;
    c.height = dim.h;
    var g = c.getContext('2d');

    var seed = Zippy.hash(prompt + '|' + ratio + '|' + style);
    var hue = seed % 360;
    var hue2 = (hue + 55 + (seed >> 8) % 90) % 360;

    var grad = g.createLinearGradient(0, 0, dim.w, dim.h);
    grad.addColorStop(0, 'hsl(' + hue + ',72%,22%)');
    grad.addColorStop(0.55, 'hsl(' + hue2 + ',68%,34%)');
    grad.addColorStop(1, 'hsl(' + ((hue + 200) % 360) + ',60%,14%)');
    g.fillStyle = grad;
    g.fillRect(0, 0, dim.w, dim.h);

    /* soft blobs */
    for (var i = 0; i < 7; i++) {
      var s2 = seed * (i + 3);
      var cx = (s2 % dim.w);
      var cy = ((s2 >> 7) % dim.h);
      var rad = 90 + ((s2 >> 3) % 260);
      var rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, 'hsla(' + ((hue + i * 47) % 360) + ',85%,65%,0.30)');
      rg.addColorStop(1, 'hsla(' + ((hue + i * 47) % 360) + ',85%,65%,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
    }

    /* grid lines for a designed feel */
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    var step = Math.round(dim.w / 16);
    for (var x = 0; x < dim.w; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, dim.h); g.stroke();
    }
    for (var y = 0; y < dim.h; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(dim.w, y); g.stroke();
    }

    /* vignette */
    var vg = g.createRadialGradient(dim.w / 2, dim.h / 2, dim.h * 0.2, dim.w / 2, dim.h / 2, dim.h * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, dim.w, dim.h);

    /* caption block */
    var pad = Math.round(dim.w * 0.055);
    var fs = Math.max(18, Math.round(dim.w * 0.030));
    g.font = 'bold ' + fs + 'px system-ui, Arial';
    g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(255,255,255,0.95)';
    var lines = Zippy.wrapText(g, prompt || 'Untitled prompt', dim.w - pad * 2);
    var shown = lines.slice(0, 4);
    shown.forEach(function (line, idx) {
      g.fillText(line, pad, dim.h - pad - (shown.length - 1 - idx) * (fs * 1.3));
    });

    g.font = 'bold ' + Math.round(fs * 0.62) + 'px system-ui, Arial';
    g.fillStyle = 'rgba(255,255,255,0.62)';
    g.textBaseline = 'top';
    g.fillText('DEMO MODE · ' + ratio + ' · ' + (style === 'none' ? 'no style' : style), pad, pad);

    return c.toDataURL('image/png');
  }

  /* ---------- real API ---------- */

  function buildPrompt(prompt, style) {
    var hint = STYLE_HINTS[style] || '';
    return hint ? prompt + ', ' + hint : prompt;
  }

  function realImage(prompt, ratio, style) {
    var key = Zippy.getKey('image');
    var base = (Zippy.getKey('imageBase') || 'https://api.openai.com/v1').replace(/\/+$/, '');
    var dim = RATIOS[ratio] || RATIOS['16:9'];
    var size = dim.w + 'x' + dim.h;

    return fetch(base + '/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildPrompt(prompt, style),
        n: 1,
        size: size
      })
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) {
          var msg = 'HTTP ' + res.status;
          try {
            var j = JSON.parse(txt);
            if (j.error && j.error.message) msg += ' — ' + j.error.message;
          } catch (e) { /* non-JSON */ }
          throw new Error(msg);
        }
        var data = JSON.parse(txt);
        var item = data.data && data.data[0];
        if (!item) throw new Error('The API returned no image.');
        if (item.b64_json) return 'data:image/png;base64,' + item.b64_json;
        if (item.url) return item.url;
        throw new Error('Unrecognised API response shape.');
      });
    });
  }

  /* ---------- flow ---------- */

  function showResult(src, meta) {
    lastResult = src;
    var panel = el('imgResultPanel');
    var img = el('imgResult');
    var m = el('imgMeta');
    if (img) img.src = src;
    if (m) m.textContent = meta;
    if (panel) panel.hidden = false;
  }

  function generate() {
    if (busy) return;
    var prompt = (el('imgPrompt').value || '').trim();
    var ratio = el('imgRatio').value;
    var style = el('imgStyle').value;

    if (!prompt) {
      setStatus('Please write a prompt first.', 'err');
      el('imgPrompt').focus();
      return;
    }

    setBusy(true);
    setStatus('Working…');

    var hasKey = !!Zippy.getKey('image');

    if (!hasKey) {
      /* demo: small delay so the loading state is visible */
      setTimeout(function () {
        var src = demoImage(prompt, ratio, style);
        showResult(src, 'Demo mode · ' + ratio + ' · ' + (style === 'none' ? 'no style' : style) + ' · placeholder graphic, not an AI image');
        setStatus('Demo image ready. Add an API key in Settings to generate real images.', 'ok');
        setBusy(false);
      }, 700);
      return;
    }

    realImage(prompt, ratio, style).then(function (src) {
      showResult(src, 'Generated · ' + ratio + ' · ' + (style === 'none' ? 'no style' : style));
      setStatus('Image generated.', 'ok');
      setBusy(false);
    }).catch(function (err) {
      setStatus('Generation failed: ' + err.message + ' — falling back to a demo image.', 'err');
      var src = demoImage(prompt, ratio, style);
      showResult(src, 'Demo fallback · ' + ratio + ' · API call failed');
      setBusy(false);
    });
  }

  function download() {
    if (!lastResult) return;
    var ext = lastResult.indexOf('data:image/jpeg') === 0 ? 'jpg' : 'png';
    var name = 'zippy-ai-image-' + Date.now() + '.' + ext;
    if (lastResult.indexOf('data:') === 0) {
      Zippy.downloadDataUrl(lastResult, name);
    } else {
      /* remote URL: fetch to blob so the download attribute works */
      fetch(lastResult).then(function (r) { return r.blob(); }).then(function (b) {
        Zippy.downloadBlob(b, name);
      }).catch(function () {
        window.open(lastResult, '_blank');
      });
    }
    Zippy.toast('Download started');
  }

  function init() {
    if (booted) return;
    var btn = el('imgGenerate');
    if (!btn) return;
    booted = true;

    refreshNotice();
    btn.onclick = generate;

    var dl = el('imgDownload');
    var again = el('imgAgain');
    if (dl) dl.onclick = download;
    if (again) again.onclick = generate;

    var prompt = el('imgPrompt');
    if (prompt) {
      prompt.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
      });
    }
  }

  return { init: init, refreshNotice: refreshNotice };
})();
