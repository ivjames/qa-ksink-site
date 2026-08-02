import { api, getSession, setSession } from '../api';
import { toast } from '../ui';

const DEMO_ACCOUNTS = [
  { email: 'admin@example.com', role: 'admin' },
  { email: 'editor@example.com', role: 'editor' },
  { email: 'viewer@example.com', role: 'viewer' }
];

export function renderLogin(container: HTMLElement): void {
  const session = getSession();
  container.innerHTML = `
    <form class="stack" data-testid="login-form">
      <h2>Authentication Lab</h2>
      ${
        session
          ? `<p data-testid="login-current">Currently signed in as ${session.user.role}. Signing in again switches accounts.</p>`
          : ''
      }
      <label>Email<input data-testid="login-email" name="email" autocomplete="username" value="admin@example.com"></label>
      <label>Passphrase<input data-testid="login-password" name="password" type="password" autocomplete="current-password" value="demo"></label>
      <button data-testid="login-submit" type="submit">Sign in</button>
      <p data-testid="login-message" aria-live="polite"></p>
      <fieldset class="demo-accounts">
        <legend>Demo accounts (passphrase: demo)</legend>
        ${DEMO_ACCOUNTS.map(
          (account) =>
            `<button type="button" data-testid="login-fill-${account.role}" data-email="${account.email}">Fill ${account.role}</button>`
        ).join('')}
      </fieldset>
    </form>
  `;

  const emailInput = container.querySelector<HTMLInputElement>('[data-testid="login-email"]');
  const passwordInput = container.querySelector<HTMLInputElement>('[data-testid="login-password"]');
  const message = container.querySelector('[data-testid="login-message"]');

  container.querySelectorAll<HTMLButtonElement>('[data-email]').forEach((button) => {
    button.addEventListener('click', () => {
      if (emailInput) emailInput.value = button.dataset.email ?? '';
      if (passwordInput) passwordInput.value = 'demo';
    });
  });

  container.querySelector('[data-testid="login-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailInput?.value ?? '', password: passwordInput?.value ?? '' })
      });
      setSession({ token: result.token, user: result.user });
      if (message) message.textContent = `Signed in as ${result.user.role}`;
      toast(`Signed in as ${result.user.name}`, 'success');
      window.dispatchEvent(new Event('qa:session-changed'));
    } catch {
      if (message) message.textContent = 'Invalid email or password';
    }
  });
}
