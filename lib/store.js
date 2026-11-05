const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const dates = require("./dates");
const { buildSeed, hashPin } = require("./seed");

const STORE_PATH = process.env.STORE_PATH || path.join(__dirname, "..", "data", "store.json");

const PERMS = {
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

class DomainError extends Error {
  constructor(message, status = 400, code = "invalid") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let cache = null;

function uid(db, key) {
  db.seq[key] = (db.seq[key] || 0) + 1;
  return `${key}_${db.seq[key]}`;
}

function save(db) {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function load() {
  if (cache) return cache;
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    cache = buildSeed();
    save(cache);
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (error) {
    throw new Error("Apex data file could not be read. Remove data/store.json and restart.");
  }
  return cache;
}

function remaining(db, invoice) {
  const paid = db.payments
    .filter((payment) => payment.invoiceId === invoice.id)
    .reduce((sum, payment) => sum + payment.amount, 0);
  return Math.max(0, invoice.amount - paid);
}

function paidAmount(db, invoice) {
  return invoice.amount - remaining(db, invoice);
}

function memberBalance(db, memberId) {
  return db.invoices
    .filter((invoice) => invoice.memberId === memberId && invoice.status !== "void" && invoice.status !== "paid")
    .reduce((sum, invoice) => sum + remaining(db, invoice), 0);
}

function log(db, memberId, staffId, message) {
  db.activity.push({
    id: uid(db, "activity"),
    memberId,
    staffId: staffId || null,
    at: new Date().toISOString(),
    message,
  });
}

function liftFreeze(db, member, onDate, staffId, message) {
  if (!member.freeze) return false;
  const paused = Math.max(0, dates.daysBetween(member.freeze.from, onDate));
  member.endDate = dates.addDays(member.freeze.anchorEnd, paused);
  member.freeze = null;
  const today = dates.todayISO();
  member.status = member.endDate < today ? "expired" : "active";
  log(db, member.id, staffId, message || (paused
    ? `Freeze lifted. ${paused} paused day${paused === 1 ? "" : "s"} added to the membership.`
    : "Freeze lifted."));
  return true;
}

function recheck(db) {
  const today = dates.todayISO();
  let changed = false;
  for (const member of db.members) {
    if (member.status === "frozen" && member.freeze && member.freeze.until < today) {
      liftFreeze(
        db,
        member,
        dates.addDays(member.freeze.until, 1),
        null,
        "Freeze ended and the membership resumed."
      );
      changed = true;
    } else if (member.status === "active" && member.endDate && member.endDate < today) {
      member.status = "expired";
      changed = true;
    }
  }
  for (const invoice of db.invoices) {
    if (invoice.status === "void" || invoice.status === "paid") continue;
    const balance = remaining(db, invoice);
    const next = balance <= 0 ? "paid" : invoice.dueAt < today ? "overdue" : "open";
    if (next !== invoice.status) {
      invoice.status = next;
      if (next === "paid" && !invoice.paidAt) invoice.paidAt = today;
      changed = true;
    }
  }
  const now = Date.now();
  const sessions = db.sessions.filter((session) => now - session.createdAt < 12 * 60 * 60 * 1000);
  if (sessions.length !== db.sessions.length) {
    db.sessions = sessions;
    changed = true;
  }
  return changed;
}

function read() {
  const db = load();
  if (recheck(db)) save(db);
  return db;
}

function withDb(fn) {
  const db = load();
  recheck(db);
  const snapshot = structuredClone(db);
  try {
    const result = fn(db);
    save(db);
    return result;
  } catch (error) {
    cache = snapshot;
    save(cache);
    throw error;
  }
}

function str(value, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function emailOk(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneOk(value) {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

function assertDate(value, label) {
  if (!dates.isDate(value)) throw new DomainError(`${label} must be a valid date.`);
}

function publicStaff(staff) {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    title: staff.title,
    active: staff.active,
  };
}

function permit(staff, perm) {
  return Boolean(staff && staff.active && (PERMS[perm] || []).includes(staff.role));
}

function requirePerm(staff, perm) {
  if (!permit(staff, perm)) throw new DomainError("Your role cannot do that.", 403, "forbidden");
}

function findPlan(db, id) {
  return db.plans.find((plan) => plan.id === id) || null;
}

function memberView(db, member) {
  const plan = findPlan(db, member.planId);
  const trainer = db.trainers.find((item) => item.id === member.trainerId) || null;
  const today = dates.todayISO();
  const checkin = db.checkins.find((item) => item.memberId === member.id && item.date === today);
  return {
    ...member,
    name: `${member.firstName} ${member.lastName}`,
    plan: plan ? publicPlan(plan) : null,
    trainer: trainer ? publicTrainer(trainer) : null,
    daysLeft: member.endDate ? dates.daysBetween(today, member.endDate) : null,
    checkedInAt: checkin ? checkin.at : null,
    balance: memberBalance(db, member.id),
  };
}

function publicPlan(plan) {
  const { id, key, name, price, durationDays, access, credits, dayPass, blurb, active } = plan;
  return { id, key, name, price, durationDays, access, credits, dayPass, blurb, active };
}

function publicTrainer(trainer) {
  const { id, name, title, specialties, bio, phone, email, status, hue, staffId } = trainer;
  return { id, name, title, specialties, bio, phone, email, status, hue, staffId };
}

function invoiceView(db, invoice) {
  const member = db.members.find((item) => item.id === invoice.memberId);
  const plan = findPlan(db, invoice.planId);
  const paid = paidAmount(db, invoice);
  return {
    ...invoice,
    memberName: member ? `${member.firstName} ${member.lastName}` : "Unknown",
    memberNo: member ? member.memberNo : "",
    planName: plan ? plan.name : "",
    paid,
    balance: Math.max(0, invoice.amount - paid),
    payments: db.payments
      .filter((payment) => payment.invoiceId === invoice.id)
      .sort((a, b) => a.at.localeCompare(b.at)),
  };
}

function alerts(db) {
  const today = dates.todayISO();
  const soon = dates.addDays(today, 7);
  return {
    overdue: db.invoices.filter((invoice) => invoice.status === "overdue").length,
    expiring: db.members.filter((member) => (
      member.status === "active" && member.endDate && member.endDate >= today && member.endDate <= soon
    )).length,
  };
}

function pinsMatch(pin, staff) {
  const got = Buffer.from(hashPin(String(pin ?? ""), staff.pinSalt), "hex");
  const expected = Buffer.from(staff.pinHash, "hex");
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(got, expected);
}

function authenticate(email, pin) {
  const db = read();
  const needle = str(email, 120).toLowerCase();
  const staff = db.staff.find((item) => item.email === needle && item.active);
  if (!staff || !pinsMatch(pin, staff)) return null;
  return publicStaff(staff);
}

function createSession(staffId) {
  return withDb((db) => {
    const staff = db.staff.find((item) => item.id === staffId && item.active);
    if (!staff) throw new DomainError("Staff profile not found.", 401, "auth");
    const token = crypto.randomBytes(24).toString("hex");
    db.sessions.push({ token, staffId, createdAt: Date.now() });
    return token;
  });
}

function staffFromToken(token) {
  if (!token) return null;
  const db = read();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const staff = db.staff.find((item) => item.id === session.staffId && item.active);
  return staff ? publicStaff(staff) : null;
}

function destroySession(token) {
  withDb((db) => {
    db.sessions = db.sessions.filter((session) => session.token !== token);
  });
}

function me(staff) {
  const db = read();
  return { ...staff, alerts: alerts(db) };
}

function evaluateAccess(db, member, now) {
  if (!member) return { ok: false, code: "missing", reason: "Member not found." };
  if (member.status === "prospect" || !member.planId) {
    return { ok: false, code: "prospect", reason: "This person is a prospect and does not have floor access yet." };
  }
  if (member.status === "frozen") {
    const until = member.freeze && member.freeze.until;
    return {
      ok: false,
      code: "frozen",
      reason: until ? `Membership is frozen through ${dates.formatLong(until)}.` : "Membership is frozen.",
    };
  }
  if (member.startDate && member.startDate > now.iso) {
    return { ok: false, code: "notstarted", reason: `Membership starts on ${dates.formatLong(member.startDate)}.` };
  }
  if (member.status === "expired" || (member.endDate && member.endDate < now.iso)) {
    return {
      ok: false,
      code: "expired",
      reason: member.endDate ? `Membership ended on ${dates.formatLong(member.endDate)}.` : "Membership has ended.",
    };
  }
  const plan = findPlan(db, member.planId);
  if (!plan) return { ok: false, code: "plan", reason: "Membership plan is missing." };
  if (plan.access === "classes") {
    return { ok: false, code: "classes", reason: `${plan.name} covers class bookings only. Book a session from the schedule.` };
  }
  if (plan.access === "offpeak" && now.minutes >= 16 * 60) {
    return { ok: false, code: "offpeak", reason: "Off-Peak memberships include the floor until 4:00 PM." };
  }
  return { ok: true, code: "ok", plan };
}

function listMembers(filters = {}) {
  const db = read();
  const q = str(filters.q, 80).toLowerCase();
  const digits = phoneDigits(q);
  let rows = db.members.slice();
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((member) => member.status === filters.status);
  }
  if (filters.planId) rows = rows.filter((member) => member.planId === filters.planId);
  if (q) {
    rows = rows.filter((member) => {
      const hay = `${member.firstName} ${member.lastName} ${member.email} ${member.memberNo} ${member.company}`.toLowerCase();
      return hay.includes(q) || (digits.length >= 3 && phoneDigits(member.phone).includes(digits));
    });
  }
  rows.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  return rows.map((member) => memberView(db, member));
}

function getMember(id) {
  const db = read();
  const member = db.members.find((item) => item.id === id);
  if (!member) throw new DomainError("Member not found.", 404, "notfound");
  const invoices = db.invoices
    .filter((invoice) => invoice.memberId === id)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number))
    .map((invoice) => invoiceView(db, invoice));
  const checkins = db.checkins
    .filter((item) => item.memberId === id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 80);
  const bookings = db.bookings
    .filter((item) => item.memberId === id && item.status !== "cancelled")
    .map((booking) => decorateBooking(db, booking))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.startTime).localeCompare(String(a.startTime)))
    .slice(0, 40);
  const activity = db.activity
    .filter((item) => item.memberId === id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40)
    .map((item) => ({
      ...item,
      staffName: (db.staff.find((staff) => staff.id === item.staffId) || {}).name || "System",
    }));
  return { ...memberView(db, member), invoices, checkins, bookings, activity };
}

