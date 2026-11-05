const Pages = {
  async dashboard(ctx) {
    const data = await api.dashboard();
    if (!ctx.alive()) return;
    App.staff.alerts = data.alerts;
    const k = data.kpis;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">${fmt.esc(fmt.weekday(fmt.todayISO(), "long"))} · ${fmt.esc(data.club.city)}</p>
            <h1>${fmt.esc(fmt.greeting(App.staff.name))}</h1>
            <p class="lede">${k.onFloor} on the floor · ${k.expiringSoon} membership${k.expiringSoon === 1 ? "" : "s"} lapse within 7 days</p>
          </div>
          <div class="head-actions">
            <a class="btn" href="#/desk">Front desk</a>
            ${App.can("members") ? `<button class="btn btn-primary" type="button" data-action="new-member">New member</button>` : ""}
          </div>
        </header>
        <div class="kpi-grid">
          ${kpi("Active members", k.active, `${k.frozen} frozen · ${k.prospects} prospects`)}
          ${kpi("On the floor", k.onFloor, "Checked in today")}
          ${kpi("Collected", fmt.money(k.collectedThisMonth), "This month")}
          ${kpi("Outstanding", fmt.money(k.outstanding), `${k.overdueCount} overdue`)}
        </div>
        <div class="grid-2">
          <article class="card">
            <header class="card-head"><h2>Collections</h2><span>Last 6 months</span></header>
            ${ui.barChart(data.revenueByMonth.map((item) => ({ label: item.label, value: item.amount, current: item.current })))}
          </article>
          <article class="card">
            <header class="card-head"><h2>Today's sessions</h2><a href="#/schedule">Schedule</a></header>
            <div class="list">
              ${data.classesToday.map((cls) => `
                <a class="list-row" href="#/schedule">
                  <span>${fmt.esc(fmt.clockTime(cls.startTime))}</span>
                  <span><b>${fmt.esc(cls.name)}</b><small class="muted">${fmt.esc(cls.trainerName)} · ${fmt.esc(cls.room)}</small></span>
                  <span class="spots">${cls.booked}/${cls.capacity}</span>
                </a>`).join("") || `<p class="empty">No classes on today's timetable.</p>`}
            </div>
            ${data.quietClasses.length ? `<p class="hint">Still quiet: ${data.quietClasses.map((cls) => fmt.esc(cls.name)).join(", ")}.</p>` : ""}
          </article>
        </div>
        <div class="grid-2">
          <article class="card">
            <header class="card-head"><h2>Lapsing soon</h2><a href="#/members">Members</a></header>
            ${peopleRows(data.expiring, (member) => fmt.daysLeft(member.daysLeft)) || `<p class="empty">No memberships end in the next 7 days.</p>`}
          </article>
          <article class="card">
            <header class="card-head"><h2>Latest check-ins</h2><a href="#/desk">Desk</a></header>
            ${data.recentCheckins.map((item) => `
              <a class="list-row" href="#/members/${item.memberId}">
                ${avatar(item)}
                <span><b>${fmt.esc(item.memberName)}</b><small>${fmt.esc(item.planName || "Day visit")}</small></span>
                <span class="spots">${fmt.esc(fmt.time(item.at))}</span>
              </a>`).join("") || `<p class="empty">No one has checked in yet today.</p>`}
          </article>
        </div>
        ${data.overdue.length ? `
          <article class="card" style="margin-top:12px">
            <header class="card-head"><h2>Overdue accounts</h2><a href="#/billing">Billing</a></header>
            <div class="table-wrap"><table>
              <thead><tr><th>Member</th><th>Invoice</th><th class="money">Balance</th></tr></thead>
              <tbody>
                ${data.overdue.map((invoice) => `
                  <tr class="is-link" data-href="#/members/${invoice.memberId}">
                    <td>${fmt.esc(invoice.memberName)}</td>
                    <td>${fmt.esc(invoice.number)}</td>
                    <td class="money">${fmt.esc(fmt.money(invoice.balance))}</td>
                  </tr>`).join("")}
              </tbody>
            </table></div>
          </article>` : ""}
      </section>`;
    App.setActions({
      "new-member": () => openMemberForm(),
    });
  },

  async desk(ctx) {
    const floor = await api.checkins();
    if (!ctx.alive()) return;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page" data-page="desk">
        <header class="page-head">
          <div>
            <p class="eyebrow">Front desk</p>
            <h1>Check in</h1>
            <p class="lede">Search by name, phone, or member number. Press / to focus search from anywhere.</p>
          </div>
          ${App.can("members") ? `<button class="btn btn-primary" type="button" data-action="day-pass">Sell day pass</button>` : ""}
        </header>
        <div class="desk">
          <div class="card desk-main">
            <label class="search-lg"><input id="desk-q" placeholder="Name, phone, or member number" autocomplete="off"></label>
            <div id="desk-results"><p class="hint">The roster stays quiet until you search.</p></div>
          </div>
          <aside class="card floor">
            <header class="card-head"><h2>On the floor</h2><strong id="floor-count">${floor.count}</strong></header>
            <div id="floor-list">${floorHtml(floor)}</div>
          </aside>
        </div>
      </section>`;
    const input = document.getElementById("desk-q");
    input.focus();
    input.addEventListener("input", ui.debounce(async () => {
      const q = input.value.trim();
      const box = document.getElementById("desk-results");
      if (!box) return;
      if (q.length < 2) {
        box.innerHTML = `<p class="hint">The roster stays quiet until you search.</p>`;
        return;
      }
      const data = await api.members({ q });
      box.innerHTML = data.items.slice(0, 8).map(deskRow).join("") || `<p class="hint">No member matches “${fmt.esc(q)}”.</p>`;
    }, 180));
    App.setActions({
      "day-pass": openDayPass,
      "check-in": async (el) => {
        const name = el.dataset.name;
        try {
          await api.checkIn(el.dataset.id);
          ui.toast(`${name} is checked in.`);
          input.dispatchEvent(new Event("input"));
          await paintFloor();
        } catch (error) {
          ui.toast(error.message, error.code === "duplicate" ? "warn" : "bad");
          await paintFloor();
        }
      },
    });
    clearInterval(App.floorTimer);
    App.floorTimer = setInterval(paintFloor, 20000);
  },

  async members(ctx) {
    const [roster, plans] = await Promise.all([api.members(), api.plans()]);
    if (!ctx.alive()) return;
    let query = "";
    let status = "all";
    let planId = "";
    let page = 1;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">Roster</p>
            <h1>Members</h1>
            <p class="lede" id="member-count"></p>
          </div>
          <div class="head-actions">
            <button class="btn" type="button" data-action="export">Export</button>
            ${App.can("members") ? `<button class="btn btn-primary" type="button" data-action="new-member">New member</button>` : ""}
          </div>
        </header>
        <div class="filters">
          <input id="mq" placeholder="Search the roster" autocomplete="off">
          <select id="ms">
            <option value="all">All statuses</option>
            ${["active", "frozen", "expired", "prospect"].map((item) => `<option value="${item}">${fmt.status(item)}</option>`).join("")}
          </select>
          <select id="mp">
            <option value="">All plans</option>
            ${plans.items.filter((plan) => !plan.dayPass).map((plan) => `<option value="${fmt.esc(plan.id)}">${fmt.esc(plan.name)}</option>`).join("")}
          </select>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Membership</th><th class="money">Balance</th></tr></thead>
            <tbody id="member-body"></tbody>
          </table></div>
          <div class="pager" id="member-pager"></div>
        </div>
      </section>`;
    const filtered = () => roster.items.filter((member) => {
      if (status !== "all" && member.status !== status) return false;
      if (planId && member.planId !== planId) return false;
      if (!query) return true;
      const hay = `${member.name} ${member.email} ${member.memberNo} ${member.phone} ${member.company}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    const paint = () => {
      const rows = filtered();
      document.getElementById("member-count").textContent = `${rows.length} member${rows.length === 1 ? "" : "s"}`;
      const paged = pageOf(rows, page, 12);
      page = paged.current;
      document.getElementById("member-body").innerHTML = paged.rows.map((member) => `
        <tr class="is-link" data-href="#/members/${member.id}">
          <td>${who(member)}</td>
          <td>${fmt.esc(member.plan ? member.plan.name : "—")}</td>
          <td>${badge(member.status)}</td>
          <td>${member.endDate ? `${fmt.esc(fmt.date(member.endDate))}<br><small class="muted">${fmt.esc(fmt.daysLeft(member.daysLeft))}</small>` : "—"}</td>
          <td class="money">${member.balance ? fmt.esc(fmt.money(member.balance)) : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="5"><div class="empty"><h2>No members in this view</h2><p>Adjust the filters or add someone at the desk.</p></div></td></tr>`;
      document.getElementById("member-pager").innerHTML = pager(paged, "members-page");
    };
    paint();
    document.getElementById("mq").addEventListener("input", (event) => { query = event.target.value.trim(); page = 1; paint(); });
    document.getElementById("ms").addEventListener("change", (event) => { status = event.target.value; page = 1; paint(); });
    document.getElementById("mp").addEventListener("change", (event) => { planId = event.target.value; page = 1; paint(); });
    App.setActions({
      "new-member": () => openMemberForm(plans.items),
      export: () => downloadCsv(filtered()),
      "members-page": (el) => { page = Number(el.dataset.page); paint(); },
    });
  },

  async member(ctx, id) {
    const [member, plans, trainers] = await Promise.all([api.member(id), api.plans(), api.trainers()]);
    if (!ctx.alive()) return;
    const view = document.getElementById("view");
    const access = member.plan ? fmt.access(member.plan.access) : "No access";
    view.innerHTML = `
      <section class="page profile">
        <article class="card profile-hero">
          ${avatar(member, "lg")}
          <div class="profile-id">
            <p class="eyebrow">${fmt.esc(member.memberNo)}</p>
            <h1>${fmt.esc(member.name)}</h1>
            <div class="chips">
              ${badge(member.status)}
              <span class="badge">${fmt.esc(member.plan ? member.plan.name : "No plan")}</span>
              <span class="muted">${fmt.esc(member.status === "frozen" && member.freeze ? `Frozen through ${fmt.date(member.freeze.until)}` : member.endDate ? fmt.daysLeft(member.daysLeft) : access)}</span>
              ${member.plan && member.plan.access === "classes" ? `<span class="badge badge-info">${member.classCredits} class credits</span>` : ""}
            </div>
          </div>
          <div class="hero-actions">
            ${App.can("checkin") ? `<button class="btn btn-primary" type="button" data-action="check-in" ${member.checkedInAt ? "disabled" : ""}>${member.checkedInAt ? `In since ${fmt.esc(fmt.time(member.checkedInAt))}` : "Check in"}</button>` : ""}
            ${App.can("members") && member.status !== "frozen" ? `<button class="btn" type="button" data-action="renew">${member.status === "prospect" ? "Enroll" : member.status === "expired" ? "Restart" : "Renew"}</button>` : ""}
            ${App.can("members") && member.status === "active" ? `<button class="btn" type="button" data-action="freeze">Freeze</button>` : ""}
            ${App.can("members") && member.status === "frozen" ? `<button class="btn" type="button" data-action="unfreeze">Lift freeze</button>` : ""}
            ${App.can("members") ? `<button class="btn" type="button" data-action="edit">Edit</button>` : ""}
          </div>
        </article>
        <article class="card">
          <div class="tabs">
            <button type="button" class="is-on" data-action="tab" data-tab="overview">Overview</button>
            <button type="button" data-action="tab" data-tab="visits">Visits</button>
            <button type="button" data-action="tab" data-tab="billing">Billing</button>
            <button type="button" data-action="tab" data-tab="activity">Activity</button>
          </div>
          <div data-panel="overview">
            <dl class="dl">
              ${row("Phone", member.phone)}
              ${row("Email", member.email || "—")}
              ${row("Address", member.address || "—")}
              ${row("Company", member.company || "—")}
              ${row("Emergency", [member.emergencyName, member.emergencyPhone].filter(Boolean).join(" · ") || "—")}
              ${row("Coach", member.trainer ? member.trainer.name : "—")}
              ${row("Joined", fmt.date(member.joinDate))}
              ${row("Access", access)}
              ${row("Notes", member.notes || "—")}
            </dl>
          </div>
          <div data-panel="visits" hidden>
            ${member.checkins.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Door</th></tr></thead><tbody>
              ${member.checkins.map((item) => `<tr><td>${fmt.esc(fmt.date(item.date))} · ${fmt.esc(fmt.time(item.at))}</td><td>${item.method === "class" ? "Class" : "Front desk"}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="empty">No visits on record.</p>`}
            <h3 style="margin:8px 0">Classes</h3>
            ${member.bookings.length ? `<div class="table-wrap"><table><thead><tr><th>Session</th><th>When</th><th>Status</th></tr></thead><tbody>
              ${member.bookings.map((item) => `<tr><td>${fmt.esc(item.className)}<br><small class="muted">${fmt.esc(item.trainerName)}</small></td><td>${fmt.esc(fmt.date(item.date))} · ${fmt.esc(fmt.clockTime(item.startTime))}</td><td>${badge(item.status)}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="empty">No class bookings.</p>`}
          </div>
          <div data-panel="billing" hidden>
            <p class="lede" style="margin-bottom:8px">Balance ${fmt.esc(fmt.money(member.balance))}</p>
            ${invoiceTable(member.invoices, true)}
          </div>
          <div data-panel="activity" hidden>
            <ol class="timeline">
              ${member.activity.map((item) => `<li><time>${fmt.esc(fmt.date(item.at.slice(0, 10)))} · ${fmt.esc(fmt.time(item.at))}</time><p>${fmt.esc(item.message)}</p><small class="muted">${fmt.esc(item.staffName)}</small></li>`).join("") || `<p class="empty">No activity yet.</p>`}
            </ol>
          </div>
        </article>
      </section>`;
    App.setActions({
      tab: (el) => {
        document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== el.dataset.tab; });
        document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("is-on", tab === el));
      },
      "check-in": () => checkInMember(member),
      renew: () => openRenew(member, plans.items),
      freeze: () => openFreeze(member),
      unfreeze: async () => {
        await api.unfreeze(member.id);
        ui.toast("Freeze lifted.");
        await App.reload();
      },
      edit: () => openMemberForm(plans.items, member, trainers.items),
      "pay-invoice": (el) => openPay(member.invoices.find((invoice) => invoice.id === el.dataset.id)),
    });
  },

  async schedule(ctx) {
    if (!App.week) App.week = fmt.todayISO();
    const data = await api.schedule(App.week);
    if (!ctx.alive()) return;
    App.schedule = data;
    const trainers = App.can("manageClasses") ? await api.trainers() : { items: [] };
    const view = document.getElementById("view");
    const today = fmt.todayISO();
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">Studios</p>
            <h1>Schedule</h1>
            <p class="lede">${fmt.esc(fmt.date(data.weekStart))} – ${fmt.esc(fmt.date(data.weekEnd))}</p>
          </div>
          <div class="head-actions">
            <button class="btn" type="button" data-action="week" data-dir="-1">Previous</button>
            <button class="btn" type="button" data-action="this-week">This week</button>
            <button class="btn" type="button" data-action="week" data-dir="1">Next</button>
            ${App.can("manageClasses") ? `<button class="btn btn-primary" type="button" data-action="edit-class">Add class</button>` : ""}
          </div>
        </header>
        <div class="legend">
          ${Object.entries(fmt.CATEGORY).map(([key, label]) => `<span><i class="swatch" style="background:${catColor(key)}"></i>${label}</span>`).join("")}
        </div>
        <div class="week-scroll"><div class="week">
          ${data.days.map((day) => `
            <section class="day-col ${day.date === today ? "is-today" : ""}">
              <header><span>${fmt.esc(day.weekday)}</span><span>${fmt.esc(fmt.dateShort(day.date))}</span></header>
              ${day.classes.map((cls) => `
                <button type="button" class="class-card" data-cat="${fmt.esc(cls.category)}" data-action="open-class" data-id="${fmt.esc(cls.id)}" data-date="${fmt.esc(day.date)}">
                  <small>${fmt.esc(fmt.clockTime(cls.startTime))} · ${cls.durationMin}m</small>
                  <b>${fmt.esc(cls.name)}</b>
                  <small>${fmt.esc(cls.trainerName)}</small>
                  <div class="cap ${cls.spots === 0 ? "is-full" : ""}"><span style="width:${Math.min(100, Math.round((cls.booked / cls.capacity) * 100))}%"></span></div>
                  <small>${cls.booked}/${cls.capacity} · ${fmt.esc(cls.room)}</small>
                </button>`).join("") || `<p class="hint">House closed to classes.</p>`}
            </section>`).join("")}
        </div></div>
      </section>`;
    App.setActions({
      week: async (el) => {
        App.week = fmt.addDays(data.weekStart, Number(el.dataset.dir) * 7);
        await App.reload();
      },
      "this-week": async () => { App.week = fmt.todayISO(); await App.reload(); },
      "open-class": (el) => openClass(sessionBy(el.dataset.id, el.dataset.date), trainers.items),
      "edit-class": () => openClassForm(null, trainers.items),
    });
  },

  async trainers(ctx) {
    const data = await api.trainers();
    if (!ctx.alive()) return;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">Coaching</p>
            <h1>Coaches</h1>
            <p class="lede">The roster behind the timetable.</p>
          </div>
          ${App.can("manageTrainers") ? `<button class="btn btn-primary" type="button" data-action="edit-trainer">Add coach</button>` : ""}
        </header>
        <div class="coach-grid">
          ${data.items.map((trainer) => `
            <article class="card coach-card">
              <div class="who">${avatar(trainer)}<span><strong>${fmt.esc(trainer.name)}</strong><small>${fmt.esc(trainer.title)}</small></span></div>
              <p>${fmt.esc(trainer.bio || "Coach on the Apex roster.")}</p>
              <div class="chips">${(trainer.specialties || []).map((item) => `<span class="badge">${fmt.esc(item)}</span>`).join("")}</div>
              <small class="muted">${trainer.classCount} classes · ${trainer.memberCount} members</small>
              ${App.can("manageTrainers") ? `<button class="btn" type="button" data-action="edit-trainer" data-id="${fmt.esc(trainer.id)}">Edit</button>` : ""}
            </article>`).join("")}
        </div>
      </section>`;
    App.setActions({
      "edit-trainer": (el) => openTrainerForm(data.items.find((trainer) => trainer.id === el.dataset.id)),
    });
  },

  async billing(ctx) {
    const data = await api.invoices();
    if (!ctx.alive()) return;
    let query = "";
    let status = "outstanding";
    let page = 1;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">Accounts</p>
            <h1>Billing</h1>
            <p class="lede">Collected this month ${fmt.esc(fmt.money(data.collectedThisMonth))} · Outstanding ${fmt.esc(fmt.money(data.outstanding))}</p>
          </div>
          ${App.can("bill") ? `<button class="btn btn-primary" type="button" data-action="new-invoice">New charge</button>` : ""}
        </header>
        <div class="filters">
          <input id="bq" placeholder="Search invoices" autocomplete="off">
          <select id="bs">
            <option value="outstanding">Outstanding</option>
            <option value="overdue">Overdue</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="card"><div id="bill-table"></div><div class="pager" id="bill-pager"></div></div>
      </section>`;
    const filtered = () => data.items.filter((invoice) => {
      if (status === "outstanding" && invoice.status !== "open" && invoice.status !== "overdue") return false;
      if (status !== "outstanding" && status !== "all" && invoice.status !== status) return false;
      if (!query) return true;
      return `${invoice.number} ${invoice.memberName} ${invoice.memberNo} ${invoice.description}`.toLowerCase().includes(query.toLowerCase());
    });
    const paint = () => {
      const rows = filtered();
      const paged = pageOf(rows, page, 12);
      page = paged.current;
      document.getElementById("bill-table").innerHTML = invoiceTable(paged.rows, false);
      document.getElementById("bill-pager").innerHTML = pager(paged, "bill-page");
    };
    paint();
    document.getElementById("bq").addEventListener("input", (event) => { query = event.target.value.trim(); page = 1; paint(); });
    document.getElementById("bs").addEventListener("change", (event) => { status = event.target.value; page = 1; paint(); });
    App.setActions({
      "new-invoice": openInvoiceForm,
      "pay-invoice": (el) => openPay(data.items.find((invoice) => invoice.id === el.dataset.id)),
      "bill-page": (el) => { page = Number(el.dataset.page); paint(); },
    });
  },

  async plans(ctx) {
    const data = await api.plans();
    if (!ctx.alive()) return;
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">Memberships</p>
            <h1>Plans</h1>
            <p class="lede">What the house sells, and who it lets through the door.</p>
          </div>
          ${App.can("managePlans") ? `<button class="btn btn-primary" type="button" data-action="edit-plan">New plan</button>` : ""}
        </header>
        <div class="plan-grid">
          ${data.items.map((plan) => `
            <article class="card plan-card ${plan.active ? "" : "is-off"}">
              <div class="chips"><span class="badge">${fmt.esc(fmt.access(plan.access))}</span>${plan.active ? "" : `<span class="badge">Hidden</span>`}</div>
              <h2>${fmt.esc(plan.name)}</h2>
              <div class="price">${fmt.esc(fmt.money(plan.price))}</div>
              <p>${fmt.esc(plan.blurb || "")}</p>
              <small class="muted">${plan.durationDays} days${plan.credits ? ` · ${plan.credits} credits` : ""}</small>
              ${App.can("managePlans") && !plan.dayPass ? `<button class="btn" type="button" data-action="edit-plan" data-id="${fmt.esc(plan.id)}">Edit</button>` : ""}
            </article>`).join("")}
        </div>
      </section>`;
    App.setActions({
      "edit-plan": (el) => openPlanForm(data.items.find((plan) => plan.id === el.dataset.id)),
    });
  },

  async reports(ctx) {
    const data = await api.reports();
    if (!ctx.alive()) return;
    const maxMix = Math.max(...data.planMix.map((item) => item.count), 1);
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">House report</p>
            <h1>Performance</h1>
            <p class="lede">${data.visitsPerMember} visits per active member over the last 30 days.</p>
          </div>
        </header>
        <div class="stat-row">
          <div><strong>${data.newMembers.thisMonth}</strong><span class="muted">Joined this month</span></div>
          <div><strong>${data.newMembers.lastMonth}</strong><span class="muted">Joined last month</span></div>
          <div><strong>${fmt.esc(fmt.money(data.collectedThisMonth))}</strong><span class="muted">Collected</span></div>
          <div><strong>${fmt.esc(fmt.money(data.outstanding))}</strong><span class="muted">Outstanding</span></div>
        </div>
        <div class="grid-2">
          <article class="card">
            <header class="card-head"><h2>Collections</h2></header>
            ${ui.barChart(data.revenueByMonth.map((item) => ({ label: item.label, value: item.amount, current: item.current })))}
            <div class="table-wrap"><table>
              <tbody>${data.revenueByMonth.map((item) => `<tr><td>${fmt.esc(item.label)}</td><td class="money">${fmt.esc(fmt.money(item.amount))}</td></tr>`).join("")}</tbody>
            </table></div>
          </article>
          <article class="card">
            <header class="card-head"><h2>Check-ins</h2><span>14 days</span></header>
            ${ui.barChart(data.attendance.map((item) => ({ label: item.date.slice(8), value: item.count })), { money: false })}
            <h3 style="margin:12px 0 8px">By method, this month</h3>
            ${data.byMethod.map((item) => `<div class="list-row"><span>${fmt.esc(fmt.method(item.method))}</span><span></span><b>${fmt.esc(fmt.money(item.amount))}</b></div>`).join("") || `<p class="empty">No payments recorded this month.</p>`}
          </article>
        </div>
        <div class="grid-2">
          <article class="card">
            <header class="card-head"><h2>Membership mix</h2><span>Active and frozen</span></header>
            <div class="mix">
              ${data.planMix.map((item) => `
                <div class="mix-row"><span>${fmt.esc(item.name)}</span><div class="mix-bar"><span style="width:${Math.round((item.count / maxMix) * 100)}%"></span></div><b>${item.count}</b></div>
              `).join("") || `<p class="empty">No current memberships.</p>`}
            </div>
          </article>
          <article class="card">
            <header class="card-head"><h2>Lapsing within 14 days</h2></header>
            ${peopleRows(data.expiring, (member) => fmt.date(member.endDate)) || `<p class="empty">Nobody is inside the 14-day window.</p>`}
          </article>
        </div>
      </section>`;
    App.setActions({});
  },

  async club(ctx) {
    const [club, staff] = await Promise.all([api.club(), api.staff()]);
    if (!ctx.alive()) return;
    const locked = !App.can("manageClub");
    const view = document.getElementById("view");
    view.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <p class="eyebrow">House</p>
            <h1>Club profile</h1>
            <p class="lede">${locked ? "Only the general manager can change these details." : "These details appear across the desk and reports."}</p>
          </div>
        </header>
        <div class="grid-2">
          <article class="card">
            <form class="stack" data-action="save-club">
              <div class="form-grid">
                ${clubField("Name", "name", club.name, locked)}
                ${clubField("Short name", "shortName", club.shortName, locked)}
                ${clubField("Tagline", "tagline", club.tagline, locked, true)}
                ${clubField("Address", "address", club.address, locked, true)}
                ${clubField("City", "city", club.city, locked)}
                ${clubField("Phone", "phone", club.phone, locked)}
                ${clubField("Email", "email", club.email, locked)}
                ${clubField("Hours", "hours", club.hours, locked, true)}
              </div>
              ${locked ? "" : `<div class="modal-actions"><button class="btn btn-primary" type="submit">Save profile</button></div>`}
            </form>
          </article>
          <article class="card">
            <header class="card-head"><h2>Staff with console access</h2></header>
            ${staff.items.map((person) => `
              <div class="list-row">
                <span class="avatar" style="--h:18">${fmt.esc(fmt.initials(person.name.split(" ")[0], person.name.split(" ")[1] || ""))}</span>
                <span><b>${fmt.esc(person.name)}</b><small>${fmt.esc(person.title)} · ${fmt.esc(person.email)}</small></span>
                <span class="badge">${fmt.esc(person.role === "frontdesk" ? "Front desk" : person.role === "trainer" ? "Coach" : "Manager")}</span>
              </div>`).join("")}
          </article>
        </div>
      </section>`;
    App.setActions({
      "save-club": async (form) => {
        try {
          const clubNext = await api.updateClub(ui.form(form));
          ui.toast("Club profile saved.");
          App.paintClub(clubNext);
        } catch (error) {
          ui.formError(form, error.message);
        }
      },
    });
  },
};

function kpi(label, value, note) {
  return `<article class="kpi"><p>${fmt.esc(label)}</p><strong>${fmt.esc(value)}</strong><span>${fmt.esc(note)}</span></article>`;
}

function row(label, value) {
  return `<dt>${fmt.esc(label)}</dt><dd>${fmt.esc(value)}</dd>`;
}

function who(member) {
  return `<div class="who">${avatar(member)}<span><strong>${fmt.esc(member.name)}</strong><small>${fmt.esc(member.memberNo)} · ${fmt.esc(member.phone)}</small></span></div>`;
}

function peopleRows(members, aside) {
  if (!members.length) return "";
  return members.map((member) => `
    <a class="list-row" href="#/members/${member.id}">
      ${avatar(member)}
      <span><b>${fmt.esc(member.name)}</b><small>${fmt.esc(member.plan ? member.plan.name : "No plan")}</small></span>
      <span class="spots">${fmt.esc(aside(member))}</span>
    </a>`).join("");
}

function floorHtml(floor) {
  if (!floor.items.length) return `<p class="hint">The floor is empty.</p>`;
  return floor.items.map((item) => `
    <a class="floor-row" href="#/members/${item.memberId}">
      ${avatar(item)}
      <span><b>${fmt.esc(item.memberName)}</b><small>${fmt.esc(item.memberNo)} · ${fmt.esc(item.planName || "Visit")}</small></span>
      <span class="spots">${fmt.esc(fmt.time(item.at))}</span>
    </a>`).join("");
}

async function paintFloor() {
  if (!document.querySelector("[data-page=desk]")) return;
  const floor = await api.checkins();
  const list = document.getElementById("floor-list");
  const count = document.getElementById("floor-count");
  if (list) list.innerHTML = floorHtml(floor);
  if (count) count.textContent = String(floor.count);
}

function deskRow(member) {
  const inHouse = Boolean(member.checkedInAt);
  const action = App.can("checkin")
    ? `<button class="btn ${inHouse ? "" : "btn-primary"}" type="button" data-action="check-in" data-id="${fmt.esc(member.id)}" data-name="${fmt.esc(member.name)}" ${inHouse ? "disabled" : ""}>${inHouse ? `In since ${fmt.esc(fmt.time(member.checkedInAt))}` : "Check in"}</button>`
    : `<a class="btn" href="#/members/${member.id}">Open</a>`;
  return `<div class="desk-result">${who(member)}<div>${badge(member.status)} ${member.balance ? `<small class="muted"> · ${fmt.esc(fmt.money(member.balance))} outstanding</small>` : ""}</div>${action}</div>`;
}

function invoiceTable(invoices, compact) {
  if (!invoices.length) return `<p class="empty">No invoices in this view.</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${compact ? "" : "<th>Member</th>"}<th>Invoice</th><th>Issued</th><th>Status</th><th class="money">Balance</th><th></th></tr></thead>
    <tbody>
      ${invoices.map((invoice) => `
        <tr>
          ${compact ? "" : `<td><a href="#/members/${invoice.memberId}">${fmt.esc(invoice.memberName)}</a></td>`}
          <td>${fmt.esc(invoice.number)}<br><small class="muted">${fmt.esc(invoice.description)}</small></td>
          <td>${fmt.esc(fmt.date(invoice.issuedAt))}</td>
          <td>${badge(invoice.status)}</td>
          <td class="money">${invoice.balance ? fmt.esc(fmt.money(invoice.balance)) : "—"}</td>
          <td>${App.can("bill") && invoice.balance > 0 ? `<button class="btn" type="button" data-action="pay-invoice" data-id="${fmt.esc(invoice.id)}">Record payment</button>` : ""}</td>
        </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function pageOf(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(page, 1), pages);
  return { rows: rows.slice((current - 1) * size, current * size), pages, current, total: rows.length };
}

function pager(paged, action) {
  if (paged.total <= 12) return `<span>${paged.total} records</span><span></span>`;
  return `<span>${paged.total} records</span><span class="inline-actions">
    <button class="btn" type="button" data-action="${action}" data-page="${paged.current - 1}" ${paged.current === 1 ? "disabled" : ""}>Previous</button>
    <span>Page ${paged.current} of ${paged.pages}</span>
    <button class="btn" type="button" data-action="${action}" data-page="${paged.current + 1}" ${paged.current === paged.pages ? "disabled" : ""}>Next</button>
  </span>`;
}

function methodSelect() {
  return `<label class="field" data-pay><span>Method</span><select name="method">${Object.entries(fmt.METHODS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>`;
}

function catColor(key) {
  return { strength: "#c4512c", conditioning: "#1f6b4a", cycle: "#1d4e89", mind: "#6b4c9a", combat: "#8c3a3a" }[key] || "#1c1916";
}

function clubField(label, name, value, locked, wide) {
  return `<label class="field ${wide ? "wide" : ""}"><span>${label}</span><input name="${name}" value="${fmt.esc(value)}" ${locked ? "disabled" : ""}></label>`;
}

function downloadCsv(members) {
  const header = ["Member number", "First name", "Last name", "Phone", "Email", "Status", "Plan", "End date", "Balance"];
  const lines = [header, ...members.map((member) => [
    member.memberNo, member.firstName, member.lastName, member.phone, member.email,
    member.status, member.plan ? member.plan.name : "", member.endDate || "", member.balance,
  ])].map((cols) => cols.map(fmt.csvCell).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "apex-members.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function openMemberForm(knownPlans, member, trainers) {
  const plans = knownPlans || (await api.plans()).items;
  const editing = Boolean(member);
  ui.modal({
    title: editing ? "Edit profile" : "New member",
    subtitle: editing ? member.memberNo : "Prospects can be enrolled now or later.",
    wide: true,
    body: `
      <form class="stack" data-action="${editing ? "save-edit" : "save-member"}">
        <div class="form-grid">
          <label class="field"><span>First name</span><input name="firstName" required data-autofocus value="${fmt.esc(member?.firstName)}"></label>
          <label class="field"><span>Last name</span><input name="lastName" required value="${fmt.esc(member?.lastName)}"></label>
          <label class="field"><span>Phone</span><input name="phone" required value="${fmt.esc(member?.phone)}" placeholder="+233 24 000 0000"></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${fmt.esc(member?.email)}"></label>
          <label class="field"><span>Gender</span><select name="gender"><option value="">—</option>
            ${["female", "male", "other"].map((gender) => `<option value="${gender}" ${member?.gender === gender ? "selected" : ""}>${gender[0].toUpperCase()}${gender.slice(1)}</option>`).join("")}
          </select></label>
          <label class="field"><span>Date of birth</span><input type="date" name="dateOfBirth" value="${fmt.esc(member?.dateOfBirth)}"></label>
          <label class="field wide"><span>Address</span><input name="address" value="${fmt.esc(member?.address)}"></label>
          <label class="field"><span>Company</span><input name="company" value="${fmt.esc(member?.company)}"></label>
          <label class="field"><span>Emergency contact</span><input name="emergencyName" value="${fmt.esc(member?.emergencyName)}"></label>
          <label class="field"><span>Emergency phone</span><input name="emergencyPhone" value="${fmt.esc(member?.emergencyPhone)}"></label>
          <label class="field wide"><span>Notes</span><textarea name="notes">${fmt.esc(member?.notes)}</textarea></label>
          ${editing ? `<label class="field wide"><span>Coach</span><select name="trainerId"><option value="">No coach</option>
            ${(trainers || []).map((trainer) => `<option value="${fmt.esc(trainer.id)}" ${member.trainerId === trainer.id ? "selected" : ""}>${fmt.esc(trainer.name)}</option>`).join("")}
          </select></label>` : `
            <label class="field wide"><span>Membership</span><select name="planId"><option value="">Prospect — decide later</option>
              ${plans.filter((plan) => plan.active && !plan.dayPass).map((plan) => `<option value="${fmt.esc(plan.id)}">${fmt.esc(plan.name)} · ${fmt.esc(fmt.money(plan.price))}</option>`).join("")}
            </select></label>
            <p class="quote wide" data-quote hidden></p>
            <label class="check wide" data-pay hidden><input type="checkbox" name="collectPayment" checked> Collect payment now</label>
            <div data-pay hidden>${methodSelect()}</div>
            <label class="field wide" data-pay hidden><span>Reference</span><input name="reference" placeholder="Optional MoMo or transfer reference"></label>
          `}
        </div>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${editing ? "Save profile" : "Add member"}</button></div>
      </form>`,
  });
  const form = document.querySelector("#modal-root form");
  if (!editing) {
    const sync = () => {
      const plan = plans.find((item) => item.id === form.planId.value);
      form.querySelectorAll("[data-pay]").forEach((el) => { el.hidden = !plan; });
      const quote = form.querySelector("[data-quote]");
      if (!plan) { quote.hidden = true; return; }
      quote.hidden = false;
      const end = fmt.addDays(fmt.todayISO(), plan.durationDays - 1);
      quote.innerHTML = `Starts today, through <strong>${fmt.esc(fmt.date(end))}</strong> · ${fmt.esc(fmt.money(plan.price))}.`;
    };
    form.planId.addEventListener("change", sync);
  }
  const previous = App.actions;
  App.setActions({
    ...previous,
    "save-member": async (current) => {
      const data = ui.form(current);
      data.collectPayment = Boolean(current.collectPayment && current.collectPayment.checked && data.planId);
      if (!data.planId) delete data.planId;
      const button = current.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const created = await api.createMember(data);
        ui.closeModal();
        ui.toast(`${created.member.name} is on the roster.`);
        const next = `#/members/${created.member.id}`;
        if (location.hash === next) await App.reload();
        else location.hash = next;
      } catch (error) {
        ui.formError(current, error.message);
        button.disabled = false;
      }
    },
    "save-edit": async (current) => {
      const button = current.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await api.updateMember(member.id, ui.form(current));
        ui.closeModal();
        ui.toast("Profile saved.");
        await App.reload();
      } catch (error) {
        ui.formError(current, error.message);
        button.disabled = false;
      }
    },
  });
}

function openRenew(member, plans) {
  const choices = plans.filter((plan) => plan.active && !plan.dayPass);
  ui.modal({
    title: member.status === "prospect" ? "Enroll" : member.status === "expired" ? "Restart membership" : "Renew membership",
    subtitle: member.name,
    body: `
      <form class="stack" data-action="save-renew">
        <label class="field"><span>Plan</span><select name="planId">
          ${choices.map((plan) => `<option value="${fmt.esc(plan.id)}" ${plan.id === member.planId ? "selected" : ""}>${fmt.esc(plan.name)} · ${fmt.esc(fmt.money(plan.price))}</option>`).join("")}
        </select></label>
        <p class="quote" data-quote>Calculating the new end date…</p>
        <label class="check"><input type="checkbox" name="collectPayment" checked> Collect payment now</label>
        ${methodSelect()}
        <label class="field"><span>Reference</span><input name="reference"></label>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Confirm</button></div>
      </form>`,
  });
  const form = document.querySelector("#modal-root form");
  const paint = async () => {
    const quote = await api.quote(member.id, form.planId.value);
    form.querySelector("[data-quote]").innerHTML = `${quote.mode === "extend" ? "Extends" : "Runs"} through <strong>${fmt.esc(fmt.date(quote.endDate))}</strong> · ${fmt.esc(fmt.money(quote.amount))}.`;
  };
  form.planId.addEventListener("change", () => paint().catch((error) => ui.formError(form, error.message)));
  paint().catch((error) => ui.formError(form, error.message));
  App.setActions({
    ...App.actions,
    "save-renew": async (current) => {
      const data = ui.form(current);
      data.collectPayment = Boolean(current.collectPayment.checked);
      const button = current.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const result = await api.renew(member.id, data);
        ui.closeModal();
        ui.toast(`${member.firstName} is active through ${fmt.date(result.member.endDate)}.`);
        await App.reload();
      } catch (error) {
        ui.formError(current, error.message);
        button.disabled = false;
      }
    },
  });
}

function openFreeze(member) {
  const start = fmt.addDays(fmt.todayISO(), 14);
  ui.modal({
    title: "Freeze membership",
    subtitle: "The end date moves forward by the days actually paused.",
    body: `
      <form class="stack" data-action="save-freeze">
        <label class="field"><span>Frozen through</span><input type="date" name="until" required value="${start}" min="${fmt.addDays(fmt.todayISO(), 1)}" max="${fmt.addDays(fmt.todayISO(), 90)}"></label>
        <p class="muted">Freezes can run up to 90 days. ${fmt.esc(member.firstName)} cannot check in while the freeze is in force.</p>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Freeze</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-freeze": async (form) => {
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await api.freeze(member.id, ui.form(form).until);
        ui.closeModal();
        ui.toast("Membership frozen.");
        await App.reload();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

function openDayPass() {
  ui.modal({
    title: "Sell a day pass",
    subtitle: "Takes payment and checks the guest in.",
    body: `
      <form class="stack" data-action="save-pass">
        <div class="form-grid">
          <label class="field"><span>First name</span><input name="firstName" required data-autofocus></label>
          <label class="field"><span>Last name</span><input name="lastName" required></label>
          <label class="field wide"><span>Phone</span><input name="phone" required placeholder="+233 24 000 0000"></label>
          ${methodSelect()}
        </div>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Sell and check in</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-pass": async (form) => {
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const result = await api.dayPass(ui.form(form));
        ui.closeModal();
        ui.toast(`${result.member.name} has a day pass and is on the floor.`);
        await paintFloor();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

async function checkInMember(member) {
  try {
    await api.checkIn(member.id);
    ui.toast(`${member.firstName} is checked in.`);
    await App.reload();
  } catch (error) {
    ui.toast(error.message, error.code === "duplicate" ? "warn" : "bad");
  }
}

function sessionBy(classId, date) {
  const day = (App.schedule?.days || []).find((item) => item.date === date);
  return day && day.classes.find((cls) => cls.id === classId);
}

function openClass(cls, trainers) {
  if (!cls) return;
  const today = fmt.todayISO();
  ui.modal({
    title: cls.name,
    subtitle: `${fmt.clockTime(cls.startTime)} · ${fmt.date(cls.date)} · ${cls.room}`,
    wide: true,
    body: `
      <p class="muted">${fmt.esc(cls.trainerName)} · ${fmt.esc(cls.level)} · ${cls.booked}/${cls.capacity} booked</p>
      <div class="cap ${cls.spots === 0 ? "is-full" : ""}"><span style="width:${Math.min(100, Math.round((cls.booked / cls.capacity) * 100))}%"></span></div>
      <div class="roster">
        ${cls.bookings.map((booking) => `
          <div class="roster-row">
            <span><b>${fmt.esc(booking.memberName)}</b> <small class="muted">${fmt.esc(booking.memberNo)}</small> ${badge(booking.status)}</span>
            <span class="inline-actions">
              ${App.can("attend") && booking.status === "booked" && cls.date <= today ? `<button class="btn" type="button" data-action="attend" data-id="${fmt.esc(booking.id)}">Attended</button>` : ""}
              ${App.can("book") && booking.status === "booked" && cls.date >= today ? `<button class="btn btn-danger" type="button" data-action="cancel-booking" data-id="${fmt.esc(booking.id)}">Cancel</button>` : ""}
            </span>
          </div>`).join("") || `<p class="hint">No one is booked yet.</p>`}
      </div>
      ${App.can("book") && cls.spots > 0 && cls.date >= today ? `
        <label class="field" style="margin-top:12px"><span>Book a member</span><input id="book-q" placeholder="Search the roster" autocomplete="off"></label>
        <div id="book-hits"></div>` : ""}
      <div class="modal-actions">
        ${App.can("manageClasses") ? `<button class="btn" type="button" data-action="edit-session">Edit weekly class</button>` : ""}
        <button class="btn" type="button" data-action="close-modal">Close</button>
      </div>`,
  });
  const search = document.getElementById("book-q");
  if (search) {
    search.addEventListener("input", ui.debounce(async () => {
      const hits = document.getElementById("book-hits");
      if (!hits) return;
      const q = search.value.trim();
      if (q.length < 2) { hits.innerHTML = ""; return; }
      const result = await api.search(q);
      hits.innerHTML = result.items.map((item) => `
        <button type="button" class="search-hit" data-action="book-member" data-id="${fmt.esc(item.id)}">
          ${avatar(item)}<span><b>${fmt.esc(item.name)}</b><small>${fmt.esc(item.memberNo)} · ${fmt.esc(item.planName)} · ${fmt.esc(fmt.status(item.status))}</small></span>
        </button>`).join("") || `<p class="hint">No match.</p>`;
    }, 180));
  }
  App.setActions({
    ...App.actions,
    "book-member": async (el) => {
      try {
        await api.book({ classId: cls.id, memberId: el.dataset.id, date: cls.date });
        ui.toast("Booking confirmed.");
        await reopenClass(cls.id, cls.date, trainers);
      } catch (error) {
        ui.toast(error.message, "bad");
      }
    },
    attend: async (el) => {
      await api.attend(el.dataset.id);
      ui.toast("Attendance recorded.");
      await reopenClass(cls.id, cls.date, trainers);
    },
    "cancel-booking": async (el) => {
      await api.cancelBooking(el.dataset.id);
      ui.toast("Booking cancelled.");
      await reopenClass(cls.id, cls.date, trainers);
    },
    "edit-session": () => openClassForm(cls, trainers),
  });
}

async function reopenClass(classId, date, trainers) {
  const onSchedule = () => (location.hash || "#/") === "#/schedule";
  if (!onSchedule()) return;
  await Pages.schedule({ alive: onSchedule });
  if (!onSchedule()) return;
  const fresh = sessionBy(classId, date);
  if (fresh) openClass(fresh, trainers);
}

function openClassForm(cls, trainers) {
  const days = [1, 2, 3, 4, 5, 6, 0];
  ui.modal({
    title: cls ? "Edit class" : "Add class",
    subtitle: "This updates the weekly timetable, not a single date.",
    body: `
      <form class="stack" data-action="save-class">
        <div class="form-grid">
          <label class="field wide"><span>Name</span><input name="name" required data-autofocus value="${fmt.esc(cls?.name)}"></label>
          <label class="field"><span>Coach</span><select name="trainerId">${trainers.filter((trainer) => trainer.status === "active" || trainer.id === cls?.trainerId).map((trainer) => `<option value="${fmt.esc(trainer.id)}" ${trainer.id === cls?.trainerId ? "selected" : ""}>${fmt.esc(trainer.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Room</span><input name="room" required value="${fmt.esc(cls?.room || "Studio A")}"></label>
          <label class="field"><span>Day</span><select name="dayOfWeek">${days.map((day) => `<option value="${day}" ${Number(cls?.dayOfWeek) === day ? "selected" : ""}>${fmt.dayName(day)}</option>`).join("")}</select></label>
          <label class="field"><span>Start</span><input name="startTime" required placeholder="06:30" value="${fmt.esc(cls?.startTime || "06:30")}"></label>
          <label class="field"><span>Minutes</span><input name="durationMin" type="number" min="15" max="180" required value="${cls?.durationMin || 45}"></label>
          <label class="field"><span>Capacity</span><input name="capacity" type="number" min="1" max="80" required value="${cls?.capacity || 16}"></label>
          <label class="field"><span>Category</span><select name="category">${Object.entries(fmt.CATEGORY).map(([key, label]) => `<option value="${key}" ${cls?.category === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="field"><span>Level</span><input name="level" value="${fmt.esc(cls?.level || "All levels")}"></label>
          <label class="check wide"><input type="checkbox" name="active" ${cls?.active === false ? "" : "checked"}> On the timetable</label>
        </div>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save class</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-class": async (form) => {
      const data = ui.form(form);
      data.active = form.active.checked;
      data.dayOfWeek = Number(data.dayOfWeek);
      data.durationMin = Number(data.durationMin);
      data.capacity = Number(data.capacity);
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        if (cls) await api.updateClass(cls.id, data);
        else await api.createClass(data);
        ui.closeModal();
        ui.toast("Timetable updated.");
        await App.reload();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

function openTrainerForm(trainer) {
  ui.modal({
    title: trainer ? "Edit coach" : "Add coach",
    body: `
      <form class="stack" data-action="save-trainer">
        <div class="form-grid">
          <label class="field"><span>Name</span><input name="name" required data-autofocus value="${fmt.esc(trainer?.name)}"></label>
          <label class="field"><span>Title</span><input name="title" value="${fmt.esc(trainer?.title || "Coach")}"></label>
          <label class="field"><span>Phone</span><input name="phone" value="${fmt.esc(trainer?.phone)}"></label>
          <label class="field"><span>Email</span><input name="email" value="${fmt.esc(trainer?.email)}"></label>
          <label class="field wide"><span>Specialties</span><input name="specialties" value="${fmt.esc((trainer?.specialties || []).join(", "))}" placeholder="Strength, Mobility"></label>
          <label class="field wide"><span>Bio</span><textarea name="bio">${fmt.esc(trainer?.bio)}</textarea></label>
          <label class="field"><span>Status</span><select name="status"><option value="active">Active</option><option value="inactive" ${trainer?.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>
        </div>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save coach</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-trainer": async (form) => {
      const data = ui.form(form);
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        if (trainer) await api.updateTrainer(trainer.id, data);
        else await api.createTrainer(data);
        ui.closeModal();
        ui.toast("Coach saved.");
        await App.reload();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

function openPlanForm(plan) {
  ui.modal({
    title: plan ? "Edit plan" : "New plan",
    body: `
      <form class="stack" data-action="save-plan">
        <div class="form-grid">
          <label class="field wide"><span>Name</span><input name="name" required data-autofocus value="${fmt.esc(plan?.name)}"></label>
          <label class="field"><span>Price (GHS)</span><input name="price" type="number" min="0" step="1" required value="${plan?.price ?? 0}"></label>
          <label class="field"><span>Duration (days)</span><input name="durationDays" type="number" min="1" max="730" required value="${plan?.durationDays ?? 30}"></label>
          <label class="field"><span>Access</span><select name="access">
            <option value="full" ${plan?.access === "full" ? "selected" : ""}>Full house</option>
            <option value="offpeak" ${plan?.access === "offpeak" ? "selected" : ""}>Off-peak, until 4:00 PM</option>
            <option value="classes" ${plan?.access === "classes" ? "selected" : ""}>Class credits</option>
          </select></label>
          <label class="field"><span>Class credits</span><input name="credits" type="number" min="1" max="100" value="${plan?.credits || 8}"></label>
          <label class="field wide"><span>Description</span><textarea name="blurb">${fmt.esc(plan?.blurb)}</textarea></label>
          <label class="check wide"><input type="checkbox" name="active" ${plan?.active === false ? "" : "checked"}> Available to sell</label>
        </div>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save plan</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-plan": async (form) => {
      const data = ui.form(form);
      data.price = Number(data.price);
      data.durationDays = Number(data.durationDays);
      data.credits = Number(data.credits);
      data.active = form.active.checked;
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        if (plan) await api.updatePlan(plan.id, data);
        else await api.createPlan(data);
        ui.closeModal();
        ui.toast("Plan saved.");
        await App.reload();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

function openPay(invoice) {
  if (!invoice) return;
  ui.modal({
    title: "Record payment",
    subtitle: `${invoice.number} · ${invoice.memberName}`,
    body: `
      <form class="stack" data-action="save-pay">
        <p class="quote">Outstanding ${fmt.esc(fmt.money(invoice.balance))}. ${fmt.esc(invoice.description)}</p>
        <label class="field"><span>Amount</span><input name="amount" type="number" min="1" step="1" required value="${invoice.balance}"></label>
        ${methodSelect()}
        <label class="field"><span>Reference</span><input name="reference" placeholder="Optional"></label>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Record payment</button></div>
      </form>`,
  });
  App.setActions({
    ...App.actions,
    "save-pay": async (form) => {
      const data = ui.form(form);
      data.amount = Number(data.amount);
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await api.pay(invoice.id, data);
        ui.closeModal();
        ui.toast("Payment recorded.");
        await App.reload();
      } catch (error) {
        ui.formError(form, error.message);
        button.disabled = false;
      }
    },
  });
}

function openInvoiceForm() {
  ui.modal({
    title: "New charge",
    subtitle: "Private sessions, retail, or an adjustment.",
    body: `
      <form class="stack" data-action="save-invoice">
        <input type="hidden" name="memberId">
        <label class="field"><span>Member</span><input id="inv-q" placeholder="Search the roster" autocomplete="off"></label>
        <div id="inv-hits"></div>
        <p id="inv-picked" class="quote" hidden></p>
        <label class="field"><span>Description</span><input name="description" required placeholder="Private session · 60 min"></label>
        <label class="field"><span>Amount (GHS)</span><input name="amount" type="number" min="1" step="1" required></label>
        <label class="field"><span>Payment</span><select name="method"><option value="">Bill to account</option>${Object.entries(fmt.METHODS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
        <label class="field"><span>Reference</span><input name="reference"></label>
        <div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Create charge</button></div>
      </form>`,
  });
  const form = document.querySelector("#modal-root form");
  document.getElementById("inv-q").addEventListener("input", ui.debounce(async (event) => {
    const hits = document.getElementById("inv-hits");
    const q = event.target.value.trim();
    if (q.length < 2) { hits.innerHTML = ""; return; }
    const result = await api.search(q);
    hits.innerHTML = result.items.map((item) => `
      <button type="button" class="search-hit" data-action="pick-member" data-id="${fmt.esc(item.id)}" data-name="${fmt.esc(item.name)}">
        ${avatar(item)}<span><b>${fmt.esc(item.name)}</b><small>${fmt.esc(item.memberNo)}</small></span>
      </button>`).join("") || `<p class="hint">No match.</p>`;
  }, 180));
  App.setActions({
    ...App.actions,
    "pick-member": (el) => {
      form.memberId.value = el.dataset.id;
      const picked = document.getElementById("inv-picked");
      picked.hidden = false;
      picked.textContent = el.dataset.name;
      document.getElementById("inv-hits").innerHTML = "";
      document.getElementById("inv-q").value = "";
    },
    "save-invoice": async (current) => {
      const data = ui.form(current);
      if (!data.memberId) { ui.formError(current, "Choose a member."); return; }
      if (!data.method) delete data.method;
      data.amount = Number(data.amount);
      const button = current.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await api.createInvoice(data);
        ui.closeModal();
        ui.toast("Charge created.");
        await App.reload();
      } catch (error) {
        ui.formError(current, error.message);
        button.disabled = false;
      }
    },
  });
}
