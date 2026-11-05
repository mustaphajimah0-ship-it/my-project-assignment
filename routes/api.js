const express = require("express");
const store = require("../lib/store");

const router = express.Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const staff = store.staffFromToken(token);
  if (!staff) return res.status(401).json({ error: "Sign in required.", code: "auth" });
  req.staff = staff;
  req.token = token;
  return next();
}

function allow(perm) {
  return (req, res, next) => {
    if (!store.permit(req.staff, perm)) {
      return res.status(403).json({ error: "Your role cannot do that.", code: "forbidden" });
    }
    return next();
  };
}

router.get("/health", wrap(async (_req, res) => {
  res.json({ ok: true, club: store.getClub().name });
}));

router.post("/auth/login", wrap(async (req, res) => {
  const body = req.body || {};
  const staff = store.authenticate(body.email, body.pin);
  if (!staff) return res.status(401).json({ error: "Those credentials were not recognised.", code: "auth" });
  const token = store.createSession(staff.id);
  res.json({ token, staff: store.me(staff) });
}));

router.use(auth);

router.post("/auth/logout", wrap(async (req, res) => {
  store.destroySession(req.token);
  res.json({ ok: true });
}));

router.get("/auth/me", wrap(async (req, res) => {
  res.json(store.me(req.staff));
}));

router.get("/alerts", wrap(async (_req, res) => {
  res.json(store.me(_req.staff).alerts);
}));

router.get("/dashboard", wrap(async (_req, res) => {
  res.json(store.dashboard());
}));

router.get("/reports", wrap(async (_req, res) => {
  res.json(store.reports());
}));

router.get("/search", wrap(async (req, res) => {
  res.json({ items: store.search(req.query.q || "") });
}));

router.get("/members", wrap(async (req, res) => {
  res.json({ items: store.listMembers(req.query) });
}));

router.post("/members", allow("members"), wrap(async (req, res) => {
  res.status(201).json(store.createMember(req.body || {}, req.staff.id));
}));

router.get("/members/:id", wrap(async (req, res) => {
  res.json(store.getMember(req.params.id));
}));

router.get("/members/:id/quote", wrap(async (req, res) => {
  res.json(store.membershipQuote(req.params.id, req.query.planId));
}));

router.patch("/members/:id", allow("members"), wrap(async (req, res) => {
  res.json(store.updateMember(req.params.id, req.body || {}));
}));

router.post("/members/:id/renew", allow("members"), wrap(async (req, res) => {
  res.json(store.renewMembership(req.params.id, req.body || {}, req.staff.id));
}));

router.post("/members/:id/freeze", allow("members"), wrap(async (req, res) => {
  res.json(store.freezeMember(req.params.id, req.body || {}, req.staff.id));
}));

router.post("/members/:id/unfreeze", allow("members"), wrap(async (req, res) => {
  res.json(store.unfreezeMember(req.params.id, req.staff.id));
}));

router.post("/desk/day-pass", allow("members"), wrap(async (req, res) => {
  res.status(201).json(store.sellDayPass(req.body || {}, req.staff.id));
}));

router.get("/checkins", wrap(async (req, res) => {
  res.json(store.listCheckins(req.query.date));
}));

router.post("/checkins", allow("checkin"), wrap(async (req, res) => {
  const body = req.body || {};
  res.status(201).json(store.checkIn(body.memberId, req.staff.id));
}));

router.get("/plans", wrap(async (_req, res) => {
  res.json({ items: store.listPlans() });
}));

router.post("/plans", allow("managePlans"), wrap(async (req, res) => {
  res.status(201).json(store.savePlan(null, req.body || {}));
}));

router.patch("/plans/:id", allow("managePlans"), wrap(async (req, res) => {
  res.json(store.savePlan(req.params.id, req.body || {}));
}));

router.get("/trainers", wrap(async (_req, res) => {
  res.json({ items: store.listTrainers() });
}));

router.post("/trainers", allow("manageTrainers"), wrap(async (req, res) => {
  res.status(201).json(store.saveTrainer(null, req.body || {}));
}));

router.patch("/trainers/:id", allow("manageTrainers"), wrap(async (req, res) => {
  res.json(store.saveTrainer(req.params.id, req.body || {}));
}));

router.get("/classes", wrap(async (_req, res) => {
  res.json({ items: store.listClasses() });
}));

router.post("/classes", allow("manageClasses"), wrap(async (req, res) => {
  res.status(201).json(store.saveClass(null, req.body || {}));
}));

router.patch("/classes/:id", allow("manageClasses"), wrap(async (req, res) => {
  res.json(store.saveClass(req.params.id, req.body || {}));
}));

router.get("/schedule", wrap(async (req, res) => {
  res.json(store.schedule(req.query.week));
}));

router.post("/bookings", allow("book"), wrap(async (req, res) => {
  res.status(201).json(store.book(req.body || {}, req.staff.id));
}));

router.post("/bookings/:id/cancel", allow("book"), wrap(async (req, res) => {
  res.json(store.cancelBooking(req.params.id, req.staff.id));
}));

router.post("/bookings/:id/attend", allow("attend"), wrap(async (req, res) => {
  res.json(store.attendBooking(req.params.id, req.staff.id));
}));

router.get("/invoices", wrap(async (req, res) => {
  res.json(store.listInvoices(req.query));
}));

router.post("/invoices", allow("bill"), wrap(async (req, res) => {
  res.status(201).json(store.createInvoice(req.body || {}, req.staff.id));
}));

router.get("/invoices/:id", wrap(async (req, res) => {
  res.json(store.getInvoice(req.params.id));
}));

router.post("/invoices/:id/pay", allow("bill"), wrap(async (req, res) => {
  res.json(store.payInvoice(req.params.id, req.body || {}, req.staff.id));
}));

router.get("/club", wrap(async (_req, res) => {
  res.json(store.getClub());
}));

router.patch("/club", allow("manageClub"), wrap(async (req, res) => {
  res.json(store.updateClub(req.body || {}));
}));

router.get("/staff", wrap(async (_req, res) => {
  res.json({ items: store.listStaff() });
}));

module.exports = router;
