import { API_BASE, api, ApiError } from '../api';

export function renderAsyncLab(container: HTMLElement): void {
  container.innerHTML = `
    <div class="stack">
      <h2>Async Lab</h2>
      <section class="stack">
        <h3>Slow request</h3>
        <div class="toolbar">
          <label>Delay (ms)<input data-testid="async-delay" type="number" min="0" max="5000" step="50" value="750"></label>
          <button type="button" data-testid="async-run">Run slow request</button>
          <button type="button" data-testid="async-cancel" disabled>Cancel request</button>
        </div>
        <p data-testid="async-status" aria-live="polite">Idle</p>
      </section>
      <section class="stack">
        <h3>Parallel batch</h3>
        <button type="button" data-testid="batch-run">Run 3 parallel requests</button>
        <p data-testid="batch-status" aria-live="polite">Idle</p>
        <ul data-testid="batch-list"></ul>
      </section>
      <section class="stack">
        <h3>Flaky endpoint with retry</h3>
        <div class="toolbar">
          <label>Failures before success<input data-testid="flaky-times" type="number" min="0" max="10" step="1" value="2"></label>
          <button type="button" data-testid="flaky-run">Run with retry</button>
        </div>
        <p data-testid="flaky-status" aria-live="polite">Idle</p>
      </section>
    </div>
  `;

  const status = container.querySelector('[data-testid="async-status"]');
  const cancelButton = container.querySelector<HTMLButtonElement>('[data-testid="async-cancel"]');
  let controller: AbortController | null = null;

  container.querySelector('[data-testid="async-run"]')?.addEventListener('click', async () => {
    const delay = Number(container.querySelector<HTMLInputElement>('[data-testid="async-delay"]')?.value ?? 750);
    controller = new AbortController();
    if (cancelButton) cancelButton.disabled = false;
    if (status) status.textContent = 'Loading';
    try {
      const response = await fetch(`${API_BASE}/slow?delay_ms=${delay}`, { signal: controller.signal });
      const result = await response.json();
      if (status) status.textContent = `Completed after ${result.delayMs}ms`;
    } catch (error) {
      if (status) {
        status.textContent = error instanceof DOMException && error.name === 'AbortError' ? 'Cancelled' : 'Failed';
      }
    } finally {
      if (cancelButton) cancelButton.disabled = true;
      controller = null;
    }
  });

  cancelButton?.addEventListener('click', () => controller?.abort());

  container.querySelector('[data-testid="batch-run"]')?.addEventListener('click', async () => {
    const batchStatus = container.querySelector('[data-testid="batch-status"]');
    const list = container.querySelector('[data-testid="batch-list"]');
    const delays = [200, 400, 600];
    if (batchStatus) batchStatus.textContent = `0 of ${delays.length} completed`;
    if (list) {
      list.innerHTML = delays
        .map((delay) => `<li data-testid="batch-item" data-delay="${delay}">${delay}ms: pending</li>`)
        .join('');
    }
    let completed = 0;
    await Promise.all(
      delays.map(async (delay) => {
        const item = container.querySelector(`[data-testid="batch-item"][data-delay="${delay}"]`);
        try {
          const result = await api(`/slow?delay_ms=${delay}`);
          completed += 1;
          if (item) item.textContent = `${delay}ms: done (reported ${result.delayMs}ms)`;
        } catch {
          if (item) item.textContent = `${delay}ms: failed`;
        }
        if (batchStatus) batchStatus.textContent = `${completed} of ${delays.length} completed`;
      })
    );
  });

  container.querySelector('[data-testid="flaky-run"]')?.addEventListener('click', async () => {
    const flakyStatus = container.querySelector('[data-testid="flaky-status"]');
    const failTimes = Number(container.querySelector<HTMLInputElement>('[data-testid="flaky-times"]')?.value ?? 2);
    const maxAttempts = 6;
    const key = `ui-${Math.random().toString(36).slice(2, 8)}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (flakyStatus) flakyStatus.textContent = `Attempt ${attempt} of ${maxAttempts}`;
      try {
        const result = await api(`/flaky?key=${key}&fail_times=${failTimes}`);
        if (flakyStatus) flakyStatus.textContent = `Recovered after ${result.attempts} attempts`;
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 503) {
          if (flakyStatus) flakyStatus.textContent = 'Failed with unexpected error';
          return;
        }
      }
    }
    if (flakyStatus) flakyStatus.textContent = `Gave up after ${maxAttempts} attempts`;
  });
}
