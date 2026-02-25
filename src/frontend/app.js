/* ==================================================
   BLOODHUB V4 — API Connected Engine
   ================================================== */

const backendURL = "http://localhost:3300";

// ─── SESSION (token based) ───────────
const Session = {
  setToken(token) {
    localStorage.setItem("bh_token", token);
  },
  getToken() {
    return localStorage.getItem("bh_token");
  },
  setUser(user, role) {
    localStorage.setItem("bh_user", JSON.stringify(user));
    localStorage.setItem("bh_role", role);
  },
  getUser() {
    const user = localStorage.getItem("bh_user");
    return user ? JSON.parse(user) : null;
  },
  getRole() {
    return localStorage.getItem("bh_role");
  },
  clear() {
    localStorage.removeItem("bh_token");
    localStorage.removeItem("bh_user");
    localStorage.removeItem("bh_role");
  },
  getAuthHeaders() {
    const token = this.getToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
  }
};

// Backwards compatibility with standard UI code
Session.liveDonor = function () { return Session.getRole() === 'donor' ? Session.getUser() : null; };
Session.liveHospital = function () { return Session.getRole() === 'hospital' ? Session.getUser() : null; };

// ─── VALIDATION ───────────────────────────────────────────────────────────
const Validation = {
  phone(val) { return /^\+977\d{10}$/.test(val); },
  email(val) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val); },
  password(val) {
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasNumber = /\d/.test(val);
    return hasUpper && hasLower && hasNumber && val.length >= 8;
  },
  getError(data) {
    if (data.phone && !this.phone(data.phone)) return "Phone number must start with +977 followed by 10 digits.";
    if (data.email && !this.email(data.email)) return "Please enter a valid email address.";
    if (data.password && !this.password(data.password)) return "Password must be at least 8 characters long and include uppercase, lowercase, and a number.";
    return null;
  },
};

