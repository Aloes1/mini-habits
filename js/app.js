const STORAGE_KEY = "mini.v1";
const BACKUP_AT_KEY = "mini.backup-at";
const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const COLORS = [
  "#FF5A36", "#FF9F1C", "#FFD166", "#84CC16",
  "#3DDC97", "#2EC4B6", "#0EA5E9", "#5B8CFF",
  "#6366F1", "#7C5CFF", "#A855F7", "#E85DAB",
  "#F43F5E", "#FB7185", "#F97316", "#22D3EE"
];
const $ = (id) => document.getElementById(id);

let db = load();
let ui = {
  view: "home",
  habitId: null,
  date: todayISO(),
  draft: emptyDraft(),
  justCreated: false
};

function emptyDraft(habit) {
  return {
    id: habit?.id || null,
    name: habit?.name || "",
    note: habit?.note || "",
    amount: "",
    color: habit?.color || nextColor()
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habits: [], logs: [] };
    const data = JSON.parse(raw);
    return {
      habits: Array.isArray(data.habits) ? data.habits : [],
      logs: Array.isArray(data.logs) ? data.logs : []
    };
  } catch {
    return { habits: [], logs: [] };
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits: db.habits, logs: db.logs }));
}

function lastBackupLabel() {
  const iso = localStorage.getItem(BACKUP_AT_KEY);
  if (!iso) return "Nog geen backup gemaakt";
  return `Laatste backup: ${formatLong(iso)}`;
}

