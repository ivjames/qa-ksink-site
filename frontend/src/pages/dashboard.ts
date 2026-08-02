import { api } from '../api';

export async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h2 data-testid="dashboard-heading">Dashboard</h2>
    <div class="cards">
      <article class="card" data-testid="metric-products">
        <strong data-testid="stat-products-total">–</strong>
        <span>Products (<span data-testid="stat-products-active">–</span> active)</span>
      </article>
      <article class="card" data-testid="metric-stock">
        <strong data-testid="stat-stock-total">–</strong>
        <span>Units in stock</span>
      </article>
      <article class="card" data-testid="metric-inventory-value">
        <strong data-testid="stat-inventory-value">–</strong>
        <span>Inventory value</span>
      </article>
      <article class="card" data-testid="metric-orders">
        <strong data-testid="stat-orders-pending">–</strong>
        <span>Pending orders of <span data-testid="stat-orders-total">–</span> total</span>
      </article>
    </div>
    <p data-testid="dashboard-status">Loading metrics</p>
  `;

  const status = container.querySelector('[data-testid="dashboard-status"]');
  try {
    const stats = await api('/stats');
    const set = (testid: string, value: string) => {
      const el = container.querySelector(`[data-testid="${testid}"]`);
      if (el) el.textContent = value;
    };
    set('stat-products-total', String(stats.products.total));
    set('stat-products-active', String(stats.products.active));
    set('stat-stock-total', String(stats.products.totalStock));
    set('stat-inventory-value', `$${Number(stats.products.inventoryValue).toFixed(2)}`);
    set('stat-orders-pending', String(stats.orders.pending));
    set('stat-orders-total', String(stats.orders.total));
    if (status) status.textContent = 'Metrics loaded';
  } catch {
    if (status) status.textContent = 'Metrics unavailable';
  }
}
