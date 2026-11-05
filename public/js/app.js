const App = {
  staff: null,
  week: null,
  schedule: null,
  actions: {},
  floorTimer: null,
  setActions(map) {
    this.actions = map || {};
  },
  can(perm) {
    const role = this.staff && this.staff.role;
    const map = {
      manageClub: ["manager"],
      managePlans: ["manager"],
      manageTrainers: ["manager"],
      manageClasses: ["manager", "trainer"],
      bill: ["manager", "frontdesk"],
      members: ["manager", "frontdesk"],
      checkin: ["manager", "frontdesk", "trainer"],
      book: ["manager", "frontdesk", "trainer"],
      attend: ["manager", "frontdesk", "trainer"],
    };
    return (map[perm] || []).includes(role);
  },
  paintClub() {},
  async reload() {
    await route();
  },
};

const NAV = [
  ["#/", "home", "Dashboard"],
  ["#/desk", "desk", "Front desk"],
  ["#/members", "people", "Members", "expiring"],
  ["#/schedule", "calendar", "Schedule"],
  ["#/trainers", "coach", "Coaches"],
  ["#/billing", "bill", "Billing", "overdue"],
  ["#/plans", "plan", "Plans"],
  ["#/reports", "chart", "Reports"],
  ["#/club", "club", "Club"],
];

const DEMOS = [
  ["Ama Mensah", "General manager", "ama@acefitness.club", "2468"],
  ["Kojo Boateng", "Front desk lead", "kojo@acefitness.club", "1357"],
  ["Nadia Sule", "Head of coaching", "nadia@acefitness.club", "9081"],
];

let generation = 0;

function shell() {
  return `
    <div class="shell" data-shell>
      <aside class="sidebar" id="sidebar">
        <div class="mark">
          <div class="mark-badge">${ui.icon("home")}</div>
          <div>
            <strong id="club-name">ACE</strong>
            <span>Fitness</span>
          </div>
        </div>
        <nav class="side-nav">
          ${NAV.map(([href, icon, label, badgeKey]) => `
            <a class="nav-item" href="${href}" data-nav>
              ${ui.icon(icon)}
              <span>${label}</span>
              ${badgeKey ? `<em class="badge-count" data-badge="${badgeKey}" hidden></em>` : ""}
            </a>`).join("")}
        </nav>
        <div class="side-foot">
          <p id="club-place">East Legon · Accra</p>
          <button type="button" data-action="logout">Sign out</button>
        </div>
      </aside>
      <div class="scrim" data-action="close-menu" hidden></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" type="button" data-action="open-menu" aria-label="Open menu">☰</button>
          <div class="search">
            <input id="global-search" placeholder="Search members" autocomplete="off">
            <div id="search-pop" class="search-pop" hidden></div>
          </div>
          <div class="top-meta">
            <span data-clock>${fmt.esc(fmt.clock())}</span>
            <span class="staff-chip" id="staff-chip"></span>
          </div>
        </header>
        <main id="view"></main>
      </div>
    </div>`;
}

function ensureShell() {
  if (document.querySelector("[data-shell]")) {
    markNav();
    return;
  }
  document.getElementById("app").innerHTML = shell();
  const search = document.getElementById("global-search");
  const pop = document.getElementById("search-pop");
  search.addEventListener("input", ui.debounce(async () => {
    const q = search.value.trim();
    if (q.length < 2) { pop.hidden = true; return; }
    const result = await api.search(q);
    pop.hidden = false;
    pop.innerHTML = result.items.map((item) => `
      <a href="#/members/${item.id}">${avatar(item)}<span><b>${fmt.esc(item.name)}</b><br><small>${fmt.esc(item.memberNo)} · ${fmt.esc(item.planName)}</small></span></a>
    `).join("") || `<p class="hint">No member matches.</p>`;
  }, 160));
  search.addEventListener("focus", () => { if (pop.innerHTML && search.value.trim().length >= 2) pop.hidden = false; });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search") && !event.target.closest("#search-pop")) pop.hidden = true;
  });
  api.club().then((club) => App.paintClub(club)).catch(() => {});
  markNav();
  paintIdentity();
}