function duplicateContact(db, { phone, email }, exceptId) {
  const digits = phoneDigits(phone);
  if (digits && db.members.some((member) => member.id !== exceptId && phoneDigits(member.phone) === digits)) {
    throw new DomainError("A member with this phone number already exists.");
  }
  const mail = str(email, 120).toLowerCase();
  if (mail && db.members.some((member) => member.id !== exceptId && member.email.toLowerCase() === mail)) {
    throw new DomainError("A member with this email already exists.");
  }
}

function applyContact(member, input, db) {
  const firstName = str(input.firstName, 60);
  const lastName = str(input.lastName, 60);
  const phone = str(input.phone, 40);
  const email = str(input.email, 120).toLowerCase();
  if (!firstName || !lastName) throw new DomainError("First and last name are required.");
  if (!phoneOk(phone)) throw new DomainError("Enter a phone number with the country code.");
  if (!emailOk(email)) throw new DomainError("Enter a valid email or leave it blank.");
  duplicateContact(db, { phone, email }, member.id);
  member.firstName = firstName;
  member.lastName = lastName;
  member.phone = phone;
  member.email = email;
  member.gender = ["female", "male", "other", ""].includes(input.gender) ? input.gender : member.gender || "";
  if (input.dateOfBirth) {
    assertDate(input.dateOfBirth, "Date of birth");
    member.dateOfBirth = input.dateOfBirth;
  }
  member.address = str(input.address, 180);
  member.company = str(input.company, 80);
  member.emergencyName = str(input.emergencyName, 80);
  member.emergencyPhone = str(input.emergencyPhone, 40);
  if (member.emergencyPhone && !phoneOk(member.emergencyPhone)) {
    throw new DomainError("Emergency phone should include the country code, or be left blank.");
  }
  member.notes = str(input.notes, 2000);
  if (input.trainerId) {
    const trainer = db.trainers.find((item) => item.id === input.trainerId);
    if (!trainer) throw new DomainError("Choose a coach on the roster.");
    member.trainerId = trainer.id;
  } else if (input.trainerId === "" || input.trainerId === null) {
    member.trainerId = null;
  }
}

