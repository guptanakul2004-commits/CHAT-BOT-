/* ============================================================
   AXON AI — public/script.js  (Frontend)

   KEY DIFFERENCE from old version:
   ✅ BEFORE: Browser called Gemini API directly (API key visible)
   ✅ NOW:    Browser calls OUR Node.js server → server calls Gemini
              The API key NEVER reaches the browser.
   ============================================================ */


// ── 1. CONFIG ──
// We call OUR OWN server — NOT Gemini directly
// No API key needed here at all!
const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
const SERVER_URL = `${BASE_URL}/api/chat`;
const UPLOAD_URL = `${BASE_URL}/api/upload`;
const HEALTH_URL = `${BASE_URL}/health`;


// ── 2. STATE ──
let sessions = JSON.parse(localStorage.getItem('axon_s') || '[]');
let activeId = null;
let busy     = false;
let uploadedDocuments = [];

const LOGIN_PAGE = 'login.html';
const AUTH_KEY   = 'axon_auth';
const AUTH_USER  = 'axon_user';
const THEME_KEY  = 'axon_theme';

const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
document.documentElement.classList.toggle('light-theme', savedTheme === 'light');

function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === 'true';
}

function logout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER);
  window.location.href = LOGIN_PAGE;
}

function applyTheme(theme) {
  const activeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('light-theme', activeTheme === 'light');
  document.documentElement.dataset.theme = activeTheme;
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.textContent = activeTheme === 'light' ? '🌙' : '☀️';
    toggle.title = activeTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    toggle.setAttribute('aria-label', toggle.title);
  }
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(stored);
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ── 3. INIT ──
window.addEventListener('load', () => {
  loadTheme();

  if (!isAuthenticated()) {
    window.location.href = LOGIN_PAGE;
    return;
  }

  if (!sessions.length) newSess(false);
  else { activeId = sessions[0].id; renderSL(); loadSess(activeId); }
  initFileUploader();
  document.getElementById('mi').focus();
  checkServer(); // Ping server on startup to confirm it's running
});


async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __rawText: text };
  }
}

// ── 4. CHECK SERVER IS RUNNING ──
// Calls the /health endpoint to verify Node.js server is up
async function checkServer() {
  try {
    const res  = await fetch(HEALTH_URL);
    const data = await parseJsonSafe(res);
    if (data?.status === 'online') {
      console.log('✅ Server connected:', data.message);
      return;
    }
    throw new Error('Invalid server health response');
  } catch(e) {
    // Server not running — show error banner
    const banner = document.getElementById('server-error');
    if (banner) {
      banner.textContent = '⚠ Server not running. Open terminal and run: node server.js';
      banner.classList.add('show');
    }
  }
}


// ── 5. SESSION MANAGEMENT ──
const gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);

function newSess(focus = true) {
  const s = { id: gid(), title: 'New Conversation', history: [], ts: Date.now() };
  sessions.unshift(s);
  activeId = s.id;
  saveToStorage();
  renderSL();
  clearArea();
  setTopbar('New Conversation');
  setMct(0);
  if (focus) document.getElementById('mi').focus();
}

function getAct() { return sessions.find(x => x.id === activeId); }

function loadSess(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  activeId = id;
  renderSL();
  clearArea(false);
  setTopbar(s.title);
  s.history.forEach(m => addBub(m.role === 'user' ? 'user' : 'ai', m.parts[0].text, false));
  setMct(s.history.length);
  document.getElementById('chat').scrollTop = 99999;
}

function saveToStorage() {
  try { localStorage.setItem('axon_s', JSON.stringify(sessions.slice(0,25))); } catch(e) {}
}

function renderSL() {
  const el = document.getElementById('sl');
  el.innerHTML = '';
  sessions.forEach(s => {
    const d = document.createElement('div');
    d.className = 's-item' + (s.id === activeId ? ' active' : '');
    const dt = new Date(s.ts).toLocaleDateString([], {month:'short', day:'numeric'});
    const mc = s.history.filter(h => h.role === 'user').length;
    d.innerHTML = `<div class="s-title">${esc(s.title)}</div><div class="s-meta">${dt} · ${mc} msgs</div>`;
    d.onclick = () => { loadSess(s.id); closeSB(); };
    el.appendChild(d);
  });
}

