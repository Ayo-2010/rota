const STORAGE_KEY = "rota.planner.v1";
const SHIFTS = [
  { id: "morning", name: "Morning", short: "AM", time: "07:00–15:00", color: "#c9f24f" },
  { id: "evening", name: "Evening", short: "PM", time: "15:00–23:00", color: "#2847ff" },
  { id: "night", name: "Night", short: "NT", time: "23:00–07:00", color: "#111711" }
];
const PALETTE = [
  { bg: "#ff6b45", fg: "#111711" },
  { bg: "#2847ff", fg: "#ffffff" },
  { bg: "#8b5cf6", fg: "#ffffff" },
  { bg: "#c9f24f", fg: "#111711" },
  { bg: "#0f9f7a", fg: "#ffffff" },
  { bg: "#f2b544", fg: "#111711" },
  { bg: "#e84a8a", fg: "#ffffff" },
  { bg: "#47a8e8", fg: "#111711" }
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
];

const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, "0");
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const now = new Date();
let nextMemberId = 8;
let history = [];
let toastTimer = 0;
let editingMember = null;

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);
}

function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function cellKey(date, shiftId) {
  return `${typeof date === "string" ? date : dateKey(date)}::${shiftId}`;
}

function splitCellKey(key) {
  const [date, shift] = key.split("::");
  return { date, shift };
}

function shortDate(date) {
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] || "").join("").toUpperCase();
}

function colorFor(member) {
  return PALETTE[clamp(Number(member.color) || 0, 0, PALETTE.length - 1)];
}

function defaultMembers() {
  return [
    { id: "m1", name: "Mara Voss", role: "Manager", max: 8, daysOff: [0], color: 0 },
    { id: "m2", name: "Ilya Chen", role: "Bar", max: 8, daysOff: [1], color: 1 },
    { id: "m3", name: "Noor Haddad", role: "Floor", max: 8, daysOff: [2], color: 2 },
    { id: "m4", name: "Theo Martin", role: "Kitchen", max: 8, daysOff: [3], color: 3 },
    { id: "m5", name: "Priya Nair", role: "Bar", max: 8, daysOff: [4], color: 4 },
    { id: "m6", name: "Sam Okafor", role: "Floor", max: 8, daysOff: [5], color: 5 },
    { id: "m7", name: "Lena Fischer", role: "Kitchen", max: 8, daysOff: [6], color: 6 }
  ];
}

let state = {
  start: dateKey(mondayOf(now)),
  members: defaultMembers(),
  assignments: {},
  settings: { avoidNight: true, balanceWeekends: true },
  selected: null
};

function memberById(id) {
  return state.members.find((member) => member.id === id) || null;
}

function assignmentCounts() {
  const counts = new Map();
  state.members.forEach((member) => counts.set(member.id, 0));
  Object.values(state.assignments).forEach((id) => {
    if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  });
  return counts;
}

function weekendCounts() {
  const counts = new Map();
  state.members.forEach((member) => counts.set(member.id, 0));
  Object.entries(state.assignments).forEach(([key, id]) => {
    if (!counts.has(id)) return;
    const { date } = splitCellKey(key);
    const day = parseKey(date).getDay();
    if (day === 0 || day === 6) counts.set(id, counts.get(id) + 1);
  });
  return counts;
}