function issueInvoice(db, { member, plan, description, amount, source, issuedAt, dueAt, status, method, reference, staffId }) {
  const invoice = {
    id: uid(db, "invoice"),
    number: `APX-${24000 + db.seq.invoice}`,
    memberId: member.id,
    planId: plan ? plan.id : null,
    description: str(description, 180),
    amount: Number(amount),
    status,
    source: source || "manual",
    issuedAt,
    dueAt,
    paidAt: status === "paid" ? issuedAt : null,
  };
  if (!invoice.description) throw new DomainError("Describe the charge.");
  if (!Number.isFinite(invoice.amount) || invoice.amount < 0 || invoice.amount > 100000) {
    throw new DomainError("Enter an amount in cedis.");
  }
  db.invoices.push(invoice);
  if (status === "paid" && invoice.amount > 0) {
    recordPayment(db, invoice, { amount: invoice.amount, method, reference, staffId, at: dates.atOn(issuedAt, dates.accraNow().minutes) });
  }
  return invoice;
}

function recordPayment(db, invoice, { amount, method, reference, staffId, at }) {
  const methods = ["cash", "card", "momo", "telecel", "transfer"];
  if (!methods.includes(method)) throw new DomainError("Choose a payment method.");
  const value = Number(amount);
  const balance = remaining(db, invoice);
  if (!Number.isFinite(value) || value <= 0) throw new DomainError("Enter the amount received.");
  if (value - balance > 0.001) throw new DomainError(`Only ${dates.money(balance)} is still outstanding.`);
  const payment = {
    id: uid(db, "payment"),
    number: `PAY-${10000 + db.seq.payment}`,
    invoiceId: invoice.id,
    memberId: invoice.memberId,
    amount: value,
    method,
    reference: str(reference, 60),
    at: at || new Date().toISOString(),
    staffId: staffId || null,
  };
  db.payments.push(payment);
  if (remaining(db, invoice) <= 0) {
    invoice.status = "paid";
    invoice.paidAt = dates.isoFromInstant(payment.at);
  }
  return payment;
}

function quoteMembership(member, plan, today = dates.todayISO()) {
  let endDate;
  let mode;
  if (member && member.endDate && member.endDate >= today && member.status !== "prospect" && member.status !== "expired") {
    endDate = dates.addDays(member.endDate, plan.durationDays);
    mode = "extend";
  } else {
    endDate = dates.addDays(today, plan.durationDays - 1);
    mode = "start";
  }
  return {
    amount: plan.price,
    endDate,
    mode,
    description: `${plan.name} · through ${dates.formatLong(endDate)}`,
  };
}

function applyMembership(db, member, plan, { method, reference, collectPayment, staffId }) {
  const today = dates.todayISO();
  const quote = quoteMembership(member, plan, today);
  if (quote.mode === "start") member.startDate = today;
  member.endDate = quote.endDate;
  member.planId = plan.id;
  member.status = "active";
  member.freeze = null;
  if (plan.access === "classes") member.classCredits = (member.classCredits || 0) + (plan.credits || 0);
  const payNow = collectPayment !== false && plan.price > 0;
  const invoice = issueInvoice(db, {
    member,
    plan,
    description: quote.description,
    amount: plan.price,
    source: "membership",
    issuedAt: today,
    dueAt: payNow ? today : dates.addDays(today, 3),
    status: payNow || plan.price === 0 ? "paid" : "open",
    method: payNow ? method : "cash",
    reference,
    staffId,
  });
  return { quote, invoice };
}

function createMember(input, staffId) {
  return withDb((db) => {
    const member = {
      id: uid(db, "member"),
      memberNo: `APX-${10420 + db.seq.member}`,
      gender: "",
      hue: 0,
      status: "prospect",
      planId: null,
      trainerId: null,
      startDate: null,
      endDate: null,
      joinDate: dates.todayISO(),
      classCredits: 0,
      freeze: null,
      createdAt: new Date().toISOString(),
      notes: "",
      company: "",
      address: "",
      emergencyName: "",
      emergencyPhone: "",
      email: "",
      dateOfBirth: "",
    };
    applyContact(member, input, db);
    member.hue = hueOf(`${member.firstName} ${member.lastName}`);
    db.members.push(member);
    let invoice = null;
    if (input.planId) {
      const plan = db.plans.find((item) => item.id === input.planId && item.active);
      if (!plan) throw new DomainError("Choose an active membership.");
      if (plan.dayPass) throw new DomainError("Sell a day pass from the front desk.");
      const result = applyMembership(db, member, plan, {
        method: input.method,
        reference: input.reference,
        collectPayment: input.collectPayment !== false && input.collectPayment !== "false",
        staffId,
      });
      invoice = result.invoice;
      log(db, member.id, staffId, `Enrolled on ${plan.name} through ${dates.formatLong(member.endDate)}.`);
    } else {
      log(db, member.id, staffId, "Added as a prospect.");
    }
    return { member: memberView(db, member), invoice: invoice ? invoiceView(db, invoice) : null };
  });
}

