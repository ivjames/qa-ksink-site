import { api, ApiError, getSession } from '../api';
import { escapeHtml, toast } from '../ui';

export function renderAdmin(container: HTMLElement): void {
  const session = getSession();
  if (session?.user.role !== 'admin') {
    container.innerHTML = `
      <div class="stack">
        <h2>Admin Audit</h2>
        <p data-testid="admin-denied">Admin role required. Sign in as admin@example.com to view the audit log.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="stack">
      <h2>Admin Audit</h2>
      <div class="toolbar">
        <button type="button" data-testid="audit-refresh">Refresh audit log</button>
      </div>
      <p data-testid="audit-status" aria-live="polite">Loading audit log</p>
      <div class="table-wrap">
        <table data-testid="audit-table">
          <thead><tr><th>ID</th><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody data-testid="audit-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const status = container.querySelector('[data-testid="audit-status"]');
  const body = container.querySelector('[data-testid="audit-body"]');

  async function load(): Promise<void> {
    try {
      const result = await api('/audit');
      if (status) status.textContent = `Showing ${result.items.length} of ${result.total} audit entries`;
      if (body) {
        body.innerHTML = result.items
          .map(
            (entry: Record<string, unknown>) => `
            <tr data-testid="audit-row">
              <td>${entry.id}</td>
              <td>${escapeHtml(entry.ts)}</td>
              <td>${escapeHtml(entry.actor)}</td>
              <td>${escapeHtml(entry.action)}</td>
              <td>${escapeHtml(entry.entity)}${entry.entity_id ? ` #${entry.entity_id}` : ''}</td>
              <td>${escapeHtml(entry.detail)}</td>
            </tr>`
          )
          .join('');
      }
    } catch (error) {
      if (status) status.textContent = 'Failed to load audit log';
      toast(error instanceof ApiError ? error.detail : 'Failed to load audit log', 'error');
    }
  }

  container.querySelector('[data-testid="audit-refresh"]')?.addEventListener('click', () => void load());
  void load();
}
