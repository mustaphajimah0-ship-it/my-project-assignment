/** Calendar helpers pinned to Africa/Accra (UTC+0, no daylight saving). */

function parts(date = new Date()) {
  const bag = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Accra",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    minutes: Number(bag.hour) * 60 + Number(bag.minute),
    at: date.toISOString(),
  };
}

function accraNow() {
  return parts(new Date());
}

function todayISO() {
  return accraNow().iso;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function weekday(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function startOfWeek(iso) {
  const day = weekday(iso);
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}

function monthKey(iso) {
  return iso.slice(0, 7);
}

function addMonths(iso, count) {
  const [year, month] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function atOn(iso, minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

function isoFromInstant(at) {
  return parts(new Date(at)).iso;
}

function formatLong(iso) {
  return new Intl.DateTimeFormat("en-GH", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function formatTime(at) {
  return new Intl.DateTimeFormat("en-GH", {
    timeZone: "Africa/Accra",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

function formatMonth(key) {
  return new Intl.DateTimeFormat("en-GH", {
    timeZone: "Africa/Accra",
    month: "short",
  }).format(new Date(`${key}-01T00:00:00Z`));
}

function money(amount) {
  const value = Number(amount) || 0;
  return `GH₵ ${value.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function weekdayName(iso, width = "short") {
  return new Intl.DateTimeFormat("en-GH", {
    timeZone: "Africa/Accra",
    weekday: width,
  }).format(new Date(`${iso}T00:00:00Z`));
}

module.exports = {
  accraNow,
  todayISO,
  isDate,
  addDays,
  daysBetween,
  weekday,
  startOfWeek,
  monthKey,
  addMonths,
  timeToMinutes,
  isTime,
  atOn,
  isoFromInstant,
  formatLong,
  formatTime,
  formatMonth,
  money,
  weekdayName,
};