function hueOf(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h % 360;
}

function updateMember(id, input) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === id);
    if (!member) throw new DomainError("Member not found.", 404, "notfound");
    const merged = {
      firstName: input.firstName ?? member.firstName,
      lastName: input.lastName ?? member.lastName,
      phone: input.phone ?? member.phone,
      email: input.email ?? member.email,
      gender: input.gender ?? member.gender,
      dateOfBirth: input.dateOfBirth ?? member.dateOfBirth,
      address: input.address ?? member.address,
      company: input.company ?? member.company,
      emergencyName: input.emergencyName ?? member.emergencyName,
      emergencyPhone: input.emergencyPhone ?? member.emergencyPhone,
      notes: input.notes ?? member.notes,
      trainerId: input.trainerId === undefined ? member.trainerId : input.trainerId,
    };
    applyContact(member, merged, db);
    return memberView(db, member);
  });
}

function renewMembership(id, input, staffId) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === id);
    if (!member) throw new DomainError("Member not found.", 404, "notfound");
    if (member.status === "frozen") throw new DomainError("Lift the freeze before renewing.");
    const plan = db.plans.find((item) => item.id === input.planId && item.active && !item.dayPass);
    if (!plan) throw new DomainError("Choose an active membership.");
    const before = member.endDate;
    const result = applyMembership(db, member, plan, {
      method: input.method,
      reference: input.reference,
      collectPayment: input.collectPayment !== false && input.collectPayment !== "false",
      staffId,
    });
    const verb = before && before >= dates.todayISO() ? "Extended" : "Started";
    log(db, member.id, staffId, `${verb} ${plan.name} through ${dates.formatLong(member.endDate)}.`);
    return { member: memberView(db, member), invoice: invoiceView(db, result.invoice), quote: result.quote };
  });
}

function membershipQuote(id, planId) {
  const db = read();
  const member = db.members.find((item) => item.id === id);
  if (!member) throw new DomainError("Member not found.", 404, "notfound");
  const plan = db.plans.find((item) => item.id === planId && item.active && !item.dayPass);
  if (!plan) throw new DomainError("Choose an active membership.");
  return { ...quoteMembership(member, plan), plan: publicPlan(plan) };
}

function freezeMember(id, input, staffId) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === id);
    if (!member) throw new DomainError("Member not found.", 404, "notfound");
    if (member.status !== "active") throw new DomainError("Only an active membership can be frozen.");
    assertDate(input.until, "Freeze end");
    const today = dates.todayISO();
    if (input.until <= today) throw new DomainError("Choose a freeze end after today.");
    if (dates.daysBetween(today, input.until) > 90) throw new DomainError("Freezes can run up to 90 days.");
    member.status = "frozen";
    member.freeze = { from: today, until: input.until, anchorEnd: member.endDate };
    log(db, member.id, staffId, `Membership frozen through ${dates.formatLong(input.until)}.`);
    return memberView(db, member);
  });
}

function unfreezeMember(id, staffId) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === id);
    if (!member) throw new DomainError("Member not found.", 404, "notfound");
    if (member.status !== "frozen" || !member.freeze) throw new DomainError("This membership is not frozen.");
    liftFreeze(db, member, dates.todayISO(), staffId);
    return memberView(db, member);
  });
}

function checkIn(memberId, staffId, clock) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === memberId);
    if (!member) throw new DomainError("Member not found.", 404, "notfound");
    const now = clock || dates.accraNow();
    const access = evaluateAccess(db, member, now);
    if (!access.ok) throw new DomainError(access.reason, 403, access.code);
    const existing = db.checkins.find((item) => item.memberId === member.id && item.date === now.iso);
    if (existing) {
      throw new DomainError(
        `Already on the floor today — checked in at ${dates.formatTime(existing.at)}.`,
        409,
        "duplicate"
      );
    }
    const checkin = {
      id: uid(db, "checkin"),
      memberId: member.id,
      staffId,
      at: (clock && clock.at) || new Date().toISOString(),
      date: now.iso,
      method: "desk",
    };
    db.checkins.push(checkin);
    log(db, member.id, staffId, "Checked in at the front desk.");
    return { checkin, member: memberView(db, member) };
  });
}

function sellDayPass(input, staffId) {
  return withDb((db) => {
    const plan = db.plans.find((item) => item.dayPass && item.active);
    if (!plan) throw new DomainError("Day passes are not on sale.");
    const today = dates.todayISO();
    const member = {
      id: uid(db, "member"),
      memberNo: `APX-${10420 + db.seq.member}`,
      gender: "",
      status: "active",
      planId: plan.id,
      trainerId: null,
      startDate: today,
      endDate: today,
      joinDate: today,
      classCredits: 0,
      freeze: null,
      createdAt: new Date().toISOString(),
      notes: "Day pass sold at the desk.",
      company: "",
      address: "",
      emergencyName: "",
      emergencyPhone: "",
      email: str(input.email, 120).toLowerCase(),
      dateOfBirth: "",
      firstName: "",
      lastName: "",
      phone: "",
    };
    applyContact(member, { ...input, email: member.email, notes: member.notes }, db);
    member.hue = hueOf(`${member.firstName} ${member.lastName}`);
    member.status = "active";
    member.planId = plan.id;
    member.startDate = today;
    member.endDate = today;
    db.members.push(member);
    const invoice = issueInvoice(db, {
      member,
      plan,
      description: `${plan.name} · ${dates.formatLong(today)}`,
      amount: plan.price,
      source: "daypass",
      issuedAt: today,
      dueAt: today,
      status: "paid",
      method: input.method,
      reference: input.reference,
      staffId,
    });
    const checkin = {
      id: uid(db, "checkin"),
      memberId: member.id,
      staffId,
      at: new Date().toISOString(),
      date: today,
      method: "desk",
    };
    db.checkins.push(checkin);
    log(db, member.id, staffId, `Day pass sold and checked in. ${dates.money(plan.price)} via ${labelMethod(input.method)}.`);
    return { member: memberView(db, member), invoice: invoiceView(db, invoice), checkin };
  });
}

