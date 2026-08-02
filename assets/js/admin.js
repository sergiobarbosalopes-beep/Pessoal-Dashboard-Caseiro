(async function adminInit() {
  const feedbackEl    = document.getElementById("admin-feedback");
  const usersBodyEl   = document.getElementById("admin-users-body");
  const formEl        = document.getElementById("admin-user-form");
  const emailInputEl  = document.getElementById("admin-email-input");
  const pwInputEl     = document.getElementById("admin-pw-input");
  const pwConfInputEl = document.getElementById("admin-pw-confirm-input");
  const consultarInputEl = document.getElementById("admin-consultar-input");
  const editarInputEl    = document.getElementById("admin-editar-input");

  // Modal elements
  const modalEl       = document.getElementById("admin-reset-modal");
  const modalEmailEl  = document.getElementById("admin-modal-email");
  const modalPwEl     = document.getElementById("admin-modal-pw");
  const modalPwCEl    = document.getElementById("admin-modal-pw-confirm");
  const modalSaveEl   = document.getElementById("admin-modal-save");
  const modalCancelEl = document.getElementById("admin-modal-cancel");

  const setFeedback = (message, tone) => {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove("admin-feedback--error", "admin-feedback--success");
    if (tone === "error")   feedbackEl.classList.add("admin-feedback--error");
    if (tone === "success") feedbackEl.classList.add("admin-feedback--success");
  };

  if (!window.supabase?.createClient) {
    setFeedback("Supabase nao esta disponivel nesta pagina.", "error");
    return;
  }

  const SUPABASE_URL = window.CGD_SUPABASE_URL || "";
  const SUPABASE_KEY = window.CGD_SUPABASE_ANON_KEY || "";
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    setFeedback("Configuracao Supabase em falta.", "error");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const normalizeEmail = (v) => String(v || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const escapeHtml = (v) =>
    String(v || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // SHA-256 hash using Web Crypto API (built into modern browsers)
  const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const renderRows = (rows) => {
    if (!usersBodyEl) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      usersBodyEl.innerHTML = "<tr><td colspan='5' class='admin-empty'>Sem utilizadores configurados.</td></tr>";
      return;
    }
    usersBodyEl.innerHTML = rows.map((row) => {
      const email     = escapeHtml(row.email);
      const consultar = Boolean(row.consultar);
      const editar    = Boolean(row.editar);
      const hasPw     = Boolean(row.password_hash);
      return `
        <tr data-email="${email}">
          <td class="admin-email-cell">${email}</td>
          <td><input type="checkbox" data-perm="consultar" ${consultar ? "checked" : ""} /></td>
          <td><input type="checkbox" data-perm="editar" ${editar ? "checked" : ""} /></td>
          <td>
            <span class="admin-pw-badge ${hasPw ? "admin-pw-badge--set" : "admin-pw-badge--unset"}">
              ${hasPw ? "&#10003; Password definida" : "&#9888; Sem password"}
            </span>
          </td>
          <td class="admin-actions-cell">
            <button type="button" class="ghost-btn ghost-btn-secondary" data-action="reset-pw">Repor password</button>
            <button type="button" class="ghost-btn ghost-btn-danger" data-action="remove">Remover</button>
          </td>
        </tr>`;
    }).join("");
  };

  const explainError = (error, fallback) => {
    const msg  = error?.message || "";
    const code = error?.code || "";
    if (code === "PGRST205" || /Could not find the table 'public\.admin'/i.test(msg))
      return "Tabela public.admin nao encontrada no Supabase.";
    return fallback;
  };

  const fetchUsers = async () => {
    const { data, error } = await sb
      .from("admin")
      .select("email,consultar,editar,password_hash")
      .order("email", { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const loadUsers = async (okMessage) => {
    try {
      const rows = await fetchUsers();
      renderRows(rows);
      setFeedback(okMessage || `Total de utilizadores: ${rows.length}`, "success");
    } catch (error) {
      renderRows([]);
      setFeedback(explainError(error, "Erro ao carregar utilizadores."), "error");
    }
  };

  const ensureDefaultUser = async () => {
    const { error } = await sb.from("admin").upsert(
      [{ email: "sergiobarbosalopes@gmail.com", consultar: true, editar: true }],
      { onConflict: "email" }
    );
    if (error) throw error;
  };

  // ── Add user form ──────────────────────────────────────────────────────────
  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email     = normalizeEmail(emailInputEl?.value);
    const password  = pwInputEl?.value || "";
    const pwConfirm = pwConfInputEl?.value || "";
    const consultar = Boolean(consultarInputEl?.checked);
    const editar    = Boolean(editarInputEl?.checked);

    if (!emailRegex.test(email)) {
      setFeedback("Introduz um email valido.", "error");
      return;
    }
    if (!password) {
      setFeedback("Define uma password inicial para o utilizador.", "error");
      return;
    }
    if (password.length < 6) {
      setFeedback("A password deve ter pelo menos 6 caracteres.", "error");
      return;
    }
    if (password !== pwConfirm) {
      setFeedback("As passwords nao coincidem.", "error");
      return;
    }
    if (!consultar && !editar) {
      setFeedback("Seleciona pelo menos uma permissao.", "error");
      return;
    }

    try {
      const hash = await hashPassword(password);
      const { error } = await sb.from("admin").upsert(
        [{ email, consultar, editar, password_hash: hash }],
        { onConflict: "email" }
      );
      if (error) throw error;

      emailInputEl.value = "";
      pwInputEl.value = "";
      pwConfInputEl.value = "";
      consultarInputEl.checked = true;
      editarInputEl.checked = false;
      await loadUsers(`Utilizador ${email} adicionado com sucesso.`);
    } catch (error) {
      setFeedback(explainError(error, "Erro ao guardar utilizador."), "error");
    }
  });

  // ── Checkbox change (permissions) ─────────────────────────────────────────
  usersBodyEl?.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-perm]");
    if (!checkbox) return;
    const row = checkbox.closest("tr[data-email]");
    if (!row) return;

    const email    = row.getAttribute("data-email") || "";
    const consultar = Boolean(row.querySelector("input[data-perm='consultar']")?.checked);
    const editar    = Boolean(row.querySelector("input[data-perm='editar']")?.checked);

    if (!consultar && !editar) {
      checkbox.checked = true;
      setFeedback("Cada utilizador deve manter pelo menos uma permissao.", "error");
      return;
    }

    try {
      const { error } = await sb.from("admin").update({ consultar, editar }).eq("email", email);
      if (error) throw error;
      setFeedback(`Permissoes atualizadas para ${email}.`, "success");
    } catch (error) {
      setFeedback(explainError(error, "Erro ao atualizar permissoes."), "error");
    }
  });

  // ── Row action buttons (remove + reset-pw) ─────────────────────────────────
  usersBodyEl?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr[data-email]");
    if (!row) return;
    const email = row.getAttribute("data-email") || "";
    if (!email) return;

    if (btn.dataset.action === "remove") {
      if (!window.confirm(`Remover utilizador ${email}?`)) return;
      try {
        const { error } = await sb.from("admin").delete().eq("email", email);
        if (error) throw error;
        await loadUsers(`Utilizador ${email} removido.`);
      } catch (error) {
        setFeedback(explainError(error, "Erro ao remover utilizador."), "error");
      }
    }

    if (btn.dataset.action === "reset-pw") {
      openResetModal(email);
    }
  });

  // ── Password reset modal ────────────────────────────────────────────────────
  const openResetModal = (email) => {
    if (!modalEl) return;
    if (modalEmailEl) modalEmailEl.textContent = email;
    if (modalPwEl)  modalPwEl.value = "";
    if (modalPwCEl) modalPwCEl.value = "";
    modalEl.dataset.targetEmail = email;
    window.DashboardModalLifecycle?.lock(modalEl, document.activeElement);
    modalEl.classList.add("admin-modal--open");
    modalEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => modalPwEl?.focus());
  };

  const closeResetModal = () => {
    if (!modalEl) return;
    modalEl.classList.remove("admin-modal--open");
    modalEl.setAttribute("aria-hidden", "true");
    window.DashboardModalLifecycle?.unlock(modalEl);
    if (modalPwEl)  modalPwEl.value = "";
    if (modalPwCEl) modalPwCEl.value = "";
  };

  modalCancelEl?.addEventListener("click", closeResetModal);

  modalEl?.addEventListener("click", (event) => {
    if (event.target === modalEl) closeResetModal();
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape"
      && modalEl?.classList.contains("admin-modal--open")
      && window.DashboardModalLifecycle?.isTopmost(modalEl)
    ) {
      event.preventDefault();
      closeResetModal();
    }
  });

  modalSaveEl?.addEventListener("click", async () => {
    const email    = modalEl?.dataset.targetEmail || "";
    const password = modalPwEl?.value || "";
    const pwConfirm = modalPwCEl?.value || "";

    if (!password || password.length < 6) {
      setFeedback("A nova password deve ter pelo menos 6 caracteres.", "error");
      return;
    }
    if (password !== pwConfirm) {
      setFeedback("As passwords nao coincidem.", "error");
      return;
    }

    try {
      const hash = await hashPassword(password);
      const { error } = await sb.from("admin").update({ password_hash: hash }).eq("email", email);
      if (error) throw error;
      closeResetModal();
      await loadUsers(`Password de ${email} reposta com sucesso.`);
    } catch (error) {
      setFeedback(explainError(error, "Erro ao repor password."), "error");
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  try {
    await ensureDefaultUser();
  } catch (error) {
    setFeedback(explainError(error, "Erro ao configurar utilizador inicial."), "error");
  }

  await loadUsers();
})();