const defaultTasks = [
  {
    id: 1,
    key: "APP-1",
    title: "Finalize project requirements",
    description: "Review the agreed scope, user needs, and final deliverables.",
    type: "Story",
    priority: "High",
    status: "todo",
    assignee: "VT"
  },
  {
    id: 2,
    key: "APP-2",
    title: "Design dashboard wireframe",
    description: "Create the initial interface layout and navigation flow.",
    type: "Task",
    priority: "Medium",
    status: "progress",
    assignee: "EM"
  },
  {
    id: 3,
    key: "APP-3",
    title: "Create database structure",
    description: "Define tables, fields, relationships, and required records.",
    type: "Task",
    priority: "High",
    status: "progress",
    assignee: "EJ"
  },
  {
    id: 4,
    key: "APP-4",
    title: "Review login and authentication flow",
    description: "Check validation, error states, and role-based access.",
    type: "Bug",
    priority: "High",
    status: "review",
    assignee: "RN"
  },
  {
    id: 5,
    key: "APP-5",
    title: "Prepare presentation outline",
    description: "Organize the final demo flow and talking points.",
    type: "Task",
    priority: "Low",
    status: "todo",
    assignee: "RN"
  },
  {
    id: 6,
    key: "APP-6",
    title: "Set up project repository",
    description: "Create the repository and initial folder structure.",
    type: "Task",
    priority: "Medium",
    status: "done",
    assignee: "VT"
  },
  {
    id: 7,
    key: "APP-7",
    title: "Create shared documentation",
    description: "Prepare the project notes, responsibilities, and references.",
    type: "Story",
    priority: "Low",
    status: "done",
    assignee: "EM"
  }
];

const defaultMembers = [
  { initials: "VT", name: "Victor", role: "Project Manager" },
  { initials: "EM", name: "Ethan M", role: "Developer" },
  { initials: "EJ", name: "Ethan J", role: "Designer" },
  { initials: "RN", name: "Rain", role: "QA / Reviewer" },
  { initials: "JO", name: "Joaquin", role: "Developer" }
];

const CONFIG_URL = typeof SUPABASE_URL === "string" ? SUPABASE_URL : "";
const CONFIG_ANON_KEY = typeof SUPABASE_ANON_KEY === "string" ? SUPABASE_ANON_KEY : "";

const hasCredentials = Boolean(CONFIG_URL && CONFIG_ANON_KEY);
const hasClient = typeof window !== "undefined" && window.supabase && window.supabase.createClient;

let supabaseClient = null;
if (hasCredentials && hasClient) {
  try {
    supabaseClient = window.supabase.createClient(CONFIG_URL, CONFIG_ANON_KEY);
  } catch (error) {
    console.warn("Supabase client could not be created:", error);
    supabaseClient = null;
  }
}

const state = {
  tasks: [],
  search: "",
  priority: "all",
  liveMode: Boolean(supabaseClient),
  subscribed: false,
  members: [],
  membersSubscribed: false
};

const lists = {
  todo: document.getElementById("todoList"),
  progress: document.getElementById("progressList"),
  review: document.getElementById("reviewList"),
  done: document.getElementById("doneList")
};

const modal = document.getElementById("taskModal");
const form = document.getElementById("taskForm");
const searchInput = document.getElementById("searchInput");
const priorityFilter = document.getElementById("priorityFilter");
const themeButton = document.getElementById("themeButton");
const sidebar = document.getElementById("sidebar");
const setupBanner = document.getElementById("setupBanner");
const toastEl = document.getElementById("toast");

function toast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function showSetupBanner() {
  if (setupBanner) setupBanner.classList.remove("hidden");
}

function hideSetupBanner() {
  if (setupBanner) setupBanner.classList.add("hidden");
}

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem("appdaetTasks");
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn("Could not read local tasks:", error);
  }
  return defaultTasks;
}

function saveLocalTasks() {
  localStorage.setItem("appdaetTasks", JSON.stringify(state.tasks));
}

function loadLocalMembers() {
  try {
    const raw = localStorage.getItem("appdaetTeamMembers");
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn("Could not read local team members:", error);
  }
  return null;
}

function saveLocalMembers() {
  try {
    localStorage.setItem("appdaetTeamMembers", JSON.stringify(state.members));
  } catch (error) {
    console.warn("Could not save local team members:", error);
  }
}

function membersFromRows(rows) {
  return (rows || []).map(row => ({
    id: row.id,
    initials: row.initials,
    name: row.name,
    role: row.role
  }));
}

function ensureKnownMembers(members) {
  const combined = (members || []).slice();
  const known = new Set(combined.map(m => m.initials));
  defaultMembers.forEach(dm => {
    if (!known.has(dm.initials)) combined.push({ ...dm });
  });
  return combined;
}