function labelMethod(method) {
  return {
    cash: "cash",
    card: "card",
    momo: "MTN MoMo",
    telecel: "Telecel Cash",
    transfer: "bank transfer",
  }[method] || method;
}

function listCheckins(date) {
  const db = read();
  const iso = date && dates.isDate(date) ? date : dates.todayISO();
  const items = db.checkins
    .filter((item) => item.date === iso)
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((item) => {
      const member = db.members.find((row) => row.id === item.memberId);
      const plan = member ? findPlan(db, member.planId) : null;
      return {
        ...item,
        memberName: member ? `${member.firstName} ${member.lastName}` : "Unknown",
        memberNo: member ? member.memberNo : "",
        hue: member ? member.hue : 0,
        planName: plan ? plan.name : "",
        initials: member ? initials(member.firstName, member.lastName) : "?",
      };
    });
  return { date: iso, count: items.length, items };
}

function initials(first, last) {
  return `${(first || "?").slice(0, 1)}${(last || "").slice(0, 1)}`.toUpperCase();
}

function listPlans() {
  return read().plans.map(publicPlan);
}

function savePlan(id, input) {
  return withDb((db) => {
    const plan = id ? db.plans.find((item) => item.id === id) : null;
    if (id && !plan) throw new DomainError("Plan not found.", 404, "notfound");
    const name = str(input.name ?? plan?.name, 60);
    const price = Number(input.price ?? plan?.price);
    const durationDays = Number(input.durationDays ?? plan?.durationDays);
    const access = input.access ?? plan?.access;
    const blurb = str(input.blurb ?? plan?.blurb, 180);
    if (!name) throw new DomainError("Name the membership.");
    if (!Number.isFinite(price) || price < 0 || price > 100000) throw new DomainError("Enter a price in cedis.");
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 730) {
      throw new DomainError("Duration must be between 1 and 730 days.");
    }
    if (!["full", "offpeak", "classes"].includes(access)) throw new DomainError("Choose an access type.");
    let credits = null;
    if (access === "classes") {
      credits = Number(input.credits ?? plan?.credits ?? 8);
      if (!Number.isInteger(credits) || credits < 1 || credits > 100) throw new DomainError("Enter the number of class credits.");
    }
    const next = plan || {
      id: uid(db, "plan"),
      key: "custom",
      dayPass: false,
      active: true,
    };
    Object.assign(next, { name, price, durationDays, access, credits, blurb, active: input.active !== false && input.active !== "false" });
    if (!plan) db.plans.push(next);
    return publicPlan(next);
  });
}

function listTrainers() {
  const db = read();
  return db.trainers.map((trainer) => ({
    ...publicTrainer(trainer),
    classCount: db.classes.filter((cls) => cls.trainerId === trainer.id && cls.active).length,
    memberCount: db.members.filter((member) => member.trainerId === trainer.id && (member.status === "active" || member.status === "frozen")).length,
  }));
}

function saveTrainer(id, input) {
  return withDb((db) => {
    const trainer = id ? db.trainers.find((item) => item.id === id) : null;
    if (id && !trainer) throw new DomainError("Coach not found.", 404, "notfound");
    const name = str(input.name ?? trainer?.name, 80);
    if (!name) throw new DomainError("Name the coach.");
    const phone = str(input.phone ?? trainer?.phone, 40);
    const email = str(input.email ?? trainer?.email, 120).toLowerCase();
    if (phone && !phoneOk(phone)) throw new DomainError("Enter a valid phone or leave it blank.");
    if (!emailOk(email)) throw new DomainError("Enter a valid email or leave it blank.");
    const specialties = Array.isArray(input.specialties)
      ? input.specialties.map((item) => str(item, 40)).filter(Boolean).slice(0, 6)
      : str(input.specialties ?? (trainer ? trainer.specialties.join(", ") : ""), 120)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6);
    const next = trainer || { id: uid(db, "trainer"), hue: hueOf(name), staffId: null };
    Object.assign(next, {
      name,
      title: str(input.title ?? trainer?.title, 80) || "Coach",
      specialties,
      bio: str(input.bio ?? trainer?.bio, 280),
      phone,
      email,
      status: input.status === "inactive" ? "inactive" : "active",
    });
    if (!trainer) db.trainers.push(next);
    return publicTrainer(next);
  });
}

function listClasses() {
  const db = read();
  return db.classes.map((cls) => decorateClass(db, cls));
}

function decorateClass(db, cls) {
  const trainer = db.trainers.find((item) => item.id === cls.trainerId);
  return { ...cls, trainerName: trainer ? trainer.name : "Unassigned" };
}

