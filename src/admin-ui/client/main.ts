/**
 * Admin web UI — single-page controller.
 *
 * Decides which view to show based on:
 *   GET /admin/state    → does an admin exist yet?
 *   GET /admin/me       → is this browser already logged in?
 *
 * Then drives the OPAQUE flow against the corresponding endpoints. The
 * session token is held in localStorage under SESSION_KEY; the master
 * password is never persisted anywhere (the browser forgets it as soon
 * as the form submit handler returns).
 */
import {
  KE2,
  OpaqueClient,
  OpaqueID,
  RegistrationResponse,
  getOpaqueConfig,
} from "@cloudflare/opaque-ts";

const SERVER_IDENTITY = "itsmypassword-server";
const SESSION_KEY = "impw.admin.session.v1";
const opaqueConfig = getOpaqueConfig(OpaqueID.OPAQUE_P256);

// --- tiny DOM helpers -------------------------------------------------

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}
function show(id: string): void {
  $(id).hidden = false;
}
function hide(id: string): void {
  $(id).hidden = true;
}
function setText(id: string, text: string): void {
  $(id).textContent = text;
}
function showError(id: string, message: string): void {
  const el = $(id);
  el.textContent = message;
  el.hidden = false;
}
function clearError(id: string): void {
  $(id).hidden = true;
}

// --- HTTP -------------------------------------------------------------

interface FetchOpts {
  method?: string;
  body?: unknown;
  auth?: boolean;
}
async function api<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const init: RequestInit = { method: opts.method ?? "GET", headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(path, init);
  if (res.status === 204) return null as T;
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const err = parsed as { error?: string } | undefined;
    throw Object.assign(new Error(err?.error ?? `HTTP ${res.status}`), {
      status: res.status,
      body: parsed,
    });
  }
  return parsed as T;
}

// --- OPAQUE flows -----------------------------------------------------

async function opaqueRegister(
  username: string,
  password: string,
  startPath: string,
  finishPath: string,
): Promise<{ adminId: string; sessionToken: string }> {
  const client = new OpaqueClient(opaqueConfig);
  const req = await client.registerInit(password);
  if (req instanceof Error) throw req;
  const start = await api<{ response: number[] }>(startPath, {
    method: "POST",
    body: { username, request: req.serialize() },
  });
  const fin = await client.registerFinish(
    RegistrationResponse.deserialize(opaqueConfig, start.response),
    SERVER_IDENTITY,
  );
  if (fin instanceof Error) throw fin;
  return api<{ adminId: string; sessionToken: string }>(finishPath, {
    method: "POST",
    body: { username, record: fin.record.serialize() },
  });
}

async function opaqueLogin(
  username: string,
  password: string,
): Promise<{ adminId: string; sessionToken: string }> {
  const client = new OpaqueClient(opaqueConfig);
  const ke1 = await client.authInit(password);
  if (ke1 instanceof Error) throw ke1;
  const start = await api<{ ke2: number[]; challengeToken: string }>(
    "/admin/auth/login/start",
    { method: "POST", body: { username, ke1: ke1.serialize() } },
  );
  const fin = await client.authFinish(
    KE2.deserialize(opaqueConfig, start.ke2),
    SERVER_IDENTITY,
  );
  if (fin instanceof Error) {
    throw new Error("invalid_login");
  }
  return api<{ adminId: string; sessionToken: string }>(
    "/admin/auth/login/finish",
    {
      method: "POST",
      body: { challengeToken: start.challengeToken, ke3: fin.ke3.serialize() },
    },
  );
}

// --- Views ------------------------------------------------------------

type View = "loading" | "setup" | "login" | "dashboard";

function switchView(view: View): void {
  for (const v of ["loading", "setup", "login", "dashboard"] as const) {
    if (v === view) show(`view-${v}`);
    else hide(`view-${v}`);
  }
}

async function decideStartView(): Promise<void> {
  switchView("loading");
  const state = await api<{ adminExists: boolean }>("/admin/state");
  if (!state.adminExists) {
    switchView("setup");
    return;
  }
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) {
    switchView("login");
    return;
  }
  try {
    const me = await api<{ username: string }>("/admin/me", { auth: true });
    setText("who", `connecté en tant que ${me.username}`);
    $("logout-btn").hidden = false;
    switchView("dashboard");
    await loadPending();
  } catch {
    localStorage.removeItem(SESSION_KEY);
    switchView("login");
  }
}

// --- Setup view -------------------------------------------------------