function toViewModel(row) {
  const id = row.id;
  return {
    id,
    key: `APP-${String(id).replace(/-/g, "").slice(0, 4).toUpperCase()}`,
    title: row.title,
    description: row.description || "",
    type: row.type || "Task",
    priority: row.priority || "Medium",
    status: row.status || "todo",
    assignee: row.assignee || "VT",
    updatedAt: row.updated_at || row.created_at || null
  };
}

async function loadTasks() {
  if (!supabaseClient) {
    state.liveMode = false;
    state.tasks = loadLocalTasks();
    showSetupBanner();
    render();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("tasks")
      .select("*")
      .order("created_at");

    if (error) throw error;

    state.liveMode = true;
    state.tasks = (data || []).map(toViewModel);
    hideSetupBanner();
    render();
    subscribe();
  } catch (error) {
    console.warn("Supabase unavailable, running in demo mode:", error);
    state.liveMode = false;
    state.tasks = loadLocalTasks();
    showSetupBanner();
    render();
  }
}

function subscribe() {
  if (!supabaseClient || state.subscribed) return;
  state.subscribed = true;
  supabaseClient
    .channel("tasks-board")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      () => loadTasks()
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Realtime channel issue:", status);
      }
    });
}

function saveTasks() {
  saveLocalTasks();
}

async function loadMembers() {
  if (!supabaseClient) {
    state.members = ensureKnownMembers(loadLocalMembers() || []);
    renderTeamSidebar();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("team_members")
      .select("*")
      .order("created_at");

    if (error) throw error;

    if (!data || data.length === 0) {
      const { error: seedError } = await supabaseClient
        .from("team_members")
        .upsert(defaultMembers, { onConflict: "initials" });
      if (seedError) throw seedError;
    } else {
      const present = new Set(data.map(m => m.initials));
      const missing = defaultMembers.filter(m => !present.has(m.initials));
      if (missing.length > 0) {
        const { error: addError } = await supabaseClient
          .from("team_members")
          .upsert(missing, { onConflict: "initials", ignoreDuplicates: true });
        if (addError) throw addError;
      }
    }

    const { data: fresh, error: freshError } = await supabaseClient
      .from("team_members")
      .select("*")
      .order("created_at");
    if (freshError) throw freshError;

    state.members = ensureKnownMembers(membersFromRows(fresh));
    saveLocalMembers();
    renderTeamSidebar();
    subscribeMembers();
    render();
  } catch (error) {
    console.warn("Team roles unavailable:", error);
    state.members = ensureKnownMembers(loadLocalMembers() || []);
    renderTeamSidebar();
    render();
    if (error && /team_members|schema cache/i.test(error.message || "")) {
      toast("Roles aren't set up in Supabase yet — create the team_members table in the SQL Editor, then reload.");
    }
  }
}

function subscribeMembers() {
  if (!supabaseClient || state.membersSubscribed) return;
  state.membersSubscribed = true;
  supabaseClient
    .channel("team-members")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_members" },
      () => loadMembers()
    )
    .subscribe();
}

function avatarColor(initials) {
  const map = { VT: "avatar-a", EM: "avatar-b", EJ: "avatar-c", RN: "avatar-d", JO: "avatar-e" };
  return map[initials] || "avatar-d";
}

function renderTeamSidebar() {
  const box = document.getElementById("teamAvatars");
  if (!box) return;
  box.innerHTML = "";
  state.members.forEach(member => {
    const el = document.createElement("div");
    el.className = `avatar ${avatarColor(member.initials)}`;
    el.textContent = member.initials;
    el.title = `${member.name} — ${member.role || "No role set"}`;
    box.appendChild(el);
  });
}

function renderTeamModal() {
  const list = document.getElementById("teamList");
  list.innerHTML = "";
  state.members.forEach(member => {
    const row = document.createElement("div");
    row.className = "team-row";
    row.innerHTML = `
      <span class="avatar ${avatarColor(member.initials)}">${escapeHtml(member.initials)}</span>
      <div class="team-info">
        <strong>${escapeHtml(member.name)}</strong>
        <span>${escapeHtml(member.initials)}</span>
      </div>
      <input class="team-role-input" data-initials="${escapeHtml(member.initials)}" value="${escapeHtml(member.role)}" maxlength="60" placeholder="Role (e.g. Developer)" />
    `;
    list.appendChild(row);
  });
}

function openTeam() {
  renderTeamModal();
  teamModal.classList.remove("hidden");
  sidebar.classList.remove("open");
}

function closeTeam() {
  teamModal.classList.add("hidden");
}