function saveClass(id, input) {
  return withDb((db) => {
    const cls = id ? db.classes.find((item) => item.id === id) : null;
    if (id && !cls) throw new DomainError("Class not found.", 404, "notfound");
    const name = str(input.name ?? cls?.name, 80);
    const trainerId = input.trainerId ?? cls?.trainerId;
    const room = str(input.room ?? cls?.room, 40);
    const startTime = input.startTime ?? cls?.startTime;
    const dayOfWeek = Number(input.dayOfWeek ?? cls?.dayOfWeek);
    const durationMin = Number(input.durationMin ?? cls?.durationMin);
    const capacity = Number(input.capacity ?? cls?.capacity);
    const category = input.category ?? cls?.category;
    const level = str(input.level ?? cls?.level, 40) || "All levels";
    if (!name) throw new DomainError("Name the class.");
    if (!db.trainers.some((trainer) => trainer.id === trainerId)) throw new DomainError("Assign a coach.");
    if (!room) throw new DomainError("Name the studio or room.");
    if (!dates.isTime(startTime)) throw new DomainError("Start time should look like 06:30.");
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new DomainError("Choose a day of the week.");
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 180) throw new DomainError("Duration must be between 15 and 180 minutes.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 80) throw new DomainError("Capacity must be between 1 and 80.");
    if (!["strength", "conditioning", "cycle", "mind", "combat"].includes(category)) throw new DomainError("Choose a class category.");
    if (cls) {
      const today = dates.todayISO();
      let fullest = 0;
      for (const booking of db.bookings) {
        if (booking.classId !== cls.id || booking.status === "cancelled" || booking.date < today) continue;
        const count = db.bookings.filter((item) => item.classId === cls.id && item.date === booking.date && item.status !== "cancelled").length;
        fullest = Math.max(fullest, count);
      }
      if (capacity < fullest) throw new DomainError(`Capacity cannot drop below ${fullest}, the fullest upcoming roster.`);
    }
    const next = cls || { id: uid(db, "class"), active: true };
    Object.assign(next, {
      name,
      trainerId,
      room,
      startTime,
      dayOfWeek,
      durationMin,
      capacity,
      category,
      level,
      active: input.active !== false && input.active !== "false",
    });
    if (!cls) db.classes.push(next);
    return decorateClass(db, next);
  });
}

function decorateBooking(db, booking) {
  const cls = db.classes.find((item) => item.id === booking.classId);
  const member = db.members.find((item) => item.id === booking.memberId);
  const trainer = cls ? db.trainers.find((item) => item.id === cls.trainerId) : null;
  return {
    ...booking,
    className: cls ? cls.name : "Class",
    startTime: cls ? cls.startTime : "",
    durationMin: cls ? cls.durationMin : 0,
    room: cls ? cls.room : "",
    category: cls ? cls.category : "",
    trainerName: trainer ? trainer.name : "",
    memberName: member ? `${member.firstName} ${member.lastName}` : "Member",
    memberNo: member ? member.memberNo : "",
    hue: member ? member.hue : 0,
    initials: member ? initials(member.firstName, member.lastName) : "?",
  };
}

function schedule(weekDate) {
  const db = read();
  const anchor = dates.isDate(weekDate) ? weekDate : dates.todayISO();
  const weekStart = dates.startOfWeek(anchor);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = dates.addDays(weekStart, i);
    const dow = dates.weekday(date);
    const classes = db.classes
      .filter((cls) => cls.active && cls.dayOfWeek === dow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((cls) => {
        const bookings = db.bookings
          .filter((booking) => booking.classId === cls.id && booking.date === date && booking.status !== "cancelled")
          .map((booking) => decorateBooking(db, booking))
          .sort((a, b) => a.memberName.localeCompare(b.memberName));
        return {
          ...decorateClass(db, cls),
          date,
          booked: bookings.length,
          spots: Math.max(0, cls.capacity - bookings.length),
          bookings,
        };
      });
    days.push({
      date,
      weekday: dates.weekdayName(date, "short"),
      label: dates.formatLong(date),
      classes,
    });
  }
  return { weekStart, weekEnd: dates.addDays(weekStart, 6), days };
}

function book(input, staffId) {
  return withDb((db) => decorateBooking(db, bookInto(db, input, staffId)));
}

function bookInto(db, { classId, memberId, date }, staffId) {
  const cls = db.classes.find((item) => item.id === classId && item.active);
  if (!cls) throw new DomainError("Class not found.", 404, "notfound");
  assertDate(date, "Session date");
  const member = db.members.find((item) => item.id === memberId);
  if (!member) throw new DomainError("Member not found.", 404, "notfound");
  const now = dates.accraNow();
  if (date < now.iso) throw new DomainError("That session has already passed.");
  const start = dates.timeToMinutes(cls.startTime);
  if (date === now.iso && now.minutes > start + cls.durationMin) throw new DomainError("That session has ended.");
  if (dates.weekday(date) !== cls.dayOfWeek) throw new DomainError("That class does not run on the selected day.");
  if (member.status === "prospect" || !member.planId) throw new DomainError("Enroll this member before booking a class.");
  if (member.status === "expired") throw new DomainError("Renew the membership before booking.");
  if (member.freeze && date >= member.freeze.from && date <= member.freeze.until) {
    throw new DomainError("Membership is frozen on that date.");
  }
  if (member.endDate && member.endDate < date) throw new DomainError("Membership will have ended before that session.");
  if (member.startDate && member.startDate > date) throw new DomainError("Membership has not started by that date.");
  const plan = findPlan(db, member.planId);
  if (!plan) throw new DomainError("Membership plan is missing.");
  if (plan.access === "offpeak" && start >= 16 * 60) {
    throw new DomainError("Off-Peak memberships can book sessions that start before 4:00 PM.");
  }
  if (db.bookings.some((item) => item.classId === classId && item.memberId === memberId && item.date === date && item.status !== "cancelled")) {
    throw new DomainError("Already booked into this session.", 409, "duplicate");
  }
  const taken = db.bookings.filter((item) => item.classId === classId && item.date === date && item.status !== "cancelled").length;
  if (taken >= cls.capacity) throw new DomainError("That session is full.", 409, "full");
  let creditUsed = false;
  if (plan.access === "classes") {
    if (!(member.classCredits > 0)) throw new DomainError("No class credits remaining.");
    member.classCredits -= 1;
    creditUsed = true;
  }
  const booking = {
    id: uid(db, "booking"),
    classId,
    memberId,
    date,
    status: "booked",
    creditUsed,
    createdAt: new Date().toISOString(),
    staffId,
  };
  db.bookings.push(booking);
  log(db, memberId, staffId, `Booked into ${cls.name} on ${dates.formatLong(date)}.`);
  return booking;
}