function buildSchedule() {
  state.assignments = {};
  const counts = new Map();
  const weekends = new Map();
  const nights = new Map();
  state.members.forEach((member) => {
    counts.set(member.id, 0);
    weekends.set(member.id, 0);
    nights.set(member.id, 0);
  });
  const start = parseKey(state.start);

  for (let day = 0; day < 14; day += 1) {
    const date = addDays(start, day);
    const previousNight = state.assignments[cellKey(dateKey(addDays(date, -1)), "night")] || null;
    const usedToday = new Set();
    const weekend = date.getDay() === 0 || date.getDay() === 6;

    SHIFTS.forEach((shift) => {
      const eligible = state.members.filter((member) => {
        if (!member.daysOff.includes(date.getDay())) {
          if ((counts.get(member.id) || 0) >= member.max) return false;
          if (usedToday.has(member.id)) return false;
          if (shift.id === "morning" && state.settings.avoidNight && previousNight === member.id) return false;
          return true;
        }
        return false;
      });
      if (!eligible.length) return;

      const scored = eligible.map((member) => {
        const load = (counts.get(member.id) || 0) / Math.max(member.max, 1);
        let score = load + Math.random() * 0.32;
        if (weekend && state.settings.balanceWeekends) score += ((weekends.get(member.id) || 0) / Math.max(member.max, 1)) * 0.28;
        if (shift.id === "night") score += ((nights.get(member.id) || 0) / Math.max(member.max, 1)) * 0.14;
        return { member, score };
      }).sort((a, b) => a.score - b.score);

      const chosen = scored[0].member;
      state.assignments[cellKey(date, shift.id)] = chosen.id;
      counts.set(chosen.id, (counts.get(chosen.id) || 0) + 1);
      if (weekend) weekends.set(chosen.id, (weekends.get(chosen.id) || 0) + 1);
      if (shift.id === "night") nights.set(chosen.id, (nights.get(chosen.id) || 0) + 1);
      usedToday.add(chosen.id);
    });
  }
}

