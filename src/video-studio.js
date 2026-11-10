// Magic Hour API + Local Fallback

const MAGIC_HOUR_BASE = 'https://api.magichour.ai/v1';
let scenes = [];
let playing = false;
let playStart = 0;
let playRaf = null;
let cancelExport = false;

function loadVideoSettings() {
  return { apiKey: localStorage.getItem('zippy.vidKey') || '' };
}

function updateVideoKeyNotice() {
  const { apiKey } = loadVideoSettings();
  const el = document.getElementById('videoKeyNotice');
  if (!el) return;
  if (apiKey) {
    el.className = 'notice ok';
    el.textContent = '✅ Magic Hour key detected — AI video generation is available.';
  } else {
    el.className = 'notice warn';
    el.textContent = 'ℹ️ No Magic Hour key set. Video export uses a local canvas renderer. Add a key in ⚙️ Settings for AI scenes.';
  }
}

function buildStoryboard() {
  const script = document.getElementById('vidScript').value.trim();
  if (!script) return;
  const lines = script.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  scenes = lines.map((text, i) => ({
    id: crypto.randomUUID(),
    text, duration: 4,
    color: `hsl(${(i * 47) % 360}, 60%, 30%)`,
  }));
  renderTimeline();
  drawScene(0);
}

function renderTimeline() {
  const el = document.getElementById('vidTimeline');
  if (!scenes.length) {
    el.innerHTML = '<p class="small">No scenes yet — build a storyboard or add images.</p>';
    return;
  }
  el.innerHTML = scenes.map((s, i) => `
    <div class="scene-item" data-id="${s.id}">
      ${s.imgUrl ? `<img src="${s.imgUrl}" alt="">` : `<div style="width:80px;height:45px;background:${s.color};border-radius:4px"></div>`}
      <div class="scene-info"><strong>Scene ${i + 1}</strong><br><span class="small">${escapeHtml(s.text.slice(0, 60))}</span></div>
      <button class="scene-del" data-del="${s.id}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      scenes = scenes.filter(s => s.id !== btn.dataset.del);
      renderTimeline();
    });
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const vidCanvas = document.getElementById('vidCanvas');
const vidCtx = vidCanvas.getContext('2d');

function drawScene(index) {
  vidCtx.clearRect(0, 0, vidCanvas.width, vidCanvas.height);
  const s = scenes[index];
  if (!s) return;
  if (s.imgUrl) {
    const img = new Image();
    img.onload = () => { vidCtx.drawImage(img, 0, 0, vidCanvas.width, vidCanvas.height); drawCaption(s.text); };
    img.src = s.imgUrl;
  } else {
    vidCtx.fillStyle = s.color || '#1e293b';
    vidCtx.fillRect(0, 0, vidCanvas.width, vidCanvas.height);
    drawCaption(s.text);
  }
}

function drawCaption(text) {
  vidCtx.fillStyle = 'rgba(0,0,0,.55)';
  vidCtx.fillRect(0, vidCanvas.height - 140, vidCanvas.width, 140);
  vidCtx.fillStyle = '#fff';
  vidCtx.font = 'bold 42px system-ui';
  vidCtx.textAlign = 'center';
  vidCtx.textBaseline = 'middle';
  vidCtx.fillText(text, vidCanvas.width / 2, vidCanvas.height - 70, vidCanvas.width - 80);
}

function playPreview() {
  if (!scenes.length || playing) return;
  playing = true;
  playStart = performance.now();
  cancelExport = false;
  const totalDur = scenes.reduce((a, s) => a + s.duration, 0) * 1000;
  let elapsed = 0;
  function tick(now) {
    if (!playing) return;
    elapsed = now - playStart;
    if (elapsed >= totalDur) { stopPreview(); return; }
    let acc = 0;
    for (let i = 0; i < scenes.length; i++) {
      const d = scenes[i].duration * 1000;
      if (elapsed < acc + d) { drawScene(i); break; }
      acc += d;
    }
    document.getElementById('vidTime').textContent = `${(elapsed / 1000).toFixed(1)}s / ${(totalDur / 1000).toFixed(1)}s`;
    playRaf = requestAnimationFrame(tick);
  }
  playRaf = requestAnimationFrame(tick);
}

function stopPreview() {
  playing = false;
  if (playRaf) cancelAnimationFrame(playRaf);
  document.getElementById('vidTime').textContent = `0.0s / ${(scenes.reduce((a, s) => a + s.duration, 0)).toFixed(1)}s`;
}

function addImages(files) {
  for (const f of files) {
    scenes.push({ id: crypto.randomUUID(), text: f.name.replace(/\.[^.]+$/, ''), imgUrl: URL.createObjectURL(f), duration: 4 });
  }
  renderTimeline();
}

function addColorCard() {
  scenes.push({ id: crypto.randomUUID(), text: 'Colour card', color: `hsl(${Math.random() * 360}, 60%, 35%)`, duration: 4 });
  renderTimeline();
}

function setProgress(pct, text) {
  const wrap = document.getElementById('vidProgress');
  const fill = document.getElementById('vidProgressFill');
  const track = wrap.querySelector('.progress-track');
  wrap.hidden = false;
  fill.style.width = `${pct}%`;
  track.setAttribute('aria-valuenow', Math.round(pct));
  if (text) document.getElementById('vidProgressText').textContent = text;
}

function hideProgress() { document.getElementById('vidProgress').hidden = true; }

async function exportVideo() {
  if (!scenes.length) { alert('Add at least one scene first.'); return; }
  const { apiKey } = loadVideoSettings();
  if (apiKey) await exportWithMagicHour(apiKey);
  else await exportLocally();
}

async function exportWithMagicHour(apiKey) {
  const btn = document.getElementById('vidExport');
  btn.disabled = true;
  cancelExport = false;
  setProgress(2, 'Submitting to Magic Hour…');
  try {
    for (let i = 0; i < scenes.length; i++) {
      if (cancelExport) throw new Error('Cancelled');
      setProgress(Math.round((i / scenes.length) * 90), `Generating scene ${i + 1} / ${scenes.length}…`);
      const res = await fetch(`${MAGIC_HOUR_BASE}/text-to-video`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Zippy scene ${i + 1}`, end_seconds: scenes[i].duration, aspect_ratio: '16:9', resolution: '480p', model: 'ltx-2.5', style: { prompt: scenes[i].text } }),
      });
      if (!res.ok) throw new Error(`Magic Hour error: ${await res.text()}`);
      const job = await res.json();
      const jobId = job.id || job.job_id;
      let videoUrl = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (cancelExport) throw new Error('Cancelled');
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(`${MAGIC_HOUR_BASE}/video-projects/${jobId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!poll.ok) continue;
        const status = await poll.json();
        const state = status.status || status.state;
        if (state === 'complete') { videoUrl = status.download?.url || status.video_url; break; }
        if (state === 'error') throw new Error('Magic Hour job failed');
        setProgress(Math.round((i / scenes.length) * 90 + (attempt / 120) * (90 / scenes.length)), `Scene ${i + 1}: ${state}…`);
      }
      if (!videoUrl) throw new Error('Timeout');
      const vidRes = await fetch(videoUrl);
      const blob = await vidRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `zippy-scene-${i + 1}.mp4`; a.click();
    }
    setProgress(100, '✅ All scenes exported.');
    setTimeout(hideProgress, 2000);
  } catch (err) {
    if (!cancelExport) alert(`Export failed: ${err.message}`);
    hideProgress();
  } finally { btn.disabled = false; }
}

async function exportLocally() {
  const btn = document.getElementById('vidExport');
  btn.disabled = true;
  cancelExport = false;
  setProgress(5, 'Recording canvas…');
  const stream = vidCanvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(resolve => { recorder.onstop = resolve; });
  recorder.start();
  const totalDur = scenes.reduce((a, s) => a + s.duration, 0);
  const start = performance.now();
  for (let i = 0; i < scenes.length; i++) {
    if (cancelExport) break;
    const dur = scenes[i].duration * 1000;
    const sceneStart = performance.now();
    while (performance.now() - sceneStart < dur) {
      drawScene(i);
      setProgress(Math.min(95, (performance.now() - start) / 1000 / totalDur * 100), `Recording scene ${i + 1}…`);
      await new Promise(r => setTimeout(r, 33));
      if (cancelExport) break;
    }
  }
  recorder.stop();
  await done;
  if (chunks.length) {
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `zippy-video.${mime.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    setProgress(100, '✅ Saved.');
  }
  setTimeout(hideProgress, 2000);
  btn.disabled = false;
}

function initVideoStudio() {
  updateVideoKeyNotice();
  document.getElementById('vidStoryboard').addEventListener('click', buildStoryboard);
  document.getElementById('vidPlay').addEventListener('click', playPreview);
  document.getElementById('vidStop').addEventListener('click', stopPreview);
  document.getElementById('vidExport').addEventListener('click', exportVideo);
  document.getElementById('vidCancel').addEventListener('click', () => { cancelExport = true; });
  document.getElementById('vidAddColor').addEventListener('click', addColorCard);
  document.getElementById('vidImages').addEventListener('change', e => {
    if (e.target.files.length) addImages(e.target.files);
    e.target.value = '';
  });
  renderTimeline();
                  }