function setTopbar(t) { document.getElementById('tbt').textContent = t; }
function setMct(n) { document.getElementById('mct').textContent = n + ' message' + (n !== 1 ? 's' : ''); }


// ── 6. INPUT HANDLERS ──
function onInp(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  const l = el.value.length;
  document.getElementById('cc').textContent = l > 60 ? l : '';
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}

function useChip(btn) {
  const b   = btn.querySelector('b').textContent;
  const sub = btn.querySelector('.chip-txt').lastChild.textContent.trim();
  document.getElementById('mi').value = `Help me with: ${b} — ${sub}`;
  onInp(document.getElementById('mi'));
  send();
}

function startVoiceInput() {
  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    document.getElementById('mi').value = text;
    onInp(document.getElementById('mi'));
  };
  recognition.start();
}

function initFileUploader() {
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const dropArea = document.getElementById('dropArea');

  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleFileUpload(file);
  });

  if (dropArea) {
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      await handleFileUpload(file);
    });
  }
}

async function handleFileUpload(file) {
  const filePreview = document.getElementById('filePreview');
  if (filePreview) {
    filePreview.innerHTML = `📄 ${file.name}`;

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      img.style.width = '120px';
      filePreview.innerHTML = '';
      filePreview.appendChild(img);
      filePreview.insertAdjacentHTML('beforeend', `<div>${file.name}</div>`);
    }
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    const data = await parseJsonSafe(res);
    if (!res.ok) throw new Error(data?.error || data?.__rawText || 'Upload failed');

    uploadedDocuments.push({
      name: data.filename,
      content: data.text || '',
      type: file.type,
    });

    addBub('ai', `File uploaded successfully ✅ ${data.filename}`);
    if (data.text) {
      addBub('ai', `Extracted text preview:\n${data.text.slice(0, 250)}`);
    }
  } catch (err) {
    addBub('ai', `Upload failed ❌ ${err.message}`);
  }
}


// ── 7. CLEAR / WELCOME ──
function clearArea(showW = true) {
  document.getElementById('chat').innerHTML = showW ? welcomeHTML() : '';
}

function clearCur() {
  if (!confirm('Clear this conversation?')) return;
  const s = getAct();
  if (s) { s.history = []; s.title = 'New Conversation'; saveToStorage(); renderSL(); }
  clearArea(true);
  setTopbar('New Conversation');
  setMct(0);
}

function dismissW() {
  const w = document.getElementById('welcome');
  if (w) { w.style.opacity='0'; w.style.transform='scale(.97)'; w.style.transition='all .25s'; setTimeout(()=>w.remove(),250); }
}

function welcomeHTML() {
  return `
  <div id="welcome">
    <div class="w-orb">
      <svg viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="rgba(99,179,237,.14)" stroke-width="1"/>
        <circle cx="50" cy="50" r="36" stroke="rgba(99,179,237,.22)" stroke-width=".8" stroke-dasharray="5 5"/>
        <circle cx="50" cy="50" r="24" stroke="rgba(79,209,197,.4)" stroke-width="1.2"/>
        <path d="M50 26 L57 44 L50 50 L43 44 Z" fill="rgba(99,179,237,.55)"/>
        <path d="M50 74 L43 56 L50 50 L57 56 Z" fill="rgba(79,209,197,.45)"/>
        <path d="M26 50 L44 43 L50 50 L44 57 Z" fill="rgba(99,179,237,.35)"/>
        <path d="M74 50 L56 57 L50 50 L56 43 Z" fill="rgba(79,209,197,.5)"/>
        <circle cx="50" cy="50" r="5" fill="#63b3ed"/>
      </svg>
    </div>
    <div class="w-title">Hello, I'm Axon</div>
    <div class="w-sub">Intelligent AI Assistant</div>
    <div class="w-secure">🔒 API Key Secured via Node.js Backend</div>
    <div class="chips">
      <button class="chip" onclick="useChip(this)"><span class="chip-ic">💻</span><span class="chip-txt"><b>Write Code</b>Python, JavaScript, C++</span></button>
      <button class="chip" onclick="useChip(this)"><span class="chip-ic">🧠</span><span class="chip-txt"><b>Explain Topics</b>Science, Math, Tech</span></button>
      <button class="chip" onclick="useChip(this)"><span class="chip-ic">✍️</span><span class="chip-txt"><b>Write Content</b>Essays, emails, reports</span></button>
      <button class="chip" onclick="useChip(this)"><span class="chip-ic">🐛</span><span class="chip-txt"><b>Debug Code</b>Find and fix bugs fast</span></button>
    </div>
  </div>`;
}


