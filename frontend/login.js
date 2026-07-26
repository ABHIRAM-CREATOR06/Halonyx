/* ─── Halonyx — login.js ─── */

/* ── Network canvas background ── */
(function () {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, nodes = [], raf;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initNodes() {
    nodes = [];
    const count = Math.floor((W * H) / 18000);
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const maxDist = 120;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129,140,248,0.5)';
      ctx.fill();

      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dx = n.x - m.x, dy = n.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.2;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = `rgba(129,140,248,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }

  resize();
  initNodes();
  draw();

  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    resize();
    initNodes();
    draw();
  });
})();

/* ── Tab switching ── */
function switchTab(tab) {
  const createPanel = document.getElementById('panel-create');
  const connectPanel = document.getElementById('panel-connect');
  const tabCreate = document.getElementById('tab-create');
  const tabConnect = document.getElementById('tab-connect');
  const indicator = document.getElementById('tab-indicator');

  if (tab === 'create') {
    createPanel.style.display = '';
    connectPanel.style.display = 'none';
    tabCreate.classList.add('active');
    tabConnect.classList.remove('active');
    tabCreate.setAttribute('aria-selected', 'true');
    tabConnect.setAttribute('aria-selected', 'false');
    indicator.classList.remove('right');
  } else {
    createPanel.style.display = 'none';
    connectPanel.style.display = '';
    tabCreate.classList.remove('active');
    tabConnect.classList.add('active');
    tabCreate.setAttribute('aria-selected', 'false');
    tabConnect.setAttribute('aria-selected', 'true');
    indicator.classList.add('right');
  }
}

/* ── Generate Fallback USID ── */
function generateUSID() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return '0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Toast ── */
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3800);
}

/* ── Form validation helpers ── */
function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors(...ids) {
  ids.forEach(id => setError(id, ''));
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  loading ? btn.classList.add('loading') : btn.classList.remove('loading');
}

/* ── Create Identity handler (Connected to Backend) ── */
async function handleCreate(e) {
  e.preventDefault();
  clearErrors('err-name', 'err-email');

  const name  = document.getElementById('create-name').value.trim();
  const email = document.getElementById('create-email').value.trim();

  let valid = true;
  if (!name) { setError('err-name', 'Name is required.'); valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('err-email', 'Enter a valid email address.'); valid = false;
  }
  if (!valid) return;

  setLoading('btn-create', true);

  try {
    const res = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });

    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem('halonyx_usid', data.usid);
      sessionStorage.setItem('halonyx_name', name);
      sessionStorage.setItem('halonyx_email', email);
      if (data.token) sessionStorage.setItem('halonyx_token', data.token);

      document.getElementById('usid-value').textContent = data.usid;
      document.getElementById('usid-display').style.display = '';
      document.getElementById('form-create').style.display = 'none';
      showToast('Identity registered on backend! Copy your USID.', 'success');
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server signup failed');
    }
  } catch (err) {
    console.warn('Backend server connection fallback:', err.message);
    // Offline / Standalone mode fallback
    const usid = generateUSID();
    sessionStorage.setItem('halonyx_usid', usid);
    sessionStorage.setItem('halonyx_name', name);
    sessionStorage.setItem('halonyx_email', email);

    document.getElementById('usid-value').textContent = usid;
    document.getElementById('usid-display').style.display = '';
    document.getElementById('form-create').style.display = 'none';
    showToast('Identity generated locally. Copy your USID before proceeding.', 'success');
  } finally {
    setLoading('btn-create', false);
  }
}

/* ── Connect handler (Connected to Backend) ── */
async function handleConnect(e) {
  e.preventDefault();
  clearErrors('err-identifier');

  const identifier = document.getElementById('connect-identifier').value.trim();

  if (!identifier) {
    setError('err-identifier', 'USID or registered email is required.');
    return;
  }

  setLoading('btn-connect', true);

  const isEmail = identifier.includes('@');
  const payload = isEmail ? { email: identifier } : { usid: identifier };

  try {
    const res = await fetch('/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem('halonyx_auth', '1');
      sessionStorage.setItem('halonyx_usid', data.usid);
      sessionStorage.setItem('halonyx_name', data.name || 'Agent');
      sessionStorage.setItem('halonyx_email', data.email || identifier);
      if (data.token) sessionStorage.setItem('halonyx_token', data.token);

      showToast('Connected to Halonyx server! Loading workspace...', 'success');
      setTimeout(() => {
        window.location.href = 'app.html';
      }, 700);
    } else {
      const errData = await res.json().catch(() => ({}));
      setError('err-identifier', errData.error || 'Identity not found. Check your USID or email.');
      showToast(errData.error || 'Connect failed', 'error');
    }
  } catch (err) {
    console.warn('Backend connection fallback:', err.message);
    // Offline / Standalone mode fallback
    sessionStorage.setItem('halonyx_auth', '1');
    sessionStorage.setItem('halonyx_usid', identifier.startsWith('0x') ? identifier : generateUSID());
    sessionStorage.setItem('halonyx_name', isEmail ? identifier.split('@')[0] : 'Agent');
    sessionStorage.setItem('halonyx_email', isEmail ? identifier : 'agent@halonyx.sec');

    showToast('Connected in offline mode. Loading workspace...', 'success');
    setTimeout(() => {
      window.location.href = 'app.html';
    }, 700);
  } finally {
    setLoading('btn-connect', false);
  }
}

/* ── Copy USID ── */
function copyUSID() {
  const usid = document.getElementById('usid-value').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(usid)
      .then(() => showToast('USID copied to clipboard.', 'success'))
      .catch(() => fallbackCopy(usid));
  } else {
    fallbackCopy(usid);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('USID copied to clipboard.', 'success');
}

/* ── Proceed to app ── */
function proceedToApp() {
  sessionStorage.setItem('halonyx_auth', '1');
  window.location.href = 'app.html';
}

/* ── Forgot flow ── */
function showForgotFlow() {
  showToast('Recovery: Enter your USID or registered email in the field to connect.', 'info');
}
