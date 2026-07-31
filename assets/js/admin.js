(async function adminInit() {
  const feedbackEl = document.getElementById("admin-feedback");
  const usersBodyEl = document.getElementById("admin-users-body");
  const formEl = document.getElementById("admin-user-form");
  const emailInputEl = document.getElementById("admin-email-input");
  const consultarInputEl = document.getElementById("admin-consultar-input");
  const editarInputEl = document.getElementById("admin-editar-input");

  const setFeedback = (message, tone) => {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.classList.remove("admin-feedback--error", "admin-feedback--success");
    if (tone === "error") feedbackEl.classList.add("admin-feedback--error");
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

  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderRows = (rows) => {
    if (!usersBodyEl) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      usersBodyEl.innerHTML = "<tr><td colspan='4' class='admin-empty'>Sem utilizadores configurados.</td></tr>";
      return;
    }

    usersBodyEl.innerHTML = rows
      .map((row) => {
        const email = escapeHtml(row.email);
        const consultar = Boolean(row.consultar);
        const editar = Boolean(row.editar);
        return `
          <tr data-email="${email}">
            <td class="admin-email-cell">${email}</td>
            <td><input type="checkbox" data-perm="consultar" ${consultar ? "checked" : ""} /></td>
            <td><input type="checkbox" data-perm="editar" ${editar ? "checked" : ""} /></td>
            <td><button type="button" class="ghost-btn ghost-btn-danger" data-action="remove">Remover</button></td>
          </tr>
        `;
      })
      .join("");
  };

  const explainError = (error, fallbackMessage) => {
    const message = error?.message || "";
    const code = error?.code || "";
    if (code === "PGRST205" || /Could not find the table 'public\.admin'/i.test(message)) {
      return "Tabela public.admin nao encontrada no Supabase. Aplicar a migration database/migrations/20260731_create_admin_table.sql.";
    }
    return fallbackMessage;
  };

  const fetchUsers = async () => {
    const { data, error } = await sb
      .from("admin")
      .select("email,consultar,editar")
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
    if (error) {
      throw error;
    }
  };

  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = normalizeEmail(emailInputEl?.value);
    const consultar = Boolean(consultarInputEl?.checked);
    const editar = Boolean(editarInputEl?.checked);

    if (!emailRegex.test(email)) {
      setFeedback("Introduz um email valido.", "error");
      return;
    }
    if (!consultar && !editar) {
      setFeedback("Seleciona pelo menos uma permissao.", "error");
      return;
    }

    try {
      const { error } = await sb.from("admin").upsert(
        [{ email, consultar, editar }],
        { onConflict: "email" }
      );
      if (error) throw error;

      if (emailInputEl) emailInputEl.value = "";
      if (consultarInputEl) consultarInputEl.checked = true;
      if (editarInputEl) editarInputEl.checked = false;
      await loadUsers(`Utilizador ${email} guardado com sucesso.`);
    } catch (error) {
      setFeedback(explainError(error, "Erro ao guardar utilizador."), "error");
    }
  });

  usersBodyEl?.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[type='checkbox'][data-perm]");
    if (!checkbox) return;

    const row = checkbox.closest("tr[data-email]");
    if (!row) return;

    const email = row.getAttribute("data-email") || "";
    const consultarCheckbox = row.querySelector("input[data-perm='consultar']");
    const editarCheckbox = row.querySelector("input[data-perm='editar']");
    const consultar = Boolean(consultarCheckbox?.checked);
    const editar = Boolean(editarCheckbox?.checked);

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

  usersBodyEl?.addEventListener("click", async (event) => {
    const removeBtn = event.target.closest("button[data-action='remove']");
    if (!removeBtn) return;

    const row = removeBtn.closest("tr[data-email]");
    if (!row) return;
    const email = row.getAttribute("data-email") || "";
    if (!email) return;

    if (!window.confirm(`Remover utilizador ${email}?`)) {
      return;
    }

    try {
      const { error } = await sb.from("admin").delete().eq("email", email);
      if (error) throw error;
      await loadUsers(`Utilizador ${email} removido.`);
    } catch (error) {
      setFeedback(explainError(error, "Erro ao remover utilizador."), "error");
    }
  });

  try {
    await ensureDefaultUser();
  } catch (error) {
    setFeedback(explainError(error, "Erro ao configurar utilizador inicial."), "error");
  }

  await loadUsers();
})();