// ── 8. ADD MESSAGE BUBBLE ──
function addBub(role, text, animate = true) {
  const area = document.getElementById('chat');
  const now  = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

  const row = document.createElement('div');
  row.className = `row ${role}`;
  if (!animate) row.style.animation = 'none';

  const av = document.createElement('div');
  av.className = `av ${role}`;
  av.textContent = role === 'ai' ? '◈' : '◎';

  const mc  = document.createElement('div'); mc.className = 'mc';
  const lbl = document.createElement('div'); lbl.className = 'mlabel'; lbl.textContent = role === 'ai' ? 'AXON' : 'YOU';
  const bub = document.createElement('div'); bub.className = 'bub'; bub.innerHTML = fmt(text);

  bub.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'cp-btn'; btn.textContent = 'COPY';
    btn.onclick = () => { navigator.clipboard.writeText(pre.querySelector('code')?.innerText||''); btn.textContent='✓ DONE'; setTimeout(()=>btn.textContent='COPY',1500); };
    pre.appendChild(btn);
  });

  const act = document.createElement('div'); act.className = 'mact';
  act.innerHTML = `<span class="mtime">${now}</span>`;
  if (role === 'ai') {
    const cb = document.createElement('button'); cb.className = 'mcopy'; cb.textContent = '⎘ copy';
    cb.onclick = () => { navigator.clipboard.writeText(text); cb.textContent='✓ copied'; setTimeout(()=>cb.textContent='⎘ copy',1500); };
    act.appendChild(cb);
  }

  mc.appendChild(lbl); mc.appendChild(bub); mc.appendChild(act);
  row.appendChild(av); row.appendChild(mc);
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}


// ── 9. FORMAT TEXT ──
function fmt(t) {
  return esc(t)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_,l,c) => `<pre><code class="l-${l}">${c.trim()}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, (_,t) => `<strong style="font-size:15px;color:var(--text);display:block;margin:8px 0 4px">${t}</strong>`)
    .replace(/^[-•] (.+)$/gm, (_,t) => `<span style="display:block;padding-left:14px">• ${t}</span>`)
    .replace(/\n/g, '<br>');
}
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


// ── 10. TYPING INDICATOR ──
function showT() {
  const area = document.getElementById('chat');
  const row  = document.createElement('div');
  row.className = 'row ai'; row.id = 'trow';
  row.innerHTML = `<div class="av ai">◈</div><div class="mc"><div class="mlabel">AXON</div><div class="t-bub"><div class="td"></div><div class="td"></div><div class="td"></div></div></div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}
function hideT() { const r=document.getElementById('trow'); if(r) r.remove(); }