function wireSetup(): void {
  const form = $<HTMLFormElement>("setup-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("setup-error");
    const username = ($("setup-username") as HTMLInputElement).value.trim();
    const pw1 = ($("setup-password") as HTMLInputElement).value;
    const pw2 = ($("setup-password-2") as HTMLInputElement).value;
    if (pw1 !== pw2) {
      showError("setup-error", "Les deux mots de passe diffèrent.");
      return;
    }
    if (pw1.length < 8) {
      showError("setup-error", "Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    const submit = $<HTMLButtonElement>("setup-submit");
    submit.disabled = true;
    submit.textContent = "Création…";
    try {
      const result = await opaqueRegister(
        username,
        pw1,
        "/admin/setup/register/start",
        "/admin/setup/register/finish",
      );
      localStorage.setItem(SESSION_KEY, result.sessionToken);
      await decideStartView();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError("setup-error", humanError(message));
    } finally {
      submit.disabled = false;
      submit.textContent = "Créer mon compte admin";
    }
  });
}

// --- Login view -------------------------------------------------------

function wireLogin(): void {
  const form = $<HTMLFormElement>("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError("login-error");
    const username = ($("login-username") as HTMLInputElement).value.trim();
    const password = ($("login-password") as HTMLInputElement).value;
    const submit = $<HTMLButtonElement>("login-submit");
    submit.disabled = true;
    submit.textContent = "Connexion…";
    try {
      const result = await opaqueLogin(username, password);
      localStorage.setItem(SESSION_KEY, result.sessionToken);
      ($("login-password") as HTMLInputElement).value = "";
      await decideStartView();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError("login-error", humanError(message));
    } finally {
      submit.disabled = false;
      submit.textContent = "Se connecter";
    }
  });
}

// --- Dashboard --------------------------------------------------------

interface PendingUser {
  id: string;
  emailHashHex: string;
  createdAt: number;
}

async function loadPending(): Promise<void> {
  const list = $("pending-list");
  list.innerHTML = "<li class='muted center'>Chargement…</li>";
  try {
    const data = await api<{ users: PendingUser[] }>(
      "/admin/users/pending",
      { auth: true },
    );
    renderPending(data.users);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    list.innerHTML = `<li class='error'>Erreur de chargement : ${escapeHtml(message)}</li>`;
  }
}

function renderPending(users: PendingUser[]): void {
  const list = $("pending-list");
  setText("pending-count", String(users.length));
  if (users.length === 0) {
    list.innerHTML =
      "<li class='muted center' style='padding:24px;'>Aucune demande en attente. Quand un utilisateur tente de se connecter, il apparaîtra ici.</li>";
    return;
  }
  list.innerHTML = "";
  for (const u of users) {
    const li = document.createElement("li");
    li.className = "entry";
    const fmtDate = new Date(u.createdAt).toLocaleString("fr-FR");
    li.innerHTML = `
      <div class="meta">
        <strong>Utilisateur ${escapeHtml(u.id.slice(0, 8))}…</strong>
        <span class="id">empreinte email : ${escapeHtml(u.emailHashHex)}</span>
        <span class="age">demandé le ${escapeHtml(fmtDate)}</span>
      </div>
      <div class="row-actions">
        <button data-act="reject" data-id="${escapeHtml(u.id)}" class="btn-ghost">Refuser</button>
        <button data-act="approve" data-id="${escapeHtml(u.id)}" class="btn-success">Approuver</button>
      </div>
    `;
    list.appendChild(li);
  }
}

async function approve(id: string): Promise<void> {
  await api(`/admin/users/${id}/approve`, { method: "POST", auth: true });
}
async function reject(id: string): Promise<void> {
  const reason = window.prompt("Raison (facultatif) :", "")?.trim() ?? "";
  await api(`/admin/users/${id}/reject`, {
    method: "POST",
    auth: true,
    body: reason.length > 0 ? { reason } : {},
  });
}

function wireDashboard(): void {
  $("refresh-btn").addEventListener("click", () => void loadPending());
  $("pending-list").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLButtonElement)) return;
    const act = target.dataset["act"];
    const id = target.dataset["id"];
    if (!act || !id) return;
    target.disabled = true;
    const action = act === "approve" ? approve(id) : reject(id);
    void action
      .then(() => loadPending())
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        window.alert(`Échec : ${message}`);
      })
      .finally(() => {
        target.disabled = false;
      });
  });
}

// --- Logout + theme + boot --------------------------------------------

function wireLogout(): void {
  $("logout-btn").addEventListener("click", async () => {
    try {
      await api("/admin/auth/logout", { method: "POST", auth: true });
    } catch {
      /* best-effort */
    }
    localStorage.removeItem(SESSION_KEY);
    setText("who", "");
    $("logout-btn").hidden = true;
    await decideStartView();
  });
}

function wireThemeToggle(): void {
  $("theme-toggle").addEventListener("click", () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* localStorage blocked */
    }
  });
}

function humanError(message: string): string {
  if (message === "invalid_login") return "Identifiants refusés.";
  if (message === "setup_locked") return "Le setup admin est déjà verrouillé : un compte existe.";
  if (message.includes("HTTP 429")) return "Trop de tentatives. Patiente quelques minutes.";
  return message;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ??
      c
    );
  });
}

// --- Boot -------------------------------------------------------------

wireSetup();
wireLogin();
wireDashboard();
wireLogout();
wireThemeToggle();
void decideStartView();
