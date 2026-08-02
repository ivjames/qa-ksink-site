export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toast(message: string, kind: 'success' | 'error' | 'info' = 'info'): void {
  let region = document.querySelector('[data-testid="toast-region"]');
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('data-testid', 'toast-region');
    region.setAttribute('aria-live', 'polite');
    region.className = 'toast-region';
    document.body.appendChild(region);
  }
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('data-testid', 'toast');
  item.textContent = message;
  region.appendChild(item);
  setTimeout(() => item.remove(), 4000);
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalOptions {
  title: string;
  body: string;
  testid: string;
  onMount?: (modal: HTMLElement, close: () => void) => void;
  onClose?: () => void;
}

export function openModal(options: ModalOptions): void {
  closeModal();
  const opener = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('data-modal-overlay', '');
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid="${escapeHtml(options.testid)}">
      <header class="modal-header">
        <h3 id="modal-title">${escapeHtml(options.title)}</h3>
        <button type="button" class="modal-close" data-testid="modal-close" aria-label="Close dialog">&times;</button>
      </header>
      <div class="modal-body">${options.body}</div>
    </div>
  `;

  function close(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
    opener?.focus();
    options.onClose?.();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
  }

  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);

  const modal = overlay.querySelector<HTMLElement>('.modal');
  if (modal) {
    modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', close);
    options.onMount?.(modal, close);
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    (focusable.find((el) => !el.classList.contains('modal-close')) ?? focusable[0])?.focus();
  }
}

export function closeModal(): void {
  document.querySelector('[data-modal-overlay]')?.remove();
}

export function confirmModal(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    openModal({
      title,
      testid: 'confirm-modal',
      body: `
        <p data-testid="confirm-message">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" data-testid="confirm-cancel">Cancel</button>
          <button type="button" class="danger" data-testid="confirm-accept">Confirm</button>
        </div>
      `,
      onMount: (modal, close) => {
        modal.querySelector('[data-testid="confirm-accept"]')?.addEventListener('click', () => {
          if (!settled) {
            settled = true;
            resolve(true);
          }
          close();
        });
        modal.querySelector('[data-testid="confirm-cancel"]')?.addEventListener('click', close);
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });
  });
}

export function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  }) as T;
}