// ── 11. MAIN SEND FUNCTION ──
/*
  HOW THE SECURE FLOW WORKS:
  
  [Browser]  →  POST /api/chat  →  [Node.js Server]  →  Gemini API
                { history: [...] }    adds API key        AI response
                                   ↓
  [Browser]  ←  { reply: "..." }  ←  [Node.js Server]
  
  The API key ONLY lives in .env on the server.
  The browser NEVER sees it!
*/
async function send() {
  const inp  = document.getElementById('mi');
  const text = inp.value.trim();
  if (!text || busy) return;

  dismissW();
  busy = true;
  document.getElementById('sb').disabled = true;
  inp.value = ''; inp.style.height = 'auto';
  document.getElementById('cc').textContent = '';

  const s = getAct();
  addBub('user', text);
  s.history.push({ role: 'user', parts: [{ text }] });

  // Auto-title session
  if (s.history.length === 1) {
    s.title = text.slice(0,38) + (text.length > 38 ? '…' : '');
    setTopbar(s.title); renderSL();
  }

  showT();

  try {
    // ✅ Call OUR server — not Gemini directly
    // No API key in this request at all!
    const res = await fetch(SERVER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: s.history })   // Send conversation history
    });

    const data = await parseJsonSafe(res);

    if (!res.ok) {
      const errMsg = data?.error || data?.__rawText || res.statusText || `Server error ${res.status}`;
      if (res.status === 429) throw new Error('RATE_LIMIT');
      throw new Error(errMsg);
    }

    // Server returns just { reply: "..." }
    const reply = data?.reply || '(No response)';

    s.history.push({ role: 'model', parts: [{ text: reply }] });
    saveToStorage();
    hideT();
    addBub('ai', reply);
    setMct(s.history.length);
    renderSL();

  } catch(err) {
    hideT();
    if (err.message === 'Failed to fetch') {
      addBub('ai', `⚠️ **Cannot connect to server**\n\nMake sure the Node.js server is running:\n\`\`\`bash\nnode server.js\n\`\`\``);
    } else if (err.message.includes('RATE_LIMIT')) {
      addBub('ai', `⚠️ **Rate Limit Reached**\n\nFree tier: 15 requests/minute.\nWait a moment and try again.`);
    } else {
      addBub('ai', `⚠️ **Error:** ${err.message}`);
    }
  }

  busy = false;
  document.getElementById('sb').disabled = false;
  inp.focus();
}


// ── 12. EXPORT ──
function doExport() {
  const s = getAct();
  if (!s || !s.history.length) { toast('⚠ Nothing to export'); return; }
  const lines = [
    'AXON AI — Chat Export',
    '═'.repeat(44),
    `Session : ${s.title}`,
    `Date    : ${new Date().toLocaleString()}`,
    `Model   : OpenRouter Auto (Secure Node.js)`,
    '',
    ...s.history.map(m => `[${m.role.toUpperCase()}]\n${m.parts[0].text}`)
  ].join('\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines],{type:'text/plain'}));
  a.download = `axon-chat-${Date.now()}.txt`;
  a.click();
  toast('✓ Exported');
}


// ── 13. TOAST ──
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}


// ── 14. SIDEBAR ──
function togSB()   { document.getElementById('sidebar').classList.toggle('open'); }
function closeSB() { document.getElementById('sidebar').classList.remove('open'); }
document.addEventListener('click', e => {
  const sb  = document.getElementById('sidebar');
  const tog = document.getElementById('menu-tog');
  if (sb.classList.contains('open') && !sb.contains(e.target) && !tog.contains(e.target)) closeSB();
});

// ── 15. STOCK ANALYSIS ──
const STOCK_API_URL = `${BASE_URL}/api/stocks`;

function toggleStockPanel() {
  const panel = document.getElementById('stockPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('stockInput').focus();
  }
}

function closeStockPanel() {
  document.getElementById('stockPanel').classList.add('hidden');
}

async function analyzeStock() {
  const ticker = document.getElementById('stockInput').value.trim().toUpperCase();
  if (!ticker) {
    toast('⚠ Enter a stock symbol');
    return;
  }

  const resultDiv = document.getElementById('stockResult');
  const loadingDiv = document.getElementById('stockLoading');

  resultDiv.innerHTML = '';
  loadingDiv.classList.remove('hidden');

  try {
    const res = await fetch(`${STOCK_API_URL}/${ticker}/analysis`);
    const data = await parseJsonSafe(res);

    if (!res.ok || !data?.success) {
      throw new Error(data?.error || data?.__rawText || 'Analysis failed');
    }

    loadingDiv.classList.add('hidden');
    renderStockAnalysis(data);
    toast('✓ Analysis complete');

  } catch (err) {
    loadingDiv.classList.add('hidden');
    resultDiv.innerHTML = `<div style="color: #fc8181; padding: 16px; text-align: center;">
      ❌ Error: ${err.message}
    </div>`;
    toast(`⚠ ${err.message}`);
  }
}