async function saveTeamRoles() {
  const membersToSave = [];

  document.querySelectorAll(".team-role-input").forEach(input => {
    const member = state.members.find(m => m.initials === input.dataset.initials);
    if (!member) return;

    const role = input.value.trim();
    if (role === (member.role || "")) return;

    member.role = role;
    membersToSave.push(member);
  });

  if (membersToSave.length === 0) {
    toast("No changes to save.");
    return;
  }

  saveLocalMembers();
  renderTeamSidebar();
  render();

  if (!supabaseClient) {
    toast("Demo mode — no database connected, roles saved only in this browser.");
    closeTeam();
    return;
  }

  const writes = membersToSave.map(member => {
    if (member.id) {
      return supabaseClient
        .from("team_members")
        .update({ role: member.role })
        .eq("id", member.id);
    }
    return supabaseClient
      .from("team_members")
      .upsert({ initials: member.initials, name: member.name, role: member.role }, { onConflict: "initials" });
  });

  try {
    const results = await Promise.all(writes);
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    toast("Roles saved — everyone sees the same roster.");
  } catch (error) {
    console.warn("Could not save roles:", error);
    const tableMissing = /team_members|schema cache/i.test(error.message || "");
    toast(
      tableMissing
        ? "Saved only in this browser — create the team_members table: run supabase-schema.sql in the Supabase SQL Editor."
        : `Could not save roles to the database: ${error.message}`
    );
  }

  closeTeam();
}

function priorityIcon(priority) {
  if (priority === "High") return "↑";
  if (priority === "Low") return "↓";
  return "↔";
}

