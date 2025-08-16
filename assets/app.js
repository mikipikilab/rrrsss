// ========== Radno vrijeme - utili i storage ==========
const STORAGE_KEY = "radnoVrijeme_v1";

const DAYS = [
  { i: 0, name: "Ponedjeljak" },
  { i: 1, name: "Utorak" },
  { i: 2, name: "Srijeda" },
  { i: 3, name: "Četvrtak" },
  { i: 4, name: "Petak" },
  { i: 5, name: "Subota" },
  { i: 6, name: "Nedjelja" },
];

function getDefaultSchedule() {
  return {
    version: 1,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Podgorica",
    days: [
      { name: "Ponedjeljak", closed: false, open: "10:00", close: "20:00" },
      { name: "Utorak",     closed: false, open: "10:00", close: "20:00" },
      { name: "Srijeda",    closed: false, open: "10:00", close: "20:00" },
      { name: "Četvrtak",   closed: false, open: "10:00", close: "20:00" },
      { name: "Petak",      closed: false, open: "10:00", close: "20:00" },
      { name: "Subota",     closed: false, open: "10:00", close: "14:00" },
      { name: "Nedjelja",   closed: true,  open: null,    close: null    },
    ]
  };
}

const API_URL = "/api/schedule";

async function fetchRemoteSchedule() {
  try {
    const res = await fetch(API_URL, { headers: { "Accept": "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error("Bad status");
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
}

async function pushRemoteSchedule(sch) {
  try {
    const res = await fetch(API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sch)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function loadSchedule() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSchedule();
    const parsed = JSON.parse(raw);
    // very light validation
    if (!parsed.days || parsed.days.length !== 7) return getDefaultSchedule();
    return parsed;
  } catch(e) {
    console.warn("Greška pri čitanju localStorage:", e);
    return getDefaultSchedule();
  }
}

function saveSchedule(sch) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sch));
}

function resetSchedule() {
  const def = getDefaultSchedule();
  saveSchedule(def);
  return def;
}

// Helpers
function jsDayToIndex(d) {
  // JS Date.getDay(): 0 = Sunday ... 6 = Saturday
  // Naš indeks: 0 = Ponedjeljak ... 6 = Nedjelja
  // Map: Sun(0)->6, Mon(1)->0, Tue(2)->1, ... Sat(6)->5
  return d === 0 ? 6 : d - 1;
}
function indexToJsDay(i) { return i === 6 ? 0 : i + 1; }

function timeStrToMinutes(t) {
  // "HH:MM" -> total minutes
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isOpenAt(date, schedule) {
  const jsDay = date.getDay();
  const idx = jsDayToIndex(jsDay);
  const d = schedule.days[idx];
  if (d.closed) return false;
  if (!d.open || !d.close) return false;

  const nowMin = date.getHours() * 60 + date.getMinutes();
  const openMin = timeStrToMinutes(d.open);
  const closeMin = timeStrToMinutes(d.close);

  // Podržava i preklapanje preko ponoći (ako ikad zatreba)
  if (closeMin > openMin) {
    return nowMin >= openMin && nowMin < closeMin;
  } else if (closeMin < openMin) {
    // npr. 20:00 -> 02:00
    return nowMin >= openMin || nowMin < closeMin;
  } else {
    // isti open/close: tretiramo kao zatvoreno
    return false;
  }
}

function formatRange(d) {
  return d.closed ? "NERADNI DAN" : `${d.open} – ${d.close}`;
}

// ========== INDEX ==========
async function initIndex() {
  let schedule = await fetchRemoteSchedule() || loadSchedule();
  const statusImg = document.getElementById("status-img");
  const statusLabel = document.getElementById("status-label");
  const metaLine = document.getElementById("meta-line");
  const tableBody = document.getElementById("tabela-tijelo");

  function render() {
    const now = new Date();
    const open = isOpenAt(now, schedule);
    const jsDay = now.getDay();
    const idx = jsDayToIndex(jsDay);
    const today = schedule.days[idx];

    // Slika
    const imgPath = open ? "open.png" : "close.png";
    statusImg.src = imgPath;
    statusImg.alt = open ? "Otvoreno" : "Zatvoreno";

    // Tekst
    statusLabel.textContent = open ? "OTVORENO" : "ZATVORENO";
    statusLabel.className = "badge " + (open ? "open" : "closed");
    metaLine.textContent = `Danas (${DAYS[idx].name}): ${formatRange(today)}`;

    // Tabela sedmice
    tableBody.innerHTML = "";
    schedule.days.forEach((d, i) => {
      const tr = document.createElement("tr");
      if (i === idx) tr.classList.add("today");
      tr.innerHTML = `
        <td>${DAYS[i].name}</td>
        <td>${formatRange(d)}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  render();
  // re-fetch remote every 5 minutes in case admin changed it
  setInterval(async () => { schedule = await fetchRemoteSchedule() || schedule; render(); }, 5 * 60 * 1000);
  // Osvježi svake minute
  setInterval(render, 60 * 1000);

  // Admin dugme
  const adminBtn = document.getElementById("admin-btn");
  adminBtn.addEventListener("click", () => {
    const pw = prompt("Unesi lozinku za admin: ");
    if (pw === "1234") {
      window.location.href = "admin.html";
    } else if (pw !== null) {
      alert("Pogrešna lozinka.");
    }
  });
}

// ========== ADMIN ==========
function requirePasswordOrBack() {
  const pw = prompt("Admin lozinka:");
  if (pw !== "1234") {
    alert("Pogrešna lozinka. Vraćam na početnu.");
    window.location.replace("index.html");
    return false;
  }
  return true;
}

async function initAdmin() {
  if (!requirePasswordOrBack()) return;

  let schedule = await fetchRemoteSchedule() || loadSchedule();

  const daySelect = document.getElementById("day-select");
  const closedCheck = document.getElementById("closed-check");
  const openInput = document.getElementById("open-input");
  const closeInput = document.getElementById("close-input");
  const saveBtn = document.getElementById("save-btn");
  const resetBtn = document.getElementById("reset-btn");
  const info = document.getElementById("info");
  const tableBody = document.getElementById("admin-table-body");

  // Populate day options
  DAYS.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = d.name;
    daySelect.appendChild(opt);
  });

  function renderTable() {
    tableBody.innerHTML = "";
    schedule.days.forEach((d, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${DAYS[i].name}</td>
        <td>${d.closed ? "NERADNI DAN" : `${d.open} – ${d.close}`}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  function loadFormFor(i) {
    const d = schedule.days[i];
    closedCheck.checked = !!d.closed;
    openInput.value = d.open || "10:00";
    closeInput.value = d.close || "20:00";
    openInput.disabled = closedCheck.checked;
    closeInput.disabled = closedCheck.checked;
  }

  daySelect.addEventListener("change", () => loadFormFor(Number(daySelect.value)));
  closedCheck.addEventListener("change", () => {
    openInput.disabled = closedCheck.checked;
    closeInput.disabled = closedCheck.checked;
  });

  saveBtn.addEventListener("click", async () => {
    const i = Number(daySelect.value);
    const wasClosed = schedule.days[i].closed;
    schedule.days[i].closed = closedCheck.checked;
    if (!closedCheck.checked) {
      schedule.days[i].open = openInput.value || "10:00";
      schedule.days[i].close = closeInput.value || "20:00";
    } else {
      schedule.days[i].open = null;
      schedule.days[i].close = null;
    }
    saveSchedule(schedule);
    // try remote
    const ok = await pushRemoteSchedule(schedule);
    renderTable();
    if (!ok) { info.textContent = "Sačuvano lokalno (remote nije dostupan)."; return; }
    info.textContent = "Sačuvano.";
    setTimeout(() => (info.textContent = ""), 1800);
  });

  resetBtn.addEventListener("click", () => {
    if (confirm("Vrati podrazumijevano radno vrijeme?")) {
      schedule = resetSchedule();
      loadFormFor(Number(daySelect.value));
      renderTable();
      info.textContent = "Vraćeno na podrazumijevano.";
      setTimeout(() => (info.textContent = ""), 1800);
    }
  });

  // Init
  daySelect.value = "0";
  loadFormFor(0);
  renderTable();
}

window.HoursApp = { initIndex, initAdmin };