function cancelBooking(id, staffId) {
  return withDb((db) => {
    const booking = db.bookings.find((item) => item.id === id);
    if (!booking) throw new DomainError("Booking not found.", 404, "notfound");
    if (booking.status === "cancelled") throw new DomainError("Booking is already cancelled.");
    if (booking.status === "attended") throw new DomainError("Attended sessions stay on the record.");
    if (booking.date < dates.todayISO()) throw new DomainError("Past sessions cannot be cancelled.");
    booking.status = "cancelled";
    if (booking.creditUsed) {
      const member = db.members.find((item) => item.id === booking.memberId);
      if (member) member.classCredits = (member.classCredits || 0) + 1;
    }
    const cls = db.classes.find((item) => item.id === booking.classId);
    log(db, booking.memberId, staffId, `Cancelled ${cls ? cls.name : "a class"} on ${dates.formatLong(booking.date)}.`);
    return decorateBooking(db, booking);
  });
}

function attendBooking(id, staffId) {
  return withDb((db) => {
    const booking = db.bookings.find((item) => item.id === id);
    if (!booking || booking.status === "cancelled") throw new DomainError("Booking not found.", 404, "notfound");
    if (booking.date > dates.todayISO()) throw new DomainError("Attendance opens on the day of the session.");
    if (booking.status !== "attended") {
      booking.status = "attended";
      const cls = db.classes.find((item) => item.id === booking.classId);
      log(db, booking.memberId, staffId, `Marked attended for ${cls ? cls.name : "a class"}.`);
      if (booking.date === dates.todayISO()) {
        const member = db.members.find((item) => item.id === booking.memberId);
        const now = dates.accraNow();
        const access = evaluateAccess(db, member, now);
        const existing = db.checkins.some((item) => item.memberId === booking.memberId && item.date === booking.date);
        if (access.ok && !existing) {
          db.checkins.push({
            id: uid(db, "checkin"),
            memberId: booking.memberId,
            staffId,
            at: new Date().toISOString(),
            date: booking.date,
            method: "class",
          });
        }
      }
    }
    return decorateBooking(db, booking);
  });
}

function listInvoices(filters = {}) {
  const db = read();
  const q = str(filters.q, 80).toLowerCase();
  let rows = db.invoices.slice();
  if (filters.status && filters.status !== "all") rows = rows.filter((invoice) => invoice.status === filters.status);
  rows = rows.map((invoice) => invoiceView(db, invoice));
  if (q) {
    rows = rows.filter((invoice) => `${invoice.number} ${invoice.memberName} ${invoice.memberNo} ${invoice.description}`.toLowerCase().includes(q));
  }
  rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number));
  const collectedThisMonth = monthPayments(db, dates.monthKey(dates.todayISO()));
  const outstanding = db.invoices
    .filter((invoice) => invoice.status === "open" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + remaining(db, invoice), 0);
  return {
    items: rows,
    collectedThisMonth,
    outstanding,
    overdueCount: db.invoices.filter((invoice) => invoice.status === "overdue").length,
  };
}

function monthPayments(db, key) {
  return db.payments.reduce((sum, payment) => (
    dates.monthKey(dates.isoFromInstant(payment.at)) === key ? sum + payment.amount : sum
  ), 0);
}

function getInvoice(id) {
  const db = read();
  const invoice = db.invoices.find((item) => item.id === id);
  if (!invoice) throw new DomainError("Invoice not found.", 404, "notfound");
  return invoiceView(db, invoice);
}

function createInvoice(input, staffId) {
  return withDb((db) => {
    const member = db.members.find((item) => item.id === input.memberId);
    if (!member) throw new DomainError("Choose a member.");
    const today = dates.todayISO();
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new DomainError("Enter an amount in cedis.");
    const payNow = Boolean(input.method);
    const invoice = issueInvoice(db, {
      member,
      plan: null,
      description: input.description,
      amount,
      source: "manual",
      issuedAt: today,
      dueAt: payNow ? today : dates.addDays(today, 7),
      status: payNow ? "paid" : "open",
      method: input.method,
      reference: input.reference,
      staffId,
    });
    log(db, member.id, staffId, `${payNow ? "Charged and collected" : "Invoiced"} ${dates.money(amount)} — ${invoice.description}.`);
    return invoiceView(db, invoice);
  });
}

function payInvoice(id, input, staffId) {
  return withDb((db) => {
    const invoice = db.invoices.find((item) => item.id === id);
    if (!invoice || invoice.status === "void") throw new DomainError("Invoice not found.", 404, "notfound");
    if (invoice.status === "paid" || remaining(db, invoice) <= 0) throw new DomainError("This invoice is already settled.");
    const payment = recordPayment(db, invoice, {
      amount: input.amount === undefined ? remaining(db, invoice) : input.amount,
      method: input.method,
      reference: input.reference,
      staffId,
    });
    log(db, invoice.memberId, staffId, `Payment of ${dates.money(payment.amount)} recorded (${labelMethod(payment.method)}).`);
    return invoiceView(db, invoice);
  });
}

function search(q) {
  return listMembers({ q }).slice(0, 8).map((member) => ({
    id: member.id,
    name: member.name,
    memberNo: member.memberNo,
    phone: member.phone,
    status: member.status,
    planName: member.plan ? member.plan.name : "No plan",
    checkedInAt: member.checkedInAt,
    hue: member.hue,
  }));
}