function typeIcon(type) {
  if (type === "Bug") return "◆";
  if (type === "Story") return "◇";
  return "■";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSgTime(value) {
  const date = new Date(value);
  if (!value || isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function timeAgo(value) {
  const date = new Date(value);
  if (!value || isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatSgTime(value);
}

function render() {
  Object.values(lists).forEach(list => {
    list.innerHTML = "";
  });

  const filtered = state.tasks.filter(task => {
    const query = state.search.toLowerCase().trim();

    const matchesSearch =
      (task.title || "").toLowerCase().includes(query) ||
      (task.description || "").toLowerCase().includes(query) ||
      (task.key || "").toLowerCase().includes(query);

    const matchesPriority =
      state.priority === "all" ||
      task.priority === state.priority;

    return matchesSearch && matchesPriority;
  });

  filtered.forEach(task => {
    const card = document.createElement("article");
    const member = state.members.find(m => m.initials === task.assignee);
    const assigneeName = member && member.name ? member.name : task.assignee;
    const assigneeRole = member && member.role ? member.role : "";

    card.className = "issue-card";
    card.draggable = true;
    card.dataset.id = task.id;

    card.innerHTML = `
      <div class="issue-topline">
        <span class="issue-type">
          ${typeIcon(task.type)} ${escapeHtml(task.type)}
        </span>

        <span class="issue-key">
          ${escapeHtml(task.key)}
        </span>

        <span class="card-actions">
          <button class="card-edit" title="Edit issue" aria-label="Edit issue">✎</button>
          <button class="card-delete" title="Delete issue" aria-label="Delete issue">✕</button>
        </span>
      </div>

      <h4 class="issue-title">
        ${escapeHtml(task.title)}
      </h4>

      <p class="issue-description">
        ${escapeHtml(task.description || "No description added.")}
      </p>

      <div class="issue-footer">
        <span class="priority ${escapeHtml(task.priority)}">
          ${priorityIcon(task.priority)}
          ${escapeHtml(task.priority)}
        </span>

        <span class="assignee-chip" title="${escapeHtml(assigneeName)} · ${escapeHtml(assigneeRole || "No role")}">
          <span class="assignee">${escapeHtml(task.assignee)}</span>
          ${assigneeRole ? `<span class="assignee-role">${escapeHtml(assigneeRole)}</span>` : ""}
        </span>
      </div>

      ${task.updatedAt ? `
        <div class="issue-edited" title="${escapeHtml(formatSgTime(task.updatedAt))}">
          Edited ${escapeHtml(timeAgo(task.updatedAt))}
        </div>
      ` : ""}

      <select class="card-status-move" aria-label="Move to status">
        <option value="todo"${task.status === "todo" ? " selected" : ""}>To Do</option>
        <option value="progress"${task.status === "progress" ? " selected" : ""}>In Progress</option>
        <option value="review"${task.status === "review" ? " selected" : ""}>In Review</option>
        <option value="done"${task.status === "done" ? " selected" : ""}>Done</option>
      </select>
    `;

    card.addEventListener("dragstart", () => {
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    card.querySelector(".card-delete").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteTask(task);
    });

    card.querySelector(".card-edit").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditModal(task);
    });

    card.querySelector(".card-status-move").addEventListener("change", (event) => {
      moveTask(task, event.target.value);
    });

    const list = lists[task.status];
    if (list) list.appendChild(card);
  });

  updateCounts();
}

function updateCounts() {
  const counts = {
    todo: state.tasks.filter(task => task.status === "todo").length,
    progress: state.tasks.filter(task => task.status === "progress").length,
    review: state.tasks.filter(task => task.status === "review").length,
    done: state.tasks.filter(task => task.status === "done").length
  };

  document.querySelectorAll("[data-count]").forEach(element => {
    element.textContent = counts[element.dataset.count] || 0;
  });

  document.getElementById("totalCount").textContent = state.tasks.length;
  document.getElementById("todoCount").textContent = counts.todo;
  document.getElementById("progressCount").textContent = counts.progress;
  document.getElementById("doneCount").textContent = counts.done;
}

function moveTask(task, newStatus) {
  if (!task || task.status === newStatus) return;

  const previousStatus = task.status;
  task.status = newStatus;
  task.updatedAt = new Date().toISOString();
  render();

  if (state.liveMode && supabaseClient) {
    supabaseClient
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", task.id)
      .then(({ error }) => {
        if (error) {
          console.warn("Could not update status:", error);
          task.status = previousStatus;
          render();
          toast("Could not update status. Check your connection.");
        }
      });
  } else {
    saveTasks();
  }
}

document.querySelectorAll(".column").forEach(column => {
  column.addEventListener("dragover", event => {
    event.preventDefault();
    column.classList.add("drop-active");
  });

  column.addEventListener("dragleave", () => {
    column.classList.remove("drop-active");
  });

  column.addEventListener("drop", event => {
    event.preventDefault();
    column.classList.remove("drop-active");

    const draggingCard = document.querySelector(".issue-card.dragging");
    if (!draggingCard) return;

    const taskId = draggingCard.dataset.id;
    const task = state.tasks.find(task => String(task.id) === String(taskId));
    if (!task) return;

    moveTask(task, column.dataset.status);
  });
});

let editingTaskId = null;
const modalEyebrow = document.getElementById("modalEyebrow");
const modalTitle = document.getElementById("modalTitle");
const modalSubmit = document.getElementById("modalSubmit");
const modalEditedAt = document.getElementById("modalEditedAt");

function openModal(status = "todo") {
  editingTaskId = null;
  modalEyebrow.textContent = "New Issue";
  modalTitle.textContent = "Create task";
  modalSubmit.textContent = "Create issue";
  modalEditedAt.classList.add("hidden");
  modal.classList.remove("hidden");
  document.getElementById("taskStatus").value = status;
  document.getElementById("taskTitle").focus();
}

function openEditModal(task) {
  editingTaskId = task.id;
  modalEyebrow.textContent = "Edit Issue";
  modalTitle.textContent = "Edit task";
  modalSubmit.textContent = "Save changes";
  modal.classList.remove("hidden");

  document.getElementById("taskTitle").value = task.title || "";
  document.getElementById("taskDescription").value = task.description || "";
  document.getElementById("taskType").value = task.type || "Task";
  document.getElementById("taskPriority").value = task.priority || "Medium";
  document.getElementById("taskStatus").value = task.status || "todo";
  document.getElementById("taskAssignee").value = task.assignee || "VT";

  if (task.updatedAt) {
    modalEditedAt.textContent = `Last modified: ${formatSgTime(task.updatedAt)}`;
    modalEditedAt.classList.remove("hidden");
  }

  document.getElementById("taskTitle").focus();
}

function closeModal() {
  modal.classList.add("hidden");
  form.reset();
}

document.getElementById("createTaskButton").addEventListener("click", () => {
  openModal();
});

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelModal").addEventListener("click", closeModal);

document.querySelectorAll("[data-add]").forEach(button => {
  button.addEventListener("click", () => {
    openModal(button.dataset.add);
  });
});

modal.addEventListener("click", event => {
  if (event.target === modal) {
    closeModal();
  }
});

form.addEventListener("submit", event => {
  event.preventDefault();

  const title = document.getElementById("taskTitle").value.trim();
  if (!title) return;

  const newTask = {
    title,
    description: document.getElementById("taskDescription").value.trim(),
    type: document.getElementById("taskType").value,
    priority: document.getElementById("taskPriority").value,
    status: document.getElementById("taskStatus").value,
    assignee: document.getElementById("taskAssignee").value
  };

  if (editingTaskId) {
    const task = state.tasks.find(t => String(t.id) === String(editingTaskId));
    if (task) {
      Object.assign(task, newTask);
      task.updatedAt = new Date().toISOString();

      if (state.liveMode && supabaseClient) {
        supabaseClient
          .from("tasks")
          .update(newTask)
          .eq("id", task.id)
          .then(({ error }) => {
            if (error) {
              console.warn("Could not update task:", error);
              toast("Could not save changes. Check your connection.");
            } else {
              toast("Issue updated.");
            }
          });
      } else {
        saveTasks();
        toast("Issue updated.");
      }

      render();
    }
    closeModal();
    return;
  }

  if (state.liveMode && supabaseClient) {
    supabaseClient
      .from("tasks")
      .insert(newTask)
      .then(({ error }) => {
        if (error) {
          console.warn("Could not create task:", error);
          toast("Could not save task. Check your connection.");
        } else {
          toast("Issue created.");
        }
      });
    closeModal();
  } else {
    const nextId = state.tasks.length
      ? Math.max(...state.tasks.map(task => task.id)) + 1
      : 1;
    state.tasks.push({
      id: nextId,
      key: `APP-${nextId}`,
      updatedAt: new Date().toISOString(),
      ...newTask
    });
    saveTasks();
    closeModal();
    render();
  }
});

function deleteTask(task) {
  const confirmed = confirm(`Delete ${task.key} — "${task.title}"?`);
  if (!confirmed) return;

  if (state.liveMode && supabaseClient) {
    supabaseClient
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .then(({ error }) => {
        if (error) {
          console.warn("Could not delete task:", error);
          toast("Could not delete issue.");
        } else {
          state.tasks = state.tasks.filter(t => String(t.id) !== String(task.id));
          render();
          toast("Issue deleted.");
        }
      });
  } else {
    state.tasks = state.tasks.filter(t => String(t.id) !== String(task.id));
    saveTasks();
    render();
  }
}

searchInput.addEventListener("input", event => {
  state.search = event.target.value;
  render();
});

priorityFilter.addEventListener("change", event => {
  state.priority = event.target.value;
  render();
});

document.getElementById("clearFilters").addEventListener("click", () => {
  state.search = "";
  state.priority = "all";
  searchInput.value = "";
  priorityFilter.value = "all";
  render();
});

themeButton.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const darkMode = document.body.classList.contains("dark");
  localStorage.setItem("appdaetTheme", darkMode ? "dark" : "light");
  themeButton.textContent = darkMode ? "☀" : "☾";
});

