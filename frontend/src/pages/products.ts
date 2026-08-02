import { API_BASE, api, ApiError, hasRole } from '../api';
import { confirmModal, debounce, escapeHtml, openModal, toast } from '../ui';

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'archived';
}

interface GridState {
  q: string;
  status: string;
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const COLUMNS: Array<{ key: string; label: string; sortable: boolean }> = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'price', label: 'Price', sortable: true },
  { key: 'stock', label: 'Stock', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false }
];

export function renderProducts(container: HTMLElement): void {
  const state: GridState = { q: '', status: '', sort: 'name', direction: 'asc', page: 1, pageSize: 10 };
  const canEdit = hasRole('editor', 'admin', 'viewer');
  const canDelete = hasRole('admin');

  container.innerHTML = `
    <div class="stack">
      <h2>Data Grid Lab</h2>
      <div class="toolbar">
        <input data-testid="grid-search" placeholder="Search">
        <label>Status filter
          <select data-testid="grid-filter-status">
            <option value="">All</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>Page size
          <select data-testid="grid-page-size">
            <option value="5">5</option>
            <option value="10" selected>10</option>
            <option value="20">20</option>
          </select>
        </label>
        <button type="button" data-testid="grid-export">Export CSV</button>
        ${canEdit ? '<button type="button" data-testid="product-new">New product</button>' : ''}
      </div>
      <p data-testid="grid-status" aria-live="polite">Loading products</p>
      <div class="table-wrap">
        <table data-testid="products-grid">
          <thead><tr>
            ${COLUMNS.map(
              (column) => `
              <th ${column.sortable ? 'aria-sort="none"' : ''} data-column="${column.key}">
                ${
                  column.sortable
                    ? `<button type="button" class="sort-button" data-testid="grid-sort-${column.key}">${column.label}</button>`
                    : column.label
                }
              </th>`
            ).join('')}
          </tr></thead>
          <tbody data-testid="grid-body"></tbody>
        </table>
      </div>
      <div class="pager">
        <button type="button" data-testid="grid-prev">Previous</button>
        <span data-testid="grid-page-label">Page 1</span>
        <button type="button" data-testid="grid-next">Next</button>
      </div>
    </div>
  `;

  const statusLine = container.querySelector('[data-testid="grid-status"]');
  const body = container.querySelector('[data-testid="grid-body"]');
  const pageLabel = container.querySelector('[data-testid="grid-page-label"]');
  const prevButton = container.querySelector<HTMLButtonElement>('[data-testid="grid-prev"]');
  const nextButton = container.querySelector<HTMLButtonElement>('[data-testid="grid-next"]');

  function listQuery(paged: boolean): string {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    params.set('sort', state.sort);
    params.set('direction', state.direction);
    if (paged) {
      params.set('page', String(state.page));
      params.set('page_size', String(state.pageSize));
    }
    return params.toString();
  }

  async function load(): Promise<void> {
    try {
      const result = await api(`/products?${listQuery(true)}`);
      const items: Product[] = result.items;
      const totalPages = Math.max(1, Math.ceil(result.total / state.pageSize));
      if (statusLine) statusLine.textContent = `Loaded ${items.length + 1} products`;
      if (pageLabel) pageLabel.textContent = `Page ${result.page} of ${totalPages} (${result.total} total)`;
      if (prevButton) prevButton.disabled = state.page <= 1;
      if (nextButton) nextButton.disabled = state.page >= totalPages;
      container.querySelectorAll('th[aria-sort]').forEach((th) => {
        const column = (th as HTMLElement).dataset.column;
        th.setAttribute(
          'aria-sort',
          column === state.sort ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        );
      });
      if (body) {
        body.innerHTML = items
          .map(
            (item) => `
            <tr data-testid="grid-row" data-product-id="${item.id}">
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.category)}</td>
              <td>${Number(item.price).toFixed(2)}</td>
              <td>${item.stock}</td>
              <td><span class="badge badge-${item.status}">${item.status}</span></td>
              <td class="row-actions">
                <button type="button" data-testid="row-view" data-id="${item.id}">View</button>
                ${canEdit ? `<button type="button" data-testid="row-edit" data-id="${item.id}">Edit</button>` : ''}
                ${canDelete ? `<button type="button" class="danger" data-testid="row-delete" data-id="${item.id}">Delete</button>` : ''}
              </td>
            </tr>`
          )
          .join('');
        body.querySelectorAll<HTMLButtonElement>('[data-testid="row-view"]').forEach((button) => {
          button.addEventListener('click', () => void showDetail(Number(button.dataset.id)));
        });
        body.querySelectorAll<HTMLButtonElement>('[data-testid="row-edit"]').forEach((button) => {
          const item = items.find((candidate) => candidate.id === Number(button.dataset.id));
          button.addEventListener('click', () => showEditor(item ?? null));
        });
        body.querySelectorAll<HTMLButtonElement>('[data-testid="row-delete"]').forEach((button) => {
          button.addEventListener('click', () => void deleteProduct(Number(button.dataset.id)));
        });
      }
    } catch (error) {
      if (statusLine) statusLine.textContent = 'Failed to load products';
      toast(error instanceof ApiError ? error.detail : 'Failed to load products', 'error');
    }
  }

  async function showDetail(id: number): Promise<void> {
    try {
      const result = await api(`/products/${id}`);
      const item: Product = result.item;
      openModal({
        title: item.name,
        testid: 'product-detail-modal',
        body: `
          <dl class="detail-list">
            <dt>ID</dt><dd data-testid="detail-id">${item.id}</dd>
            <dt>Category</dt><dd data-testid="detail-category">${escapeHtml(item.category)}</dd>
            <dt>Price</dt><dd data-testid="detail-price">$${Number(item.price).toFixed(2)}</dd>
            <dt>Stock</dt><dd data-testid="detail-stock">${item.stock}</dd>
            <dt>Status</dt><dd data-testid="detail-status">${item.status}</dd>
          </dl>
        `
      });
    } catch (error) {
      toast(error instanceof ApiError ? error.detail : 'Failed to load product', 'error');
    }
  }

  function showEditor(item: Product | null): void {
    openModal({
      title: item ? `Edit ${item.name}` : 'New product',
      testid: 'product-form-modal',
      body: `
        <form class="stack" data-testid="product-form">
          <label>Name<input data-testid="product-name" required maxlength="80" value="${escapeHtml(item?.name ?? '')}"></label>
          <label>Category<input data-testid="product-category" required maxlength="40" value="${escapeHtml(item?.category ?? '')}"></label>
          <label>Price<input data-testid="product-price" type="number" step="0.01" min="0.01" required value="${item?.price ?? ''}"></label>
          <label>Stock<input data-testid="product-stock" type="number" step="1" min="0" required value="${item?.stock ?? ''}"></label>
          <label>Status
            <select data-testid="product-status">
              <option value="active" ${item?.status !== 'archived' ? 'selected' : ''}>active</option>
              <option value="archived" ${item?.status === 'archived' ? 'selected' : ''}>archived</option>
            </select>
          </label>
          <p class="field-error" data-testid="product-form-error" aria-live="polite"></p>
          <button type="submit" data-testid="product-save">${item ? 'Save changes' : 'Create product'}</button>
        </form>
      `,
      onMount: (modal, close) => {
        modal.querySelector('[data-testid="product-form"]')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const value = (testid: string) =>
            modal.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-testid="${testid}"]`)?.value ?? '';
          const errorLine = modal.querySelector('[data-testid="product-form-error"]');
          const payload = {
            name: value('product-name'),
            category: value('product-category'),
            price: Number(value('product-price')),
            stock: Number(value('product-stock')),
            status: value('product-status')
          };
          try {
            if (item) {
              await api(`/products/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
              toast(`Updated ${payload.name}`, 'success');
            } else {
              await api('/products', { method: 'POST', body: JSON.stringify(payload) });
              toast(`Created ${payload.name}`, 'success');
            }
            close();
            void load();
          } catch (error) {
            if (errorLine) {
              errorLine.textContent = error instanceof ApiError ? error.detail : 'Save failed';
            }
          }
        });
      }
    });
  }

  async function deleteProduct(id: number): Promise<void> {
    const accepted = await confirmModal('Delete product', `Delete product #${id}? This cannot be undone.`);
    if (!accepted) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      toast(`Deleted product #${id}`, 'success');
      void load();
    } catch (error) {
      toast(error instanceof ApiError ? error.detail : 'Delete failed', 'error');
    }
  }

  const debouncedLoad = debounce(() => {
    state.page = 1;
    void load();
  }, 250);

  container.querySelector('[data-testid="grid-search"]')?.addEventListener('input', (event) => {
    state.q = (event.target as HTMLInputElement).value;
    debouncedLoad();
  });
  container.querySelector('[data-testid="grid-filter-status"]')?.addEventListener('change', (event) => {
    state.status = (event.target as HTMLSelectElement).value;
    state.page = 1;
    void load();
  });
  container.querySelector('[data-testid="grid-page-size"]')?.addEventListener('change', (event) => {
    state.pageSize = Number((event.target as HTMLSelectElement).value);
    state.page = 1;
    void load();
  });
  COLUMNS.filter((column) => column.sortable).forEach((column) => {
    container.querySelector(`[data-testid="grid-sort-${column.key}"]`)?.addEventListener('click', () => {
      if (state.sort === column.key) {
        state.direction = state.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = column.key;
        state.direction = 'asc';
      }
      void load();
    });
  });
  prevButton?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      void load();
    }
  });
  nextButton?.addEventListener('click', () => {
    state.page += 1;
    void load();
  });
  container.querySelector('[data-testid="grid-export"]')?.addEventListener('click', () => {
    const anchor = document.createElement('a');
    anchor.href = `${API_BASE}/products/export.csv?${listQuery(false)}`;
    anchor.download = 'products-export.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast('Export started', 'info');
  });
  container.querySelector('[data-testid="product-new"]')?.addEventListener('click', () => showEditor(null));

  void load();
}
