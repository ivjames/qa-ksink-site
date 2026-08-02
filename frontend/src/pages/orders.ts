import { api, ApiError, getSession, hasRole } from '../api';
import { escapeHtml, toast } from '../ui';

interface Order {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  status: 'pending' | 'shipped' | 'cancelled';
  customer_name: string;
  created_at: string;
}

export function renderOrders(container: HTMLElement): void {
  const session = getSession();
  if (!session) {
    container.innerHTML = `
      <div class="stack">
        <h2>Orders Desk</h2>
        <p data-testid="orders-login-prompt">Sign in to view orders. Use the Login page with any demo account.</p>
      </div>
    `;
    return;
  }

  const canManage = hasRole('editor', 'admin');
  container.innerHTML = `
    <div class="stack">
      <h2>Orders Desk</h2>
      ${
        canManage
          ? `
        <form class="toolbar order-create" data-testid="order-form">
          <label>Product
            <select data-testid="order-product" required></select>
          </label>
          <label>Quantity<input data-testid="order-quantity" type="number" min="1" max="50" step="1" value="1" required></label>
          <label>Customer<input data-testid="order-customer" maxlength="80" value="Walk-in Customer" required></label>
          <button type="submit" data-testid="order-submit">Place order</button>
        </form>`
          : '<p data-testid="orders-readonly-note">Viewer role is read-only: orders can be browsed but not placed.</p>'
      }
      <div class="toolbar">
        <label>Status filter
          <select data-testid="orders-filter">
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="shipped">shipped</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
      </div>
      <p data-testid="orders-status" aria-live="polite">Loading orders</p>
      <div class="table-wrap">
        <table data-testid="orders-table">
          <thead><tr>
            <th>ID</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th><th>Customer</th><th>Created</th><th>Actions</th>
          </tr></thead>
          <tbody data-testid="orders-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const statusLine = container.querySelector('[data-testid="orders-status"]');
  const body = container.querySelector('[data-testid="orders-body"]');
  const filter = container.querySelector<HTMLSelectElement>('[data-testid="orders-filter"]');

  async function load(): Promise<void> {
    try {
      const params = filter?.value ? `?status=${filter.value}` : '';
      const result = await api(`/orders${params}`);
      const items: Order[] = result.items;
      if (statusLine) statusLine.textContent = `Loaded ${items.length} orders`;
      if (body) {
        body.innerHTML = items
          .map(
            (order) => `
            <tr data-testid="order-row" data-order-id="${order.id}">
              <td>${order.id}</td>
              <td>${escapeHtml(order.product_name)}</td>
              <td>${order.quantity}</td>
              <td>$${Number(order.total).toFixed(2)}</td>
              <td><span class="badge badge-${order.status}" data-testid="order-status-badge">${order.status}</span></td>
              <td>${escapeHtml(order.customer_name)}</td>
              <td>${escapeHtml(order.created_at)}</td>
              <td class="row-actions">
                ${
                  canManage && order.status === 'pending'
                    ? `
                  <button type="button" data-testid="order-ship" data-id="${order.id}">Ship</button>
                  <button type="button" class="danger" data-testid="order-cancel" data-id="${order.id}">Cancel</button>`
                    : ''
                }
              </td>
            </tr>`
          )
          .join('');
        body.querySelectorAll<HTMLButtonElement>('[data-testid="order-ship"]').forEach((button) => {
          button.addEventListener('click', () => void transition(Number(button.dataset.id), 'shipped'));
        });
        body.querySelectorAll<HTMLButtonElement>('[data-testid="order-cancel"]').forEach((button) => {
          button.addEventListener('click', () => void transition(Number(button.dataset.id), 'cancelled'));
        });
      }
    } catch (error) {
      if (statusLine) statusLine.textContent = 'Failed to load orders';
      toast(error instanceof ApiError ? error.detail : 'Failed to load orders', 'error');
    }
  }

  async function transition(orderId: number, next: 'shipped' | 'cancelled'): Promise<void> {
    try {
      await api(`/orders/${orderId}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      toast(`Order #${orderId} ${next}`, 'success');
      void load();
    } catch (error) {
      toast(error instanceof ApiError ? error.detail : 'Transition failed', 'error');
    }
  }

  async function loadProductOptions(): Promise<void> {
    const select = container.querySelector<HTMLSelectElement>('[data-testid="order-product"]');
    if (!select) return;
    try {
      const result = await api('/products?status=active&page_size=100&sort=name&direction=asc');
      select.innerHTML = result.items
        .map(
          (item: { id: number; name: string; stock: number }) =>
            `<option value="${item.id}">${escapeHtml(item.name)} (${item.stock} in stock)</option>`
        )
        .join('');
    } catch {
      select.innerHTML = '<option value="">Failed to load products</option>';
    }
  }

  container.querySelector('[data-testid="order-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const productId = Number(container.querySelector<HTMLSelectElement>('[data-testid="order-product"]')?.value);
    const quantity = Number(container.querySelector<HTMLInputElement>('[data-testid="order-quantity"]')?.value);
    const customer = container.querySelector<HTMLInputElement>('[data-testid="order-customer"]')?.value ?? '';
    try {
      const result = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, quantity, customer_name: customer })
      });
      toast(`Order #${result.item.id} placed for $${Number(result.item.total).toFixed(2)}`, 'success');
      void load();
      void loadProductOptions();
    } catch (error) {
      toast(error instanceof ApiError ? error.detail : 'Order failed', 'error');
    }
  });

  filter?.addEventListener('change', () => void load());

  void load();
  if (canManage) void loadProductOptions();
}