document.getElementById("menuButton").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

if (localStorage.getItem("appdaetTheme") === "dark") {
  document.body.classList.add("dark");
  themeButton.textContent = "☀";
}

if (!supabaseClient) {
  showSetupBanner();
}

const docsModal = document.getElementById("docsModal");
const docsFrame = document.getElementById("docsFrame");
const docsPlaceholder = document.getElementById("docsPlaceholder");
const docsTabs = document.getElementById("docsTabs");

const teamModal = document.getElementById("teamModal");

const CONFIG_DOCS_URL = typeof GOOGLE_DOCS_URL === "string" ? GOOGLE_DOCS_URL : "";

function docsEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/\/document\/d\/([^/]+)/);
  if (match) return `https://docs.google.com/document/d/${match[1]}/preview`;
  return url;
}

const repoDocs = [
  { label: "APPDAET Plan", file: "APPDAET PLAN.pdf" },
  { label: "Coding Challenge 4", file: "Coding Challenge 4.pdf" }
];

function repoFileUrl(name) {
  const base = window.location.pathname.replace(/[^/]*$/, "");
  return base + encodeURI(name);
}

const customDocUrl = docsEmbedUrl(CONFIG_DOCS_URL);
if (customDocUrl && !CONFIG_DOCS_URL.includes("YOUR_DOC_ID")) {
  repoDocs.push({ label: "Google Doc", file: customDocUrl });
}

let currentDocUrl = "";

function loadDoc(file, index) {
  currentDocUrl = file.startsWith("http") ? file : repoFileUrl(file);
  docsFrame.classList.remove("hidden");
  docsPlaceholder.classList.add("hidden");
  docsFrame.src = currentDocUrl;
  document.querySelectorAll(".docs-tab").forEach((tab, i) => {
    tab.classList.toggle("active", i === index);
  });
}

const docsZoomOut = document.getElementById("docsZoomOut");
const docsZoomIn = document.getElementById("docsZoomIn");
const docsZoomReset = document.getElementById("docsZoomReset");
const docsZoomLabel = document.getElementById("docsZoomLabel");
const docsOpen = document.getElementById("docsOpen");

const DOCS_ZOOM_MIN = 0.5;
const DOCS_ZOOM_MAX = 3;
const DOCS_ZOOM_STEP = 0.25;
let docsZoom = 1;

function updateDocsZoomControls() {
  docsZoomLabel.textContent = `${Math.round(docsZoom * 100)}%`;
  docsZoomOut.disabled = docsZoom <= DOCS_ZOOM_MIN;
  docsZoomIn.disabled = docsZoom >= DOCS_ZOOM_MAX;
  docsZoomReset.disabled = docsZoom === 1;
  docsOpen.disabled = !currentDocUrl;
}

function setDocsZoom(value) {
  docsZoom = Math.min(DOCS_ZOOM_MAX, Math.max(DOCS_ZOOM_MIN, value));
  docsFrame.style.zoom = docsZoom;
  updateDocsZoomControls();
}

