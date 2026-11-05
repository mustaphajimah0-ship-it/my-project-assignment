const crypto = require("crypto");
const dates = require("./dates");

const FIRST = [
  ["Akosua", "F"], ["Kwame", "M"], ["Abena", "F"], ["Yaw", "M"], ["Efua", "F"],
  ["Kofi", "M"], ["Ama", "F"], ["Kojo", "M"], ["Adwoa", "F"], ["Kwesi", "M"],
  ["Esi", "F"], ["Fiifi", "M"], ["Maame", "F"], ["Nana", "F"], ["Selorm", "M"],
  ["Dzifa", "F"], ["Nii", "M"], ["Akua", "F"], ["Adjoa", "F"], ["Elikem", "M"],
  ["Comfort", "F"], ["Joseph", "M"], ["Priscilla", "F"], ["Daniel", "M"],
  ["Linda", "F"], ["Samuel", "M"], ["Yaa", "F"], ["Kweku", "M"], ["Araba", "F"],
  ["Edem", "M"], ["Sena", "F"], ["Latid", "M"], ["Abla", "F"], ["Yoofi", "M"],
  ["Kuukua", "F"], ["Papa", "M"],
];

const LAST = [
  "Mensah", "Boateng", "Owusu", "Asante", "Adjei", "Darko", "Appiah", "Annan",
  "Quaye", "Sarpong", "Ofori", "Lartey", "Tetteh", "Boadu", "Osei", "Agbeko",
  "Hammond", "Coleman", "Nyarko", "Frimpong", "Addo", "Dogbe", "Arthur", "Manu",
  "Amenyo", "Quartey", "Dapaah", "Antwi", "Sackey", "Bonsu", "Gyan", "Opoku",
];

const AREAS = [
  "East Legon", "Cantonments", "Labone", "Osu", "Airport Residential", "Adenta",
  "Spintex", "Dzorwulu", "Roman Ridge", "Trasacco Valley", "Haatso", "Tesano",
  "North Ridge", "Ridge", "Abelemkpe",
];

