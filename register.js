const AUTH_KEY = 'axon_auth';
const AUTH_USER_KEY = 'axon_user';
const AUTH_TOKEN_KEY = 'axon_token';
const THEME_KEY = 'axon_theme';
const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;

const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
document.documentElement.classList.toggle('light-theme', savedTheme === 'light');

function applyTheme(theme) {
  const activeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('light-theme', activeTheme === 'light');
  document.documentElement.dataset.theme = activeTheme;

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.textContent = activeTheme === 'light' ? '🌙' : '☀️';
    toggle.title = activeTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    toggle.setAttribute('aria-label', toggle.title);
  }
}

function loadTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
}

function toggleTheme() {
  const current = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function showError(message) {
  const error = document.getElementById('register-error');
  error.textContent = message;
  error.classList.add('show');
}

window.addEventListener('DOMContentLoaded', () => {
  loadTheme();

  const form = document.getElementById('register-form');
  const submit = document.getElementById('register-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-pass').value;
    const confirm = document.getElementById('register-confirm').value;

    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Creating...';

    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      localStorage.setItem(AUTH_KEY, 'true');
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      window.location.href = 'index.html';
    } catch (err) {
      showError(err.message);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create account';
    }
  });
});
