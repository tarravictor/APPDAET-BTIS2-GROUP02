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
  subscribed: false
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
    assignee: row.assignee || "VT"
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

        <button class="card-delete" title="Delete issue" aria-label="Delete issue">✕</button>
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

        <span class="assignee" title="${escapeHtml(task.assignee)}">
          ${escapeHtml(task.assignee)}
        </span>
      </div>
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
    const newStatus = column.dataset.status;
    const task = state.tasks.find(task => String(task.id) === String(taskId));
    if (!task) return;

    if (task.status === newStatus) return;

    const previousStatus = task.status;
    task.status = newStatus;
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
  });
});

function openModal(status = "todo") {
  modal.classList.remove("hidden");
  document.getElementById("taskStatus").value = status;
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
    state.tasks.push({ id: nextId, key: `APP-${nextId}`, ...newTask });
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

const CONFIG_DOCS_URL = typeof GOOGLE_DOCS_URL === "string" ? GOOGLE_DOCS_URL : "";

function docsEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/\/document\/d\/([^/]+)/);
  if (match) return `https://docs.google.com/document/d/${match[1]}/preview`;
  return url;
}

function openDocs() {
  docsModal.classList.remove("hidden");
  const embedUrl = docsEmbedUrl(CONFIG_DOCS_URL);
  if (embedUrl) {
    docsFrame.src = embedUrl;
    docsFrame.classList.remove("hidden");
    docsPlaceholder.classList.add("hidden");
  } else {
    docsFrame.classList.add("hidden");
    docsPlaceholder.classList.remove("hidden");
  }
}

function closeDocs() {
  docsModal.classList.add("hidden");
  docsFrame.src = "about:blank";
}

document.getElementById("docsNavItem").addEventListener("click", openDocs);
document.getElementById("boardNavItem").addEventListener("click", () => {
  closeDocs();
  sidebar.classList.remove("open");
});
document.getElementById("closeDocs").addEventListener("click", closeDocs);
docsModal.addEventListener("click", event => {
  if (event.target === docsModal) closeDocs();
});

loadTasks();