import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
const root = document.querySelector<HTMLDivElement>('#root');

if (!root) {
  throw new Error('Missing root element');
}

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function shell(content: string) {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <h1 data-testid="app-title">QA KSink Site</h1>
          <p data-testid="build-info">loading</p>
        </div>
        <nav aria-label="Main navigation">
          <button data-testid="nav-dashboard">Dashboard</button>
          <button data-testid="nav-login">Login</button>
          <button data-testid="nav-forms">Forms</button>
          <button data-testid="nav-grid">Grid</button>
          <button data-testid="nav-async">Async</button>
        </nav>
      </header>
      <section class="panel" data-testid="active-page">${content}</section>
    </main>
  `;

  document.querySelector('[data-testid="nav-dashboard"]')?.addEventListener('click', dashboard);
  document.querySelector('[data-testid="nav-login"]')?.addEventListener('click', login);
  document.querySelector('[data-testid="nav-forms"]')?.addEventListener('click', forms);
  document.querySelector('[data-testid="nav-grid"]')?.addEventListener('click', grid);
  document.querySelector('[data-testid="nav-async"]')?.addEventListener('click', asyncLab);

  api('/build-info')
    .then((info) => {
      const el = document.querySelector('[data-testid="build-info"]');
      if (el) el.textContent = `${info.branch} / ${info.version} / ${info.bugProfile}`;
    })
    .catch(() => {
      const el = document.querySelector('[data-testid="build-info"]');
      if (el) el.textContent = 'offline';
    });
}

function dashboard() {
  shell(`
    <h2 data-testid="dashboard-heading">Dashboard</h2>
    <div class="cards">
      <article class="card" data-testid="metric-products"><strong>Products</strong><span>Seeded API records</span></article>
      <article class="card" data-testid="metric-tests"><strong>QA surfaces</strong><span>Forms, grid, auth, async</span></article>
      <article class="card" data-testid="metric-purpose"><strong>Purpose</strong><span>Visible browser automation target</span></article>
    </div>
  `);
}

function login() {
  shell(`
    <form class="stack" data-testid="login-form">
      <h2>Authentication Lab</h2>
      <label>Email<input data-testid="login-email" value="admin@example.com"></label>
      <label>Passphrase<input data-testid="login-password" type="password" value="demo"></label>
      <button data-testid="login-submit" type="submit">Sign in</button>
      <p data-testid="login-message"></p>
    </form>
  `);
  document.querySelector('[data-testid="login-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = (document.querySelector('[data-testid="login-email"]') as HTMLInputElement).value;
    const password = (document.querySelector('[data-testid="login-password"]') as HTMLInputElement).value;
    const message = document.querySelector('[data-testid="login-message"]');
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (message) message.textContent = `Signed in as ${result.user.role}`;
    } catch {
      if (message) message.textContent = 'Invalid email or password';
    }
  });
}

function forms() {
  shell(`
    <form class="stack" data-testid="complex-form">
      <h2>Form Gauntlet</h2>
      <label>Full name<input data-testid="form-full-name" required value="Test User"></label>
      <button data-testid="form-submit" type="submit">Submit form</button>
      <p data-testid="form-message"></p>
    </form>
  `);
  document.querySelector('[data-testid="complex-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = (document.querySelector('[data-testid="form-full-name"]') as HTMLInputElement).value;
    const message = document.querySelector('[data-testid="form-message"]');
    try {
      const result = await api('/forms/complex', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email: 'test@example.com', quantity: 3, requested_date: '2026-02-28', currency_amount: 10.005, terms: true })
      });
      if (message) message.textContent = `Saved ${result.normalized.currencyAmount.toFixed(2)}`;
    } catch {
      if (message) message.textContent = 'Form rejected';
    }
  });
}

async function grid() {
  shell(`
    <div class="stack">
      <h2>Data Grid Lab</h2>
      <label>Search<input data-testid="grid-search"></label>
      <p data-testid="grid-status">Loading products</p>
      <table data-testid="products-grid"><tbody data-testid="grid-body"></tbody></table>
    </div>
  `);

  async function load() {
    const query = (document.querySelector('[data-testid="grid-search"]') as HTMLInputElement).value;
    const status = document.querySelector('[data-testid="grid-status"]');
    const body = document.querySelector('[data-testid="grid-body"]');
    const result = await api(`/products?q=${encodeURIComponent(query)}&sort=name&direction=asc`);
    if (status) status.textContent = `Loaded ${result.items.length} products`;
    if (body) body.innerHTML = result.items.map((item: any) => `<tr data-testid="grid-row"><td>${item.name}</td><td>${item.category}</td><td>${Number(item.price).toFixed(2)}</td></tr>`).join('');
  }

  document.querySelector('[data-testid="grid-search"]')?.addEventListener('input', load);
  await load();
}

function asyncLab() {
  shell(`
    <div class="stack">
      <h2>Async Lab</h2>
      <button data-testid="async-run">Run slow request</button>
      <p data-testid="async-status">Idle</p>
    </div>
  `);
  document.querySelector('[data-testid="async-run"]')?.addEventListener('click', async () => {
    const status = document.querySelector('[data-testid="async-status"]');
    if (status) status.textContent = 'Loading';
    try {
      const result = await api('/slow?delay_ms=750');
      if (status) status.textContent = `Completed after ${result.delayMs}ms`;
    } catch {
      if (status) status.textContent = 'Failed';
    }
  });
}

dashboard();
