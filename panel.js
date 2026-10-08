"use strict";

/**
 * Resend Request - logica do painel de DevTools.
 *
 * Fluxo:
 *  1. Captura requisicoes da aba Network via chrome.devtools.network.onRequestFinished.
 *  2. Lista na lateral. Ao selecionar, carrega metodo/URL/headers/body no editor.
 *  3. O usuario edita o que quiser e clica "Reenviar": montamos um fetch com os
 *     dados editados e exibimos a resposta.
 *
 * Observacao: por seguranca, o navegador ignora alguns headers "proibidos"
 * (Host, Origin, User-Agent, Cookie, Content-Length, etc.) em um fetch comum.
 * Marcamos esses headers na UI, mas o navegador os descarta no envio.
 */

// Headers que o navegador nao permite setar manualmente via fetch.
// https://developer.mozilla.org/docs/Glossary/Forbidden_header_name
const FORBIDDEN_HEADERS = new Set(
  [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "date",
    "dnt",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "via",
  ].map((h) => h.toLowerCase())
);

function isForbiddenHeader(name) {
  const lower = name.trim().toLowerCase();
  if (FORBIDDEN_HEADERS.has(lower)) return true;
  // Prefixos proibidos.
  return lower.startsWith("proxy-") || lower.startsWith("sec-");
}

// -------------------------------------------------------------------------
// Estado
// -------------------------------------------------------------------------
const state = {
  requests: [], // { id, method, url, headers:[{name,value}], body }
  selectedId: null,
  nextId: 1,
  filter: "",
};

// -------------------------------------------------------------------------
// Referencias de DOM
// -------------------------------------------------------------------------
const el = {
  requestList: document.getElementById("requestList"),
  emptyState: document.getElementById("emptyState"),
  filterInput: document.getElementById("filterInput"),
  clearBtn: document.getElementById("clearBtn"),

  editorEmpty: document.getElementById("editorEmpty"),
  editorContent: document.getElementById("editorContent"),

  methodSelect: document.getElementById("methodSelect"),
  urlInput: document.getElementById("urlInput"),
  sendBtn: document.getElementById("sendBtn"),

  addHeaderBtn: document.getElementById("addHeaderBtn"),
  headersEditor: document.getElementById("headersEditor"),

  bodyInput: document.getElementById("bodyInput"),

  responseMeta: document.getElementById("responseMeta"),
  responseBody: document.getElementById("responseBody"),

  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".tab-panel")),
};

// -------------------------------------------------------------------------
// Captura de requisicoes (API de DevTools)
// -------------------------------------------------------------------------
if (chrome.devtools && chrome.devtools.network) {
  chrome.devtools.network.onRequestFinished.addListener((harEntry) => {
    try {
      addCapturedRequest(harEntry);
    } catch (err) {
      // Nunca deixar um erro de parsing quebrar o listener.
      console.error("Resend Request: falha ao capturar entrada HAR", err);
    }
  });
}

function addCapturedRequest(harEntry) {
  const req = harEntry.request;
  if (!req || !req.url) return;

  const headers = (req.headers || [])
    .filter((h) => h && h.name && !h.name.startsWith(":")) // descarta pseudo-headers HTTP/2
    .map((h) => ({ name: h.name, value: h.value }));

  let body = "";
  if (req.postData) {
    if (typeof req.postData.text === "string") {
      body = req.postData.text;
    } else if (Array.isArray(req.postData.params)) {
      body = req.postData.params
        .map(
          (p) =>
            encodeURIComponent(p.name || "") +
            "=" +
            encodeURIComponent(p.value || "")
        )
        .join("&");
    }
  }

  const entry = {
    id: state.nextId++,
    method: (req.method || "GET").toUpperCase(),
    url: req.url,
    headers,
    body,
  };

  state.requests.unshift(entry);
  renderRequestList();
}

// -------------------------------------------------------------------------
// Lista de requisicoes
// -------------------------------------------------------------------------
function matchesFilter(entry) {
  if (!state.filter) return true;
  const f = state.filter.toLowerCase();
  return (
    entry.url.toLowerCase().includes(f) ||
    entry.method.toLowerCase().includes(f)
  );
}

function renderRequestList() {
  const visible = state.requests.filter(matchesFilter);

  el.emptyState.hidden = state.requests.length > 0;
  el.requestList.innerHTML = "";

  for (const entry of visible) {
    const li = document.createElement("li");
    li.className = "request-item";
    if (entry.id === state.selectedId) li.classList.add("selected");
    li.dataset.id = String(entry.id);

    const method = document.createElement("span");
    method.className = "req-method " + entry.method.toLowerCase();
    method.textContent = entry.method;

    const url = document.createElement("span");
    url.className = "req-url";
    url.textContent = shortUrl(entry.url);
    url.title = entry.url;

    li.appendChild(method);
    li.appendChild(url);
    li.addEventListener("click", () => selectRequest(entry.id));
    el.requestList.appendChild(li);
  }
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

// -------------------------------------------------------------------------
// Selecao / editor
// -------------------------------------------------------------------------
function selectRequest(id) {
  const entry = state.requests.find((r) => r.id === id);
  if (!entry) return;

  state.selectedId = id;
  el.editorEmpty.hidden = true;
  el.editorContent.hidden = false;

  // Garante que o metodo exista no select (adiciona se vier algo incomum).
  ensureMethodOption(entry.method);
  el.methodSelect.value = entry.method;
  el.urlInput.value = entry.url;
  el.bodyInput.value = entry.body || "";

  renderHeaders(entry.headers);
  clearResponse();
  activateTab("headers");
  renderRequestList();
}

function ensureMethodOption(method) {
  const exists = Array.from(el.methodSelect.options).some(
    (o) => o.value === method
  );
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = method;
    opt.textContent = method;
    el.methodSelect.appendChild(opt);
  }
}

