/* Zippy AI Tools — Thumbnail Studio
   Original layer editor, preserved and extended:
   - word-wrap text, bold toggle, slider sync while dragging
   - undo/redo, localStorage autosave, remove background, 2x export
*/
window.ThumbnailStudio = (function () {
  'use strict';

  var W = 1280, H = 720;
  var STORE_KEY = 'zippy.thumbnail.v1';
  var MAX_HISTORY = 40;

  var canvas, ctx;
  var layers = [];
  var selected = null;
  var photo = null;          // HTMLImageElement
  var photoData = null;      // dataURL, for persistence
  var dragging = false;
  var exporting = false;
  var offsetX = 0, offsetY = 0;
  var history = [];
  var future = [];
  var saveTimer = null;
  var booted = false;

  function uid() { return Zippy.uid('l'); }
  function clamp(v, a, b) { return Zippy.clamp(v, a, b); }
  function current() { return layers.find(function (l) { return l.id === selected; }); }

  /* ---------------- history ---------------- */

  function snapshot() {
    return JSON.stringify({ layers: layers, selected: selected, photo: photoData });
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > MAX_HISTORY) history.shift();
    future.length = 0;
    updateHistoryButtons();
  }

  function restore(json) {
    var s = JSON.parse(json);
    layers = s.layers || [];
    selected = s.selected || null;
    photoData = s.photo || null;
    if (photoData) {
      var img = new Image();
      img.onload = function () { photo = img; draw(); };
      img.src = photoData;
    } else {
      photo = null;
    }
    draw(); renderLayers(); renderEditor(); scheduleSave();
  }

  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
    updateHistoryButtons();
  }

  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    var u = document.getElementById('undoBtn');
    var r = document.getElementById('redoBtn');
    if (u) u.disabled = !history.length;
    if (r) r.disabled = !future.length;
  }

  /* ---------------- persistence ---------------- */

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, snapshot());
        var el = document.getElementById('saveState');
        if (el) el.textContent = 'Autosaved in this browser · ' + new Date().toLocaleTimeString();
      } catch (e) {
        var el2 = document.getElementById('saveState');
        if (el2) el2.textContent = 'Autosave unavailable (storage full or private mode).';
      }
    }, 500);
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      layers = s.layers || [];
      selected = s.selected || null;
      photoData = s.photo || null;
      if (photoData) {
        var img = new Image();
        img.onload = function () { photo = img; draw(); };
        img.src = photoData;
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- layer creation ---------------- */

  function addText() {
    pushHistory();
    var l = {
      id: uid(), type: 'text', text: 'YOUR TEXT',
      x: W / 2, y: H / 2, size: 90,
      color: '#ffffff', bg: 'transparent',
      font: 'Arial', bold: true, align: 'center',
      stroke: '#000000', strokeWidth: 4,
      opacity: 1
    };
    layers.push(l);
    select(l.id);
  }

  function addShape(type) {
    pushHistory();
    var l = {
      id: uid(), type: type, x: W / 2, y: H / 2,
      w: type === 'line' ? 500 : 400,
      h: 200,
      color: '#8055e9', opacity: 1
    };
    layers.push(l);
    select(l.id);
  }

  function addColorLayer() {
    pushHistory();
    var l = {
      id: uid(), type: 'rect', x: W / 2, y: H / 2,
      w: W, h: H, color: '#8055e9', opacity: 0.5
    };
    layers.push(l);
    select(l.id);
  }

  function duplicate() {
    var l = current();
    if (!l) return;
    pushHistory();
    var copy = Object.assign({}, l, { id: uid(), x: l.x + 35, y: l.y + 35 });
    layers.push(copy);
    select(copy.id);
  }

  function select(id) {
    selected = id;
    draw(); renderLayers(); renderEditor(); scheduleSave();
  }

  /* ---------------- panels ---------------- */

  function renderLayers() {
    var box = document.getElementById('layers');
    if (!box) return;
    box.innerHTML = '';
    if (!layers.length) {
      box.innerHTML = '<p class="small">No layers yet — add text or a shape above.</p>';
      return;
    }
    layers.slice().reverse().forEach(function (l) {
      var div = document.createElement('div');
      div.className = 'layer' + (l.id === selected ? ' active' : '');

      var name = l.type === 'text'
        ? (l.text || 'Text')
        : (l.type === 'rect' && l.w === W && l.h === H ? 'Color Layer' : l.type);

      var label = document.createElement('span');
      label.className = 'layer-name';
      label.textContent = String(name).slice(0, 26);
      label.onclick = function () { select(l.id); };

      var up = document.createElement('button');
      up.textContent = '↑';
      up.title = 'Move up';
      up.setAttribute('aria-label', 'Move layer up');
      up.onclick = function () { moveLayer(l.id, 1); };

      var down = document.createElement('button');
      down.textContent = '↓';
      down.title = 'Move down';
      down.setAttribute('aria-label', 'Move layer down');
      down.onclick = function () { moveLayer(l.id, -1); };

      var del = document.createElement('button');
      del.textContent = '✕';
      del.className = 'danger';
      del.title = 'Delete layer';
      del.setAttribute('aria-label', 'Delete layer');
      del.onclick = function () { removeLayer(l.id); };

      div.append(label, up, down, del);
      box.append(div);
    });
  }

  function addField(box, labelText, element, id) {
    var wrap = document.createElement('div');
    var title = document.createElement('label');
    title.textContent = labelText;
    if (id) { title.htmlFor = id; element.id = id; }
    wrap.append(title, element);
    box.append(wrap);
  }

  function colorInput(value, change) {
    var el = document.createElement('input');
    el.type = 'color';
    el.value = value;
    el.addEventListener('input', function () {
      change(el.value); draw(); scheduleSave();
    });
    return el;
  }

  function slider(value, min, max, step, change, key) {
    var el = document.createElement('input');
    el.type = 'range';
    el.min = min; el.max = max; el.step = step; el.value = value;
    if (key) el.dataset.key = key;
    el.addEventListener('input', function () {
      change(parseFloat(el.value)); draw(); scheduleSave();
    });
    return el;
  }

  function renderEditor() {
    var l = current();
    var box = document.getElementById('editor');
    if (!box) return;
    box.innerHTML = '';

    if (!l) {
      box.innerHTML = '<p class="small rtl" dir="rtl" lang="ur">پہلے کوئی Layer منتخب کریں۔</p>';
      return;
    }

    if (l.type === 'text') {
      var text = document.createElement('textarea');
      text.value = l.text;
      text.oninput = function () {
        l.text = text.value; draw(); renderLayers(); scheduleSave();
      };
      addField(box, 'Text Content', text, 'f-text');

      addField(box, 'Text Color', colorInput(l.color, function (v) { l.color = v; }), 'f-color');

      var bgOn = document.createElement('input');
      bgOn.type = 'checkbox';
      bgOn.checked = l.bg !== 'transparent';

      var bgColor = colorInput(l.bg === 'transparent' ? '#8055e9' : l.bg, function (v) { l.bg = v; });
      bgColor.disabled = !bgOn.checked;

      bgOn.onchange = function () {
        l.bg = bgOn.checked ? bgColor.value : 'transparent';
        bgColor.disabled = !bgOn.checked;
        draw(); scheduleSave();
      };

      addField(box, 'Show Text Background', bgOn, 'f-bgon');
      addField(box, 'Text Background Color', bgColor, 'f-bgcolor');

      var font = document.createElement('select');
      ['Arial', 'Impact', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New'].forEach(function (f) {
        var o = document.createElement('option');
        o.value = f; o.textContent = f;
        font.append(o);
      });
      font.value = l.font;
      font.onchange = function () { l.font = font.value; draw(); scheduleSave(); };
      addField(box, 'Font Style', font, 'f-font');

      var boldOn = document.createElement('input');
      boldOn.type = 'checkbox';
      boldOn.checked = !!l.bold;
      boldOn.onchange = function () { l.bold = boldOn.checked; draw(); scheduleSave(); };
      addField(box, 'Bold', boldOn, 'f-bold');

      var align = document.createElement('select');
      [['left', 'Left'], ['center', 'Center'], ['right', 'Right']].forEach(function (p) {
        var o = document.createElement('option');
        o.value = p[0]; o.textContent = p[1];
        align.append(o);
      });
      align.value = l.align || 'center';
      align.onchange = function () { l.align = align.value; draw(); scheduleSave(); };
      addField(box, 'Text Alignment', align, 'f-align');

      addField(box, 'Font Size', slider(l.size, 10, 300, 1, function (v) { l.size = v; }, 'size'), 'f-size');
      addField(box, 'Outline Color', colorInput(l.stroke, function (v) { l.stroke = v; }), 'f-stroke');
      addField(box, 'Outline Width', slider(l.strokeWidth, 0, 20, 1, function (v) { l.strokeWidth = v; }, 'strokeWidth'), 'f-strokew');
    } else {
      addField(box, 'Layer Color', colorInput(l.color, function (v) { l.color = v; }), 'f-lcolor');

      if (l.type === 'line') {
        addField(box, 'Line Length', slider(l.w, 20, W, 1, function (v) { l.w = v; }, 'w'), 'f-lw');
      } else {
        addField(box, 'Width', slider(l.w, 10, W, 1, function (v) { l.w = v; }, 'w'), 'f-w');
        addField(box, 'Height', slider(l.h, 10, H, 1, function (v) { l.h = v; }, 'h'), 'f-h');
      }
    }

    addField(box, 'Horizontal Position', slider(l.x, 0, W, 1, function (v) { l.x = v; }, 'x'), 'f-x');
    addField(box, 'Vertical Position', slider(l.y, 0, H, 1, function (v) { l.y = v; }, 'y'), 'f-y');
    addField(box, 'Opacity', slider(l.opacity, 0, 1, 0.01, function (v) { l.opacity = v; }, 'opacity'), 'f-op');

    var buttons = document.createElement('div');
    buttons.className = 'row';
    buttons.style.marginTop = '12px';

    var dup = document.createElement('button');
    dup.textContent = 'Duplicate';
    dup.onclick = duplicate;

    var del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'danger';
    del.onclick = function () { removeLayer(l.id); };

    buttons.append(dup, del);
    box.append(buttons);
  }

  /* Keep the X/Y sliders in sync while the layer is dragged on canvas. */
  function syncPositionSliders() {
    var l = current();
    if (!l) return;
    var x = document.getElementById('f-x');
    var y = document.getElementById('f-y');
    if (x) x.value = l.x;
    if (y) y.value = l.y;
  }

  function moveLayer(id, direction) {
    var i = layers.findIndex(function (l) { return l.id === id; });
    var j = i + direction;
    if (i < 0 || j < 0 || j >= layers.length) return;
    pushHistory();
    var tmp = layers[i];
    layers[i] = layers[j];
    layers[j] = tmp;
    draw(); renderLayers(); scheduleSave();
  }

  function removeLayer(id) {
    pushHistory();
    layers = layers.filter(function (l) { return l.id !== id; });
    selected = null;
    draw(); renderLayers(); renderEditor(); scheduleSave();
  }

  /* ---------------- drawing ---------------- */

  function textBounds(l) {
    ctx.font = (l.bold ? 'bold ' : '') + l.size + 'px ' + l.font;
    var maxWidth = 1180;
    var lines = Zippy.wrapText(ctx, l.text, maxWidth);
    var lineHeight = l.size * 1.2;
    var widest = 0;
    lines.forEach(function (t) {
      widest = Math.max(widest, ctx.measureText(t).width);
    });
    var w = Math.min(widest + 35, maxWidth + 20);
    var h = lines.length * lineHeight + 12;
    return { x: l.x - w / 2, y: l.y - h / 2, w: w, h: h, lines: lines, lineHeight: lineHeight };
  }

  function bounds(l) {
    if (l.type === 'text') return textBounds(l);
    if (l.type === 'line') return { x: l.x - l.w / 2, y: l.y - 12, w: l.w, h: 24 };
    return { x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h };
  }

  function drawLayer(l) {
    ctx.save();
    ctx.globalAlpha = clamp(Number(l.opacity == null ? 1 : l.opacity), 0, 1);

    if (l.type === 'text') {
      var align = l.align || 'center';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      var b = textBounds(l);
      if (l.bg !== 'transparent') {
        ctx.fillStyle = l.bg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      var anchorX = align === 'left' ? b.x + 17 : align === 'right' ? b.x + b.w - 17 : l.x;

      b.lines.forEach(function (line, i) {
        var y = l.y + (i - (b.lines.length - 1) / 2) * b.lineHeight;
        if (l.strokeWidth > 0) {
          ctx.lineWidth = l.strokeWidth;
          ctx.strokeStyle = l.stroke;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, anchorX, y);
        }
        ctx.fillStyle = l.color;
        ctx.fillText(line, anchorX, y);
      });
    } else {
      ctx.fillStyle = l.color;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 8;

      if (l.type === 'rect') {
        ctx.fillRect(l.x - l.w / 2, l.y - l.h / 2, l.w, l.h);
      }
      if (l.type === 'circle') {
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (l.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(l.x - l.w / 2, l.y);
        ctx.lineTo(l.x + l.w / 2, l.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawSelection(l) {
    var b = bounds(l);
    ctx.save();
    ctx.strokeStyle = '#bd99ff';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#242344';
    ctx.fillRect(0, 0, W, H);

    if (photo) {
      var s = Math.max(W / photo.width, H / photo.height);
      var w = photo.width * s, h = photo.height * s;
      ctx.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
    }

    layers.forEach(drawLayer);

    var l = current();
    if (l && !exporting) drawSelection(l);
  }

  /* ---------------- interaction ---------------- */

  function coords(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * W / r.width,
      y: (e.clientY - r.top) * H / r.height
    };
  }

  function hit(l, p) {
    var b = bounds(l);
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  function bindCanvas() {
    canvas.addEventListener('pointerdown', function (e) {
      var p = coords(e);
      for (var i = layers.length - 1; i >= 0; i--) {
        var l = layers[i];
        if (hit(l, p)) {
          pushHistory();
          select(l.id);
          dragging = true;
          offsetX = p.x - l.x;
          offsetY = p.y - l.y;
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      selected = null;
      draw(); renderLayers(); renderEditor();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var p = coords(e);
      var l = current();
      if (!l) return;
      l.x = clamp(p.x - offsetX, 0, W);
      l.y = clamp(p.y - offsetY, 0, H);
      draw();
      syncPositionSliders();
    });

    canvas.addEventListener('pointerup', function () {
      if (dragging) { dragging = false; scheduleSave(); }
    });
    canvas.addEventListener('pointercancel', function () {
      if (dragging) { dragging = false; scheduleSave(); }
    });

    /* keyboard nudge */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      var l = current();
      if (!l) return;
      var step = e.shiftKey ? 20 : 2;
      var moved = true;
      if (e.key === 'ArrowLeft') l.x = clamp(l.x - step, 0, W);
      else if (e.key === 'ArrowRight') l.x = clamp(l.x + step, 0, W);
      else if (e.key === 'ArrowUp') l.y = clamp(l.y - step, 0, H);
      else if (e.key === 'ArrowDown') l.y = clamp(l.y + step, 0, H);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo(); return;
      } else moved = false;

      if (moved) {
        e.preventDefault();
        draw(); syncPositionSliders(); scheduleSave();
      }
    });
  }

  function bindPhoto() {
    var input = document.getElementById('photo');
    if (input) {
      input.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          Zippy.toast('Please select an image file.');
          return;
        }
        if (file.size > 12 * 1024 * 1024) {
          Zippy.toast('Image is larger than 12 MB — try a smaller one.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          var img = new Image();
          img.onload = function () {
            pushHistory();
            photo = img;
            photoData = ev.target.result;
            draw(); scheduleSave();
          };
          img.onerror = function () { Zippy.toast('That image could not be loaded.'); };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    var rm = document.getElementById('removePhoto');
    if (rm) {
      rm.onclick = function () {
        if (!photo) return;
        pushHistory();
        photo = null; photoData = null;
        if (input) input.value = '';
        draw(); scheduleSave();
      };
    }
  }

  function exportPng(scale) {
    var out = document.createElement('canvas');
    out.width = W * scale;
    out.height = H * scale;
    var octx = out.getContext('2d');
    octx.scale(scale, scale);

    var realCtx = ctx;
    ctx = octx;
    exporting = true;
    draw();
    exporting = false;
    ctx = realCtx;
    draw();

    Zippy.downloadDataUrl(out.toDataURL('image/png'), 'Zippy-AI-Thumbnail' + (scale > 1 ? '@2x' : '') + '.png');
    Zippy.toast('PNG downloaded (' + out.width + '×' + out.height + ')');
  }

  function reset() {
    if (!confirm('Reset your entire design? This cannot be undone.')) return;
    pushHistory();
    layers = [];
    photo = null; photoData = null;
    selected = null;
    var input = document.getElementById('photo');
    if (input) input.value = '';
    draw(); renderLayers(); renderEditor(); scheduleSave();
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (booted) return;
    canvas = document.getElementById('canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    booted = true;

    loadSaved();
    bindCanvas();
    bindPhoto();

    document.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.onclick = function () {
        var kind = btn.dataset.add;
        if (kind === 'text') addText();
        else if (kind === 'color') addColorLayer();
        else if (kind === 'duplicate') duplicate();
        else addShape(kind);
      };
    });

    var d1 = document.getElementById('download1x');
    var d2 = document.getElementById('download2x');
    var u = document.getElementById('undoBtn');
    var r = document.getElementById('redoBtn');
    var rs = document.getElementById('resetBtn');
    if (d1) d1.onclick = function () { exportPng(1); };
    if (d2) d2.onclick = function () { exportPng(2); };
    if (u) u.onclick = undo;
    if (r) r.onclick = redo;
    if (rs) rs.onclick = reset;

    draw(); renderLayers(); renderEditor(); updateHistoryButtons();
  }

  return { init: init, draw: draw };
})();