async function exportBackup() {
  const json = JSON.stringify({ habits: db.habits, logs: db.logs }, null, 2);
  const filename = `mini-backup-${todayISO()}.json`;
  const file = new File([json], filename, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Mini backup" });
      localStorage.setItem(BACKUP_AT_KEY, todayISO());
      return;
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  localStorage.setItem(BACKUP_AT_KEY, todayISO());
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return toISO(new Date());
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, delta) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + delta);
  return toISO(date);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatLong(iso) {
  const date = fromISO(iso);
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function formatPrettyDate() {
  const date = new Date();
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function nextColor() {
  const used = new Set(db.habits.map((habit) => habit.color));
  return COLORS.find((color) => !used.has(color)) || COLORS[db.habits.length % COLORS.length];
}

function habitById(id) {
  return db.habits.find((habit) => habit.id === id);
}

function logFor(habitId, date) {
  return db.logs.find((log) => log.habitId === habitId && log.date === date);
}

function amountFor(habitId, date) {
  return logFor(habitId, date)?.amount || 0;
}

function setAmount(habitId, date, amount) {
  const existing = logFor(habitId, date);
  const clean = Math.max(0, Number(amount) || 0);
  if (clean === 0) {
    db.logs = db.logs.filter((log) => !(log.habitId === habitId && log.date === date));
  } else if (existing) {
    existing.amount = clean;
  } else {
    db.logs.push({ id: uid(), habitId, date, amount: clean });
  }
  save();
}

function lastLog(habit) {
  return db.logs
    .filter((log) => log.habitId === habit.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function lastText(habit) {
  const last = lastLog(habit);
  if (!last) return "Nog niet gedaan";
  if (last.date === todayISO()) return "Vandaag gedaan";
  if (last.date === addDays(todayISO(), -1)) return "Gisteren gedaan";
  const days = Math.round((fromISO(todayISO()) - fromISO(last.date)) / 86400000);
  return `${days} dagen geleden`;
}

function unitLabel(_habit, amount) {
  return String(amount);
}

function startOfWeek(iso) {
  const date = fromISO(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toISO(date);
}

function logsForRange(habitId, days) {
  const end = todayISO();
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(end, index - (days - 1));
    return { date, amount: amountFor(habitId, date) };
  });
}

function currentWeek() {
  const start = startOfWeek(todayISO());
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const colors = db.habits
      .filter((habit) => amountFor(habit.id, date) > 0)
      .map((habit) => habit.color)
      .slice(0, 5);
    return { date, colors };
  });
}

function weekTotal(habit) {
  return logsForRange(habit.id, 7).reduce((sum, day) => sum + day.amount, 0);
}

function allTotal(habit) {
  return db.logs
    .filter((log) => log.habitId === habit.id)
    .reduce((sum, log) => sum + log.amount, 0);
}

function rangeDates(days) {
  const end = todayISO();
  return Array.from({ length: days }, (_, index) => addDays(end, index - (days - 1)));
}

function sparkBars(habit, days = 14) {
  const dates = rangeDates(days);
  const max = Math.max(...dates.map((date) => amountFor(habit.id, date)), 1);
  return dates.map((date) => {
    const amount = amountFor(habit.id, date);
    const height = amount ? Math.max(18, Math.round((amount / max) * 100)) : 10;
    return `<i class="${amount ? "is-on" : ""}" style="height:${height}%"></i>`;
  }).join("");
}

function overviewChart(days = 14) {
  const dates = rangeDates(days);
  const maxByHabit = Object.fromEntries(
    db.habits.map((habit) => [
      habit.id,
      Math.max(...dates.map((date) => amountFor(habit.id, date)), 1)
    ])
  );
  const columns = dates.map((date) => {
    const parts = db.habits
      .map((habit) => {
        const amount = amountFor(habit.id, date);
        return {
          color: habit.color,
          share: amount > 0 ? amount / maxByHabit[habit.id] : 0
        };
      })
      .filter((part) => part.share > 0);
    return {
      date,
      parts,
      total: parts.reduce((sum, part) => sum + part.share, 0)
    };
  });
  return {
    columns,
    maxTotal: Math.max(...columns.map((column) => column.total), 1)
  };
}

function moveHabit(id, dir) {
  const index = db.habits.findIndex((habit) => habit.id === id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= db.habits.length) return;
  const [habit] = db.habits.splice(index, 1);
  db.habits.splice(next, 0, habit);
  save();
  renderHome();
}

function show(view) {
  ui.view = view;
  ["home", "detail", "editor", "settings"].forEach((name) => {
    const el = $(`view-${name}`);
    const on = name === view;
    el.classList.toggle("is-active", on);
    el.hidden = !on;
  });
  window.scrollTo(0, 0);
}

function svgGear() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.5 1.2H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>`;
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

function overviewHtml() {
  if (!db.habits.length) return "";
  const { columns, maxTotal } = overviewChart(14);
  return `
    <section class="panel overview">
      <h3>Alle habits · 14 dagen</h3>
      <div class="stack-chart">
        ${columns.map((column) => {
          if (!column.parts.length) return `<div class="stack is-empty"></div>`;
          const height = Math.max(12, Math.round((column.total / maxTotal) * 100));
          return `
            <div class="stack ${column.date === todayISO() ? "is-today" : ""}" style="height:${height}%">
              ${column.parts.map((part) => `<i style="flex:${Math.max(part.share, 0.08)};background:${part.color}"></i>`).join("")}
            </div>
          `;
        }).join("")}
      </div>
      <div class="chart-labels">
        ${columns.map((column) => `<span>${DAY_NAMES[fromISO(column.date).getDay()]}</span>`).join("")}
      </div>
      <div class="legend">
        ${db.habits.map((habit) => `<span><i style="background:${habit.color}"></i>${esc(habit.name)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderHome() {
  const week = currentWeek();

  const cards = db.habits.map((habit, index) => {
    const today = amountFor(habit.id, todayISO());
    return `
      <article class="habit" style="--habit:${habit.color}">
        <button type="button" data-open="${habit.id}">
          <div class="habit-name">${esc(habit.name)}</div>
          <div class="habit-meta">${esc(lastText(habit))}</div>
          <div class="spark" aria-hidden="true">${sparkBars(habit)}</div>
        </button>
        <div class="habit-side">
          ${db.habits.length > 1 ? `
            <div class="sort">
              <button type="button" class="sort-btn" data-move="${habit.id}" data-dir="-1" aria-label="Omhoog" ${index === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="sort-btn" data-move="${habit.id}" data-dir="1" aria-label="Omlaag" ${index === db.habits.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          ` : ""}
          <div class="count">
            <b>${today || "–"}</b>
            <span class="muted">vandaag</span>
          </div>
        </div>
      </article>
    `;
  }).join("");

  $("view-home").innerHTML = `
    <div class="top">
      <div>
        <p class="kicker">${esc(formatPrettyDate())}</p>
        <h1 class="wordmark">Mini<span>.</span></h1>
      </div>
      <button type="button" class="icon-btn" data-go="settings" aria-label="Instellingen">${svgGear()}</button>
    </div>
    <div class="week">
      ${week.map((day) => `
        <div class="week-day ${day.date === todayISO() ? "is-today" : ""}">
          <small>${DAY_NAMES[fromISO(day.date).getDay()]}</small>
          <div class="dots">
            ${day.colors.length ? day.colors.map((color) => `<i class="dot" style="background:${color}"></i>`).join("") : `<i class="dot" style="background:${day.date === todayISO() ? "rgba(255,255,255,.28)" : "#e7e0d6"}"></i>`}
          </div>
        </div>
      `).join("")}
    </div>
    ${overviewHtml()}
    <div class="row-btns backup-row">
      <button type="button" class="btn btn-ghost" data-export="1">Backup downloaden</button>
      <button type="button" class="btn btn-ghost" data-import="1">Backup terugzetten</button>
    </div>
    ${db.habits.length ? `<div class="list">${cards}</div>` : `
      <div class="empty">
        <div class="blobs">
          <i class="blob" style="background:#FF5A36"></i>
          <i class="blob" style="background:#5B8CFF"></i>
          <i class="blob" style="background:#3DDC97"></i>
        </div>
        <h2>Begin met één</h2>
        <p>Voeg een beweging of habit toe. Als die vanzelf gaat, voeg je de volgende toe.</p>
        <button type="button" class="btn btn-primary" data-go="new">Eerste habit toevoegen</button>
      </div>
    `}
    ${db.habits.length ? `<button type="button" class="fab" data-go="new"><span>+</span> Habit</button>` : ""}
    ${!isStandalone() ? `
      <div class="tip" style="margin-top:${db.habits.length ? "12px" : "84px"}">
        <h3>Op je iPhone zetten</h3>
        <ol>
          <li>Open deze pagina in <b>Safari</b></li>
          <li>Tik op het deel-icoon</li>
          <li>Kies <b>Zet op beginscherm</b></li>
        </ol>
      </div>
    ` : `<div style="height:84px"></div>`}
  `;
}

function renderDetail() {
  const habit = habitById(ui.habitId);
  if (!habit) {
    show("home");
    renderHome();
    return;
  }

  const amount = amountFor(habit.id, ui.date);
  const days = logsForRange(habit.id, 14);
  const max = Math.max(...days.map((day) => day.amount), 1);
  const recent = db.logs
    .filter((log) => log.habitId === habit.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  $("view-detail").innerHTML = `
    <button type="button" class="back" data-go="home">← Overzicht</button>
    ${ui.justCreated ? `
      <button type="button" class="btn btn-primary btn-home" data-go="home">Terug naar overzicht</button>
    ` : ""}
    <section class="hero" style="background:${habit.color}">
      <p class="kicker">${esc(lastText(habit))}</p>
      <h1>${esc(habit.name)}</h1>
      ${habit.note ? `<p class="hero-note">${esc(habit.note)}</p>` : ""}
      <div class="date-nav">
        <button type="button" class="chip" data-shift="-1">‹</button>
        <strong>${esc(formatLong(ui.date))}</strong>
        <button type="button" class="chip" data-shift="1">›</button>
      </div>
      ${ui.date !== todayISO() ? `<button type="button" class="chip" data-today="1">Naar vandaag</button>` : ""}
    </section>
    <section class="amount-card" style="--habit:${habit.color}">
      <label class="field">
        <span>Aantal</span>
        <input id="amount-input" inputmode="decimal" value="${amount || ""}" placeholder="Typ het aantal" />
      </label>
      <button type="button" class="btn btn-color" data-save-amount="1" style="--habit:${habit.color};width:100%">Opslaan</button>
    </section>
    <div class="stats">
      <div class="stat"><span class="muted">Deze week</span><b>${weekTotal(habit)}</b></div>
      <div class="stat"><span class="muted">Totaal</span><b>${allTotal(habit)}</b></div>
    </div>
    <section class="panel">
      <h3>Laatste 14 dagen</h3>
      <div class="chart" style="--habit:${habit.color}">
        ${days.map((day) => {
          const height = Math.max(8, Math.round((day.amount / max) * 100));
          return `<button type="button" class="bar ${day.amount ? "is-on" : ""} ${day.date === ui.date ? "is-selected" : ""}" style="--h:${height}%" data-date="${day.date}" aria-label="${day.date}"></button>`;
        }).join("")}
      </div>
      <div class="chart-labels">
        ${days.map((day) => `<span>${DAY_NAMES[fromISO(day.date).getDay()]}</span>`).join("")}
      </div>
    </section>
    <section class="panel">
      <h3>Geschiedenis</h3>
      <div class="history">
        ${recent.length ? recent.map((log) => `
          <div class="history-row">
            <span>${esc(formatLong(log.date))}</span>
            <strong>${esc(unitLabel(habit, log.amount))}</strong>
          </div>
        `).join("") : `<p class="muted">Nog geen logs. Zet hierboven neer hoeveel je deed.</p>`}
      </div>
    </section>
    <div class="row-btns">
      <button type="button" class="btn btn-ghost" data-edit="${habit.id}">Aanpassen</button>
      <button type="button" class="btn btn-danger" data-delete="${habit.id}">Verwijderen</button>
    </div>
  `;

  const input = $("amount-input");
  if (input) {
    input.addEventListener("change", () => {
      setAmount(habit.id, ui.date, input.value);
      renderDetail();
    });
  }
}

function renderEditor() {
  const draft = ui.draft;
  $("view-editor").innerHTML = `
    <button type="button" class="back" data-go="${draft.id ? "detail" : "home"}">← Terug</button>
    <p class="kicker">${draft.id ? "Aanpassen" : "Nieuwe habit"}</p>
    <h1>${draft.id ? "Wijzig" : "Voeg er één toe"}</h1>
    <form id="habit-form" class="panel" style="margin-top:16px">
      <div class="field">
        <span>Naam</span>
        <input name="name" maxlength="40" placeholder="bijv. squats of wandelen" value="${esc(draft.name)}" required />
      </div>
      <div class="field">
        <span>Notitie</span>
        <textarea name="note" maxlength="240" rows="3" placeholder="bijv. 3 sets, of 1 dag rust">${esc(draft.note)}</textarea>
      </div>
      ${draft.id ? "" : `
      <div class="field">
        <span>Aantal vandaag (optioneel)</span>
        <input name="amount" inputmode="decimal" placeholder="Typ het aantal" value="${esc(draft.amount || "")}" />
      </div>
      `}
      <div class="field">
        <span>Kleur</span>
        <div class="colors">
          ${COLORS.map((color) => `<button type="button" data-color="${color}" class="${draft.color === color ? "is-on" : ""}" style="--swatch:${color}" aria-label="${color}"></button>`).join("")}
        </div>
      </div>
      <button type="submit" class="btn btn-color" style="--habit:${draft.color};width:100%">Opslaan</button>
    </form>
  `;

  $("habit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = event.target.name.value.trim();
    const note = event.target.note.value.trim();
    if (!name) return;
    if (draft.id) {
      const habit = habitById(draft.id);
      habit.name = name;
      habit.note = note;
      habit.color = draft.color;
      ui.justCreated = false;
      save();
      show("detail");
      renderDetail();
      return;
    }
    const habit = { id: uid(), name, note, color: draft.color, createdAt: Date.now() };
    db.habits.push(habit);
    const amount = event.target.amount?.value;
    if (amount) setAmount(habit.id, todayISO(), amount);
    else save();
    ui.habitId = habit.id;
    ui.justCreated = false;
    show("home");
    renderHome();
  });
}

function renderSettings() {
  $("view-settings").innerHTML = `
    <button type="button" class="back" data-go="home">← Overzicht</button>
    <p class="kicker">Mini</p>
    <h1>Instellingen</h1>
    <section class="settings-card" style="margin-top:16px">
      <h3>Backup</h3>
      <p class="backup-meta">${esc(lastBackupLabel())}</p>
      <button type="button" class="btn btn-primary" data-export="1" style="width:100%">Backup downloaden</button>
      <button type="button" class="btn btn-ghost" data-import="1" style="width:100%;margin-top:8px">Backup terugzetten</button>
    </section>
    <section class="settings-card">
      <h3>Op je beginscherm</h3>
      <ol>
        <li>Open Mini in Safari</li>
        <li>Tik op het vierkantje met het pijltje</li>
        <li>Scroll naar <b>Zet op beginscherm</b></li>
        <li>Tik op Voeg toe</li>
      </ol>
    </section>
    <section class="settings-card">
      <h3>Kleine regel</h3>
      <p>Voeg pas een nieuwe habit toe als de vorige bijna vanzelf gaat. Mini is expres klein.</p>
    </section>
  `;
}

function render() {
  if (ui.view === "home") renderHome();
  if (ui.view === "detail") renderDetail();
  if (ui.view === "editor") renderEditor();
  if (ui.view === "settings") renderSettings();
}

function confirmDelete(habit) {
  $("modal-title").textContent = `${habit.name} verwijderen?`;
  $("modal-text").textContent = "De geschiedenis van deze habit verdwijnt ook.";
  $("modal").hidden = false;
  $("modal-ok").onclick = () => {
    db.habits = db.habits.filter((item) => item.id !== habit.id);
    db.logs = db.logs.filter((log) => log.habitId !== habit.id);
    save();
    $("modal").hidden = true;
    show("home");
    renderHome();
  };
}

$("modal-cancel").onclick = () => {
  $("modal").hidden = true;
};

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const go = event.target.closest("[data-go]")?.dataset.go;
  if (go === "home") { ui.justCreated = false; show("home"); renderHome(); }
  if (go === "detail") { show("detail"); renderDetail(); }
  if (go === "settings") { show("settings"); renderSettings(); }
  if (go === "new") {
    ui.draft = emptyDraft();
    show("editor");
    renderEditor();
  }

  const openId = event.target.closest("[data-open]")?.dataset.open;
  if (openId) {
    ui.habitId = openId;
    ui.date = todayISO();
    show("detail");
    renderDetail();
  }

  const moveBtn = event.target.closest("[data-move]");
  if (moveBtn) {
    event.preventDefault();
    moveHabit(moveBtn.dataset.move, Number(moveBtn.dataset.dir));
  }

  const form = $("habit-form");
  if (form && event.target.closest("[data-color]")) {
    ui.draft.name = form.name.value;
    ui.draft.note = form.note.value;
    if (form.amount) ui.draft.amount = form.amount.value;
  }

  const color = event.target.closest("[data-color]")?.dataset.color;
  if (color) {
    ui.draft.color = color;
    renderEditor();
  }

  const shift = event.target.closest("[data-shift]")?.dataset.shift;
  if (shift) {
    ui.date = addDays(ui.date, Number(shift));
    renderDetail();
  }

  if (event.target.closest("[data-today]")) {
    ui.date = todayISO();
    renderDetail();
  }

  const date = event.target.closest("[data-date]")?.dataset.date;
  if (date) {
    ui.date = date;
    renderDetail();
  }

  if (event.target.closest("[data-save-amount]")) {
    const input = $("amount-input");
    setAmount(ui.habitId, ui.date, input ? input.value : 0);
    renderDetail();
  }

  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  if (editId) {
    ui.draft = emptyDraft(habitById(editId));
    show("editor");
    renderEditor();
  }

  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (deleteId) confirmDelete(habitById(deleteId));

  if (event.target.closest("[data-export]")) {
    exportBackup();
    if (ui.view === "home") renderHome();
    if (ui.view === "settings") renderSettings();
  }

  if (event.target.closest("[data-import]")) {
    $("import-file").click();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id !== "import-file") return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.habits) || !Array.isArray(data.logs)) throw new Error("ongeldig");
      db = { habits: data.habits, logs: data.logs };
      save();
      show("home");
      renderHome();
    } catch {
      $("modal-title").textContent = "Backup lukte niet";
      $("modal-text").textContent = "Kies een Mini backup-bestand.";
      $("modal-ok").textContent = "Oké";
      $("modal-ok").onclick = () => { $("modal").hidden = true; $("modal-ok").textContent = "Verwijderen"; };
      $("modal").hidden = false;
    }
  };
  reader.readAsText(file);
  event.target.value = "";
});

renderHome();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=10").catch(() => {});
}
