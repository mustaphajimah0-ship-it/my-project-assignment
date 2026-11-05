const assert = require("assert");
const os = require("os");
const path = require("path");

process.env.APEX_TEST = "1";
process.env.STORE_PATH = path.join(os.tmpdir(), `apex-smoke-${Date.now()}.json`);

const dates = require("../lib/dates");
const store = require("../lib/store");
const { createApp } = require("../server");

function throws(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

function testDomain() {
  const ama = store.authenticate("ama@apexathletic.club", "2468");
  assert.ok(ama && ama.role === "manager");
  assert.equal(store.authenticate("ama@apexathletic.club", "0000"), null);
  assert.equal(store.authenticate("kojo@apexathletic.club", "1357").role, "frontdesk");

  const dash = store.dashboard();
  assert.ok(dash.kpis.active >= 40, "expected a full active roster");
  assert.ok(dash.kpis.onFloor > 0, "expected seeded check-ins today");
  assert.equal(dash.revenueByMonth.length, 6);
  assert.ok(store.listPlans().length >= 6);
  assert.ok(store.schedule().days.length === 7);

  const denied = throws(() => store.requirePerm({ role: "frontdesk", active: true }, "manageClub"));
  assert.equal(denied.status, 403);

  const monthly = store.listPlans().find((plan) => plan.key === "monthly");
  const offpeak = store.listPlans().find((plan) => plan.key === "offpeak");
  const studio = store.listPlans().find((plan) => plan.key === "studio");
  const trainer = store.listTrainers()[0];

  const prospect = store.createMember({
    firstName: "Ama",
    lastName: "Test Prospect",
    phone: "+233 20 555 0101",
  }, ama.id);
  assert.equal(prospect.member.status, "prospect");

  const enrolled = store.createMember({
    firstName: "Kofi",
    lastName: "Test Member",
    phone: "+233 24 555 0102",
    email: "kofi.test@example.net",
    planId: monthly.id,
    method: "momo",
    reference: "MP100",
    collectPayment: true,
  }, ama.id);
  assert.equal(enrolled.member.status, "active");
  assert.equal(enrolled.member.balance, 0);
  assert.equal(enrolled.invoice.status, "paid");
  assert.ok(enrolled.member.endDate > dates.todayISO());

  const openBill = store.createMember({
    firstName: "Esi",
    lastName: "Test Open",
    phone: "+233 24 555 0103",
    planId: monthly.id,
    collectPayment: false,
  }, ama.id);
  assert.equal(openBill.invoice.status, "open");
  assert.equal(openBill.member.balance, monthly.price);
  const half = store.payInvoice(openBill.invoice.id, { amount: 200, method: "cash" }, ama.id);
  assert.equal(half.status, "open");
  assert.equal(half.balance, monthly.price - 200);
  const settled = store.payInvoice(openBill.invoice.id, { method: "cash" }, ama.id);
  assert.equal(settled.status, "paid");
  assert.equal(settled.balance, 0);

  const today = dates.todayISO();
  const evening = throws(() => store.checkIn(enrolled.member.id, ama.id, { iso: today, minutes: 18 * 60, at: dates.atOn(today, 18 * 60) }));
  assert.equal(evening, null, "full-access member should pass an evening check-in");
  const duplicate = throws(() => store.checkIn(enrolled.member.id, ama.id));
  assert.equal(duplicate.code, "duplicate");

  const peak = store.createMember({
    firstName: "Yaw",
    lastName: "Off Peak",
    phone: "+233 24 555 0104",
    planId: offpeak.id,
    method: "card",
  }, ama.id);
  const late = throws(() => store.checkIn(peak.member.id, ama.id, { iso: today, minutes: 18 * 60, at: dates.atOn(today, 18 * 60) }));
  assert.equal(late.code, "offpeak");
  const morning = store.checkIn(peak.member.id, ama.id, { iso: today, minutes: 9 * 60, at: dates.atOn(today, 9 * 60) });
  assert.ok(morning.checkin.id);

  const frozen = store.freezeMember(peak.member.id, { until: dates.addDays(today, 10) }, ama.id);
  assert.equal(frozen.status, "frozen");
  const blocked = throws(() => store.checkIn(peak.member.id, ama.id, { iso: dates.addDays(today, 1), minutes: 9 * 60, at: dates.atOn(dates.addDays(today, 1), 9 * 60) }));
  assert.equal(blocked.code, "frozen");

  const anchor = frozen.endDate;
  const db = store._db();
  const row = db.members.find((member) => member.id === peak.member.id);
  row.freeze.from = dates.addDays(today, -4);
  row.freeze.until = dates.addDays(today, -1);
  store.dashboard();
  const lifted = store.getMember(peak.member.id);
  assert.equal(lifted.status, "active");
  assert.equal(lifted.endDate, dates.addDays(anchor, 4));

  const pass = store.sellDayPass({
    firstName: "Guest",
    lastName: "Walker",
    phone: "+233 20 555 0199",
    method: "cash",
  }, ama.id);
  assert.equal(pass.member.plan.name, "Day Pass");
  assert.ok(pass.checkin.id);
  assert.equal(throws(() => store.checkIn(pass.member.id, ama.id)).code, "duplicate");

  const classesMember = store.createMember({
    firstName: "Lena",
    lastName: "Studio",
    phone: "+233 24 555 0105",
    planId: studio.id,
    method: "telecel",
  }, ama.id);
  assert.equal(classesMember.member.classCredits, 12);
  assert.equal(throws(() => store.checkIn(classesMember.member.id, ama.id)).code, "classes");

  const tomorrow = dates.addDays(today, 1);
  const session = store.saveClass(null, {
    name: "Smoke Strength",
    trainerId: trainer.id,
    room: "Studio A",
    dayOfWeek: dates.weekday(tomorrow),
    startTime: "09:00",
    durationMin: 30,
    capacity: 1,
    category: "strength",
    level: "All levels",
  });
  const firstBooking = store.book({ classId: session.id, memberId: enrolled.member.id, date: tomorrow }, ama.id);
  assert.equal(firstBooking.status, "booked");
  const full = throws(() => store.book({ classId: session.id, memberId: openBill.member.id, date: tomorrow }, ama.id));
  assert.equal(full.code, "full");
  store.cancelBooking(firstBooking.id, ama.id);
  const again = store.book({ classId: session.id, memberId: openBill.member.id, date: tomorrow }, ama.id);
  assert.equal(again.memberId, openBill.member.id);

  const creditRow = store._db().members.find((member) => member.id === classesMember.member.id);
  assert.ok(creditRow, "studio member should still be on the roster");
  creditRow.classCredits = 1;
  const creditClass = store.saveClass(null, {
    name: "Smoke Studio",
    trainerId: trainer.id,
    room: "Studio B",
    dayOfWeek: dates.weekday(tomorrow),
    startTime: "10:00",
    durationMin: 30,
    capacity: 10,
    category: "mind",
    level: "All levels",
  });
  const used = store.book({ classId: creditClass.id, memberId: classesMember.member.id, date: tomorrow }, ama.id);
  assert.equal(used.creditUsed, true);
  assert.equal(store.getMember(classesMember.member.id).classCredits, 0);
  const noCredit = throws(() => store.book({ classId: creditClass.id, memberId: classesMember.member.id, date: dates.addDays(tomorrow, 7) }, ama.id));
  assert.match(noCredit.message, /credits/i);
  store.cancelBooking(used.id, ama.id);
  assert.equal(store.getMember(classesMember.member.id).classCredits, 1);

  const renewed = store.renewMembership(enrolled.member.id, { planId: monthly.id, method: "transfer", reference: "FT900" }, ama.id);
  assert.ok(renewed.member.endDate > enrolled.member.endDate);

  console.log("domain checks passed");
}

async function testHttp() {
  const server = createApp().listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const denied = await fetch(`${base}/api/dashboard`);
    assert.equal(denied.status, 401);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "kojo@apexathletic.club", pin: "1357" }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const headers = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
    const members = await fetch(`${base}/api/members?q=Kofi`, { headers });
    assert.equal(members.status, 200);
    const body = await members.json();
    assert.ok(body.items.some((member) => member.lastName === "Test Member"));
    const forbidden = await fetch(`${base}/api/club`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Should Fail" }),
    });
    assert.equal(forbidden.status, 403);
    const desk = await fetch(`${base}/api/checkins`, { headers });
    const floor = await desk.json();
    assert.ok(floor.count >= 1);
    console.log("http checks passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

(async () => {
  testDomain();
  await testHttp();
  console.log("smoke ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
