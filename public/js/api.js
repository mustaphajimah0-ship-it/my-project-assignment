const api = {
  token: "",

  setToken(token) {
    this.token = token || "";
    if (this.token) sessionStorage.setItem("apex_token", this.token);
    else sessionStorage.removeItem("apex_token");
  },

  clear() {
    this.setToken("");
  },

  async req(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (_error) {
      throw Object.assign(new Error("The desk cannot reach the server."), { status: 0 });
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !options.allow401) {
      this.clear();
      window.dispatchEvent(new Event("apex:logout"));
    }
    if (!response.ok) {
      throw Object.assign(new Error(data.error || "Request failed."), {
        status: response.status,
        code: data.code,
      });
    }
    return data;
  },

  login(email, pin) {
    return this.req("/api/auth/login", { method: "POST", body: { email, pin }, allow401: true });
  },
  logout() {
    return this.req("/api/auth/logout", { method: "POST", body: {} });
  },
  me() {
    return this.req("/api/auth/me");
  },
  dashboard() {
    return this.req("/api/dashboard");
  },
  reports() {
    return this.req("/api/reports");
  },
  search(q) {
    return this.req(`/api/search?q=${encodeURIComponent(q || "")}`);
  },
  members(query) {
    return this.req(`/api/members${qs(query)}`);
  },
  member(id) {
    return this.req(`/api/members/${id}`);
  },
  createMember(body) {
    return this.req("/api/members", { method: "POST", body });
  },
  updateMember(id, body) {
    return this.req(`/api/members/${id}`, { method: "PATCH", body });
  },
  quote(id, planId) {
    return this.req(`/api/members/${id}/quote?planId=${encodeURIComponent(planId)}`);
  },
  renew(id, body) {
    return this.req(`/api/members/${id}/renew`, { method: "POST", body });
  },
  freeze(id, until) {
    return this.req(`/api/members/${id}/freeze`, { method: "POST", body: { until } });
  },
  unfreeze(id) {
    return this.req(`/api/members/${id}/unfreeze`, { method: "POST", body: {} });
  },
  dayPass(body) {
    return this.req("/api/desk/day-pass", { method: "POST", body });
  },
  checkins(date) {
    return this.req(`/api/checkins${qs({ date })}`);
  },
  checkIn(memberId) {
    return this.req("/api/checkins", { method: "POST", body: { memberId } });
  },
  plans() {
    return this.req("/api/plans");
  },
  createPlan(body) {
    return this.req("/api/plans", { method: "POST", body });
  },
  updatePlan(id, body) {
    return this.req(`/api/plans/${id}`, { method: "PATCH", body });
  },
  trainers() {
    return this.req("/api/trainers");
  },
  createTrainer(body) {
    return this.req("/api/trainers", { method: "POST", body });
  },
  updateTrainer(id, body) {
    return this.req(`/api/trainers/${id}`, { method: "PATCH", body });
  },
  schedule(week) {
    return this.req(`/api/schedule${qs({ week })}`);
  },
  createClass(body) {
    return this.req("/api/classes", { method: "POST", body });
  },
  updateClass(id, body) {
    return this.req(`/api/classes/${id}`, { method: "PATCH", body });
  },
  book(body) {
    return this.req("/api/bookings", { method: "POST", body });
  },
  cancelBooking(id) {
    return this.req(`/api/bookings/${id}/cancel`, { method: "POST", body: {} });
  },
  attend(id) {
    return this.req(`/api/bookings/${id}/attend`, { method: "POST", body: {} });
  },
  invoices(query) {
    return this.req(`/api/invoices${qs(query)}`);
  },
  createInvoice(body) {
    return this.req("/api/invoices", { method: "POST", body });
  },
  pay(id, body) {
    return this.req(`/api/invoices/${id}/pay`, { method: "POST", body });
  },
  club() {
    return this.req("/api/club");
  },
  updateClub(body) {
    return this.req("/api/club", { method: "PATCH", body });
  },
  staff() {
    return this.req("/api/staff");
  },
};

function qs(query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}
