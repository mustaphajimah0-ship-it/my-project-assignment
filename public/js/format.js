const fmt = (() => {
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function money(amount) {
    const value = Number(amount) || 0;
    return `GH₵ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function moneyShort(amount) {
    const value = Number(amount) || 0;
    if (Math.abs(value) >= 10000) return `GH₵ ${Math.round(value / 1000)}k`;
    if (Math.abs(value) >= 1000) return `GH₵ ${(value / 1000).toFixed(1)}k`;
    return money(value);
  }

  function date(iso) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "Africa/Accra",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${iso}T00:00:00Z`));
  }

  function dateShort(iso) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "Africa/Accra",
      day: "numeric",
      month: "short",
    }).format(new Date(`${iso}T00:00:00Z`));
  }

  function time(at) {
    if (!at) return "—";
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "Africa/Accra",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  }

  function clock(date = new Date()) {
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "Africa/Accra",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function weekday(iso, width = "short") {
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "Africa/Accra",
      weekday: width,
    }).format(new Date(`${iso}T00:00:00Z`));
  }

  function todayISO() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Accra",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDays(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function hour() {
    return Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Accra",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()));
  }

  function greeting(name) {
    const h = hour();
    const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return `${part}, ${(name || "there").split(" ")[0]}`;
  }

  function initials(first, last) {
    return `${(first || "?").slice(0, 1)}${(last || "").slice(0, 1)}`.toUpperCase();
  }

  const STATUS = {
    active: "Active",
    frozen: "Frozen",
    expired: "Expired",
    prospect: "Prospect",
    paid: "Paid",
    open: "Open",
    overdue: "Overdue",
    void: "Void",
    booked: "Booked",
    attended: "Attended",
    cancelled: "Cancelled",
    inactive: "Inactive",
  };

  const METHODS = {
    cash: "Cash",
    card: "Card",
    momo: "MTN MoMo",
    telecel: "Telecel Cash",
    transfer: "Bank transfer",
  };

  const ACCESS = {
    full: "Full house",
    offpeak: "Until 4:00 PM",
    classes: "Classes only",
  };

  const CATEGORY = {
    strength: "Strength",
    conditioning: "Conditioning",
    cycle: "Cycle",
    mind: "Mind & body",
    combat: "Combat",
  };

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function label(map, key) {
    return map[key] || key || "—";
  }

  function daysLeft(days) {
    if (days === null || days === undefined) return "No end date";
    if (days < 0) return `Ended ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
    if (days === 0) return "Ends today";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  }

  function clockTime(hhmm) {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const date = new Date(Date.UTC(2026, 0, 1, h, m));
    return new Intl.DateTimeFormat("en-GH", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  return {
    esc, money, moneyShort, date, dateShort, time, clock, weekday, todayISO, addDays,
    greeting, initials, daysLeft, clockTime, csvCell,
    status: (key) => label(STATUS, key),
    method: (key) => label(METHODS, key),
    access: (key) => label(ACCESS, key),
    category: (key) => label(CATEGORY, key),
    dayName: (index) => DAYS[index] || "",
    METHODS, CATEGORY, DAYS,
  };
})();
