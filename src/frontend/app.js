/* ==================================================
   BLOODHUB V3 — Core Application Engine
   Data persisted via localStorage so requests
   created in hospital.html are visible in donor.html
   even for brand-new donors who just registered.
   ================================================== */

// ─── SEED DATA (used only on very first load) ─────────────────────────────
const backendURL = "http://localhost:3300";
// No seed data — register manually via the Donor/Hospital portals
const SEED_DONORS = [];
const SEED_HOSPITALS = [];
const SEED_REQUESTS = [];

// ─── LOCALSTORAGE PERSISTENCE ─────────────────────────────────────────────
// All data lives in localStorage so it is shared across every page.
// Hospital creates request → stored → donor sees it on any page.

// ─── LIVE DATA ARRAYS (Removed as data now comes from API) ────────────────
const donors = [];
const hospitals = [];
const bloodRequests = [];

// ─── SESSION (tab-level, does not persist across browser close) ───────────
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
    // Also clear old session storage if it exists
    sessionStorage.removeItem("bh_donor_session");
    sessionStorage.removeItem("bh_hospital_session");
  },
  getAuthHeaders() {
    const token = this.getToken();
    return token ? { "Authorization": `Bearer ${token}` } : {};
  },
  // Legacy support for scripts expecting liveHospital/liveDonor
  liveDonor() { return this.getUser(); },
  liveHospital() { return this.getUser(); }
};

// ─── VALIDATION ───────────────────────────────────────────────────────────
const Validation = {
  phone(val) {
    // Must start with +977 and have 10 digits after it
    return /^\+977\d{10}$/.test(val);
  },
  email(val) {
    // Authentic email check (must have @ and a domain like .com)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  },
  password(val) {
    // 8+ chars, 1 uppercase, 1 lowercase, 1 number
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasNumber = /\d/.test(val);
    const isLongEnough = val.length >= 8;
    return hasUpper && hasLower && hasNumber && isLongEnough;
  },
  getError(data) {
    if (data.phone && !this.phone(data.phone))
      return "Phone number must start with +977 followed by 10 digits.";
    if (data.email && !this.email(data.email))
      return "Please enter a valid email address (e.g. name@email.com).";
    if (data.password && !this.password(data.password))
      return "Password must be at least 8 characters long and include uppercase, lowercase, and a number.";
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
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "Request failed" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error. Is the backend running?" };
    }
  },

  async loginDonor(email, password) {
    const res = await this._post("/login", { email, password });
    if (res.ok) {
      if (res.data.role !== "donor") return { ok: false, msg: "Invalid credentials." };
      Session.setToken(res.data.token);
      Session.setUser(res.data.user, res.data.role);
      return { ok: true, donor: res.data.user };
    }
    return res;
  },

  async loginHospital(email, password) {
    const res = await this._post("/login", { email, password });
    if (res.ok) {
      if (res.data.role !== "hospital") return { ok: false, msg: "Invalid credentials." };
      Session.setToken(res.data.token);
      Session.setUser(res.data.user, res.data.role);
      return { ok: true, hospital: res.data.user };
    }
    return res;
  },

  async registerDonor(data) {
    console.log("register donor data", data);
    const res = await this._post("/register-donor", data);
    if (res.ok) {
      // Auto login after registration
      return this.loginDonor(data.email, data.password);
    }
    return res;
  },

  async registerHospital(data) {
    const res = await this._post("/register-hospital", data);
    if (res.ok) {
      // Auto login after registration
      return this.loginHospital(data.email, data.password);
    }
    return res;
  },

  logout() {
    Session.clear();
    window.location.href = "index.html";
  },
};