function renderStockAnalysis(data) {
  const resultDiv = document.getElementById('stockResult');
  const { ticker, currentPrice, dayChange, dayChangePercent, indicators, sentiment, prediction, risk } = data;

  const changeClass = parseFloat(dayChange) >= 0 ? '' : 'negative';
  const changeSymbol = parseFloat(dayChange) >= 0 ? '▲' : '▼';

  let html = `
    <div class="stock-card">
      <div class="stock-price">
        <div class="value">$${parseFloat(currentPrice).toFixed(2)}</div>
        <div class="change ${changeClass}">
          ${changeSymbol} ${Math.abs(dayChange).toFixed(2)} (${dayChangePercent}%)
        </div>
      </div>

      <div class="stock-grid">
        <div class="stock-stat">
          <span class="stock-stat-label">RSI</span>
          <span class="stock-stat-value">${parseFloat(indicators.rsi).toFixed(1)}</span>
        </div>
        <div class="stock-stat">
          <span class="stock-stat-label">MACD</span>
          <span class="stock-stat-value">${parseFloat(indicators.macd.value).toFixed(4)}</span>
        </div>
        <div class="stock-stat">
          <span class="stock-stat-label">SMA 20</span>
          <span class="stock-stat-value">$${parseFloat(indicators.sma.sma20).toFixed(2)}</span>
        </div>
        <div class="stock-stat">
          <span class="stock-stat-label">SMA 50</span>
          <span class="stock-stat-value">$${parseFloat(indicators.sma.sma50).toFixed(2)}</span>
        </div>
      </div>

      <!-- AI Prediction -->
      <div class="stock-prediction">
        <div class="prediction-header">
          <span class="prediction-action">${prediction.emoji} ${prediction.action}</span>
          <span class="prediction-confidence">Confidence: ${prediction.confidence}%</span>
        </div>
        <div class="prediction-reason"><strong>Analysis:</strong> ${prediction.reason}</div>
        <div class="signals">
          ${prediction.signals.map(s => {
            let signalClass = '';
            if (s.includes('BEARISH') || s.includes('OVERSOLD') || s.includes('SELL')) {
              signalClass = 'bearish';
            } else if (s.includes('NEUTRAL') || s.includes('WEAK')) {
              signalClass = 'neutral';
            }
            return `<span class="signal ${signalClass}">${s}</span>`;
          }).join('')}
        </div>
      </div>

      <!-- Sentiment Analysis -->
      <div class="sentiment-section">
        <div class="sentiment-title">📰 Market Sentiment</div>
        <div class="sentiment-content">
          <div class="sentiment-emoji">${sentiment.emoji}</div>
          <div class="sentiment-info">
            <div class="sentiment-status">${sentiment.sentiment}</div>
            <div class="sentiment-score">Confidence: ${sentiment.confidence}%</div>
          </div>
        </div>
      </div>

      <!-- Technical Indicators -->
      <div class="indicator-section">
        <strong style="font-size: 12px; color: var(--blue);">📊 Technical Indicators</strong>
        <div class="indicator-grid" style="margin-top: 10px;">
          <div class="indicator">
            <div class="indicator-name">MACD Signal</div>
            <div class="indicator-value">${parseFloat(indicators.macd.signal).toFixed(4)}</div>
          </div>
          <div class="indicator">
            <div class="indicator-name">EMA 12</div>
            <div class="indicator-value">$${parseFloat(indicators.ema.ema12).toFixed(2)}</div>
          </div>
          <div class="indicator">
            <div class="indicator-name">BB Upper</div>
            <div class="indicator-value">$${indicators.bollingerBands.upper}</div>
          </div>
          <div class="indicator">
            <div class="indicator-name">BB Lower</div>
            <div class="indicator-value">$${indicators.bollingerBands.lower}</div>
          </div>
        </div>
      </div>

      <!-- Risk Assessment -->
      <div style="background: rgba(252,129,129,.08); border: 1px solid rgba(252,129,129,.25); border-left: 3px solid var(--red); border-radius: 8px; padding: 14px; margin-top: 12px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--red); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px;">⚠️ Risk Assessment</div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px;">
          <strong>Risk Level:</strong> ${risk.risk}
        </div>
        <div style="font-size: 13px; color: var(--text);">
          ${risk.recommendation}
        </div>
      </div>
    </div>
  `;

  resultDiv.innerHTML = html;
}

document.getElementById('mi').focus();