docsZoomOut.addEventListener("click", () => setDocsZoom(docsZoom - DOCS_ZOOM_STEP));
docsZoomIn.addEventListener("click", () => setDocsZoom(docsZoom + DOCS_ZOOM_STEP));
docsZoomReset.addEventListener("click", () => setDocsZoom(1));

docsOpen.addEventListener("click", () => {
  if (currentDocUrl) window.open(currentDocUrl, "_blank", "noopener");
});

function renderDocsTabs() {
  docsTabs.innerHTML = "";
  repoDocs.forEach((doc, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "docs-tab" + (index === 0 ? " active" : "");
    tab.textContent = doc.label;
    tab.addEventListener("click", () => {
      loadDoc(doc.file, index);
    });
    docsTabs.appendChild(tab);
  });
}

function openDocs() {
  docsModal.classList.remove("hidden");
  renderDocsTabs();
  loadDoc(repoDocs[0].file, 0);
  updateDocsZoomControls();
  sidebar.classList.remove("open");
}

function closeDocs() {
  docsModal.classList.add("hidden");
  docsFrame.src = "about:blank";
}

document.getElementById("docsNavItem").addEventListener("click", openDocs);
document.getElementById("driveNavItem").addEventListener("click", () => {
  sidebar.classList.remove("open");
});
document.getElementById("teamNavItem").addEventListener("click", openTeam);
document.getElementById("teamRolesButton").addEventListener("click", openTeam);
document.getElementById("closeTeam").addEventListener("click", closeTeam);
document.getElementById("cancelTeam").addEventListener("click", closeTeam);
document.getElementById("saveTeamRoles").addEventListener("click", saveTeamRoles);
teamModal.addEventListener("click", event => {
  if (event.target === teamModal) closeTeam();
});
document.getElementById("boardNavItem").addEventListener("click", () => {
  closeDocs();
  closeTeam();
  closeLegal();
  sidebar.classList.remove("open");
});
document.getElementById("closeDocs").addEventListener("click", closeDocs);
docsModal.addEventListener("click", event => {
  if (event.target === docsModal) closeDocs();
});

const legalModal = document.getElementById("legalModal");
const legalEyebrow = document.getElementById("legalEyebrow");
const legalTitle = document.getElementById("legalTitle");
const legalBody = document.getElementById("legalBody");

const privacyContent = `
  <h4>Overview</h4>
  <p>This website is the shared kanban board for the <strong>APPDAET-BTIS2-GROUP2</strong> academic project. This Privacy Policy explains what information the site handles, where it is stored, and the rights you have under Philippine law.</p>

  <h4>Data Privacy Act of 2012 (Republic Act No. 10173)</h4>
  <p>The project respects your privacy and observes the principles of the <strong><a href="https://privacy.gov.ph/data-privacy-act/" target="_blank" rel="noopener">Data Privacy Act of 2012 (R.A. 10173)</a></strong> — transparency, legitimate purpose, and proportionality in the collection and processing of personal data. By using this website, you consent to the handling of data described below.</p>

  <h4>What data this website collects</h4>
  <ul>
    <li><strong>Issues you create</strong> — title, description, type, priority, status, and assignee.</li>
    <li><strong>Team information</strong> — member names, initials, and role labels.</li>
    <li><strong>Browser settings</strong> — your chosen theme (light/dark) and a marker that you have seen the tutorial. These are stored only on your own browser.</li>
  </ul>
  <p>No sensitive personal data (such as ID numbers, addresses, or financial information) is requested by this site.</p>

  <h4>How your data is used</h4>
  <p>Data is used only to operate the shared board so every team member sees the same live project — issues, roles, and progress — and nothing else. It is never sold or shared for marketing.</p>

  <h4>Where your data is stored</h4>
  <ul>
    <li><strong>Supabase</strong> — a cloud-hosted PostgreSQL database that stores issues and team roles when the database connection is active.</li>
    <li><strong>Your browser's local storage</strong> — used in demo mode (when no database is connected) and for your theme and tutorial preferences.</li>
  </ul>

  <h4>Third-party services</h4>
  <ul>
    <li><strong>Supabase</strong> — online database and realtime sync for the board.</li>
    <li><strong>Google Fonts</strong> — loads the Inter typeface used by the interface.</li>
    <li><strong>GitHub Pages</strong> — hosts this website.</li>
  </ul>
  <p>Each of these services operates under its own privacy policy.</p>

  <h4>Your rights under R.A. 10173</h4>
  <p>You may request access to, correction of, or deletion of your personal data. Please contact the Project Manager (Victor / VT) and changes will be applied to the shared board. Removing or clearing a shared issue affects what other teammates see.</p>

  <h4>Contact</h4>
  <p>For any privacy concern, reach out to the <strong>APPDAET-BTIS2-GROUP2</strong> project team through the Project Manager.</p>`;