function classesOn(db, iso) {
  const dow = dates.weekday(iso);
  return db.classes
    .filter((cls) => cls.active && cls.dayOfWeek === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((cls) => {
      const booked = db.bookings.filter((booking) => booking.classId === cls.id && booking.date === iso && booking.status !== "cancelled").length;
      return { ...decorateClass(db, cls), booked, spots: Math.max(0, cls.capacity - booked) };
    });
}

function revenueSeries(db, months) {
  const today = dates.todayISO();
  const start = dates.addMonths(today, -(months - 1));
  const series = [];
  for (let i = 0; i < months; i += 1) {
    const key = dates.monthKey(dates.addMonths(start, i));
    series.push({
      key,
      label: dates.formatMonth(key),
      amount: monthPayments(db, key),
      current: key === dates.monthKey(today),
    });
  }
  return series;
}

function dashboard() {
  const db = read();
  const today = dates.todayISO();
  const soon = dates.addDays(today, 7);
  const count = (status) => db.members.filter((member) => member.status === status).length;
  const expiringAll = db.members
    .filter((member) => member.status === "active" && member.endDate && member.endDate >= today && member.endDate <= soon)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const expiring = expiringAll.slice(0, 8).map((member) => memberView(db, member));
  const overdue = db.invoices
    .filter((invoice) => invoice.status === "overdue")
    .map((invoice) => invoiceView(db, invoice))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6);
  const recent = listCheckins(today).items.slice(0, 8);
  const now = dates.accraNow();
  const quiet = classesOn(db, today)
    .filter((cls) => dates.timeToMinutes(cls.startTime) > now.minutes && cls.capacity >= 8 && cls.booked / cls.capacity < 0.35)
    .slice(0, 3);
  return {
    club: db.club,
    kpis: {
      active: count("active"),
      frozen: count("frozen"),
      expired: count("expired"),
      prospects: count("prospect"),
      onFloor: new Set(db.checkins.filter((item) => item.date === today).map((item) => item.memberId)).size,
      collectedThisMonth: monthPayments(db, dates.monthKey(today)),
      outstanding: db.invoices
        .filter((invoice) => invoice.status === "open" || invoice.status === "overdue")
        .reduce((sum, invoice) => sum + remaining(db, invoice), 0),
      overdueCount: db.invoices.filter((invoice) => invoice.status === "overdue").length,
      expiringSoon: expiringAll.length,
    },
    revenueByMonth: revenueSeries(db, 6),
    classesToday: classesOn(db, today),
    expiring,
    overdue,
    recentCheckins: recent,
    quietClasses: quiet,
    alerts: alerts(db),
  };
}

function reports() {
  const db = read();
  const today = dates.todayISO();
  const thisMonth = dates.monthKey(today);
  const lastMonth = dates.monthKey(dates.addMonths(today, -1));
  const joined = (key) => db.members.filter((member) => dates.monthKey(member.joinDate) === key).length;
  const attendance = [];
  for (let ago = 13; ago >= 0; ago -= 1) {
    const date = dates.addDays(today, -ago);
    attendance.push({
      date,
      label: dates.weekdayName(date, "narrow"),
      count: db.checkins.filter((item) => item.date === date).length,
    });
  }
  const mixMap = new Map();
  for (const member of db.members) {
    if (member.status !== "active" && member.status !== "frozen") continue;
    const plan = findPlan(db, member.planId);
    const name = plan ? plan.name : "Unassigned";
    mixMap.set(name, (mixMap.get(name) || 0) + 1);
  }
  const planMix = [...mixMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const methodMap = new Map();
  for (const payment of db.payments) {
    if (dates.monthKey(dates.isoFromInstant(payment.at)) !== thisMonth) continue;
    methodMap.set(payment.method, (methodMap.get(payment.method) || 0) + payment.amount);
  }
  const active = db.members.filter((member) => member.status === "active").length;
  const since = dates.addDays(today, -29);
  const visits = db.checkins.filter((item) => item.date >= since && item.date <= today).length;
  const horizon = dates.addDays(today, 14);
  const expiring = db.members
    .filter((member) => member.status === "active" && member.endDate && member.endDate >= today && member.endDate <= horizon)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((member) => memberView(db, member));
  return {
    revenueByMonth: revenueSeries(db, 6),
    attendance,
    planMix,
    byMethod: [...methodMap.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    newMembers: { thisMonth: joined(thisMonth), lastMonth: joined(lastMonth) },
    visitsPerMember: active ? Math.round((visits / active) * 10) / 10 : 0,
    expiring,
    collectedThisMonth: monthPayments(db, thisMonth),
    outstanding: db.invoices
      .filter((invoice) => invoice.status === "open" || invoice.status === "overdue")
      .reduce((sum, invoice) => sum + remaining(db, invoice), 0),
  };
}

function getClub() {
  return read().club;
}

function updateClub(input) {
  return withDb((db) => {
    const club = db.club;
    const name = str(input.name ?? club.name, 80);
    if (!name) throw new DomainError("The club needs a name.");
    club.name = name;
    club.shortName = str(input.shortName ?? club.shortName, 24) || name.split(" ")[0];
    club.tagline = str(input.tagline ?? club.tagline, 140);
    club.address = str(input.address ?? club.address, 120);
    club.city = str(input.city ?? club.city, 60);
    club.phone = str(input.phone ?? club.phone, 40);
    club.email = str(input.email ?? club.email, 120).toLowerCase();
    club.hours = str(input.hours ?? club.hours, 140);
    if (club.phone && !phoneOk(club.phone)) throw new DomainError("Enter a valid club phone.");
    if (!emailOk(club.email)) throw new DomainError("Enter a valid club email.");
    return club;
  });
}

function listStaff() {
  return read().staff.filter((staff) => staff.active).map(publicStaff);
}

module.exports = {
  DomainError,
  permit,
  requirePerm,
  authenticate,
  createSession,
  staffFromToken,
  destroySession,
  me,
  evaluateAccess,
  listMembers,
  getMember,
  createMember,
  updateMember,
  renewMembership,
  membershipQuote,
  freezeMember,
  unfreezeMember,
  checkIn,
  sellDayPass,
  listCheckins,
  listPlans,
  savePlan,
  listTrainers,
  saveTrainer,
  listClasses,
  saveClass,
  schedule,
  book,
  cancelBooking,
  attendBooking,
  listInvoices,
  getInvoice,
  createInvoice,
  payInvoice,
  search,
  dashboard,
  reports,
  getClub,
  updateClub,
  listStaff,
  alerts,
};

if (process.env.APEX_TEST === "1") {
  module.exports._db = () => load();
  module.exports._today = () => dates.todayISO();
}