// ─── MATCHING ALGORITHM ───────────────────────────────────────────────────
const Matching = {
  async getRequestsForDonor() {
    try {
      const res = await fetch(`${backendURL}/requests/donor`, {
        headers: { ...Session.getAuthHeaders() }
      });
      const result = await res.json();
      if (!res.ok) return [];

      // Map to format that donor.html expects
      return result.requests.map(r => ({
        ...r,
        bloodType: r.blood_type,
        hospitalName: r.hospitalName,
        patientCondition: r.patientCondition || r.patient_details,
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

  async getHospitalDashboard(requestId) {
    try {
      const res = await fetch(`${backendURL}/hospital-dashboard/${requestId}`, {
        headers: { ...Session.getAuthHeaders() }
      });
      const result = await res.json();
      if (!res.ok) return null;
      return result;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  async respondToRequest(data) {
    try {
      const res = await fetch(`${backendURL}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Session.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, msg: result.error || "failed" };
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },

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
      if (!res.ok) return { ok: false, msg: result.error || "Failed" };
      return { ok: true, data: result };
    } catch (e) {
      console.error(e);
      return { ok: false, msg: "Network error" };
    }
  },

  async markFulfilled(requestId) {
    try {
      const res = await fetch(`${backendURL}/requests/${requestId}/fulfill`, {
        method: "POST",
        headers: { ...Session.getAuthHeaders() }
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
};

// ─── CHATBOT ──────────────────────────────────────────────────────────────
const Chatbot = {
  seedData: [
    { q: "hi", a: "Hello! Welcome to BLOODHUB. How can I help you today?" },
    { q: "how to donate", a: "To donate blood, register as a donor, check matching requests in your city, and click 'I'M COMING' to alert the hospital." },
    { q: "emergency", a: "If you have a medical emergency, please contact your local hospital directly or call the emergency hotline at +977-1-XXXXXXXX." },
    { q: "is it safe", a: "Yes, blood donation is very safe. We ensure all donors meet health eligibility criteria before donating." },
    { q: "hospital", a: "Hospitals can register on our platform to create emergency blood requests and instantly connect with verified donors." }
  ],

  init() {
    this.injectHTML();
    this.bindEvents();
    this.addMessage("bot", "Hi! I'm your BLOODHUB assistant. Ask me anything about blood donation!");
  },

  injectHTML() {
    const html = `
      <div class="chatbot-fab" id="chatbot-fab">
        <i class="fas fa-comment-dots"></i>
      </div>
      <div class="chatbot-window" id="chatbot-window">
        <div class="chatbot-header">
          <h3><i class="fas fa-droplet"></i> BLOODHUB AI</h3>
          <div class="chatbot-close" id="chatbot-close"><i class="fas fa-times"></i></div>
        </div>
        <div class="chatbot-messages" id="chatbot-messages"></div>
        <div class="chat-typing" id="chat-typing" style="display: none;">AI is typing...</div>
        <form class="chatbot-input-area" id="chatbot-form">
          <input type="text" id="chatbot-input" placeholder="Type a message..." autocomplete="off">
          <button type="submit"><i class="fas fa-paper-plane"></i></button>
        </form>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  bindEvents() {
    const fab = document.getElementById("chatbot-fab");
    const win = document.getElementById("chatbot-window");
    const close = document.getElementById("chatbot-close");
    const form = document.getElementById("chatbot-form");
    const input = document.getElementById("chatbot-input");

    fab.onclick = () => win.classList.add("active");
    close.onclick = () => win.classList.remove("active");

    form.onsubmit = (e) => {
      e.preventDefault();
      const msg = input.value.trim();
      if (!msg) return;

      this.addMessage("user", msg);
      input.value = "";
      this.handleResponse(msg);
    };
  },

  addMessage(type, text) {
    const container = document.getElementById("chatbot-messages");
    if (!container) return;
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  async handleResponse(userMsg) {
    const typing = document.getElementById("chat-typing");
    if (typing) typing.style.display = "block";

    try {
      const res = await fetch(`${backendURL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });

      if (typing) typing.style.display = "none";

      if (res.ok) {
        const data = await res.json();
        this.addMessage("bot", data.response);
      } else {
        const data = await res.json();
        this.addMessage("bot", data.error || "I'm having trouble connecting to my brain right now. Please try again later!");
      }
    } catch (e) {
      if (typing) typing.style.display = "none";
      console.error(e);
      this.addMessage("bot", "Network error. I'm currently offline.");
    }
  }
};

// ─── UTILITIES ────────────────────────────────────────────────────────────
function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
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
    type === "success"
      ? "check-circle"
      : type === "error"
        ? "times-circle"
        : "info-circle";
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

// ─── STANDARD NAV ─────────────────────────────────────────────────────────
function buildNav() {
  const nav = document.querySelector(".navbar .container");
  if (!nav) return;
  nav.style.cssText =
    "display:flex; align-items:center; width:100%; gap:1.5rem; max-width: 1280px; margin: 0 auto; padding: 0 1.5rem;";
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
    <div class="nav-cta" style="margin-left: auto;">
      <a href="donor.html"    class="btn btn-outline btn-sm">Donor Login</a>
      <a href="hospital.html" class="btn btn-primary btn-sm">Hospital Login</a>
    </div>
  `;
  setPageActive();
  window.addEventListener("scroll", () => {
    document.querySelector(".navbar").style.boxShadow =
      window.scrollY > 20 ? "0 4px 20px rgba(0,0,0,0.08)" : "none";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  Chatbot.init();
});

// ─── EMAIL NOTIFIER (EmailJS) ────────────────────────────────────────────────
// Sends real notification emails to matching donors when a hospital creates a request.
//
// SETUP (5 min, free at emailjs.com):
//  1. Create account → Add Email Service (Gmail) → copy SERVICE_ID
//  2. Create Template (see implementation_plan.md) → copy TEMPLATE_ID
//  3. Dashboard → Account → copy PUBLIC_KEY
//  4. Paste your values below – leave as empty string '' to disable silently.

const EmailNotifier = {
  SERVICE_ID: "", // e.g. 'service_abc123'
  TEMPLATE_ID: "", // e.g. 'template_xyz789'
  PUBLIC_KEY: "", // e.g. 'user_AbCdEfGhIj'

  _ready() {
    return (
      this.SERVICE_ID &&
      this.TEMPLATE_ID &&
      this.PUBLIC_KEY &&
      typeof emailjs !== "undefined"
    );
  },

  _init() {
    if (typeof emailjs !== "undefined" && this.PUBLIC_KEY) {
      emailjs.init(this.PUBLIC_KEY);
    }
  },

  /**
   * Called by hospital.html after Matching.createRequest().
   * Sends one email per matching donor (same city + blood type).
   * @param {Object} req     - The newly created blood request
   * @param {Array}  matched - Array of matching donor objects
   */
  async sendToMatchingDonors(req, matched) {
    if (!this._ready()) {
      if (!this.PUBLIC_KEY) {
        console.info(
          "[BLOODHUB EmailNotifier] EmailJS not configured — skipping email notifications.\nSee app.js EmailNotifier config to set up real emails.",
        );
      } else {
        console.warn(
          "[BLOODHUB EmailNotifier] emailjs SDK not loaded on this page.",
        );
      }
      return { sent: 0, skipped: matched.length };
    }

    this._init();

    let sent = 0;
    const dashboardUrl = window.location.origin + "/donor.html";

    for (const donor of matched) {
      const params = {
        donor_name: donor.name,
        to_email: donor.email,
        blood_type: req.bloodType,
        city: req.city,
        hospital_name: req.hospitalName,
        urgency: req.urgency,
        patient_condition: req.patientCondition,
        quantity: req.quantity,
        dashboard_url: dashboardUrl,
      };

      try {
        await emailjs.send(this.SERVICE_ID, this.TEMPLATE_ID, params);
        sent++;
        console.info(
          `[BLOODHUB EmailNotifier] ✅ Email sent to ${donor.name} (${donor.email})`,
        );
      } catch (err) {
        console.error(
          `[BLOODHUB EmailNotifier] ❌ Failed for ${donor.email}:`,
          err,
        );
      }
    }

    console.info(
      `[BLOODHUB EmailNotifier] Done — ${sent}/${matched.length} emails sent.`,
    );
    return { sent, skipped: matched.length - sent };
  },
};
