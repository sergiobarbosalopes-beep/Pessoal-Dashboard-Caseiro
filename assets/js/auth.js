/* Dashboard Caseiro — Authentication module */
(function () {
  'use strict';

  var SESSION_KEY = 'dashboard_session';
  var SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.email || !s.ts) return null;
      if (Date.now() - s.ts > SESSION_TTL) { clearSession(); return null; }
      return s;
    } catch (e) { clearSession(); return null; }
  }

  function setSession(email, permissions) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: email, permissions: permissions, ts: Date.now() }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function hashPassword(password) {
    var enc = new TextEncoder();
    var buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  async function login(email, password) {
    var url = window.CGD_SUPABASE_URL;
    var key = window.CGD_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Configuracao Supabase em falta.');
    if (!window.supabase) throw new Error('Biblioteca Supabase nao carregada.');

    var sb = window.supabase.createClient(url, key);
    var result = await sb.from('admin').select('email,consultar,editar,password_hash').eq('email', email.trim().toLowerCase()).single();

    if (result.error || !result.data) throw new Error('Utilizador nao encontrado ou sem acesso.');
    if (!result.data.password_hash) throw new Error('Conta sem password definida. Contacte o administrador.');

    var hash = await hashPassword(password);
    if (hash !== result.data.password_hash) throw new Error('Password incorrecta.');

    setSession(result.data.email, { consultar: result.data.consultar, editar: result.data.editar });
    return result.data;
  }

  function logout() {
    clearSession();
    window.location.replace('login.html');
  }

  function getCurrentUser() { return getSession(); }

  function injectNavUser() {
    var session = getSession();
    if (!session) return;
    var nav = document.querySelector('nav.menu');
    if (!nav) return;

    var sep = document.createElement('span');
    sep.className = 'menu-user-sep';

    var userEl = document.createElement('span');
    userEl.className = 'menu-user';
    userEl.title = 'Sessao activa';
    userEl.textContent = session.email;

    var logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'menu-link menu-logout';
    logoutBtn.textContent = 'Sair';
    logoutBtn.addEventListener('click', logout);

    nav.appendChild(sep);
    nav.appendChild(userEl);
    nav.appendChild(logoutBtn);
  }

  window.DashboardAuth = { login: login, logout: logout, getCurrentUser: getCurrentUser };

  document.addEventListener('DOMContentLoaded', function () {
    var page = (location.pathname.split('/').pop() || 'index.html');
    if (page !== 'login.html') { injectNavUser(); }
  });
})();