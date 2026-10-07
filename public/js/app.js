import { api, setSession, clearSession, getToken } from "./api.js";

const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const categoriesEl = document.querySelector("#categories");
const form = document.querySelector("#expense-form");
const formError = document.querySelector("#form-error");
const cancelBtn = document.querySelector("#cancel");
const removeBtn = document.querySelector("#remove");

let mode = "login";
let category = "Todas";
let query = "";
let selected = null;
let timer;

const money = (value) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value) || 0);
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}

function blank() {
  selected = null;
  form.reset();
  document.querySelector("#spentAt").value = new Date().toISOString().slice(0, 10);
  cancelBtn.hidden = true;
  removeBtn.hidden = true;
}

function fill(expense) {
  selected = expense;
  document.querySelector("#title").value = expense.title;
  document.querySelector("#amount").value = expense.amount;
  document.querySelector("#category").value = expense.category;
  document.querySelector("#note").value = expense.note || "";
  document.querySelector("#spentAt").value = String(expense.spentAt).slice(0, 10);
  cancelBtn.hidden = false;
  removeBtn.hidden = false;
}

async function loadCategories() {
  const data = await api("/api/categories");
  const all = data.categories.reduce((sum, item) => sum + item.total, 0);
  const items = [{ name: "Todas", count: data.categories.reduce((sum, item) => sum + item.count, 0), total: all }, ...data.categories];
  categoriesEl.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cat${item.name === category ? " active" : ""}`;
    button.textContent = `${item.name} (${item.count})`;
    button.addEventListener("click", async () => { category = item.name; await refresh(); });
    categoriesEl.append(button);
  });
}

async function loadExpenses() {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category !== "Todas") params.set("category", category);
  const data = await api(`/api/expenses?${params}`);
  document.querySelector("#total").textContent = money(data.total);
  listEl.innerHTML = "";
  if (!data.expenses.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay gastos.";
    listEl.append(empty);
    return;
  }
  data.expenses.forEach((expense) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item${selected && selected.id === expense.id ? " active" : ""}`;
    const left = document.createElement("span");
    left.append(document.createTextNode(expense.title));
    left.append(document.createElement("br"));
    const meta = document.createElement("small");
    meta.textContent = `${expense.category} \u00b7 ${String(expense.spentAt).slice(0, 10)}`;
    left.append(meta);
    const amount = document.createElement("strong");
    amount.textContent = money(expense.amount);
    button.append(left, amount);
    button.addEventListener("click", () => fill(expense));
    li.append(button);
    listEl.append(li);
  });
}

async function refresh() {
  await loadCategories();
  await loadExpenses();
}

async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    blank();
    await refresh();
  } catch {
    clearSession();
  }
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
    });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) {
    showError(authError, err.message);
  }
});
document.querySelector("#logout").addEventListener("click", () => {
  clearSession();
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
});
document.querySelector("#search").addEventListener("input", (event) => {
  clearTimeout(timer);
  timer = setTimeout(async () => { query = event.target.value.trim(); await loadExpenses(); }, 200);
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  const payload = {
    title: document.querySelector("#title").value.trim(),
    amount: document.querySelector("#amount").value,
    category: document.querySelector("#category").value.trim(),
    note: document.querySelector("#note").value.trim(),
    spentAt: document.querySelector("#spentAt").value,
  };
  try {
    if (selected) await api(`/api/expenses/${selected.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await api("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    blank();
    await refresh();
  } catch (err) {
    showError(formError, err.message);
  }
});
cancelBtn.addEventListener("click", blank);
removeBtn.addEventListener("click", async () => {
  if (!selected) return;
  await api(`/api/expenses/${selected.id}`, { method: "DELETE" });
  blank();
  await refresh();
});
boot();
