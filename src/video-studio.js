/* Zippy AI Tools — AI Video Generator & Editor
   Script -> storyboard -> editable timeline -> real .webm export.
   Rendering is 100% client-side (canvas + MediaRecorder); nothing is uploaded.
*/
window.VideoStudio = (function () {
  'use strict';

  var W = 1280, H = 720;
  var STORE_KEY = 'zippy.video.v1';

  var scenes = [];        // {id, kind:'image'|'color', src, img, color, text, duration, fit}
  var selected = null;
  var booted = false;

  var canvas, ctx;
  var playing = false;
  var rafId = null;
  var startTime = 0;
  var elapsed = 0;
  var recording = false;

  function el(id) { return document.getElementById(id); }
  function uid() { return Zippy.uid('s'); }

  function totalDuration() {
    return scenes.reduce(function (a, s) { return a + (Number(s.duration) || 0); }, 0);
  }

  /* ---------------- persistence ---------------- */

  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var slim = scenes.map(function (s) {
          return {
            id: s.id, kind: s.kind, src: s.src, color: s.color,
            text: s.text, duration: s.duration, fit: s.fit
          };
        });
        localStorage.setItem(STORE_KEY, JSON.stringify(slim));
      } catch (e) { /* storage full — images are heavy, ignore */ }
    }, 600);
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      arr.forEach(function (s) {
        var scene = {
          id: s.id || uid(), kind: s.kind || 'color', src: s.src || null,
          color: s.color || '#8055e9', text: s.text || '',
          duration: Number(s.duration) || 3, fit: s.fit || 'cover', img: null
        };
        if (scene.kind === 'image' && scene.src) {
          var img = new Image();
          img.onload = function () { scene.img = img; drawAt(0); };
          img.src = scene.src;
        }
        scenes.push(scene);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------------- scene creation ---------------- */

  function addScene(scene) {
    scenes.push(scene);
    selected = scene.id;
    renderTimeline();
    drawAt(0);
    scheduleSave();
  }

  function addColorCard() {
    addScene({
      id: uid(), kind: 'color', color: '#8055e9',
      text: 'New scene', duration: 3, fit: 'cover', img: null, src: null
    });
  }

  function storyboardFromScript() {
    var raw = (el('vidScript').value || '').trim();
    if (!raw) {
      Zippy.toast('Write a script first — one line per scene.');
      el('vidScript').focus();
      return;
    }
    var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) {
      Zippy.toast('No usable lines found.');
      return;
    }

    var palette = ['#8055e9', '#2f6fbf', '#1f8a70', '#b7452d', '#7a3fa8', '#2b3a67'];
    lines.forEach(function (line, i) {
      var words = line.split(/\s+/).length;
      /* ~2.6 words per second, clamped to a sane range */
      var dur = Zippy.clamp(Math.round((words / 2.6) * 10) / 10, 2, 8);
      addScene({
        id: uid(), kind: 'color',
        color: palette[i % palette.length],
        text: line, duration: dur, fit: 'cover', img: null, src: null
      });
    });
    Zippy.toast(lines.length + ' scenes created');
  }

  function addImages(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 12 * 1024 * 1024) {
        Zippy.toast(file.name + ' is over 12 MB — skipped.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function (ev) {
        var src = ev.target.result;
        var img = new Image();
        img.onload = function () {
          addScene({
            id: uid(), kind: 'image', src: src, img: img,
            color: '#000000', text: '', duration: 3, fit: 'cover'
          });
        };
        img.onerror = function () { Zippy.toast('Could not load ' + file.name); };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- timeline UI ---------------- */

  function renderTimeline() {
    var box = el('vidTimeline');
    if (!box) return;
    box.innerHTML = '';

    if (!scenes.length) {
      box.innerHTML = '<p class="small">No scenes yet — build a storyboard or add images.</p>';
      updateTimeLabel();
      return;
    }

    scenes.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'scene' + (s.id === selected ? ' active' : '');

      var thumb;
      if (s.kind === 'image' && s.src) {
        thumb = document.createElement('img');
        thumb.className = 'scene-thumb';
        thumb.src = s.src;
        thumb.alt = 'Scene ' + (i + 1);
      } else {
        thumb = document.createElement('div');
        thumb.className = 'scene-thumb';
        thumb.style.background = s.color || '#8055e9';
      }

      var body = document.createElement('div');
      body.className = 'scene-body';
      var title = document.createElement('div');
      title.className = 'scene-title';
      title.textContent = (i + 1) + '. ' + (s.text || (s.kind === 'image' ? 'Image scene' : 'Colour card'));
      var meta = document.createElement('div');
      meta.className = 'scene-meta';
      meta.textContent = s.kind + ' · ' + s.duration + 's';
      body.append(title, meta);

      var actions = document.createElement('div');
      actions.className = 'scene-actions';

      var up = document.createElement('button');
      up.textContent = '↑'; up.title = 'Move earlier';
      up.setAttribute('aria-label', 'Move scene earlier');
      up.disabled = i === 0;
      up.onclick = function () { moveScene(i, -1); };

      var down = document.createElement('button');
      down.textContent = '↓'; down.title = 'Move later';
      down.setAttribute('aria-label', 'Move scene later');
      down.disabled = i === scenes.length - 1;
      down.onclick = function () { moveScene(i, 1); };

      var del = document.createElement('button');
      del.textContent = '✕'; del.className = 'danger'; del.title = 'Delete scene';
      del.setAttribute('aria-label', 'Delete scene');
      del.onclick = function () { removeScene(s.id); };

      actions.append(up, down, del);

      row.append(thumb, body, actions);

      /* inline fields for the selected scene */
      if (s.id === selected) {
        var fields = document.createElement('div');
        fields.className = 'scene-fields';

        var capWrap = document.createElement('div');
        var capLabel = document.createElement('label');
        capLabel.textContent = 'Caption / overlay text';
        var cap = document.createElement('input');
        cap.type = 'text';
        cap.value = s.text || '';
        cap.placeholder = 'Text shown on this scene';
        cap.oninput = function () {
          s.text = cap.value;
          title.textContent = (i + 1) + '. ' + (s.text || (s.kind === 'image' ? 'Image scene' : 'Colour card'));
          drawAt(currentSceneTime());
          scheduleSave();
        };
        capWrap.append(capLabel, cap);

        var durWrap = document.createElement('div');
        var durLabel = document.createElement('label');
        durLabel.textContent = 'Duration (seconds)';
        var dur = document.createElement('input');
        dur.type = 'number';
        dur.min = '0.5'; dur.max = '30'; dur.step = '0.5';
        dur.value = s.duration;
        dur.oninput = function () {
          s.duration = Zippy.clamp(parseFloat(dur.value) || 0.5, 0.5, 30);
          meta.textContent = s.kind + ' · ' + s.duration + 's';
          updateTimeLabel();
          scheduleSave();
        };
        durWrap.append(durLabel, dur);

        fields.append(capWrap, durWrap);

        if (s.kind === 'image') {
          var fitWrap = document.createElement('div');
          var fitLabel = document.createElement('label');
          fitLabel.textContent = 'Image fit';
          var fit = document.createElement('select');
          [['cover', 'Cover (fill frame)'], ['contain', 'Contain (letterbox)']].forEach(function (p) {
            var o = document.createElement('option');
            o.value = p[0]; o.textContent = p[1];
            fit.append(o);
          });
          fit.value = s.fit || 'cover';
          fit.onchange = function () { s.fit = fit.value; drawAt(currentSceneTime()); scheduleSave(); };
          fitWrap.append(fitLabel, fit);
          fields.append(fitWrap);
        } else {
          var colWrap = document.createElement('div');
          var colLabel = document.createElement('label');
          colLabel.textContent = 'Card colour';
          var col = document.createElement('input');
          col.type = 'color';
          col.value = s.color || '#8055e9';
          col.oninput = function () {
            s.color = col.value;
            thumb.style.background = col.value;
            drawAt(currentSceneTime());
            scheduleSave();
          };
          colWrap.append(colLabel, col);
          fields.append(colWrap);
        }

        row.append(fields);
      }

      row.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        selected = s.id;
        renderTimeline();
        drawAt(currentSceneTime());
      });

      box.append(row);
    });

    updateTimeLabel();
  }

  function moveScene(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= scenes.length) return;
    var tmp = scenes[i];
    scenes[i] = scenes[j];
    scenes[j] = tmp;
    renderTimeline();
    drawAt(currentSceneTime());
    scheduleSave();
  }

  function removeScene(id) {
    scenes = scenes.filter(function (s) { return s.id !== id; });
    if (selected === id) selected = scenes.length ? scenes[0].id : null;
    renderTimeline();
    drawAt(currentSceneTime());
    scheduleSave();
  }

  /* ---------------- rendering ---------------- */

  function sceneAt(t) {
    var acc = 0;
    for (var i = 0; i < scenes.length; i++) {
      var d = Number(scenes[i].duration) || 0;
      if (t < acc + d) return { scene: scenes[i], index: i, local: t - acc };
      acc += d;
    }
    return scenes.length ? { scene: scenes[scenes.length - 1], index: scenes.length - 1, local: 0 } : null;
  }

  function currentSceneTime() {
    return playing ? elapsed : 0;
  }

  function drawFrame(scene, local) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!scene) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 34px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add a scene to start', W / 2, H / 2);
      return;
    }

    if (scene.kind === 'image' && scene.img) {
      var iw = scene.img.width, ih = scene.img.height;
      if (scene.fit === 'contain') {
        var sc = Math.min(W / iw, H / ih);
        var dw = iw * sc, dh = ih * sc;
        ctx.drawImage(scene.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        var sc2 = Math.max(W / iw, H / ih);
        var dw2 = iw * sc2, dh2 = ih * sc2;
        ctx.drawImage(scene.img, (W - dw2) / 2, (H - dh2) / 2, dw2, dh2);
      }
    } else {
      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, scene.color || '#8055e9');
      g.addColorStop(1, shade(scene.color || '#8055e9', -0.45));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* caption overlay */
    if (scene.text) {
      var pad = 64;
      var fs = 56;
      ctx.font = 'bold ' + fs + 'px system-ui, Arial';
      var lines = Zippy.wrapText(ctx, scene.text, W - pad * 2);
      var lh = fs * 1.25;
      var blockH = lines.length * lh;
      var baseY = H - pad - blockH;

      /* scrim for legibility */
      var sg = ctx.createLinearGradient(0, baseY - 40, 0, H);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, baseY - 40, W, H - baseY + 40);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      lines.forEach(function (line, i) {
        var y = baseY + i * lh;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, W / 2, y);
        ctx.fillStyle = '#fff';
        ctx.fillText(line, W / 2, y);
      });
    }

    /* subtle progress bar */
    var total = totalDuration();
    if (total > 0) {
      var acc = 0;
      for (var i = 0; i < scenes.length; i++) {
        if (scenes[i] === scene) break;
        acc += Number(scenes[i].duration) || 0;
      }
      var p = Zippy.clamp((acc + local) / total, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, H - 6, W, 6);
      ctx.fillStyle = '#b18aff';
      ctx.fillRect(0, H - 6, W * p, 6);
    }
  }

  function shade(hex, amt) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    function f(v) {
      var n = amt < 0 ? v * (1 + amt) : v + (255 - v) * amt;
      return Math.round(Zippy.clamp(n, 0, 255));
    }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function drawAt(t) {
    if (!ctx) return;
    var hit = sceneAt(t);
    drawFrame(hit ? hit.scene : null, hit ? hit.local : 0);
  }

  function updateTimeLabel() {
    var lbl = el('vidTime');
    if (!lbl) return;
    var total = totalDuration();
    lbl.textContent = elapsed.toFixed(1) + 's / ' + total.toFixed(1) + 's · ' + scenes.length + ' scene' + (scenes.length === 1 ? '' : 's');
  }

  /* ---------------- playback ---------------- */

  function play() {
    if (playing || !scenes.length) {
      if (!scenes.length) Zippy.toast('Add at least one scene first.');
      return;
    }
    playing = true;
    startTime = performance.now();
    var from = elapsed >= totalDuration() ? 0 : elapsed;
    elapsed = from;

    function tick(now) {
      if (!playing) return;
      elapsed = from + (now - startTime) / 1000;
      var total = totalDuration();
      if (elapsed >= total) {
        elapsed = total;
        drawAt(total - 0.001);
        updateTimeLabel();
        stop();
        return;
      }
      drawAt(elapsed);
      updateTimeLabel();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    updateTimeLabel();
  }

  /* ---------------- export ---------------- */

  function pickMime() {
    var candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function exportVideo() {
    if (recording) return;
    if (!scenes.length) {
      Zippy.toast('Add at least one scene first.');
      return;
    }
    if (!window.MediaRecorder || !canvas.captureStream) {
      var st = el('vidExportStatus');
      if (st) st.textContent = 'This browser cannot record canvas video. Try Chrome, Edge or Firefox.';
      Zippy.toast('Recording is not supported in this browser.');
      return;
    }

    var mime = pickMime();
    if (!mime) {
      Zippy.toast('No supported WebM codec found in this browser.');
      return;
    }

    var status = el('vidExportStatus');
    var btn = el('vidExport');
    recording = true;
    if (btn) { btn.disabled = true; btn.textContent = '⏺ Recording…'; }

    var stream = canvas.captureStream(30);
    var chunks = [];
    var rec;

    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
    } catch (e) {
      recording = false;
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Export video (.webm)'; }
      if (status) status.textContent = 'Could not start the recorder: ' + e.message;
      return;
    }

    rec.ondataavailable = function (e) {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    rec.onstop = function () {
      recording = false;
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Export video (.webm)'; }
      var blob = new Blob(chunks, { type: mime });
      Zippy.downloadBlob(blob, 'zippy-ai-video-' + Date.now() + '.webm');
      if (status) {
        status.textContent = 'Exported ' + (blob.size / 1048576).toFixed(1) + ' MB · ' +
          totalDuration().toFixed(1) + 's · ' + mime;
      }
      Zippy.toast('Video exported');
      drawAt(0);
    };

    rec.start(250);

    /* render the timeline in real time so the recording matches the preview */
    var total = totalDuration();
    var t0 = performance.now();
    if (status) status.textContent = 'Recording ' + total.toFixed(1) + 's in real time — keep this tab visible…';

    function frame(now) {
      var t = (now - t0) / 1000;
      if (t >= total) {
        drawAt(total - 0.001);
        setTimeout(function () {
          try { rec.stop(); } catch (e) { /* already stopped */ }
          stream.getTracks().forEach(function (tr) { tr.stop(); });
        }, 300);
        return;
      }
      drawAt(t);
      elapsed = t;
      updateTimeLabel();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (booted) return;
    canvas = el('vidCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    booted = true;

    loadSaved();

    var notice = el('videoKeyNotice');
    if (notice) {
      if (Zippy.getKey('video')) {
        notice.className = 'notice ok';
        notice.textContent = 'Video API key detected. Note: this build renders and exports locally — the key is reserved for a future hosted video model.';
      } else {
        notice.className = 'notice warn';
        notice.textContent = 'No video API key set. This tool works fully offline: it builds a storyboard from your script and exports a real .webm from the browser. No key needed.';
      }
    }

    var sb = el('vidStoryboard');
    if (sb) sb.onclick = storyboardFromScript;

    var addColor = el('vidAddColor');
    if (addColor) addColor.onclick = addColorCard;

    var imgs = el('vidImages');
    if (imgs) {
      imgs.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) addImages(e.target.files);
        e.target.value = '';
      });
    }

    var p = el('vidPlay');
    var s = el('vidStop');
    var ex = el('vidExport');
    if (p) p.onclick = play;
    if (s) s.onclick = function () { stop(); elapsed = 0; drawAt(0); updateTimeLabel(); };
    if (ex) ex.onclick = exportVideo;

    renderTimeline();
    drawAt(0);
  }

  return { init: init };
})();
