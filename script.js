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
    state.members = defaultMembers.map(m => ({ ...m }));
    renderTeamSidebar();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("team_members")
      .select("*")
      .order("created_at");

    if (error) throw error;

    const present = new Set((data || []).map(m => m.initials));
    const missing = defaultMembers.filter(m => !present.has(m.initials));

    if (!data || data.length === 0) {
      const { error: seedError } = await supabaseClient
        .from("team_members")
        .upsert(defaultMembers, { onConflict: "initials" });
      if (seedError) throw seedError;
      state.members = defaultMembers.map(m => ({ ...m }));
    } else {
      if (missing.length > 0) {
        const { error: addError } = await supabaseClient
          .from("team_members")
          .upsert(missing, { onConflict: "initials", ignoreDuplicates: true });
        if (addError) throw addError;
        const { data: fresh, error: freshError } = await supabaseClient
          .from("team_members")
          .select("*")
          .order("created_at");
        if (freshError) throw freshError;
        data = fresh;
      }
      state.members = (data || []).map(row => ({
        id: row.id,
        initials: row.initials,
        name: row.name,
        role: row.role
      }));
    }

    const known = new Set(state.members.map(m => m.initials));
    defaultMembers.forEach(dm => {
      if (!known.has(dm.initials)) state.members.push({ ...dm });
    });

    renderTeamSidebar();
    subscribeMembers();
  } catch (error) {
    console.warn("Team roles unavailable:", error);
    state.members = defaultMembers.map(m => ({ ...m }));
    renderTeamSidebar();
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

function saveTeamRoles() {
  let changed = false;

  document.querySelectorAll(".team-role-input").forEach(input => {
    const member = state.members.find(m => m.initials === input.dataset.initials);
    if (!member) return;

    const role = input.value.trim();
    if (role === (member.role || "")) return;

    changed = true;
    member.role = role;

    if (!supabaseClient) return;

    if (member.id) {
      supabaseClient
        .from("team_members")
        .update({ role })
        .eq("id", member.id)
        .then(({ error }) => {
          if (error) console.warn("Could not update role:", error);
        });
    } else {
      supabaseClient
        .from("team_members")
        .upsert({ initials: member.initials, name: member.name, role }, { onConflict: "initials" })
        .then(({ error }) => {
          if (error) console.warn("Could not save role:", error);
        });
    }
  });

  if (changed) {
    renderTeamSidebar();
    toast(
      supabaseClient
        ? "Roles saved — everyone sees the same roster."
        : "Demo mode — no database connected, roles won't be saved."
    );
    closeTeam();
  } else {
    toast("No changes to save.");
  }
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
  sidebar.classList.remove("open");
});
document.getElementById("closeDocs").addEventListener("click", closeDocs);
docsModal.addEventListener("click", event => {
  if (event.target === docsModal) closeDocs();
});

loadTasks();
loadMembers();