App.paintClub = function paintClub(club) {
  const name = document.getElementById("club-name");
  const place = document.getElementById("club-place");
  if (name && club) name.textContent = club.shortName || club.name;
  if (place && club) place.textContent = `${club.address}`;
};

function paintIdentity() {
  const chip = document.getElementById("staff-chip");
  if (!chip || !App.staff) return;
  chip.innerHTML = `${avatar({ name: App.staff.name, hue: 18 })}<span>${fmt.esc(App.staff.name)}</span>`;
}

function markNav() {
  const hash = location.hash || "#/";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const href = link.getAttribute("href");
    const active = href === "#/" ? hash === "#/" || hash === "" : hash === href || hash.startsWith(`${href}/`);
    link.classList.toggle("is-active", active);
  });
  const alerts = (App.staff && App.staff.alerts) || {};
  document.querySelectorAll("[data-badge]").forEach((badge) => {
    const count = alerts[badge.dataset.badge] || 0;
    badge.hidden = count <= 0;
    badge.textContent = String(count);
  });
}

function loginScreen() {
  clearInterval(App.floorTimer);
  document.getElementById("app").innerHTML = `
    <section class="login">
      <div class="login-brand">
        <div class="mark">
          <div class="mark-badge">${ui.icon("home")}</div>
          <div><strong>ACE</strong><span>Fitness</span></div>
        </div>
        <div>
          <h1>The house, run properly.</h1>
          <p class="brand-copy">Memberships, the floor, the timetable, and the books — one desk for East Legon.</p>
        </div>
        <div class="brand-meta">
          <span>14 Lagos Avenue, East Legon, Accra</span>
          <span>Mon–Fri 5:00–22:00 · Sat 6:00–20:00 · Sun 7:00–14:00</span>
        </div>
      </div>
      <div class="login-panel">
        <div class="login-card">
          <p class="eyebrow">Staff console</p>
          <h2>Sign in</h2>
          <p class="lede">Use the desk you are covering. Credentials below are for this club.</p>
          <form class="stack" data-action="login">
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required value="ama@acefitness.club"></label>
            <label class="field"><span>PIN</span><input name="pin" inputmode="numeric" autocomplete="current-password" required value="2468"></label>
            <button class="btn btn-primary" type="submit">Enter the floor</button>
          </form>
          <div class="demo-list">
            ${DEMOS.map(([name, title, email, pin]) => `
              <button class="demo" type="button" data-action="demo" data-email="${email}" data-pin="${pin}">
                <span><b>${name}</b><small>${title}</small></span>
                <em>${pin}</em>
              </button>`).join("")}
          </div>
        </div>
      </div>
    </section>`;
  App.setActions({
    login: async (form) => {
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const data = ui.form(form);
        const session = await api.login(data.email, data.pin);
        api.setToken(session.token);
        App.staff = session.staff;
        if (!location.hash || location.hash === "#") location.hash = "#/";
        await route();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
    demo: (el) => {
      const form = document.querySelector(".login-card form");
      form.email.value = el.dataset.email;
      form.pin.value = el.dataset.pin;
      form.requestSubmit();
    },
  });
}

function clearToasts() {
  const root = document.getElementById("toast-root");
  if (root) root.innerHTML = "";
}

async function route() {
  const gen = ++generation;
  clearInterval(App.floorTimer);
  clearToasts();
  ui.closeModal();
  if (!App.staff) {
    loginScreen();
    return;
  }
  ensureShell();
  const hash = location.hash || "#/";
  const member = hash.match(/^#\/members\/([^/]+)$/);
  const view = document.getElementById("view");
  const ctx = { alive: () => gen === generation };
  markNav();
  try {
    if (hash === "#/" || hash === "") await Pages.dashboard(ctx);
    else if (hash === "#/desk") await Pages.desk(ctx);
    else if (hash === "#/members") await Pages.members(ctx);
    else if (member) await Pages.member(ctx, decodeURIComponent(member[1]));
    else if (hash === "#/schedule") await Pages.schedule(ctx);
    else if (hash === "#/trainers") await Pages.trainers(ctx);
    else if (hash === "#/billing") await Pages.billing(ctx);
    else if (hash === "#/plans") await Pages.plans(ctx);
    else if (hash === "#/reports") await Pages.reports(ctx);
    else if (hash === "#/club") await Pages.club(ctx);
    else {
      view.innerHTML = `<section class="page"><div class="empty"><h2>That page is not on the floor plan.</h2><p><a href="#/">Back to the dashboard</a></p></div></section>`;
    }
    document.title = "ACE FITNESS";
  } catch (error) {
    if (!ctx.alive() || error.status === 401) return;
    view.innerHTML = `<section class="page"><div class="empty"><h2>This view did not load</h2><p>${fmt.esc(error.message)}</p><button class="btn" type="button" data-action="retry">Try again</button></div></section>`;
    App.setActions({ retry: () => route() });
  }
}

document.body.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (el) {
    const action = el.dataset.action;
    if (action === "close-modal") {
      if (el.classList.contains("modal-back") && event.target !== el) return;
      event.preventDefault();
      ui.closeModal();
      return;
    }
    if (action === "open-menu") {
      document.getElementById("sidebar")?.classList.add("is-open");
      const scrim = document.querySelector(".scrim");
      if (scrim) scrim.hidden = false;
      return;
    }
    if (action === "close-menu") {
      document.getElementById("sidebar")?.classList.remove("is-open");
      const scrim = document.querySelector(".scrim");
      if (scrim) scrim.hidden = true;
      return;
    }
    if (action === "logout") {
      event.preventDefault();
      api.logout().catch(() => {});
      api.clear();
      App.staff = null;
      loginScreen();
      return;
    }
    const fn = App.actions[action];
    if (!fn) return;
    event.preventDefault();
    Promise.resolve(fn(el, event)).catch((error) => {
      if (error.status !== 401) ui.toast(error.message || "Something went wrong.", "bad");
    });
    return;
  }
  const row = event.target.closest("[data-href]");
  if (row && !event.target.closest("button, a, input, select, label")) location.hash = row.dataset.href;
});

