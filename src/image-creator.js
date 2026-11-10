// Pollinations.ai — keyless, free, CORS-friendly image generation

const IMG_API_BASE = 'https://image.pollinations.ai';

function loadImageSettings() {
  return {
    apiKey: localStorage.getItem('zippy.imgKey') || '',
    baseUrl: localStorage.getItem('zippy.imgBase') || IMG_API_BASE,
  };
}

function updateImageKeyNotice() {
  const { apiKey } = loadImageSettings();
  const el = document.getElementById('imageKeyNotice');
  if (!el) return;
  if (apiKey) {
    el.className = 'notice ok';
    el.textContent = '✅ API key detected — using your key.';
  } else {
    el.className = 'notice warn';
    el.textContent = 'ℹ️ Demo mode active: Pollinations.ai (keyless, free). Images generate without a key.';
  }
}

async function generateImage() {
  const promptEl = document.getElementById('imgPrompt');
  const ratioEl  = document.getElementById('imgRatio');
  const styleEl  = document.getElementById('imgStyle');
  const statusEl = document.getElementById('imgStatus');
  const btn      = document.getElementById('imgGenerate');
  const panel    = document.getElementById('imgResultPanel');

  const prompt = promptEl.value.trim();
  if (!prompt) {
    statusEl.textContent = '⚠️ Please enter a prompt.';
    return;
  }

  const ratio = ratioEl.value;
  let width = 1024, height = 1024;
  if (ratio === '16:9') { width = 1280; height = 720; }
  else if (ratio === '9:16') { width = 720; height = 1280; }

  const styleMap = {
    photographic: 'photographic, realistic',
    cinematic: 'cinematic lighting, film still',
    illustration: 'digital illustration',
    '3d-render': '3D render, octane',
    'flat-vector': 'flat vector art',
    watercolor: 'watercolour painting',
  };
  const styleSuffix = styleMap[styleEl.value] || '';
  const fullPrompt = styleSuffix ? `${prompt}, ${styleSuffix}` : prompt;

  const { baseUrl } = loadImageSettings();
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model: 'flux',
  });
  const url = `${baseUrl.replace(/\/$/, '')}/prompt/${encodeURIComponent(fullPrompt)}?${params}`;

  btn.disabled = true;
  statusEl.textContent = '⏳ Generating… (may take 5–20 seconds)';
  panel.hidden = true;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error('Provider returned a non-image response.');
    }
    const objUrl = URL.createObjectURL(blob);

    const imgEl = document.getElementById('imgResult');
    imgEl.src = objUrl;
    imgEl.alt = prompt;
    imgEl.dataset.blobUrl = objUrl;

    document.getElementById('imgMeta').textContent =
      `${width} × ${height} · ${(blob.size / 1024).toFixed(0)} KB · ${styleEl.value}`;

    panel.hidden = false;
    statusEl.textContent = '✅ Done.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = `❌ Error: ${err.message}. Pollinations may be rate-limited; try again in a moment.`;
    panel.hidden = true;
  } finally {
    btn.disabled = false;
  }
}

function downloadImage() {
  const imgEl = document.getElementById('imgResult');
  const blobUrl = imgEl.dataset.blobUrl;
  if (!blobUrl) return;

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `zippy-ai-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function initImageCreator() {
  updateImageKeyNotice();
  document.getElementById('imgGenerate').addEventListener('click', generateImage);
  document.getElementById('imgAgain').addEventListener('click', generateImage);
  document.getElementById('imgDownload').addEventListener('click', downloadImage);
}
