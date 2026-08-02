import { api, ApiError } from '../api';

interface FieldRule {
  testid: string;
  errorTestId: string;
  validate: (form: HTMLElement) => string;
}

function fieldValue(form: HTMLElement, testid: string): string {
  return form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    `[data-testid="${testid}"]`
  )?.value ?? '';
}

const RULES: FieldRule[] = [
  {
    testid: 'form-full-name',
    errorTestId: 'error-full-name',
    validate: (form) => (fieldValue(form, 'form-full-name').trim() ? '' : 'Full name is required')
  },
  {
    testid: 'form-email',
    errorTestId: 'error-email',
    validate: (form) => {
      const value = fieldValue(form, 'form-email');
      return value.includes('@') && value.includes('.') ? '' : 'Enter a valid email address';
    }
  },
  {
    testid: 'form-quantity',
    errorTestId: 'error-quantity',
    validate: (form) => {
      const value = Number(fieldValue(form, 'form-quantity'));
      return Number.isInteger(value) && value >= 1 && value <= 99 ? '' : 'Quantity must be between 1 and 99';
    }
  },
  {
    testid: 'form-date',
    errorTestId: 'error-date',
    validate: (form) =>
      /^\d{4}-\d{2}-\d{2}$/.test(fieldValue(form, 'form-date')) ? '' : 'Date must be YYYY-MM-DD'
  },
  {
    testid: 'form-currency',
    errorTestId: 'error-currency',
    validate: (form) => {
      const value = Number(fieldValue(form, 'form-currency'));
      return Number.isFinite(value) && value >= 0 ? '' : 'Amount must be zero or more';
    }
  },
  {
    testid: 'form-terms',
    errorTestId: 'error-terms',
    validate: (form) =>
      form.querySelector<HTMLInputElement>('[data-testid="form-terms"]')?.checked
        ? ''
        : 'You must accept the terms'
  }
];

export function renderForms(container: HTMLElement): void {
  container.innerHTML = `
    <form class="stack" data-testid="complex-form" novalidate>
      <h2>Form Gauntlet</h2>
      <div class="form-grid">
        <label>Full name<input data-testid="form-full-name" required maxlength="80" value="Test User">
          <span class="field-error" data-testid="error-full-name"></span></label>
        <label>Email<input data-testid="form-email" type="email" required value="test@example.com">
          <span class="field-error" data-testid="error-email"></span></label>
        <label>Quantity<input data-testid="form-quantity" type="number" min="1" max="99" step="1" value="3">
          <span class="field-error" data-testid="error-quantity"></span></label>
        <label>Requested date<input data-testid="form-date" type="date" value="2026-02-28">
          <span class="field-error" data-testid="error-date"></span></label>
        <label>Amount (USD)<input data-testid="form-currency" type="number" min="0" step="0.001" value="10.005">
          <span class="field-error" data-testid="error-currency"></span></label>
        <label>Category
          <select data-testid="form-category">
            <option value="hardware" selected>hardware</option>
            <option value="food">food</option>
            <option value="outdoor">outdoor</option>
            <option value="home">home</option>
            <option value="qa-edge">qa-edge</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Priority</legend>
        <label class="inline"><input type="radio" name="priority" value="low" data-testid="form-priority-low">low</label>
        <label class="inline"><input type="radio" name="priority" value="normal" data-testid="form-priority-normal" checked>normal</label>
        <label class="inline"><input type="radio" name="priority" value="high" data-testid="form-priority-high">high</label>
      </fieldset>
      <label>Notes<textarea data-testid="form-notes" maxlength="500" rows="3" placeholder="Optional notes"></textarea></label>
      <label class="inline"><input type="checkbox" data-testid="form-terms" checked>I accept the terms
        <span class="field-error" data-testid="error-terms"></span></label>
      <button data-testid="form-submit" type="submit">Submit form</button>
      <p data-testid="form-message" aria-live="polite"></p>
      <pre class="result-block" data-testid="form-result" hidden></pre>
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>('[data-testid="complex-form"]');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = form.querySelector('[data-testid="form-message"]');
    const resultBlock = form.querySelector<HTMLPreElement>('[data-testid="form-result"]');

    let hasErrors = false;
    for (const rule of RULES) {
      const error = rule.validate(form);
      const target = form.querySelector(`[data-testid="${rule.errorTestId}"]`);
      if (target) target.textContent = error;
      if (error) hasErrors = true;
    }
    if (hasErrors) {
      if (message) message.textContent = 'Fix the highlighted fields';
      if (resultBlock) resultBlock.hidden = true;
      return;
    }

    const priority =
      form.querySelector<HTMLInputElement>('input[name="priority"]:checked')?.value ?? 'normal';
    const payload = {
      full_name: fieldValue(form, 'form-full-name'),
      email: fieldValue(form, 'form-email'),
      quantity: Number(fieldValue(form, 'form-quantity')),
      requested_date: fieldValue(form, 'form-date'),
      currency_amount: Number(fieldValue(form, 'form-currency')),
      terms: form.querySelector<HTMLInputElement>('[data-testid="form-terms"]')?.checked ?? false,
      category: fieldValue(form, 'form-category'),
      priority,
      notes: fieldValue(form, 'form-notes')
    };

    try {
      const result = await api('/forms/complex', { method: 'POST', body: JSON.stringify(payload) });
      if (message) message.textContent = `Saved ${result.normalized.currencyAmount.toFixed(2)}`;
      if (resultBlock) {
        resultBlock.hidden = false;
        resultBlock.textContent = JSON.stringify(result.normalized, null, 2);
      }
    } catch (error) {
      if (message) {
        message.textContent =
          error instanceof ApiError && error.status === 422 ? 'Form rejected' : 'Submission failed';
      }
      if (resultBlock) resultBlock.hidden = true;
    }
  });
}