// -------------------------------------------------------------------------
// Editor de headers
// -------------------------------------------------------------------------
function renderHeaders(headers) {
  el.headersEditor.innerHTML = "";
  for (const h of headers) {
    el.headersEditor.appendChild(createHeaderRow(h.name, h.value));
  }
}

function createHeaderRow(name = "", value = "") {
  const row = document.createElement("div");
  row.className = "header-row";

  const keyInput = document.createElement("input");
  keyInput.className = "header-key";
  keyInput.placeholder = "Nome";
  keyInput.value = name;

  const valueInput = document.createElement("input");
  valueInput.className = "header-value";
  valueInput.placeholder = "Valor";
  valueInput.value = value;

  const markRestricted = () => {
    row.classList.toggle("header-restricted", isForbiddenHeader(keyInput.value));
    const restricted = isForbiddenHeader(keyInput.value);
    keyInput.title = restricted
      ? "Header restrito: o navegador ignora este header no reenvio."
      : "";
  };
  keyInput.addEventListener("input", markRestricted);
  markRestricted();

  const removeBtn = document.createElement("button");
  removeBtn.className = "header-remove";
  removeBtn.textContent = "\u00d7"; // ×
  removeBtn.title = "Remover header";
  removeBtn.addEventListener("click", () => row.remove());

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  return row;
}

function collectHeaders() {
  const headers = [];
  for (const row of el.headersEditor.querySelectorAll(".header-row")) {
    const name = row.querySelector(".header-key").value.trim();
    const value = row.querySelector(".header-value").value;
    if (name) headers.push({ name, value });
  }
  return headers;
}

// -------------------------------------------------------------------------
// Abas
// -------------------------------------------------------------------------
function activateTab(tabName) {
  for (const tab of el.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  }
  for (const panel of el.panels) {
    panel.hidden = panel.dataset.panel !== tabName;
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  }
}

// -------------------------------------------------------------------------
// Reenvio
// -------------------------------------------------------------------------
async function resend() {
  const method = el.methodSelect.value;
  const url = el.urlInput.value.trim();

  if (!url) {
    showResponseError("Informe uma URL valida.");
    activateTab("response");
    return;
  }

  const headers = new Headers();
  const skipped = [];
  for (const h of collectHeaders()) {
    if (isForbiddenHeader(h.name)) {
      skipped.push(h.name);
      continue;
    }
    try {
      headers.append(h.name, h.value);
    } catch {
      skipped.push(h.name);
    }
  }

  const options = { method, headers, redirect: "follow" };

  // GET/HEAD nao podem ter body.
  if (method !== "GET" && method !== "HEAD" && el.bodyInput.value !== "") {
    options.body = el.bodyInput.value;
  }

  el.sendBtn.disabled = true;
  el.sendBtn.textContent = "Enviando...";
  activateTab("response");
  el.responseMeta.textContent = "Enviando requisicao...";
  el.responseBody.textContent = "";

  const started = performance.now();
  try {
    const res = await fetch(url, options);
    const elapsed = Math.round(performance.now() - started);
    const text = await res.text();
    showResponse(res, text, elapsed, skipped);
  } catch (err) {
    showResponseError(
      "Falha ao reenviar: " +
        (err && err.message ? err.message : String(err)) +
        "\n\n(Pode ser bloqueio de CORS, rede ou URL invalida.)"
    );
  } finally {
    el.sendBtn.disabled = false;
    el.sendBtn.textContent = "Reenviar";
  }
}

function showResponse(res, text, elapsed, skipped) {
  const ok = res.ok;
  const statusClass = ok ? "status-ok" : "status-err";

  let meta =
    `<span class="${statusClass}">${res.status} ${res.statusText}</span>` +
    `  &middot;  ${elapsed} ms  &middot;  ${formatBytes(text.length)}`;

  if (skipped.length) {
    meta +=
      `<br/><span class="hint">Headers ignorados pelo navegador: ` +
      skipped.map(escapeHtml).join(", ") +
      `</span>`;
  }

  el.responseMeta.innerHTML = meta;
  el.responseBody.textContent = prettify(text, res.headers.get("content-type"));
}

function showResponseError(message) {
  el.responseMeta.innerHTML = `<span class="status-err">Erro</span>`;
  el.responseBody.textContent = message;
}

function clearResponse() {
  el.responseMeta.textContent = "";
  el.responseBody.textContent = "";
}

// -------------------------------------------------------------------------
// Utilidades
// -------------------------------------------------------------------------
function prettify(text, contentType) {
  if (contentType && contentType.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* mantem texto cru */
    }
  }
  return text;
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -------------------------------------------------------------------------
// Eventos de UI
// -------------------------------------------------------------------------
el.sendBtn.addEventListener("click", resend);

el.addHeaderBtn.addEventListener("click", () => {
  el.headersEditor.appendChild(createHeaderRow());
});

el.clearBtn.addEventListener("click", () => {
  state.requests = [];
  state.selectedId = null;
  el.editorContent.hidden = true;
  el.editorEmpty.hidden = false;
  renderRequestList();
});

el.filterInput.addEventListener("input", (e) => {
  state.filter = e.target.value;
  renderRequestList();
});

for (const tab of el.tabs) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

// Ctrl/Cmd + Enter reenvia.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (!el.editorContent.hidden) resend();
  }
});

// Primeiro render.
renderRequestList();