document.body.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const action = form.dataset.action;
  const fn = action && App.actions[action];
  if (!fn) return;
  event.preventDefault();
  Promise.resolve(fn(form, event)).catch((error) => {
    if (error.status !== 401) ui.toast(error.message || "Something went wrong.", "bad");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    ui.closeModal();
    document.getElementById("sidebar")?.classList.remove("is-open");
    const scrim = document.querySelector(".scrim");
    if (scrim) scrim.hidden = true;
  }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
  if (event.key === "/" && App.staff && !typing) {
    event.preventDefault();
    document.getElementById("global-search")?.focus();
  }
});

window.addEventListener("hashchange", () => {
  document.getElementById("sidebar")?.classList.remove("is-open");
  const scrim = document.querySelector(".scrim");
  if (scrim) scrim.hidden = true;
  const pop = document.getElementById("search-pop");
  if (pop) pop.hidden = true;
  route();
});

window.addEventListener("apex:logout", () => {
  App.staff = null;
  loginScreen();
});

setInterval(() => {
  const clock = document.querySelector("[data-clock]");
  if (clock) clock.textContent = fmt.clock();
}, 30000);

async function boot() {
  const saved = sessionStorage.getItem("apex_token");
  if (saved) {
    api.setToken(saved);
    try {
      App.staff = await api.me();
    } catch (_error) {
      api.clear();
      App.staff = null;
    }
  }
  if (!location.hash) location.hash = "#/";
  else await route();
}

boot();