// ─── AUTH ─────────────────────────────────────────────────────────────────
const Auth = {
  async _post(endpoint, data) {
    try {
      const res = await fetch(`${backendURL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "Request failed" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },
  async loginDonor(email, password) {
    const res = await this._post("/login", { email, password });
    if (res.ok) {
      if (res.data.role !== "donor") return { ok: false, msg: "Invalid credentials" };
      Session.setToken(res.data.token);
      Session.setUser(res.data.user, res.data.role);
      return { ok: true, donor: res.data.user };
    }
    return res;
  },
  async loginHospital(email, password) {
    const res = await this._post("/login", { email, password });
    if (res.ok) {
      if (res.data.role !== "hospital") return { ok: false, msg: "Invalid credentials" };
      Session.setToken(res.data.token);
      Session.setUser(res.data.user, res.data.role);
      return { ok: true, hospital: res.data.user };
    }
    return res;
  },
  async registerDonor(data) {
    const err = Validation.getError(data);
    if (err) return { ok: false, msg: err };
    return await this._post("/register-donor", data);
  },
  async registerHospital(data) {
    const err = Validation.getError(data);
    if (err) return { ok: false, msg: err };
    return await this._post("/register-hospital", data);
  },
  logout() {
    Session.clear();
    window.location.href = "index.html";
  }
};

// ─── MATCHING ALGORITHM / API CALLS ───────────────────────────────────────────────────
const Matching = {
  async createRequest(data) {
    try {
      const res = await fetch(`${backendURL}/create-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Session.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "Failed to create request" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },

  async getHospitalDashboard(requestId) {
    try {
      const res = await fetch(`${backendURL}/hospital-dashboard/${requestId}`, {
        headers: { ...Session.getAuthHeaders() }
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "Failed to get dashboard" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },

  async respondToRequest(requestId, status = "Coming", estimated_arrival = null, message = null) {
    try {
      const res = await fetch(`${backendURL}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Session.getAuthHeaders()
        },
        body: JSON.stringify({ request_id: requestId, status, estimated_arrival, message })
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "Failed to respond" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },

  async getRequestsForDonor() {
    try {
      const res = await fetch(`${backendURL}/requests/donor`, {
        headers: { ...Session.getAuthHeaders() }
      });
      const result = await res.json();
      if (!res.ok) return [];

      // result.requests is array of requests
      // result.respondedIds is array of request IDs donor has responded to
      // Map to format that donor.html expects (adding responders check)
      return result.requests.map(r => ({
        ...r,
        bloodType: r.blood_type,
        patientCondition: r.patient_details,
        responders: result.respondedIds.includes(r.id) ? [Session.getUser().id] : []
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getHospitalRequests() {
    try {
      const res = await fetch(`${backendURL}/requests/hospital`, {
        headers: { ...Session.getAuthHeaders() }
      });
      const result = await res.json();
      if (!res.ok) return [];
      return result.map(r => ({
        ...r,
        bloodType: r.blood_type,
        patientCondition: r.patient_details
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  getMatchCountPreview(bloodType, city) {
    // Stub returning empty for sync call.
    // Need a backend route to calculate matches if we want it real time.
    return [];
  },

  markFulfilled(requestId) {
    // TODO: hit backend to mark it fulfilled
  }
};

// ─── UTILITIES ────────────────────────────────────────────────────────────
function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours} hr${hours !== 1 ? "s" : ""} ago`;
  return `${Math.floor(diff / 86400000)} day(s) ago`;
}

function bloodBadgeClass(type) {
  if (!type) return "";
  return type.replace("+", "pos").replace("-", "neg");
}

function bloodBadgeHTML(type, size = "") {
  return `<div class="blood-badge ${size} ${bloodBadgeClass(type)}">${type}</div>`;
}

function urgencyBadgeHTML(urgency) {
  return `<span class="urgency-badge ${urgency}">
    <i class="fas fa-circle" style="font-size:0.5rem;"></i> ${urgency}
  </span>`;
}

function showNotif(msg, type = "success") {
  let el = document.getElementById("bh-notif");
  if (!el) {
    el = document.createElement("div");
    el.id = "bh-notif";
    el.className = "notification";
    document.body.appendChild(el);
  }
  const icon =
    type === "success" ? "check-circle" : type === "error" ? "times-circle" : "info-circle";
  el.className = `notification ${type}`;
  el.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

function setPageActive() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === page);
  });
}

function buildNav() {
  const nav = document.querySelector(".navbar .container");
  if (!nav) return;
  nav.style.cssText =
    "display:flex; align-items:center; width:100%; gap:1.5rem; max-width: 1280px; margin: 0 auto; padding: 0 1.5rem;";

  const token = Session.getToken();
  const user = Session.getUser();

  let userSection = `
    <div class="nav-cta" style="margin-left: auto;">
      <a href="donor.html" class="btn btn-outline btn-sm">Donor Login</a>
      <a href="hospital.html" class="btn btn-primary btn-sm">Hospital Login</a>
    </div>
  `;

  if (token && user) {
    userSection = `
        <div class="nav-cta" style="margin-left: auto; display: flex; align-items: center; gap: 1rem;">
           <span style="font-size: 0.9rem; font-weight: 500;">Hi, ${user.name}</span>
           <button onclick="Auth.logout()" class="btn btn-outline btn-sm">Logout</button>
        </div>
     `;
  }

  nav.innerHTML = `
    <a href="index.html" class="nav-brand" style="margin-right: auto;">
      <i class="fas fa-droplet"></i><span>BLOODHUB</span>
    </a>
    <div class="nav-links">
      <a href="index.html">Home</a>
      <a href="donor.html">For Donors</a>
      <a href="hospital.html">For Hospitals</a>
      <a href="about.html">About</a>
      <a href="contact.html">Contact</a>
    </div>
    ${userSection}
  `;
  setPageActive();
  window.addEventListener("scroll", () => {
    document.querySelector(".navbar").style.boxShadow =
      window.scrollY > 20 ? "0 4px 20px rgba(0,0,0,0.08)" : "none";
  });
}

document.addEventListener("DOMContentLoaded", buildNav);

const EmailNotifier = {
  sendToMatchingDonors(req, matched) {
    console.log("Email sent handling has been moved to the backend");
  }
};
