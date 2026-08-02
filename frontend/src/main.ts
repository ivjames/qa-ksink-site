import './styles.css';

import { api, clearSession, getSession } from './api';
import { closeModal, escapeHtml } from './ui';
import { renderDashboard } from './pages/dashboard';
import { renderLogin } from './pages/login';
import { renderForms } from './pages/forms';
import { renderProducts } from './pages/products';
import { renderOrders } from './pages/orders';
import { renderUpload } from './pages/upload';
import { renderAsyncLab } from './pages/asynclab';
import { renderAdmin } from './pages/admin';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) {
  throw new Error('Missing root element');
}

const root = rootElement;

interface Route {
  hash: string;
  navTestId: string;
  label: string;
  render: (container: HTMLElement) => void | Promise<void>;
  adminOnly?: boolean;
}

const ROUTES: Route[] = [
  { hash: '#/dashboard', navTestId: 'nav-dashboard', label: 'Dashboard', render: renderDashboard },
  { hash: '#/login', navTestId: 'nav-login', label: 'Login', render: renderLogin },
  { hash: '#/forms', navTestId: 'nav-forms', label: 'Forms', render: renderForms },
  { hash: '#/products', navTestId: 'nav-grid', label: 'Grid', render: renderProducts },
  { hash: '#/orders', navTestId: 'nav-orders', label: 'Orders', render: renderOrders },
  { hash: '#/upload', navTestId: 'nav-upload', label: 'Upload', render: renderUpload },
  { hash: '#/async', navTestId: 'nav-async', label: 'Async', render: renderAsyncLab },
  { hash: '#/admin', navTestId: 'nav-admin', label: 'Admin', render: renderAdmin, adminOnly: true }
];

root.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <h1 data-testid="app-title">QA KSink Site</h1>
        <p data-testid="build-info">loading</p>
      </div>
      <nav></nav>
      <div class="session-area"></div>
    </header>
    <section class="panel" data-testid="active-page"></section>
  </main>
`;

const navElement = root.querySelector<HTMLElement>('nav');
const sessionArea = root.querySelector<HTMLElement>('.session-area');
const pageContainer = root.querySelector<HTMLElement>('[data-testid="active-page"]');

function currentRoute(): Route {
  return ROUTES.find((route) => route.hash === window.location.hash) ?? ROUTES[0];
}

function renderChrome(): void {
  const session = getSession();
  const active = currentRoute();
  if (navElement) {
    navElement.innerHTML = ROUTES.filter((route) => !route.adminOnly || session !== null)
      .map(
        (route) => `
          <button type="button" data-testid="${route.navTestId}" data-hash="${route.hash}"
            ${route.hash === active.hash ? 'aria-current="page"' : ''}>${route.label}</button>`
      )
      .join('');
    navElement.querySelectorAll<HTMLButtonElement>('[data-hash]').forEach((button) => {
      button.addEventListener('click', () => {
        window.location.hash = button.dataset.hash ?? '#/dashboard';
        renderPage();
      });
    });
  }
  if (sessionArea) {
    sessionArea.innerHTML = session
      ? `
        <span data-testid="session-user">${escapeHtml(session.user.name)} (${session.user.role})</span>
        <button type="button" data-testid="session-logout">Sign out</button>`
      : '<span data-testid="session-user">Not signed in</span>';
    sessionArea.querySelector('[data-testid="session-logout"]')?.addEventListener('click', () => {
      clearSession();
      renderChrome();
      if (window.location.hash === '#/dashboard' || window.location.hash === '') {
        renderPage();
      } else {
        window.location.hash = '#/dashboard';
      }
    });
  }
}

let renderedHash = '';

function renderPage(): void {
  renderedHash = window.location.hash;
  closeModal();
  renderChrome();
  if (pageContainer) {
    void currentRoute().render(pageContainer);
  }
}

function loadBuildInfo(): void {
  api('/build-info')
    .then((info) => {
      const el = root.querySelector('[data-testid="build-info"]');
      if (el) el.textContent = `${info.branch} / ${info.version} / ${info.bugProfile}`;
    })
    .catch(() => {
      const el = root.querySelector('[data-testid="build-info"]');
      if (el) el.textContent = 'offline';
    });
}

window.addEventListener('hashchange', () => {
  if (window.location.hash !== renderedHash) renderPage();
});
window.addEventListener('qa:session-changed', renderChrome);
loadBuildInfo();
renderPage();