const termsContent = `
  <h4>Acceptance of Terms</h4>
  <p>By accessing and using <strong>APPDAET-BTIS2-GROUP2</strong>, you agree to these Terms and Conditions. If you do not agree, please do not use the website.</p>

  <h4>About the platform</h4>
  <p>This is a kanban board used for tracking tasks, stories, bugs, and overall progress for the BTIS2 Group 2 academic project. It is provided as-is for the project's educational purposes.</p>

  <h4>Technologies used</h4>
  <p>This website is built with simple, open web technologies:</p>
  <ul>
    <li><strong>HTML</strong> — page structure and content.</li>
    <li><strong>CSS</strong> — styling, layout, and light/dark themes.</li>
    <li><strong>JavaScript</strong> — interactivity such as drag-and-drop, modals, filters, and the guided tour.</li>
    <li><strong>Supabase</strong> — the online database (PostgreSQL) and realtime updates shared by the team.</li>
    <li><strong>Google Fonts</strong> — the Inter typeface.</li>
    <li><strong>GitHub Pages</strong> — hosting of the site.</li>
  </ul>

  <h4>Acceptable use</h4>
  <ul>
    <li>Use the board only for the group project's purposes.</li>
    <li>Do not post harmful, illegal, defamatory, or misleading content.</li>
    <li>Remember that the board is shared — changes you make are visible to all team members.</li>
  </ul>

  <h4>Demo mode</h4>
  <p>If the online database is not connected, the site runs in <strong>demo mode</strong> and saves changes only in your browser. A banner will be shown at the top of the board when this is the case.</p>

  <h4>Content and ownership</h4>
  <p>The issues, roles, and documents on this board are contributed by the team for the project. Shared documents remain the property of their respective authors. This website and its interface are part of the group's academic output.</p>

  <h4>Changes to these terms</h4>
  <p>The team may update these Terms and Conditions from time to time. Continued use of the website after changes means you accept the updated terms.</p>

  <h4>Contact</h4>
  <p>Questions about these terms? Contact the <strong>APPDAET-BTIS2-GROUP2</strong> project team through the Project Manager (Victor / VT).</p>`;

function openLegal(kind) {
  const isPrivacy = kind === "privacy";
  legalEyebrow.textContent = isPrivacy ? "Data Privacy" : "Legal";
  legalTitle.textContent = isPrivacy ? "Privacy Policy" : "Terms and Conditions";
  legalBody.innerHTML = isPrivacy ? privacyContent : termsContent;
  legalModal.classList.remove("hidden");
  sidebar.classList.remove("open");
}

function closeLegal() {
  legalModal.classList.add("hidden");
}

document.getElementById("privacyNavItem").addEventListener("click", () => openLegal("privacy"));
document.getElementById("termsNavItem").addEventListener("click", () => openLegal("terms"));
document.getElementById("closeLegal").addEventListener("click", closeLegal);
document.getElementById("cancelLegal").addEventListener("click", closeLegal);
legalModal.addEventListener("click", event => {
  if (event.target === legalModal) closeLegal();
});

const tourOverlay = document.getElementById("tourOverlay");
const tourHighlight = document.getElementById("tourHighlight");
const tourCard = document.getElementById("tourCard");
const tourNumber = document.getElementById("tourNumber");
const tourTitle = document.getElementById("tourTitle");
const tourText = document.getElementById("tourText");
const tourProgress = document.getElementById("tourProgress");
const tourPrev = document.getElementById("tourPrev");
const tourNext = document.getElementById("tourNext");
const tourSkip = document.getElementById("tourSkip");
const tourReplay = document.getElementById("tourReplay");

const TOUR_KEY = "appdaetTourSeen";

const tourSteps = [
  {
    target: null,
    align: "center",
    title: "Welcome to APPDAET",
    text: "This is your team's shared kanban board. In a few quick steps we'll show you the essentials so you can jump right in."
  },
  {
    target: "#createTaskButton",
    align: "bottom",
    title: "Create issues",
    text: "Click + Create to add a task, story, or bug. Assign it to a teammate, pick a type, and set a priority."
  },
  {
    target: "#board",
    align: "top",
    title: "The board",
    text: "Issues flow through four columns: TO DO, IN PROGRESS, IN REVIEW, and DONE. Drag a card between columns to update its status."
  },
  {
    target: ".board-toolbar",
    align: "bottom",
    title: "Search & filter",
    text: "Use the search bar to find specific issues and filter by priority so you can focus on what matters most."
  },
  {
    target: "#teamNavItem",
    align: "right",
    title: "Team",
    text: "Open the Team page to view your teammates, adjust their avatars, and edit each member's role."
  },
  {
    target: "#docsNavItem",
    align: "right",
    title: "Docs",
    text: "The Docs section links to your project plan and shared documentation, all in one place."
  },
  {
    target: "#driveNavItem",
    align: "right",
    title: "Drive — uploads",
    text: "Use Drive to share your project files: upload your Python files (.py) and your documentation (docs.pdf) there so the whole team has everything in one shared folder."
  },
  {
    target: "#themeButton",
    align: "bottom",
    title: "Dark mode",
    text: "Toggle light and dark themes anytime with one click. That's everything — you're ready to go!"
  }
];

