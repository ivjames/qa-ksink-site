import { apiUpload, ApiError, getSession, hasRole } from '../api';
import { escapeHtml } from '../ui';

export function renderUpload(container: HTMLElement): void {
  const canImport = hasRole('editor', 'admin');
  const session = getSession();

  container.innerHTML = `
    <div class="stack">
      <h2>Upload Lab</h2>
      <section class="stack">
        <h3>File inspector</h3>
        <p>Accepts <code>.csv</code>, <code>.txt</code>, or <code>.png</code> up to 64&nbsp;KiB and reports file metadata.</p>
        <label>Choose a file<input type="file" data-testid="upload-input"></label>
        <button type="button" data-testid="upload-submit">Upload file</button>
        <p data-testid="upload-result" aria-live="polite"></p>
      </section>
      <section class="stack">
        <h3>Product CSV import</h3>
        ${
          canImport
            ? `
          <p>CSV header must be <code>name,category,price,stock,status</code>. Valid rows are imported; invalid rows are reported per line.</p>
          <label>Choose a CSV<input type="file" data-testid="import-input" accept=".csv"></label>
          <button type="button" data-testid="import-submit">Import products</button>
          <p data-testid="import-result" aria-live="polite"></p>
          <ul data-testid="import-rejected"></ul>`
            : `<p data-testid="import-login-prompt">${
                session
                  ? 'Importing requires the editor or admin role.'
                  : 'Sign in as editor or admin to import products.'
              }</p>`
        }
      </section>
    </div>
  `;

  container.querySelector('[data-testid="upload-submit"]')?.addEventListener('click', async () => {
    const input = container.querySelector<HTMLInputElement>('[data-testid="upload-input"]');
    const result = container.querySelector('[data-testid="upload-result"]');
    const file = input?.files?.[0];
    if (!file) {
      if (result) result.textContent = 'Choose a file first';
      return;
    }
    if (result) result.textContent = 'Uploading';
    try {
      const response = await apiUpload('/upload', file);
      if (result) {
        const lines = typeof response.lines === 'number' ? `, ${response.lines} lines` : '';
        result.textContent = `Uploaded ${response.filename} (${response.size} bytes, ${response.kind}${lines})`;
      }
    } catch (error) {
      if (result) {
        result.textContent = error instanceof ApiError ? `Rejected: ${error.detail}` : 'Upload failed';
      }
    }
  });

  container.querySelector('[data-testid="import-submit"]')?.addEventListener('click', async () => {
    const input = container.querySelector<HTMLInputElement>('[data-testid="import-input"]');
    const result = container.querySelector('[data-testid="import-result"]');
    const rejectedList = container.querySelector('[data-testid="import-rejected"]');
    const file = input?.files?.[0];
    if (!file) {
      if (result) result.textContent = 'Choose a CSV first';
      return;
    }
    if (result) result.textContent = 'Importing';
    if (rejectedList) rejectedList.innerHTML = '';
    try {
      const response = await apiUpload('/products/import', file);
      if (result) {
        result.textContent = `Imported ${response.accepted} products, rejected ${response.rejected.length} rows`;
      }
      if (rejectedList) {
        rejectedList.innerHTML = response.rejected
          .map(
            (row: { line: number; error: string }) =>
              `<li data-testid="import-rejected-row">Line ${row.line}: ${escapeHtml(row.error)}</li>`
          )
          .join('');
      }
    } catch (error) {
      if (result) {
        result.textContent = error instanceof ApiError ? `Import failed: ${error.detail}` : 'Import failed';
      }
    }
  });
}