const STREETS = ["Lagos", "Boundary", "Jungle", "Senchi", "Libreville", "Maseru", "Agbaamo", "Olusegun"];
const KINDS = ["Avenue", "Street", "Close", "Crescent"];
const COMPANIES = ["Ecobank Ghana", "Fan Milk", "MTN Ghana", "CalBank", "GOIL", "Tullow Ghana", "Fidelity Bank"];
const METHODS = ["momo", "card", "cash", "transfer", "telecel"];
const NOTES = [
  "Prefers early morning sessions and a quiet rack.",
  "Travels for work two weeks a month. Text before freezing.",
  "Training for the Accra Mile. Keep conditioning spots.",
  "Referred by a member of the quarterly cohort.",
  "Uses the recovery room after heavy lower days.",
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hue(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hashPin(pin, salt) {
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

function uid(db, key) {
  db.seq[key] += 1;
  return `${key}_${db.seq[key]}`;
}

function people(count) {
  const seen = new Set();
  const list = [];
  let i = 0;
  while (list.length < count && i < 800) {
    const [first, gender] = FIRST[i % FIRST.length];
    const last = LAST[(i * 5 + 3) % LAST.length];
    const key = `${first} ${last}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({ first, last, gender: gender === "F" ? "female" : "male" });
    }
    i += 1;
  }
  return list;
}

function phone(n) {
  const prefixes = [20, 24, 25, 26, 27, 50, 54, 55, 59];
  const prefix = prefixes[n % prefixes.length];
  const rest = String(1000000 + ((n * 7919) % 9000000)).padStart(7, "0");
  return `+233 ${prefix} ${rest.slice(0, 3)} ${rest.slice(3)}`;
}

function kindFor(index) {
  if (index >= 59) return "prospect";
  if (index >= 54) return "expired";
  if (index >= 50) return "frozen";
  if (index >= 45) return "expiring";
  return "active";
}

function planKeyFor(index, kind) {
  if (kind === "prospect") return null;
  const mix = ["monthly", "monthly", "monthly", "quarterly", "quarterly", "annual", "offpeak", "studio"];
  return mix[index % mix.length];
}

function cyclesBack(planKey, rand) {
  if (planKey === "annual") return rand() < 0.55 ? 1 : 0;
  if (planKey === "quarterly" || planKey === "studio") return Math.floor(rand() * 3);
  return Math.floor(rand() * 6);
}

function membershipWindow(today, plan, kind, rand) {
  if (kind === "expired") {
    const end = dates.addDays(today, -(3 + Math.floor(rand() * 36)));
    const start = dates.addDays(end, -(plan.durationDays - 1));
    const join = dates.addDays(start, -cyclesBack(plan.key, rand) * plan.durationDays);
    return { join, start, end };
  }
  if (kind === "expiring") {
    const end = dates.addDays(today, 1 + Math.floor(rand() * 6));
    const start = dates.addDays(end, -(plan.durationDays - 1));
    const join = dates.addDays(start, -cyclesBack(plan.key, rand) * plan.durationDays);
    return { join, start, end };
  }
  if (kind === "frozen") {
    const end = dates.addDays(today, 14 + Math.floor(rand() * 30));
    const start = dates.addDays(end, -(plan.durationDays - 1));
    const join = dates.addDays(start, -cyclesBack(plan.key, rand) * plan.durationDays);
    return {
      join,
      start,
      end,
      freezeFrom: today,
      freezeUntil: dates.addDays(today, 6 + Math.floor(rand() * 18)),
    };
  }
  const span = Math.max(8, plan.durationDays - 8);
  const daysLeft = 8 + Math.floor(rand() * (span - 7));
  const end = dates.addDays(today, daysLeft);
  const start = dates.addDays(end, -(plan.durationDays - 1));
  const join = dates.addDays(start, -cyclesBack(plan.key, rand) * plan.durationDays);
  return { join, start, end };
}

function pushPayment(db, invoice, method, atMinutes) {
  db.payments.push({
    id: uid(db, "payment"),
    number: `PAY-${10000 + db.seq.payment}`,
    invoiceId: invoice.id,
    memberId: invoice.memberId,
    amount: invoice.amount,
    method,
    reference: method === "momo" || method === "telecel" ? `MP${240000 + db.seq.payment}` : "",
    at: dates.atOn(invoice.paidAt, atMinutes),
    staffId: db.seq.payment % 4 === 0 ? "staff_1" : "staff_2",
  });
}

function pushInvoice(db, { member, plan, description, issuedAt, dueAt, status, start, end }) {
  const invoice = {
    id: uid(db, "invoice"),
    number: `APX-${24000 + db.seq.invoice}`,
    memberId: member.id,
    planId: plan.id,
    description: description || `${plan.name} · ${dates.formatLong(start)} – ${dates.formatLong(end)}`,
    amount: plan.price,
    status,
    source: "membership",
    issuedAt,
    dueAt,
    paidAt: status === "paid" ? issuedAt : null,
  };
  db.invoices.push(invoice);
  if (status === "paid") {
    pushPayment(db, invoice, METHODS[db.seq.invoice % METHODS.length], 9 * 60 + (db.seq.invoice % 40));
  }
  return invoice;
}

const CLASS_ROWS = [
  ["Strength Foundations", "strength", 0, "Studio A", 1, "05:30", 50, 16, "All levels"],
  ["Cycle Burn", "cycle", 4, "Cycle Loft", 1, "06:15", 45, 20, "All levels"],
  ["Desk HIIT", "conditioning", 1, "Studio B", 1, "12:10", 30, 18, "All levels"],
  ["Boxing Conditioning", "combat", 3, "The Ring", 1, "18:00", 50, 14, "Intermediate"],
  ["Yoga Restore", "mind", 2, "Studio A", 1, "19:15", 60, 18, "All levels"],
  ["Pilates Sculpt", "mind", 5, "Studio B", 2, "05:45", 50, 14, "All levels"],
  ["Barbell Strength", "strength", 0, "Studio A", 2, "06:30", 55, 12, "Intermediate"],
  ["Cycle Burn", "cycle", 4, "Cycle Loft", 2, "17:30", 45, 20, "All levels"],
  ["Athletic HIIT", "conditioning", 1, "Studio B", 2, "18:45", 40, 18, "Advanced"],
  ["Sunrise Mobility", "mind", 2, "Studio A", 3, "05:40", 45, 16, "All levels"],
  ["Strength Foundations", "strength", 0, "Studio A", 3, "06:30", 50, 16, "All levels"],
  ["Lunch HIIT", "conditioning", 1, "Studio B", 3, "12:10", 30, 18, "All levels"],
  ["Boxing Skills", "combat", 3, "The Ring", 3, "18:10", 50, 12, "All levels"],
  ["Yoga Restore", "mind", 2, "Studio A", 3, "19:20", 60, 18, "All levels"],
  ["Cycle Burn", "cycle", 4, "Cycle Loft", 4, "05:30", 45, 20, "All levels"],
  ["Pilates Sculpt", "mind", 5, "Studio B", 4, "06:20", 50, 14, "All levels"],
  ["Barbell Strength", "strength", 0, "Studio A", 4, "17:15", 55, 12, "Intermediate"],
  ["Athletic HIIT", "conditioning", 1, "Studio B", 4, "18:30", 40, 18, "All levels"],
  ["Strength Foundations", "strength", 0, "Studio A", 5, "05:30", 50, 16, "All levels"],
  ["Boxing Conditioning", "combat", 3, "The Ring", 5, "06:20", 45, 14, "Intermediate"],
  ["Cycle & Core", "cycle", 4, "Cycle Loft", 5, "12:05", 40, 20, "All levels"],
  ["Friday Night HIIT", "conditioning", 1, "Studio B", 5, "18:00", 45, 18, "All levels"],
  ["Weekend Long Ride", "cycle", 4, "Cycle Loft", 6, "07:00", 60, 20, "All levels"],
  ["Strength Foundations", "strength", 0, "Studio A", 6, "08:15", 50, 16, "All levels"],
  ["Yoga Restore", "mind", 2, "Studio A", 6, "09:30", 60, 18, "All levels"],
  ["Sunday Mobility", "mind", 5, "Studio B", 0, "08:00", 50, 16, "All levels"],
  ["Easy Cycle", "cycle", 4, "Cycle Loft", 0, "09:10", 40, 20, "All levels"],
];

function buildSeed() {
  const rand = mulberry32(20261105);
  const today = dates.todayISO();
  const db = {
    club: {
      name: "Apex Athletic Club",
      shortName: "Apex",
      tagline: "Strength, conditioning, and recovery in East Legon.",
      address: "14 Lagos Avenue, East Legon",
      city: "Accra",
      phone: "+233 30 276 4410",
      email: "desk@apexathletic.club",
      hours: "Mon–Fri 5:00–22:00 · Sat 6:00–20:00 · Sun 7:00–14:00",
      currency: "GHS",
    },
    seq: {
      staff: 0, member: 0, plan: 0, trainer: 0, class: 0,
      booking: 0, invoice: 0, payment: 0, checkin: 0, activity: 0,
    },
    staff: [],
    plans: [],
    trainers: [],
    members: [],
    classes: [],
    bookings: [],
    invoices: [],
    payments: [],
    checkins: [],
    activity: [],
    sessions: [],
  };

  const staffSeed = [
    ["Ama Mensah", "ama@apexathletic.club", "manager", "General manager", "2468"],
    ["Kojo Boateng", "kojo@apexathletic.club", "frontdesk", "Front desk lead", "1357"],
    ["Nadia Sule", "nadia@apexathletic.club", "trainer", "Head of coaching", "9081"],
  ];
  for (const [name, email, role, title, pin] of staffSeed) {
    const salt = `apex-${email}`;
    db.staff.push({
      id: uid(db, "staff"),
      name,
      email,
      role,
      title,
      active: true,
      pinSalt: salt,
      pinHash: hashPin(pin, salt),
    });
  }

  const planDefs = [
    ["day", "Day Pass", 80, 1, "full", null, true, "Full floor and studios for a single day."],
    ["offpeak", "Off-Peak", 290, 30, "offpeak", null, false, "Floor access every day until 4:00 PM."],
    ["monthly", "Apex Monthly", 520, 30, "full", null, false, "Unlimited floor and class access, renewed every 30 days."],
    ["quarterly", "Apex Quarterly", 1420, 90, "full", null, false, "Three months of unlimited access at the resident rate."],
    ["annual", "Apex Annual", 4800, 365, "full", null, false, "A full year of the house. The rate members stay for."],
    ["studio", "Studio 12", 480, 60, "classes", 12, false, "Twelve class bookings to use within 60 days. No floor access."],
  ];
  const plansByKey = {};
  for (const [key, name, price, durationDays, access, credits, dayPass, blurb] of planDefs) {
    const plan = {
      id: uid(db, "plan"),
      key,
      name,
      price,
      durationDays,
      access,
      credits,
      dayPass,
      blurb,
      active: true,
    };
    db.plans.push(plan);
    plansByKey[key] = plan;
  }

  const trainerDefs = [
    ["Nadia Sule", "Head of coaching", ["Strength", "Program design"], "Builds the house strength program and coaches the barbell hours.", "staff_3"],
    ["Malik Ibrahim", "Conditioning coach", ["HIIT", "Engine"], "Runs the lunch and evening conditioning blocks.", null],
    ["Lena Owusu", "Yoga & mobility", ["Yoga", "Mobility"], "Leads restore classes and the morning mobility hour.", null],
    ["Isaac Boateng", "Boxing coach", ["Boxing", "Conditioning"], "Teaches skills and conditioning rounds in The Ring.", null],
    ["Selasi Amesinu", "Cycle coach", ["Cycling", "Endurance"], "Holds the Cycle Loft schedule, including the weekend long ride.", null],
    ["Ruth Adom", "Pilates coach", ["Pilates", "Core"], "Coaches Pilates sculpt and Sunday mobility.", null],
  ];
  for (const [name, title, specialties, bio, staffId] of trainerDefs) {
    db.trainers.push({
      id: uid(db, "trainer"),
      name,
      title,
      specialties,
      bio,
      phone: phone(80 + db.trainers.length),
      email: `${name.split(" ")[0].toLowerCase()}@apexathletic.club`,
      status: "active",
      hue: hue(name),
      staffId,
    });
  }

  const roster = people(64);
  roster.forEach((person, index) => {
    const kind = kindFor(index);
    const plan = plansByKey[planKeyFor(index, kind)];
    const window = plan ? membershipWindow(today, plan, kind, rand) : null;
    const id = uid(db, "member");
    const full = `${person.first} ${person.last}`;
    const member = {
      id,
      memberNo: `APX-${10420 + db.seq.member}`,
      firstName: person.first,
      lastName: person.last,
      email: `${person.first}.${person.last}`.toLowerCase() + `@example.net`,
      phone: phone(index + 3),
      gender: person.gender,
      dateOfBirth: `${1976 + (index % 28)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
      address: `${1 + (index % 42)} ${STREETS[index % STREETS.length]} ${KINDS[index % KINDS.length]}, ${AREAS[index % AREAS.length]}`,
      company: index % 8 === 0 && kind !== "prospect" ? COMPANIES[index % COMPANIES.length] : "",
      emergencyName: `${FIRST[(index + 7) % FIRST.length][0]} ${person.last}`,
      emergencyPhone: phone(index + 120),
      notes: index % 11 === 0 ? NOTES[index % NOTES.length] : "",
      hue: hue(full),
      status: kind === "expiring" ? "active" : kind,
      planId: plan ? plan.id : null,
      trainerId: plan && index % 5 !== 0 ? db.trainers[index % db.trainers.length].id : null,
      startDate: window ? window.start : null,
      endDate: window ? window.end : null,
      joinDate: window ? window.join : dates.addDays(today, -(index % 5)),
      classCredits: plan && plan.access === "classes" ? plan.credits : 0,
      freeze: null,
      createdAt: dates.atOn(window ? window.join : dates.addDays(today, -(index % 5)), 8 * 60),
    };
    if (window && window.freezeFrom) {
      member.freeze = { from: window.freezeFrom, until: window.freezeUntil, anchorEnd: window.end };
      member.status = "frozen";
    }
    db.members.push(member);

    if (!plan || !window) {
      db.activity.push({
        id: uid(db, "activity"),
        memberId: member.id,
        staffId: "staff_2",
        at: member.createdAt,
        message: "Added as a prospect from the front desk.",
      });
      return;
    }

    let cursor = window.join;
    while (dates.daysBetween(cursor, window.start) >= plan.durationDays) {
      const periodEnd = dates.addDays(cursor, plan.durationDays - 1);
      pushInvoice(db, {
        member,
        plan,
        start: cursor,
        end: periodEnd,
        issuedAt: cursor,
        dueAt: cursor,
        status: "paid",
      });
      cursor = dates.addDays(cursor, plan.durationDays);
    }

    let currentStatus = "paid";
    if (kind === "active" || kind === "expiring") {
      const roll = rand();
      if (roll < 0.08) currentStatus = "overdue";
      else if (roll < 0.2) currentStatus = "open";
    }
    const monthStart = `${today.slice(0, 7)}-01`;
    const renewsThisMonth = currentStatus === "paid" && ["monthly", "offpeak", "studio"].includes(plan.key);
    const issuedAt = currentStatus === "overdue"
      ? dates.addDays(today, -12)
      : currentStatus === "open"
        ? today
        : renewsThisMonth
          ? monthStart
          : window.start;
    const dueAt = currentStatus === "overdue"
      ? dates.addDays(today, -8)
      : currentStatus === "open"
        ? dates.addDays(today, 5)
        : issuedAt;
    pushInvoice(db, {
      member,
      plan,
      start: window.start,
      end: window.end,
      issuedAt,
      dueAt,
      status: currentStatus,
    });

    db.activity.push({
      id: uid(db, "activity"),
      memberId: member.id,
      staffId: "staff_1",
      at: member.createdAt,
      message: `Joined on ${plan.name}.`,
    });
  });

  for (const row of CLASS_ROWS) {
    const [name, category, trainerIndex, room, dayOfWeek, startTime, durationMin, capacity, level] = row;
    db.classes.push({
      id: uid(db, "class"),
      name,
      category,
      trainerId: db.trainers[trainerIndex].id,
      room,
      dayOfWeek,
      startTime,
      durationMin,
      capacity,
      level,
      active: true,
    });
  }

  const weekStart = dates.startOfWeek(today);
  const dayLoad = new Map();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = dates.addDays(weekStart, offset);
    const dow = dates.weekday(date);
    for (const cls of db.classes.filter((item) => item.dayOfWeek === dow)) {
      let fill = date < today ? 0.62 + rand() * 0.3 : date === today ? 0.4 + rand() * 0.35 : 0.22 + rand() * 0.4;
      const seats = Math.min(cls.capacity, Math.max(2, Math.round(cls.capacity * fill)));
      const start = dates.timeToMinutes(cls.startTime);
      let placed = 0;
      let guard = 0;
      while (placed < seats && guard < seats * 8) {
        guard += 1;
        const member = db.members[Math.floor(rand() * db.members.length)];
        const plan = db.plans.find((item) => item.id === member.planId);
        if (!plan || member.status === "prospect") continue;
        if (member.joinDate > date || !member.endDate || member.endDate < date) continue;
        if (member.freeze && date >= member.freeze.from && date <= member.freeze.until) continue;
        if (plan.access === "offpeak" && start >= 16 * 60) continue;
        if (plan.access === "classes" && !(member.classCredits > 0)) continue;
        const loadKey = `${member.id}:${date}`;
        if ((dayLoad.get(loadKey) || 0) >= 2) continue;
        if (db.bookings.some((b) => b.memberId === member.id && b.classId === cls.id && b.date === date)) continue;
        const creditUsed = plan.access === "classes";
        if (creditUsed) member.classCredits -= 1;
        db.bookings.push({
          id: uid(db, "booking"),
          classId: cls.id,
          memberId: member.id,
          date,
          status: date < today ? "attended" : "booked",
          creditUsed,
          createdAt: dates.atOn(dates.addDays(date, -1), 14 * 60),
          staffId: "staff_2",
        });
        dayLoad.set(loadKey, (dayLoad.get(loadKey) || 0) + 1);
        placed += 1;
      }
    }
  }

  const now = dates.accraNow();
  for (let ago = 20; ago >= 0; ago -= 1) {
    const iso = dates.addDays(today, -ago);
    const target = 24 + Math.floor(rand() * 22);
    const used = new Set();
    let made = 0;
    let guard = 0;
    while (made < target && guard < target * 6) {
      guard += 1;
      const member = db.members[Math.floor(rand() * db.members.length)];
      if (used.has(member.id)) continue;
      const plan = db.plans.find((item) => item.id === member.planId);
      if (!plan || plan.access === "classes") continue;
      if (member.joinDate > iso || !member.endDate || member.endDate < iso) continue;
      if (member.freeze && iso >= member.freeze.from && iso <= member.freeze.until) continue;
      const offpeak = plan.access === "offpeak";
      const windows = offpeak
        ? [[5 * 60 + 20, 8 * 60 + 40], [11 * 60 + 20, 15 * 60 + 30]]
        : [[5 * 60 + 10, 8 * 60 + 50], [11 * 60 + 40, 13 * 60 + 30], [16 * 60 + 15, 20 * 60 + 30]];
      let minutes = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const window = windows[Math.floor(rand() * windows.length)];
        const candidate = window[0] + Math.floor(rand() * Math.max(1, window[1] - window[0]));
        if (iso === today && candidate > now.minutes - 3) continue;
        minutes = candidate;
        break;
      }
      if (minutes == null) continue;
      used.add(member.id);
      db.checkins.push({
        id: uid(db, "checkin"),
        memberId: member.id,
        staffId: rand() < 0.78 ? "staff_2" : "staff_1",
        at: dates.atOn(iso, minutes),
        date: iso,
        method: "desk",
      });
      made += 1;
    }
  }

  return db;
}

module.exports = { buildSeed, hashPin };