let tourIndex = 0;

function positionTourHighlight(el) {
  if (el.closest("#sidebar") && window.innerWidth <= 1050 && !sidebar.classList.contains("open")) {
    sidebar.classList.add("open");
  }
  const rect = el.getBoundingClientRect();
  const pad = 6;
  tourHighlight.style.left = `${rect.left - pad}px`;
  tourHighlight.style.top = `${rect.top - pad}px`;
  tourHighlight.style.width = `${rect.width + pad * 2}px`;
  tourHighlight.style.height = `${rect.height + pad * 2}px`;
  tourHighlight.style.opacity = "1";
  return rect;
}

function positionTourCard(rect, edge) {
  const cardW = tourCard.offsetWidth;
  const cardH = tourCard.offsetHeight;
  const gap = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x;
  let y;

  if (edge === "bottom") {
    x = rect.left + rect.width / 2 - cardW / 2;
    y = rect.bottom + gap;
  } else if (edge === "top") {
    x = rect.left + rect.width / 2 - cardW / 2;
    y = rect.top - cardH - gap;
  } else if (edge === "right") {
    x = rect.right + gap;
    y = rect.top + rect.height / 2 - cardH / 2;
  } else if (edge === "left") {
    x = rect.left - cardW - gap;
    y = rect.top + rect.height / 2 - cardH / 2;
  } else {
    x = (vw - cardW) / 2;
    y = (vh - cardH) / 2;
  }

  x = Math.max(12, Math.min(x, vw - cardW - 12));
  y = Math.max(12, Math.min(y, vh - cardH - 12));
  tourCard.style.left = `${x}px`;
  tourCard.style.top = `${y}px`;
}

function showTourStep(index) {
  tourIndex = index;
  const step = tourSteps[index];

  tourTitle.textContent = step.title;
  tourText.textContent = step.text;
  tourNumber.textContent = `${index + 1} / ${tourSteps.length}`;
  tourPrev.disabled = index === 0;
  tourNext.textContent = index === tourSteps.length - 1 ? "Done" : "Next ›";

  tourProgress.innerHTML = tourSteps
    .map((_, i) => `<span class="tour-progress-dot${i === index ? " active" : ""}"></span>`)
    .join("");

  if (!step.target) {
    tourHighlight.style.opacity = "0";
    positionTourCard({ left: 0, top: 0 }, "center");
    return;
  }

  const el = document.querySelector(step.target);
  if (!el) {
    tourHighlight.style.opacity = "0";
    positionTourCard({ left: 0, top: 0 }, "center");
    return;
  }

  el.scrollIntoView({ block: "center", inline: "center" });
  requestAnimationFrame(() => {
    const rect = positionTourHighlight(el);
    positionTourCard(rect, step.align);
  });
}

function openTour() {
  if (!tourOverlay.classList.contains("hidden")) return;
  document.body.classList.add("tour-open");
  tourOverlay.classList.remove("hidden");
  tourOverlay.classList.add("show");
  showTourStep(0);
}

function closeTour() {
  document.body.classList.remove("tour-open");
  tourOverlay.classList.add("hidden");
  tourOverlay.classList.remove("show");
  sidebar.classList.remove("open");
  localStorage.setItem(TOUR_KEY, "1");
}

tourNext.addEventListener("click", () => {
  if (tourIndex === tourSteps.length - 1) {
    closeTour();
  } else {
    showTourStep(tourIndex + 1);
  }
});

tourPrev.addEventListener("click", () => {
  if (tourIndex > 0) showTourStep(tourIndex - 1);
});

tourSkip.addEventListener("click", closeTour);
tourReplay.addEventListener("click", openTour);

window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !tourOverlay.classList.contains("hidden")) {
    closeTour();
  }
});

window.addEventListener("resize", () => {
  if (!tourOverlay.classList.contains("hidden")) showTourStep(tourIndex);
});

const loader = document.getElementById("loader");
const LOADER_MIN_MS = 900;
const LOADER_MAX_MS = 3500;
const loaderStartedAt = Date.now();

function hideLoader() {
  const elapsed = Date.now() - loaderStartedAt;
  const delay = Math.max(0, LOADER_MIN_MS - elapsed);
  setTimeout(() => {
    loader.classList.add("loader-hidden");
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 450);
  }, delay);
}

window.addEventListener("load", hideLoader);
if (document.readyState === "complete") hideLoader();
setTimeout(hideLoader, LOADER_MAX_MS);

setTimeout(() => {
  if (localStorage.getItem(TOUR_KEY) !== "1") openTour();
}, 700);

loadTasks();
loadMembers();