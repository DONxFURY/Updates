/* FANZVILLE Ops Console — app.js
   Static, GitHub Pages ready.
   Data source: /data/*.json
   Local edits: localStorage (export to commit back to repo).
*/

(() => {
  const LS_KEY = "fanzville_ops_v1";
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const STATUS = [
    { key: "todo",        label: "To do",        dot: "var(--brand)" },
    { key: "in_progress", label: "In progress",  dot: "var(--brand2)" },
    { key: "blocked",     label: "Blocked",      dot: "var(--warn)" },
    { key: "done",        label: "Done",         dot: "var(--ok)" },
  ];

  const UPDATE_TYPES = ["announcement", "patch", "event", "hotfix"];

  /** Basic id generator (stable enough for local edits) */
  const uid = (prefix="id") => `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;

  const fmtDate = (isoOrDateStr) => {
    if (!isoOrDateStr) return "";
    try{
      const d = new Date(isoOrDateStr);
      return new Intl.DateTimeFormat(undefined, { year:"numeric", month:"short", day:"2-digit" }).format(d);
    } catch {
      return String(isoOrDateStr);
    }
  };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const cssEsc = (s) => {
    try { return (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(s)) : String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }
    catch { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }
  };

  const toast = (() => {
    const el = $("#toast");
    let t = null;
    const show = (title, msg, ms=2500) => {
      if (!el) return;
      el.innerHTML = `<div class="toast__title">${escapeHtml(title)}</div><div class="toast__msg">${escapeHtml(msg)}</div>`;
      el.classList.add("is-open");
      clearTimeout(t);
      t = setTimeout(() => el.classList.remove("is-open"), ms);
    };
    return { show };
  })();

  const modal = (() => {
    const m = $("#modal");
    const title = $("#modalTitle");
    const body = $("#modalBody");
    const foot = $("#modalFoot");

    const open = ({ titleText, bodyHtml, footHtml }) => {
      title.textContent = titleText ?? "Modal";
      body.innerHTML = bodyHtml ?? "";
      foot.innerHTML = footHtml ?? "";
      m.classList.add("is-open");
      m.setAttribute("aria-hidden", "false");
      // icons in injected HTML
      safeIcons();
    };
    const close = () => {
      m.classList.remove("is-open");
      m.setAttribute("aria-hidden", "true");
      body.innerHTML = "";
      foot.innerHTML = "";
    };

    m.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.dataset && target.dataset.close) close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && m.classList.contains("is-open")) close();
    });

    return { open, close };
  })();

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function safeIcons(){
    // lucide loads async via defer; if present, render icons
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  /** Load repo JSON with local overrides layered on top */
  async function loadData(){
    const [config, tasks, updates] = await Promise.all([
      fetchJson("./data/config.json"),
      fetchJson("./data/tasks.json"),
      fetchJson("./data/updates.json"),
    ]);

    const local = readLocal();
    const merged = {
      config: { ...(config || {}), ...(local.config || {}) },
      tasks: Array.isArray(local.tasks) ? local.tasks : (Array.isArray(tasks) ? tasks : []),
      updates: Array.isArray(local.updates) ? local.updates : (Array.isArray(updates) ? updates : []),
      maintainer: !!local.maintainer,
      theme: local.theme || null,
      view: local.view || "kanban",
      filters: local.filters || { q:"", status:"", priority:"", category:"", showDone:true },
    };

    // Normalize shapes
    merged.tasks = merged.tasks.map(normalizeTask);
    merged.updates = merged.updates.map(normalizeUpdate);

    return merged;
  }

  async function fetchJson(path){
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
    return r.json();
  }

  function readLocal(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function writeLocal(patch){
    const cur = readLocal();
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  function resetLocal(){
    localStorage.removeItem(LS_KEY);
  }

  function normalizeTask(t){
    const created = t.createdAt || t.created_at || new Date().toISOString();
    const status = (t.status || "todo");
    const priority = Number(t.priority ?? 2);
    return {
      id: String(t.id || uid("t")),
      title: String(t.title || "Untitled task"),
      description: String(t.description || ""),
      status: STATUS.some(s => s.key === status) ? status : "todo",
      priority: clamp(priority, 1, 4),
      category: String(t.category || "General"),
      due: t.due || t.due_date || null,
      createdAt: created,
      completedAt: t.completedAt || t.completed_at || null,
    };
  }

  function normalizeUpdate(u){
    const type = (u.type || "announcement");
    return {
      id: String(u.id || uid("u")),
      type: UPDATE_TYPES.includes(type) ? type : "announcement",
      title: String(u.title || "Untitled update"),
      summary: String(u.summary || ""),
      content: String(u.content || u.content_md || ""),
      publishedAt: u.publishedAt || u.published_at || new Date().toISOString()
    };
  }

  /** Filtering */
  function applyFilters(state, items, kind){
    const f = state.filters || {};
    const q = (f.q || "").trim().toLowerCase();
    const status = f.status || "";
    const priority = f.priority || "";
    const category = f.category || "";
    const showDone = !!f.showDone;

    if (kind === "tasks"){
      return items.filter(t => {
        if (!showDone && t.status === "done") return false;
        if (status && t.status !== status) return false;
        if (priority && String(t.priority) !== String(priority)) return false;
        if (category && t.category !== category) return false;
        if (q){
          const hay = `${t.title} ${t.description} ${t.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    if (kind === "updates"){
      return items.filter(u => {
        if (q){
          const hay = `${u.title} ${u.summary} ${u.content} ${u.type}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    return items;
  }

  /** Routes */
  function setRoute(route){
    $$(".pill").forEach(b => b.classList.toggle("is-active", b.dataset.route === route));
    $$(".route").forEach(r => r.classList.toggle("is-active", r.id === `route-${route}`));
    // Update URL hash
    const hash = `#${route}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  /** Rendering */
  function renderAll(state){
    // theme
    if (state.theme) document.documentElement.setAttribute("data-theme", state.theme);
    else document.documentElement.removeAttribute("data-theme");

    // header config
    $("#serverName").textContent = state.config.serverName || "FANZVILLE";
    $("#serverSub").textContent = state.config.subtitle || "DayZ Server • Ops Console";
    $("#repoHint").textContent = state.config.repoHint || "Edit /data/*.json to publish changes.";

    // links
    const linksEl = $("#links");
    linksEl.innerHTML = "";
    (state.config.links || []).forEach(l => {
      const a = document.createElement("a");
      a.className = "linkPill";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i data-lucide="external-link"></i><span>${escapeHtml(l.label)}</span>`;
      linksEl.appendChild(a);
    });

    // Filters UI (sync)
    $("#q").value = state.filters.q || "";
    $("#statusFilter").value = state.filters.status || "";
    $("#priorityFilter").value = state.filters.priority || "";
    $("#categoryFilter").value = state.filters.category || "";
    $("#showDone").checked = !!state.filters.showDone;

    // Category dropdown options
    const cats = Array.from(new Set(state.tasks.map(t => t.category))).sort((a,b)=>a.localeCompare(b));
    const catSel = $("#categoryFilter");
    const cur = catSel.value;
    catSel.innerHTML = `<option value="">Any</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    catSel.value = cats.includes(cur) ? cur : (state.filters.category || "");

    // Maintainer UI
    $("#addTaskBtn").disabled = !state.maintainer;
    $("#addUpdateBtn").disabled = !state.maintainer;
    $("#maintainerBtn").classList.toggle("is-on", state.maintainer);

    // Overview
    renderOverview(state);

    // Tasks
    renderTasks(state);

    // Updates
    renderUpdates(state);

    // Icons refresh
    safeIcons();
  }

  function computeCounts(tasks){
    const c = { todo:0, in_progress:0, blocked:0, done:0, total:0 };
    tasks.forEach(t => { c.total++; c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }

  function renderOverview(state){
    const counts = computeCounts(state.tasks);
    const donePct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

    // Stat cards
    const statWrap = $("#statCards");
    statWrap.innerHTML = [
      statCard("To do", counts.todo, "Queued"),
      statCard("In progress", counts.in_progress, "Active"),
      statCard("Blocked", counts.blocked, "Needs attention"),
      statCard("Done", counts.done, `${donePct}% complete`),
    ].join("");

    $("#progressBadge").textContent = `${donePct}%`;
    $("#doneCount").textContent = String(counts.done);

    // Mini metrics
    const mini = $("#miniMetrics");
    const oldest = state.tasks.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))[0];
    const newest = state.tasks.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
    mini.innerHTML = [
      miniMetric("Total", counts.total),
      miniMetric("Newest", newest ? fmtDate(newest.createdAt) : "—"),
      miniMetric("Oldest", oldest ? fmtDate(oldest.createdAt) : "—"),
    ].join("");

    // Latest update
    const latest = state.updates.slice().sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt))[0];
    $("#latestType").textContent = latest ? latest.type : "—";
    $("#latestType").className = `badge badge--soft`;
    $("#latestUpdate").innerHTML = latest
      ? `
        <div class="latest__title">${escapeHtml(latest.title)}</div>
        <div class="latest__summary">${escapeHtml(latest.summary)}</div>
        <div class="latest__meta">
          <span>Published ${escapeHtml(fmtDate(latest.publishedAt))}</span>
          <span class="sep">•</span>
          <button class="ghost" id="openLatestBtn">Open</button>
        </div>`
      : `<div class="latest__summary">No updates posted yet.</div>`;
    if (latest){
      const btn = $("#openLatestBtn");
      if (btn) btn.onclick = () => openUpdateModal(state, latest.id);
    }

    // Critical list (priority 4 not done)
    const critical = state.tasks
      .filter(t => t.priority === 4 && t.status !== "done")
      .sort((a,b)=>statusRank(a.status)-statusRank(b.status) || new Date(a.createdAt)-new Date(b.createdAt))
      .slice(0, 6);
    $("#criticalList").innerHTML = critical.length
      ? critical.map(t => listItemTask(t)).join("")
      : `<div class="item"><div><div class="item__title">No critical tasks</div><div class="item__sub">You’re clear.</div></div><div class="item__right"><span class="pillMini pillMini--ok">Clean</span></div></div>`;

    // Due soon list
    const now = new Date();
    const dueSoon = state.tasks
      .filter(t => t.due && t.status !== "done")
      .map(t => ({ t, days: Math.ceil((new Date(t.due) - now) / 86400000) }))
      .sort((a,b)=>a.days-b.days)
      .slice(0, 6);

    $("#dueSoonList").innerHTML = dueSoon.length
      ? dueSoon.map(({t, days}) => {
          const urgency = days <= 0 ? "pillMini--bad" : days <= 2 ? "pillMini--warn" : "pillMini--brand";
          const label = days <= 0 ? "Overdue" : `${days}d`;
          return listItemTask(t, `<span class="pillMini ${urgency}">${label}</span>`);
        }).join("")
      : `<div class="item"><div><div class="item__title">No due dates</div><div class="item__sub">Add due dates to track milestones.</div></div><div class="item__right"><span class="pillMini">—</span></div></div>`;

    // Chart
    renderChart(counts);
  }

  function statusRank(s){
    // prefer in_progress first, then blocked, todo, done
    const map = { in_progress:0, blocked:1, todo:2, done:3 };
    return map[s] ?? 9;
  }

  function statCard(label, value, hint){
    return `
      <div class="stat">
        <div class="stat__label">${escapeHtml(label)}</div>
        <div class="stat__value">${escapeHtml(value)}</div>
        <div class="stat__hint">${escapeHtml(hint)}</div>
      </div>
    `;
  }
  function miniMetric(k, v){
    return `<div class="miniItem"><div class="miniItem__k">${escapeHtml(k)}</div><div class="miniItem__v">${escapeHtml(v)}</div></div>`;
  }

  function listItemTask(t, rightHtml){
    const p = priorityTag(t.priority);
    const right = rightHtml || `<span class="pillMini ${p.cls}">P${t.priority}</span>`;
    return `
      <div class="item" data-task-open="${escapeHtml(t.id)}">
        <div>
          <div class="item__title">${escapeHtml(t.title)}</div>
          <div class="item__sub">${escapeHtml(t.category)} • ${escapeHtml(statusLabel(t.status))}${t.due ? " • Due " + escapeHtml(fmtDate(t.due)) : ""}</div>
        </div>
        <div class="item__right">${right}</div>
      </div>
    `;
  }

  function statusLabel(key){
    return STATUS.find(s => s.key === key)?.label || key;
  }

  function priorityTag(p){
    if (p >= 4) return { text: "CRITICAL", cls: "pillMini--bad" };
    if (p === 3) return { text: "HIGH", cls: "pillMini--warn" };
    if (p === 2) return { text: "NORMAL", cls: "pillMini" };
    return { text: "LOW", cls: "pillMini--ok" };
  }

  let chart = null;
  function renderChart(counts){
    const el = $("#progressChart");
    const ok = !!window.Chart && el && el.getContext;
    if (!ok) {
      // No chart library: just show badge.
      return;
    }

    const data = [counts.todo, counts.in_progress, counts.blocked, counts.done];
    const labels = ["To do", "In progress", "Blocked", "Done"];

    // Respect CSS variables without hardcoding colors
    const cs = getComputedStyle(document.documentElement);
    const col = (v, a=1) => {
      const hex = cs.getPropertyValue(v).trim();
      return hexToRgba(hex || "#999999", a);
    };

    const colors = [col("--brand", 0.8), col("--brand2", 0.75), col("--warn", 0.75), col("--ok", 0.75)];
    const borders = [col("--brand", 1), col("--brand2", 1), col("--warn", 1), col("--ok", 1)];

    if (chart) chart.destroy();
    chart = new Chart(el, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1.25,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(14,15,20,0.85)",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: 1
          }
        }
      }
    });
  }

  function hexToRgba(hex, a){
    const h = hex.replace("#","").trim();
    if (h.length === 3){
      const r = parseInt(h[0]+h[0], 16);
      const g = parseInt(h[1]+h[1], 16);
      const b = parseInt(h[2]+h[2], 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    if (h.length === 6){
      const r = parseInt(h.slice(0,2), 16);
      const g = parseInt(h.slice(2,4), 16);
      const b = parseInt(h.slice(4,6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    return `rgba(153,153,153,${a})`;
  }

  function renderTasks(state){
    const filtered = applyFilters(state, state.tasks, "tasks");

    // view selection
    const view = state.view || "kanban";
    $("#kanban").hidden = view !== "kanban";
    $("#taskTable").hidden = view !== "list";

    // Kanban
    if (view === "kanban"){
      const by = {};
      STATUS.forEach(s => by[s.key] = []);
      filtered.forEach(t => by[t.status].push(t));

      Object.values(by).forEach(list => list.sort((a,b)=>b.priority-a.priority || new Date(b.createdAt)-new Date(a.createdAt)));

      const board = $("#kanban");
      board.innerHTML = STATUS.map(s => {
        const count = by[s.key].length;
        return `
          <div class="col" data-col="${s.key}">
            <div class="col__head">
              <div class="col__name"><span class="dot" style="background:${s.dot}"></span>${escapeHtml(s.label)}</div>
              <div class="col__count">${count}</div>
            </div>
            <div class="dropzone" data-drop="${s.key}">
              ${by[s.key].map(t => taskCardHtml(state, t)).join("") || `<div class="tag">No tasks</div>`}
            </div>
          </div>
        `;
      }).join("");

      wireTaskCardEvents(state);
      wireDnD(state);
    }

    // List/table
    if (view === "list"){
      const table = $("#taskTable");
      const rows = filtered
        .slice()
        .sort((a,b)=>statusRank(a.status)-statusRank(b.status) || b.priority-a.priority || new Date(b.createdAt)-new Date(a.createdAt));

      table.innerHTML = `
        <div class="row row--head">
          <div>Task</div><div>Status</div><div>Category</div><div>Pri</div><div class="hideSm">Due</div>
        </div>
        ${rows.map(t => `
          <div class="row" data-task-open="${escapeHtml(t.id)}">
            <div><strong>${escapeHtml(t.title)}</strong><div class="item__sub">${escapeHtml(t.description || "")}</div></div>
            <div>${escapeHtml(statusLabel(t.status))}</div>
            <div>${escapeHtml(t.category)}</div>
            <div>P${t.priority}</div>
            <div class="hideSm">${t.due ? escapeHtml(fmtDate(t.due)) : "—"}</div>
          </div>
        `).join("")}
      `;
      // open modal on click
      $$(".row[data-task-open]").forEach(r => r.addEventListener("click", () => openTaskModal(state, r.dataset.taskOpen)));
    }

    // In overview lists: open task modal
    $$(".item[data-task-open]").forEach(it => it.addEventListener("click", () => openTaskModal(state, it.dataset.taskOpen)));
  }

  function taskCardHtml(state, t){
    const p = priorityTag(t.priority);
    const dueTag = t.due ? `<span class="tag tag--due">Due ${escapeHtml(fmtDate(t.due))}</span>` : "";
    return `
      <div class="card" draggable="${state.maintainer ? "true" : "false"}" data-task="${escapeHtml(t.id)}">
        <div class="card__top">
          <div class="card__title">${escapeHtml(t.title)}</div>
          <span class="tag tag--p${t.priority}">P${t.priority} ${escapeHtml(p.text)}</span>
        </div>
        <div class="card__meta">
          <span class="tag">${escapeHtml(t.category)}</span>
          ${dueTag}
          <span class="tag">${escapeHtml(statusLabel(t.status))}</span>
        </div>
        <div class="card__desc">${escapeHtml(t.description || "No description.")}</div>
        <div class="card__actions">
          ${state.maintainer ? `
            <button class="smBtn" data-act="edit"><i data-lucide="pencil"></i><span>Edit</span></button>
            <button class="smBtn smBtn--danger" data-act="delete"><i data-lucide="trash-2"></i><span>Delete</span></button>
          ` : `
            <button class="smBtn" data-act="open"><i data-lucide="maximize-2"></i><span>Open</span></button>
          `}
        </div>
      </div>
    `;
  }

  function wireTaskCardEvents(state){
    $$(".card[data-task]").forEach(card => {
      const id = card.dataset.task;
      card.addEventListener("click", (e) => {
        // ignore drag start click weirdness
        if (e.target && e.target.closest && e.target.closest("button")) return;
        card.classList.toggle("is-open");
      });

      const editBtn = card.querySelector('[data-act="edit"]');
      if (editBtn) editBtn.addEventListener("click", (e) => { e.stopPropagation(); openTaskEditor(state, id); });

      const delBtn = card.querySelector('[data-act="delete"]');
      if (delBtn) delBtn.addEventListener("click", (e) => { e.stopPropagation(); confirmDeleteTask(state, id); });

      const openBtn = card.querySelector('[data-act="open"]');
      if (openBtn) openBtn.addEventListener("click", (e) => { e.stopPropagation(); openTaskModal(state, id); });
    });
  }

  function wireDnD(state){
    if (!state.maintainer) return;

    let draggingId = null;

    $$(".card[draggable='true']").forEach(card => {
      card.addEventListener("dragstart", (e) => {
        draggingId = card.dataset.task;
        e.dataTransfer.setData("text/plain", draggingId);
        e.dataTransfer.effectAllowed = "move";
        card.style.opacity = "0.65";
      });
      card.addEventListener("dragend", () => {
        draggingId = null;
        card.style.opacity = "";
      });
    });

    $$(".dropzone[data-drop]").forEach(zone => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("is-over");
        e.dataTransfer.dropEffect = "move";
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("is-over");
        const status = zone.dataset.drop;
        const id = e.dataTransfer.getData("text/plain") || draggingId;
        if (!id || !status) return;
        setTaskStatus(state, id, status);
      });
    });
  }

  function setTaskStatus(state, id, status){
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.status = status;
    if (status === "done" && !t.completedAt) t.completedAt = new Date().toISOString();
    if (status !== "done") t.completedAt = null;
    persist(state);
    toast.show("Task moved", `${t.title} → ${statusLabel(status)}`);
    renderAll(state);
  }

  function persist(state){
    writeLocal({
      config: state.config,
      tasks: state.tasks,
      updates: state.updates,
      maintainer: state.maintainer,
      theme: state.theme,
      view: state.view,
      filters: state.filters
    });
  }

  function openTaskModal(state, id){
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const p = priorityTag(t.priority);
    modal.open({
      titleText: "Task details",
      bodyHtml: `
        <div class="prose" style="padding:0">
          <h2 style="margin:0 0 6px;color:var(--text)">${escapeHtml(t.title)}</h2>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px">
            <span class="typeTag typeTag--patch">${escapeHtml(statusLabel(t.status))}</span>
            <span class="typeTag">${escapeHtml(t.category)}</span>
            <span class="typeTag">${escapeHtml(p.text)} (P${t.priority})</span>
            ${t.due ? `<span class="typeTag">Due ${escapeHtml(fmtDate(t.due))}</span>` : ``}
          </div>
          <p>${escapeHtml(t.description || "No description.")}</p>
          <p class="help">Created: ${escapeHtml(fmtDate(t.createdAt))}${t.completedAt ? ` • Completed: ${escapeHtml(fmtDate(t.completedAt))}` : ""}</p>
        </div>
      `,
      footHtml: `
        ${state.maintainer ? `<button class="btn btn--ghost" id="editTaskFromModal"><i data-lucide="pencil"></i><span>Edit</span></button>` : ``}
        <button class="btn btn--primary" data-close="1"><i data-lucide="check"></i><span>Done</span></button>
      `
    });

    const edit = $("#editTaskFromModal");
    if (edit) edit.onclick = () => { modal.close(); openTaskEditor(state, id); };
  }

  function openTaskEditor(state, id){
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    modal.open({
      titleText: "Edit task",
      bodyHtml: taskFormHtml(t),
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--primary" id="saveTaskBtn"><i data-lucide="save"></i><span>Save</span></button>
      `
    });

    $("#saveTaskBtn").onclick = () => {
      const patch = readTaskForm();
      if (!patch.ok) return toast.show("Fix fields", patch.msg);
      Object.assign(t, patch.value);
      persist(state);
      modal.close();
      toast.show("Saved", "Task updated.");
      renderAll(state);
    };
  }

  function confirmDeleteTask(state, id){
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    modal.open({
      titleText: "Delete task?",
      bodyHtml: `<div class="prose" style="padding:0">
        <p><strong>${escapeHtml(t.title)}</strong></p>
        <p>This removes the task from your local board. Export JSON if you want to commit the removal to GitHub.</p>
      </div>`,
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--danger" id="doDeleteTask"><i data-lucide="trash-2"></i><span>Delete</span></button>
      `
    });

    $("#doDeleteTask").onclick = () => {
      state.tasks = state.tasks.filter(x => x.id !== id);
      persist(state);
      modal.close();
      toast.show("Deleted", "Task removed.");
      renderAll(state);
    };
  }

  function taskFormHtml(t){
    return `
      <div class="formGrid">
        <div class="span2 field" style="padding:0">
          <label>Title</label>
          <input id="f_title" value="${escapeHtml(t.title)}" />
        </div>

        <div class="field" style="padding:0">
          <label>Status</label>
          <select id="f_status">
            ${STATUS.map(s => `<option value="${s.key}" ${t.status===s.key?"selected":""}>${escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>

        <div class="field" style="padding:0">
          <label>Priority</label>
          <select id="f_priority">
            <option value="4" ${t.priority===4?"selected":""}>P4 Critical</option>
            <option value="3" ${t.priority===3?"selected":""}>P3 High</option>
            <option value="2" ${t.priority===2?"selected":""}>P2 Normal</option>
            <option value="1" ${t.priority===1?"selected":""}>P1 Low</option>
          </select>
        </div>

        <div class="field" style="padding:0">
          <label>Category</label>
          <input id="f_category" value="${escapeHtml(t.category)}" />
        </div>

        <div class="field" style="padding:0">
          <label>Due date</label>
          <input id="f_due" type="date" value="${t.due ? escapeHtml(String(t.due).slice(0,10)) : ""}" />
        </div>

        <div class="span2 field" style="padding:0">
          <label>Description</label>
          <textarea id="f_desc" rows="6">${escapeHtml(t.description)}</textarea>
          <div class="help">Tip: Keep it short and actionable. Use category names players recognize.</div>
        </div>
      </div>
    `;
  }

  function readTaskForm(){
    const title = $("#f_title").value.trim();
    const status = $("#f_status").value;
    const priority = Number($("#f_priority").value);
    const category = $("#f_category").value.trim() || "General";
    const due = $("#f_due").value ? $("#f_due").value : null;
    const description = $("#f_desc").value.trim();

    if (title.length < 3) return { ok:false, msg:"Title must be at least 3 characters." };
    return {
      ok:true,
      value: {
        title,
        status,
        priority: clamp(priority,1,4),
        category,
        due,
        description
      }
    };
  }

  function openAddTask(state){
    const blank = normalizeTask({ title:"", description:"", status:"todo", priority:2, category:"General", due:null });
    modal.open({
      titleText: "Add task",
      bodyHtml: taskFormHtml(blank),
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--primary" id="createTaskBtn"><i data-lucide="plus"></i><span>Create</span></button>
      `
    });

    $("#createTaskBtn").onclick = () => {
      const patch = readTaskForm();
      if (!patch.ok) return toast.show("Fix fields", patch.msg);
      const t = normalizeTask({ ...blank, ...patch.value, id: uid("t"), createdAt: new Date().toISOString() });
      state.tasks.unshift(t);
      persist(state);
      modal.close();
      toast.show("Created", "Task added.");
      renderAll(state);
    };
  }

  function renderUpdates(state){
    const filtered = applyFilters(state, state.updates, "updates")
      .slice()
      .sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));

    const el = $("#timeline");
    el.innerHTML = filtered.length ? filtered.map(u => updateHtml(u, state.maintainer)).join("") : `
      <div class="panel"><div class="prose">No updates match your search.</div></div>
    `;

    $$(".update").forEach(node => {
      node.addEventListener("click", (e) => {
        // If clicking buttons, ignore
        if (e.target && e.target.closest && e.target.closest("button")) return;
        node.classList.toggle("is-open");
      });

      const openBtn = node.querySelector("[data-open-update]");
      if (openBtn) openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openUpdateModal(state, node.dataset.updateId);
      });

      const editBtn = node.querySelector("[data-edit-update]");
      if (editBtn) editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openUpdateEditor(state, node.dataset.updateId);
      });

      const delBtn = node.querySelector("[data-del-update]");
      if (delBtn) delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteUpdate(state, node.dataset.updateId);
      });

      // Render markdown when expanded (lazy)
      node.addEventListener("transitionend", () => {});
    });

    // Latest update open modal also uses this
  }

  function updateHtml(u, isMaintainer){
    return `
      <article class="update" data-update-id="${escapeHtml(u.id)}">
        <div class="update__head">
          <div style="min-width:0">
            <div class="update__title">${escapeHtml(u.title)}</div>
            <div class="update__meta">
              <span class="typeTag typeTag--${escapeHtml(u.type)}">${escapeHtml(u.type.toUpperCase())}</span>
              <span>Published ${escapeHtml(fmtDate(u.publishedAt))}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <button class="smBtn" data-open-update="1"><i data-lucide="maximize-2"></i><span>Open</span></button>
            ${isMaintainer ? `
              <button class="smBtn" data-edit-update="1"><i data-lucide="pencil"></i><span>Edit</span></button>
              <button class="smBtn smBtn--danger" data-del-update="1"><i data-lucide="trash-2"></i><span>Delete</span></button>
            ` : ``}
          </div>
        </div>
        ${u.summary ? `<div class="update__summary">${escapeHtml(u.summary)}</div>` : ``}
        <div class="update__content" data-md="${escapeHtml(u.id)}"></div>
      </article>
    `;
  }

  function openUpdateModal(state, id){
    const u = state.updates.find(x => x.id === id);
    if (!u) return;
    const html = renderMarkdown(u.content || "");
    modal.open({
      titleText: u.title,
      bodyHtml: `
        <div class="prose" style="padding:0">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px">
            <span class="typeTag typeTag--${escapeHtml(u.type)}">${escapeHtml(u.type.toUpperCase())}</span>
            <span class="typeTag">Published ${escapeHtml(fmtDate(u.publishedAt))}</span>
          </div>
          ${u.summary ? `<p>${escapeHtml(u.summary)}</p>` : ``}
          <div class="update__content" style="display:block;padding:0">${html}</div>
        </div>
      `,
      footHtml: `
        ${state.maintainer ? `<button class="btn btn--ghost" id="editUpdateFromModal"><i data-lucide="pencil"></i><span>Edit</span></button>` : ``}
        <button class="btn btn--primary" data-close="1"><i data-lucide="check"></i><span>Close</span></button>
      `
    });
    const edit = $("#editUpdateFromModal");
    if (edit) edit.onclick = () => { modal.close(); openUpdateEditor(state, id); };
  }

  function renderMarkdown(md){
    const safe = String(md || "");
    if (window.marked && typeof window.marked.parse === "function"){
      // marked is fast; this is a trusted local file (you control the repo).
      return window.marked.parse(safe);
    }
    // fallback: plain text
    return `<pre style="white-space:pre-wrap">${escapeHtml(safe)}</pre>`;
  }

  function openUpdateEditor(state, id){
    const u = state.updates.find(x => x.id === id);
    if (!u) return;
    modal.open({
      titleText: "Edit update",
      bodyHtml: updateFormHtml(u),
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--primary" id="saveUpdateBtn"><i data-lucide="save"></i><span>Save</span></button>
      `
    });

    $("#saveUpdateBtn").onclick = () => {
      const patch = readUpdateForm();
      if (!patch.ok) return toast.show("Fix fields", patch.msg);
      Object.assign(u, patch.value);
      persist(state);
      modal.close();
      toast.show("Saved", "Update updated.");
      renderAll(state);
    };
  }

  function confirmDeleteUpdate(state, id){
    const u = state.updates.find(x => x.id === id);
    if (!u) return;
    modal.open({
      titleText: "Delete update?",
      bodyHtml: `<div class="prose" style="padding:0">
        <p><strong>${escapeHtml(u.title)}</strong></p>
        <p>This removes the update from your local board. Export JSON to commit the removal to GitHub.</p>
      </div>`,
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--danger" id="doDeleteUpdate"><i data-lucide="trash-2"></i><span>Delete</span></button>
      `
    });
    $("#doDeleteUpdate").onclick = () => {
      state.updates = state.updates.filter(x => x.id !== id);
      persist(state);
      modal.close();
      toast.show("Deleted", "Update removed.");
      renderAll(state);
    };
  }

  function updateFormHtml(u){
    return `
      <div class="formGrid">
        <div class="span2 field" style="padding:0">
          <label>Title</label>
          <input id="u_title" value="${escapeHtml(u.title)}" />
        </div>

        <div class="field" style="padding:0">
          <label>Type</label>
          <select id="u_type">
            ${UPDATE_TYPES.map(t => `<option value="${t}" ${u.type===t?"selected":""}>${t}</option>`).join("")}
          </select>
        </div>

        <div class="field" style="padding:0">
          <label>Published</label>
          <input id="u_pub" type="datetime-local" value="${toDatetimeLocal(u.publishedAt)}" />
        </div>

        <div class="span2 field" style="padding:0">
          <label>Summary</label>
          <textarea id="u_sum" rows="3">${escapeHtml(u.summary)}</textarea>
        </div>

        <div class="span2 field" style="padding:0">
          <label>Content (Markdown)</label>
          <textarea id="u_content" rows="10">${escapeHtml(u.content)}</textarea>
          <div class="help">Markdown supported (headings, lists, bold). Use the same format every patch.</div>
        </div>
      </div>
    `;
  }

  function toDatetimeLocal(iso){
    try{
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2,"0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth()+1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    } catch { return ""; }
  }

  function readUpdateForm(){
    const title = $("#u_title").value.trim();
    const type = $("#u_type").value;
    const published = $("#u_pub").value ? new Date($("#u_pub").value).toISOString() : new Date().toISOString();
    const summary = $("#u_sum").value.trim();
    const content = $("#u_content").value;

    if (title.length < 3) return { ok:false, msg:"Title must be at least 3 characters." };
    return { ok:true, value: { title, type, publishedAt: published, summary, content } };
  }

  function openAddUpdate(state){
    const blank = normalizeUpdate({ title:"", summary:"", content:"", type:"announcement", publishedAt: new Date().toISOString() });
    modal.open({
      titleText: "Add update",
      bodyHtml: updateFormHtml(blank),
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--primary" id="createUpdateBtn"><i data-lucide="plus"></i><span>Create</span></button>
      `
    });

    $("#createUpdateBtn").onclick = () => {
      const patch = readUpdateForm();
      if (!patch.ok) return toast.show("Fix fields", patch.msg);
      const u = normalizeUpdate({ ...blank, ...patch.value, id: uid("u") });
      state.updates.unshift(u);
      persist(state);
      modal.close();
      toast.show("Created", "Update added.");
      renderAll(state);
    };
  }

  /** Export / Import */
  function exportJson(state){
    const payload = {
      tasks: state.tasks,
      updates: state.updates,
      exportedAt: new Date().toISOString(),
      note: "Paste tasks into /data/tasks.json and updates into /data/updates.json to publish on GitHub Pages."
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fanzville-ops-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast.show("Exported", "Downloaded fanzville-ops-export.json");
  }

  function importJson(state, file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.updates)){
          throw new Error("File must include { tasks: [], updates: [] }");
        }
        state.tasks = parsed.tasks.map(normalizeTask);
        state.updates = parsed.updates.map(normalizeUpdate);
        persist(state);
        toast.show("Imported", "Board updated from JSON.");
        renderAll(state);
      } catch (e){
        toast.show("Import failed", e.message || "Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  /** Maintainer mode */
  async function toggleMaintainer(state){
    if (state.maintainer){
      state.maintainer = false;
      persist(state);
      toast.show("Maintainer", "Disabled.");
      renderAll(state);
      return;
    }

    modal.open({
      titleText: "Enter maintainer passphrase",
      bodyHtml: `
        <div class="prose" style="padding:0">
          <p>This unlocks drag-and-drop + editing. It is <strong>not secure auth</strong> (static site).</p>
          <div class="field" style="padding:0;margin-top:10px">
            <label>Passphrase</label>
            <input id="pass" type="password" placeholder="Passphrase..." />
            <div class="help">Change it in <code>/data/config.json</code></div>
          </div>
        </div>
      `,
      footHtml: `
        <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
        <button class="btn btn--primary" id="unlockBtn"><i data-lucide="key-round"></i><span>Unlock</span></button>
      `
    });

    $("#unlockBtn").onclick = () => {
      const pass = ($("#pass").value || "").trim();
      if (!pass) return toast.show("Missing", "Enter the passphrase.");
      if (pass !== String(state.config.maintainerPassphrase || "")){
        toast.show("Nope", "Passphrase incorrect.");
        return;
      }
      state.maintainer = true;
      persist(state);
      modal.close();
      toast.show("Maintainer", "Enabled. Drag tasks to update status.");
      renderAll(state);
    };
  }

  /** UI wiring */
  function wireUi(state){
    // route nav
    $$(".pill").forEach(btn => btn.addEventListener("click", () => setRoute(btn.dataset.route)));
    // jump buttons
    $$("[data-jump]").forEach(btn => btn.addEventListener("click", () => setRoute(btn.dataset.jump)));

    // filters
    const onFilter = () => {
      state.filters.q = $("#q").value;
      state.filters.status = $("#statusFilter").value;
      state.filters.priority = $("#priorityFilter").value;
      state.filters.category = $("#categoryFilter").value;
      state.filters.showDone = $("#showDone").checked;
      persist(state);
      renderAll(state);
    };

    ["input","change"].forEach(evt => {
      $("#q").addEventListener(evt, onFilter);
      $("#statusFilter").addEventListener(evt, onFilter);
      $("#priorityFilter").addEventListener(evt, onFilter);
      $("#categoryFilter").addEventListener(evt, onFilter);
      $("#showDone").addEventListener(evt, onFilter);
    });

    $("#clearFiltersBtn").addEventListener("click", () => {
      state.filters = { q:"", status:"", priority:"", category:"", showDone:true };
      persist(state);
      renderAll(state);
    });

    // theme
    $("#themeBtn").addEventListener("click", () => {
      state.theme = state.theme ? null : "neo";
      persist(state);
      renderAll(state);
      toast.show("Theme", state.theme ? "Neo mode enabled." : "Default mode enabled.");
    });

    // maintainer
    $("#maintainerBtn").addEventListener("click", () => toggleMaintainer(state));

    // add buttons
    $("#addTaskBtn").addEventListener("click", () => state.maintainer && openAddTask(state));
    $("#addUpdateBtn").addEventListener("click", () => state.maintainer && openAddUpdate(state));

    // view seg
    $$("#viewSeg .seg__btn").forEach(b => b.addEventListener("click", () => {
      $$("#viewSeg .seg__btn").forEach(x => x.classList.toggle("is-active", x === b));
      state.view = b.dataset.view;
      persist(state);
      renderAll(state);
    }));
    // sync seg initial state
    const initBtn = $(`#viewSeg .seg__btn[data-view="${state.view}"]`);
    if (initBtn){
      $$("#viewSeg .seg__btn").forEach(x => x.classList.toggle("is-active", x === initBtn));
    }

    // export/import/reset
    $("#exportBtn").addEventListener("click", () => exportJson(state));

    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJson(state, file);
      e.target.value = "";
    });

    $("#resetBtn").addEventListener("click", () => {
      modal.open({
        titleText: "Reset local edits?",
        bodyHtml: `<div class="prose" style="padding:0">
          <p>This clears <code>localStorage</code> changes and reloads the repo JSON.</p>
          <div class="callout"><strong>Note:</strong> It does not modify GitHub files.</div>
        </div>`,
        footHtml: `
          <button class="btn btn--ghost" data-close="1"><i data-lucide="x"></i><span>Cancel</span></button>
          <button class="btn btn--danger" id="doReset"><i data-lucide="rotate-ccw"></i><span>Reset</span></button>
        `
      });

      $("#doReset").onclick = async () => {
        resetLocal();
        modal.close();
        toast.show("Reset", "Local edits cleared. Reloading…");
        const fresh = await loadData();
        Object.assign(state, fresh);
        renderAll(state);
      };
    });

    // hash route on load
    const h = (location.hash || "").replace("#","");
    if (["overview","tasks","updates","about"].includes(h)) setRoute(h);
    else setRoute("overview");
  }

  /** Background FX */
  function startFx(){
    const c = $("#fx");
    const ctx = c.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      w = Math.floor(window.innerWidth);
      h = Math.floor(window.innerHeight);
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + "px";
      c.style.height = h + "px";
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rnd = (a,b) => a + Math.random()*(b-a);
    const pts = Array.from({length: 56}, () => ({
      x: rnd(0,w), y: rnd(0,h),
      vx: rnd(-0.22, 0.22), vy: rnd(-0.22,0.22),
      r: rnd(1.2, 2.4)
    }));

    let t = 0;
    const loop = () => {
      t += 1;
      ctx.clearRect(0,0,w,h);

      // faint grid
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      const step = 46;
      for (let x= (t%step); x<w; x+=step){
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
      }
      for (let y= (t%step); y<h; y+=step){
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      }

      // particles + links
      ctx.globalAlpha = 0.22;
      for (const p of pts){
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = w+20;
        if (p.x > w+20) p.x = -20;
        if (p.y < -20) p.y = h+20;
        if (p.y > h+20) p.y = -20;

        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }

      // connect close points
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      for (let i=0;i<pts.length;i++){
        for (let j=i+1;j<pts.length;j++){
          const a = pts[i], b = pts[j];
          const dx = a.x-b.x, dy = a.y-b.y;
          const dist = Math.hypot(dx,dy);
          if (dist < 140){
            ctx.globalAlpha = (1 - dist/140) * 0.12;
            ctx.beginPath();
            ctx.moveTo(a.x,a.y);
            ctx.lineTo(b.x,b.y);
            ctx.stroke();
          }
        }
      }

      // color glow passes (subtle)
      ctx.globalAlpha = 0.08;
      const cs = getComputedStyle(document.documentElement);
      const b1 = cs.getPropertyValue("--brand").trim() || "#ff1b3a";
      const b2 = cs.getPropertyValue("--brand2").trim() || "#7c3aed";
      const g1 = ctx.createRadialGradient(w*0.2, h*0.1, 0, w*0.2, h*0.1, 420);
      g1.addColorStop(0, hexToRgba(b1, 0.55));
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0,0,w,h);

      const g2 = ctx.createRadialGradient(w*0.85, h*0.22, 0, w*0.85, h*0.22, 460);
      g2.addColorStop(0, hexToRgba(b2, 0.48));
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0,0,w,h);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Boot */
  (async function init(){
    startFx();

    const state = await loadData();

    // Apply brand color from config if present
    if (state.config.accent) document.documentElement.style.setProperty("--brand", state.config.accent);
    if (state.config.accent2) document.documentElement.style.setProperty("--brand2", state.config.accent2);

    // Sync view seg default before render
    state.view = state.view || "kanban";

    wireUi(state);
    renderAll(state);

    // click open task list items wired after render
    $("#footStatus").textContent = state.maintainer ? "Maintainer mode enabled" : "Ready";
    safeIcons();

    // Lazy: render update markdown when opened
    document.addEventListener("click", (e) => {
      const upd = e.target && e.target.closest && e.target.closest(".update");
      if (!upd) return;
      if (!upd.classList.contains("is-open")) return;
      const id = upd.dataset.updateId;
      const node = upd.querySelector(`.update__content[data-md="${cssEsc(id)}"]`);
      if (node && !node.dataset.rendered){
        const u = state.updates.find(x => x.id === id);
        node.innerHTML = renderMarkdown(u?.content || "");
        node.dataset.rendered = "1";
      }
    });
  })();
})();