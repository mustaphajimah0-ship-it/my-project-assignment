const ui = {
  toast(message, tone = "ok") {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = `toast is-${tone}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  },

  modal({ title, subtitle = "", body, wide = false }) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="modal-back" data-action="close-modal">
        <div class="modal ${wide ? "is-wide" : ""}" role="dialog" aria-modal="true" aria-label="${fmt.esc(title)}">
          <div class="modal-head">
            <div>
              <h2>${fmt.esc(title)}</h2>
              ${subtitle ? `<p>${fmt.esc(subtitle)}</p>` : ""}
            </div>
            <button class="icon-btn" type="button" data-action="close-modal" aria-label="Close">×</button>
          </div>
          ${body}
        </div>
      </div>`;
    const field = root.querySelector("[data-autofocus]");
    if (field) field.focus({ preventScroll: true });
  },

  closeModal() {
    document.getElementById("modal-root").innerHTML = "";
  },

  form(form) {
    return Object.fromEntries(new FormData(form).entries());
  },

  formError(form, message) {
    let el = form.querySelector(".form-error");
    if (!el) {
      el = document.createElement("p");
      el.className = "form-error";
      form.prepend(el);
    }
    el.textContent = message;
  },

  barChart(series, { money = true } = {}) {
    const width = 560;
    const height = 200;
    const padL = 52;
    const padB = 28;
    const padT = 12;
    const padR = 8;
    const max = Math.max(...series.map((item) => item.value), 1);
    const axis = (value) => (money ? fmt.moneyShort(value) : String(Math.round(value)));
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const gap = 10;
    const barW = (innerW - gap * Math.max(0, series.length - 1)) / Math.max(series.length, 1);
    const grid = [0, 0.5, 1].map((tick) => {
      const y = padT + innerH - tick * innerH;
      return `<line class="gridline" x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}"></line>
        <text class="chart-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${fmt.esc(axis(max * tick))}</text>`;
    }).join("");
    const bars = series.map((item, index) => {
      const barH = item.value > 0 ? Math.max(8, (item.value / max) * innerH) : 0;
      const x = padL + index * (barW + gap);
      const y = padT + innerH - barH;
      return `<rect class="bar ${item.current ? "is-current" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="5"></rect>
        <text class="chart-label" x="${(x + barW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle">${fmt.esc(item.label)}</text>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${grid}${bars}</svg>`;
  },

  icon(name) {
    const paths = {
      home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11V10.5"/>',
      desk: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
      people: '<circle cx="9" cy="9" r="3"/><path d="M4 19c.6-2.6 2.5-4 5-4s4.4 1.4 5 4"/><circle cx="17" cy="9" r="2.2"/><path d="M16 15.2c1.8.3 3.2 1.4 3.8 3.3"/>',
      calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>',
      coach: '<circle cx="12" cy="8" r="3"/><path d="M6 19c.8-3 2.8-4.5 6-4.5S17.2 16 18 19"/>',
      bill: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      plan: '<path d="M5 7h14M5 12h14M5 17h9"/>',
      chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15v-3M12 15V8M16 15v-5"/>',
      club: '<path d="M4 20V9l8-5 8 5v11"/><path d="M10 20v-6h4v6"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
  },

  debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },
};

function badge(status) {
  return `<span class="badge badge-${fmt.esc(status)}">${fmt.esc(fmt.status(status))}</span>`;
}

function avatar(person, size = "") {
  const hue = Number(person.hue) || 0;
  let letters = person.initials;
  if (!letters) {
    if (person.firstName || person.lastName) letters = fmt.initials(person.firstName, person.lastName);
    else {
      const parts = String(person.name || "?").trim().split(/\s+/);
      letters = fmt.initials(parts[0], parts[1] || "");
    }
  }
  return `<span class="avatar ${size}" style="--h:${hue}">${fmt.esc(letters)}</span>`;
}