function computeFlags() {
  const flags = new Set();
  const groups = new Map();
  const counts = new Map();
  state.members.forEach((member) => counts.set(member.id, 0));

  Object.entries(state.assignments).forEach(([key, id]) => {
    const member = memberById(id);
    if (!member) return;
    const { date, shift } = splitCellKey(key);
    const group = `${id}|${date}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ key, shift });
    counts.set(id, (counts.get(id) || 0) + 1);
  });

  groups.forEach((cells) => {
    if (cells.length > 1) cells.forEach((cell) => flags.add(cell.key));
  });

  state.members.forEach((member) => {
    if ((counts.get(member.id) || 0) > member.max) {
      Object.keys(state.assignments).forEach((key) => {
        if (state.assignments[key] === member.id) flags.add(key);
      });
    }
  });

  if (state.settings.avoidNight) {
    for (let day = 1; day < 14; day += 1) {
      const date = addDays(parseKey(state.start), day);
      const previous = addDays(date, -1);
      const night = state.assignments[cellKey(previous, "night")];
      const morning = state.assignments[cellKey(date, "morning")];
      if (night && morning && night === morning) {
        flags.add(cellKey(date, "morning"));
        flags.add(cellKey(previous, "night"));
      }
    }
  }
  return flags;
}

function getIssues() {
  const issues = [];
  const groups = new Map();
  const counts = new Map();
  state.members.forEach((member) => counts.set(member.id, 0));

  Object.entries(state.assignments).forEach(([key, id]) => {
    const member = memberById(id);
    if (!member) return;
    const { date, shift } = splitCellKey(key);
    const group = `${id}|${date}`;
    if (!groups.has(group)) groups.set(group, { member, date, cells: [] });
    groups.get(group).cells.push(key);
    counts.set(id, (counts.get(id) || 0) + 1);
  });

  groups.forEach((group) => {
    if (group.cells.length > 1) {
      issues.push({
        type: "conflict",
        text: `${group.member.name} is on two shifts on ${shortDate(parseKey(group.date))}.`,
        cell: group.cells[0]
      });
    }
  });

  state.members.forEach((member) => {
    if ((counts.get(member.id) || 0) > member.max) {
      const cell = Object.keys(state.assignments).find((key) => state.assignments[key] === member.id);
      issues.push({
        type: "conflict",
        text: `${member.name} has ${counts.get(member.id)} shifts, over their ${member.max} limit.`,
        cell
      });
    }
  });

  if (state.settings.avoidNight) {
    for (let day = 1; day < 14; day += 1) {
      const date = addDays(parseKey(state.start), day);
      const previous = addDays(date, -1);
      const night = state.assignments[cellKey(previous, "night")];
      const morning = state.assignments[cellKey(date, "morning")];
      if (night && morning && night === morning) {
        const member = memberById(night);
        if (member) issues.push({ type: "conflict", text: `${member.name} closes then opens on ${shortDate(date)}.`, cell: cellKey(date, "morning") });
      }
    }
  }

  const start = parseKey(state.start);
  for (let day = 0; day < 14; day += 1) {
    const date = addDays(start, day);
    SHIFTS.forEach((shift) => {
      const key = cellKey(date, shift.id);
      if (!state.assignments[key] || !memberById(state.assignments[key])) {
        issues.push({ type: "open", text: `${shift.name} on ${shortDate(date)} is open.`, cell: key });
      }
    });
  }
  return issues;
}

function renderMeta() {
  const start = parseKey(state.start);
  const end = addDays(start, 13);
  const range = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} — ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  $("start-date").value = state.start;
  $("cycle-label").textContent = `${range} · 14 days`;
  $("board-title").textContent = range;
  $("avoid-night").checked = state.settings.avoidNight;
  $("balance-weekends").checked = state.settings.balanceWeekends;
  $("undo").disabled = history.length === 0;
}

function renderBoard() {
  const board = $("board");
  const start = parseKey(state.start);
  const todayKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  const flags = computeFlags();
  board.innerHTML = "";

  for (let week = 0; week < 2; week += 1) {
    const block = document.createElement("div");
    block.className = "week-block";
    const head = document.createElement("div");
    head.className = "week-row week-head";
    const corner = document.createElement("div");
    corner.className = "week-corner";
    corner.innerHTML = `<strong>0${week + 1}</strong>Week ${week + 1}`;
    head.append(corner);

    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day);
      const cell = document.createElement("div");
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      cell.className = `day-head${weekend ? " weekend" : ""}${dateKey(date) === todayKey ? " today" : ""}`;
      cell.title = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
      cell.innerHTML = `<span>${WEEKDAYS_SHORT[date.getDay()]}</span><strong>${date.getDate()}</strong>`;
      head.append(cell);
    }
    block.append(head);

    SHIFTS.forEach((shift) => {
      const row = document.createElement("div");
      row.className = "week-row";
      const label = document.createElement("div");
      label.className = "shift-label";
      label.style.setProperty("--c", shift.color);
      label.innerHTML = `<span><i></i>${shift.name}</span><small>${shift.time}</small>`;
      row.append(label);

      for (let day = 0; day < 7; day += 1) {
        const date = addDays(start, week * 7 + day);
        const key = cellKey(date, shift.id);
        const memberId = state.assignments[key];
        const member = memberById(memberId);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `shift-cell ${shift.id}`;
        cell.dataset.date = dateKey(date);
        cell.dataset.shift = shift.id;
        cell.classList.toggle("selected", state.selected && state.selected.key === key);
        cell.classList.toggle("conflict", flags.has(key));
        cell.setAttribute("aria-label", `${shift.name} on ${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}: ${member ? member.name : "open"}`);

        if (member) {
          const color = colorFor(member);
          const chip = document.createElement("span");
          chip.className = "member-chip";
          chip.style.setProperty("--c", color.bg);
          chip.style.setProperty("--fg", color.fg);
          const badge = document.createElement("i");
          badge.textContent = initials(member.name);
          const name = document.createElement("span");
          name.textContent = member.name.split(/\s+/)[0];
          chip.append(badge, name);
          cell.append(chip);
        } else {
          const empty = document.createElement("span");
          empty.className = "cell-empty";
          empty.textContent = "+";
          cell.append(empty);
        }

        cell.addEventListener("click", () => selectCell(key, shift.id));
        cell.addEventListener("dragover", (event) => {
          event.preventDefault();
          cell.classList.add("dragover");
        });
        cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
        cell.addEventListener("drop", (event) => {
          event.preventDefault();
          cell.classList.remove("dragover");
          const memberIdDrop = event.dataTransfer.getData("text/plain");
          if (memberById(memberIdDrop)) assignMember(key, memberIdDrop);
        });
        row.append(cell);
      }
      block.append(row);
    });
    board.append(block);
  }
}

function renderTeam() {
  const list = $("team-list");
  const counts = assignmentCounts();
  list.innerHTML = "";
  state.members.forEach((member) => {
    const color = colorFor(member);
    const row = document.createElement("div");
    row.className = "member-row";
    row.draggable = true;
    row.tabIndex = 0;
    row.dataset.member = member.id;
    row.title = `${member.name} · drag onto a shift`;
    row.style.setProperty("--c", color.bg);
    row.style.setProperty("--fg", color.fg);
    row.innerHTML = `<span class="avatar">${escapeHtml(initials(member.name))}</span><span class="member-info"><span class="member-name">${escapeHtml(member.name)}</span><span class="member-role">${escapeHtml(member.role)}</span></span><span class="member-load"><strong>${counts.get(member.id) || 0}/${member.max}</strong><span>shifts</span></span>`;
    row.addEventListener("click", () => openMemberDialog(member.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMemberDialog(member.id);
      }
    });
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", member.id);
      event.dataTransfer.effectAllowed = "copy";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    list.append(row);
  });
  $("team-count").textContent = `${state.members.length} ${state.members.length === 1 ? "person" : "people"}`;
}

function renderCoverage() {
  const total = 42;
  const filled = Object.entries(state.assignments).filter(([, id]) => memberById(id)).length;
  const open = total - filled;
  const percent = Math.round(filled / total * 100);
  const counts = assignmentCounts();
  const weekends = weekendCounts();
  const values = [...counts.values()];
  const weekendValues = [...weekends.values()];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const minWeekend = weekendValues.length ? Math.min(...weekendValues) : 0;
  const maxWeekend = weekendValues.length ? Math.max(...weekendValues) : 0;

  $("coverage-ring").style.setProperty("--p", String(percent));
  $("coverage-number").textContent = `${percent}%`;
  $("hero-coverage").textContent = `${percent}%`;
  $("filled-slots").textContent = `${filled} of ${total}`;
  $("open-shifts").textContent = `${open} still open`;
  $("total-hours").textContent = `${filled * 8}h`;
  $("fairness-range").textContent = `${min}–${max}`;
  $("weekend-count").textContent = `${minWeekend}–${maxWeekend}`;
  const badge = $("open-badge");
  badge.textContent = open ? `${open} open shift${open === 1 ? "" : "s"}` : "Fully covered";
  badge.classList.toggle("alert", open > 0);
}

function memberStatus(member, date, shiftId) {
  if (member.daysOff.includes(date.getDay())) return { label: "Off", className: "off" };
  const counts = assignmentCounts();
  if ((counts.get(member.id) || 0) >= member.max) return { label: "At limit", className: "limit" };
  const sameDay = SHIFTS.some((shift) => shift.id !== shiftId && state.assignments[cellKey(date, shift.id)] === member.id);
  if (sameDay) return { label: "Double", className: "limit" };
  if (shiftId === "morning" && state.settings.avoidNight) {
    const previousNight = state.assignments[cellKey(addDays(date, -1), "night")];
    if (previousNight === member.id) return { label: "Night before", className: "off" };
  }
  return null;
}

function renderAssignment() {
  const body = $("assignment-body");
  const stateLabel = $("assignment-state");
  if (!state.selected) {
    stateLabel.textContent = "None";
    body.innerHTML = `<p class="assign-empty">Select a shift cell to see who is available. Or drag a teammate straight onto the board.</p>`;
    return;
  }
  const { key, shiftId } = state.selected;
  const { date } = splitCellKey(key);
  const shift = SHIFTS.find((item) => item.id === shiftId);
  if (!shift) {
    state.selected = null;
    renderAssignment();
    return;
  }
  const dateValue = parseKey(date);
  const assignedId = state.assignments[key];
  const assigned = memberById(assignedId);
  stateLabel.textContent = assigned ? assigned.name : "Open";
  body.innerHTML = `<p class="assign-date">${WEEKDAYS[dateValue.getDay()]} ${dateValue.getDate()} ${MONTHS_SHORT[dateValue.getMonth()]}</p><h3 class="assign-shift">${shift.name}</h3><span class="assign-time">${shift.time}</span>`;
  const options = document.createElement("div");
  options.className = "assign-options";

  if (!state.members.length) {
    const empty = document.createElement("p");
    empty.className = "assign-empty";
    empty.textContent = "Add a team member to start assigning shifts.";
    options.append(empty);
  }

  state.members.forEach((member) => {
    const color = colorFor(member);
    const status = memberStatus(member, dateValue, shift.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `assign-option${assignedId === member.id ? " current" : ""}`;
    button.style.setProperty("--c", color.bg);
    button.style.setProperty("--fg", color.fg);
    const tag = assignedId === member.id ? `<span class="assign-tag">Assigned</span>` : status ? `<span class="assign-tag ${status.className}">${status.label}</span>` : `<span class="assign-tag">Free</span>`;
    button.innerHTML = `<span class="avatar">${escapeHtml(initials(member.name))}</span><span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)} · ${assignmentCounts().get(member.id) || 0} shifts</small></span>${tag}`;
    button.addEventListener("click", () => assignMember(key, member.id));
    options.append(button);
  });
  body.append(options);

  if (assigned) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "assign-clear";
    clear.textContent = "Clear this shift";
    clear.addEventListener("click", () => assignMember(key, null));
    body.append(clear);
  }
}

function renderBalance() {
  const list = $("balance-list");
  const counts = assignmentCounts();
  const weekends = weekendCounts();
  list.innerHTML = "";
  state.members.forEach((member) => {
    const color = colorFor(member);
    const count = counts.get(member.id) || 0;
    const row = document.createElement("div");
    row.className = "balance-row";
    row.title = `${count} shifts · ${weekends.get(member.id) || 0} weekend`;
    row.style.setProperty("--c", color.bg);
    row.innerHTML = `<span class="balance-dot"></span><span class="balance-name">${escapeHtml(member.name)}</span><span class="balance-bar"><i style="width:${clamp(count / Math.max(member.max, 1) * 100, 0, 100)}%"></i></span><span class="balance-count">${count}</span>`;
    list.append(row);
  });
  if (!state.members.length) list.innerHTML = `<p class="assign-empty">No team yet.</p>`;
}

function renderIssues() {
  const issues = getIssues();
  const list = $("issues-list");
  $("issue-count").textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Clear";
  list.innerHTML = "";
  if (!issues.length) {
    list.innerHTML = `<div class="issues-clear"><strong>Everything holds.</strong>No open shifts, double bookings, or rule breaks on this board.</div>`;
    return;
  }
  issues.slice(0, 5).forEach((issue) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "issue-row";
    row.innerHTML = `<span class="issue-dot${issue.type === "open" ? " soft" : ""}"></span><span class="issue-text"></span><span class="issue-arrow">→</span>`;
    row.querySelector(".issue-text").textContent = issue.text;
    row.addEventListener("click", () => {
      if (!issue.cell) return;
      const parts = splitCellKey(issue.cell);
      selectCell(issue.cell, parts.shift);
    });
    list.append(row);
  });
  if (issues.length > 5) {
    const more = document.createElement("p");
    more.className = "issues-clear";
    more.textContent = `+ ${issues.length - 5} more issue${issues.length - 5 === 1 ? "" : "s"}`;
    list.append(more);
  }
}

function renderAll() {
  renderMeta();
  renderBoard();
  renderTeam();
  renderCoverage();
  renderAssignment();
  renderBalance();
  renderIssues();
}

function selectCell(key, shiftId) {
  state.selected = { key, shiftId };
  renderBoard();
  renderAssignment();
}

function pushHistory() {
  const snapshot = { ...state.assignments };
  const previous = history[history.length - 1];
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
  history.push(snapshot);
  if (history.length > 40) history.shift();
  $("undo").disabled = false;
}

function assignMember(key, memberId) {
  const current = state.assignments[key] || null;
  if (current === memberId) return;
  pushHistory();
  if (memberId) state.assignments[key] = memberId;
  else delete state.assignments[key];
  const parts = splitCellKey(key);
  state.selected = { key, shiftId: parts.shift };
  saveState();
  renderAll();
  const member = memberById(memberId);
  showToast(member ? `${member.name} assigned` : "Shift cleared");
}

function undo() {
  if (!history.length) return;
  state.assignments = history.pop();
  saveState();
  renderAll();
  showToast("Last change undone");
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      start: state.start,
      members: state.members,
      assignments: state.assignments,
      settings: state.settings
    }));
  } catch (error) {
    return;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.members) || !data.members.length) return false;
    if (typeof data.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.start)) state.start = data.start;
    state.members = data.members.map((member, index) => ({
      id: String(member.id || `m${index + 1}`),
      name: String(member.name || "Unnamed"),
      role: String(member.role || "Floor"),
      max: clamp(Number(member.max) || 8, 1, 14),
      daysOff: Array.isArray(member.daysOff) ? member.daysOff.map(Number).filter((day) => day >= 0 && day <= 6) : [],
      color: clamp(Number(member.color) || 0, 0, PALETTE.length - 1)
    }));
    state.assignments = data.assignments && typeof data.assignments === "object" ? data.assignments : {};
    state.settings = {
      avoidNight: data.settings ? data.settings.avoidNight !== false : true,
      balanceWeekends: data.settings ? data.settings.balanceWeekends !== false : true
    };
    state.members.forEach((member) => {
      const number = Number(String(member.id).replace(/\D/g, ""));
      if (number >= nextMemberId) nextMemberId = number + 1;
    });
    return true;
  } catch (error) {
    return false;
  }
}

function openMemberDialog(id) {
  editingMember = id || null;
  const member = id ? memberById(id) : null;
  $("member-id").value = member ? member.id : "";
  $("member-name").value = member ? member.name : "";
  $("member-role").value = member ? member.role : "Bar";
  $("member-max").value = String(member ? member.max : 8);
  $("dialog-title").textContent = member ? "Edit teammate" : "Add someone";
  $("delete-member").hidden = !member;
  renderDaysOff(member ? member.daysOff : [0]);
  renderColorPicker(member ? member.color : state.members.length % PALETTE.length);
  $("member-dialog").showModal();
  setTimeout(() => $("member-name").focus(), 30);
}

function renderDaysOff(selected) {
  const wrap = $("days-off");
  wrap.innerHTML = "";
  DAY_OPTIONS.forEach((option) => {
    const label = document.createElement("label");
    label.className = "day-off";
    label.innerHTML = `<input type="checkbox" value="${option.value}"${selected.includes(option.value) ? " checked" : ""}><span>${option.label}</span>`;
    wrap.append(label);
  });
}

function renderColorPicker(selected) {
  const wrap = $("color-picker");
  wrap.innerHTML = "";
  PALETTE.forEach((color, index) => {
    const label = document.createElement("label");
    label.className = "color-choice";
    label.style.setProperty("--c", color.bg);
    label.innerHTML = `<input type="radio" name="member-color" value="${index}"${index === selected ? " checked" : ""}><span></span>`;
    wrap.append(label);
  });
}

function saveMember(event) {
  event.preventDefault();
  const name = $("member-name").value.trim();
  if (!name) {
    $("member-name").focus();
    return;
  }
  const role = $("member-role").value;
  const max = clamp(Number($("member-max").value) || 8, 1, 14);
  const daysOff = [...document.querySelectorAll("#days-off input:checked")].map((input) => Number(input.value));
  const colorInput = document.querySelector('input[name="member-color"]:checked');
  const color = colorInput ? Number(colorInput.value) : 0;
  const id = $("member-id").value;

  if (id) {
    const member = memberById(id);
    if (member) {
      member.name = name;
      member.role = role;
      member.max = max;
      member.daysOff = daysOff;
      member.color = color;
    }
  } else {
    state.members.push({ id: `m${nextMemberId++}`, name, role, max, daysOff, color });
  }
  history = [];
  saveState();
  $("member-dialog").close();
  renderAll();
  showToast(id ? "Teammate updated" : "Teammate added");
}

function deleteMember() {
  if (!editingMember) return;
  const member = memberById(editingMember);
  if (!member) return;
  if (!window.confirm(`Remove ${member.name} and clear their shifts?`)) return;
  state.members = state.members.filter((item) => item.id !== member.id);
  Object.keys(state.assignments).forEach((key) => {
    if (state.assignments[key] === member.id) delete state.assignments[key];
  });
  history = [];
  saveState();
  $("member-dialog").close();
  renderAll();
  showToast("Teammate removed");
}

function exportCsv() {
  const rows = [["Date", "Day", "Shift", "Hours", "Member", "Role"]];
  const start = parseKey(state.start);
  for (let day = 0; day < 14; day += 1) {
    const date = addDays(start, day);
    SHIFTS.forEach((shift) => {
      const member = memberById(state.assignments[cellKey(date, shift.id)]);
      rows.push([
        dateKey(date),
        WEEKDAYS[date.getDay()],
        shift.name,
        shift.time,
        member ? member.name : "UNASSIGNED",
        member ? member.role : ""
      ]);
    });
  }
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rota-${state.start}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("CSV downloaded");
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function bindEvents() {
  $("autofill").addEventListener("click", () => {
    pushHistory();
    buildSchedule();
    saveState();
    renderAll();
    showToast("Fortnight auto-filled");
  });
  $("clear-schedule").addEventListener("click", () => {
    pushHistory();
    state.assignments = {};
    state.selected = null;
    saveState();
    renderAll();
    showToast("Board cleared");
  });
  $("undo").addEventListener("click", undo);
  $("start-date").addEventListener("change", (event) => {
    if (!event.target.value) {
      event.target.value = state.start;
      return;
    }
    const normalized = dateKey(mondayOf(parseKey(event.target.value)));
    if (normalized === state.start) {
      event.target.value = normalized;
      return;
    }
    state.start = normalized;
    state.assignments = {};
    state.selected = null;
    history = [];
    buildSchedule();
    saveState();
    renderAll();
    showToast("Cycle moved and rebuilt");
  });
  $("avoid-night").addEventListener("change", (event) => {
    state.settings.avoidNight = event.target.checked;
    saveState();
    renderAll();
  });
  $("balance-weekends").addEventListener("change", (event) => {
    state.settings.balanceWeekends = event.target.checked;
    saveState();
    renderAll();
  });
  $("add-member").addEventListener("click", () => openMemberDialog(null));
  $("close-dialog").addEventListener("click", () => $("member-dialog").close());
  $("cancel-member").addEventListener("click", () => $("member-dialog").close());
  $("member-form").addEventListener("submit", saveMember);
  $("delete-member").addEventListener("click", deleteMember);
  $("export-csv").addEventListener("click", exportCsv);
  $("member-dialog").addEventListener("click", (event) => {
    if (event.target === $("member-dialog")) $("member-dialog").close();
  });
}

const loaded = loadState();
if (!loaded) {
  state.members = defaultMembers();
  state.assignments = {};
  buildSchedule();
  saveState();
}
bindEvents();
renderAll();
