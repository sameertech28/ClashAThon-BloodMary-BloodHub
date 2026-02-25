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

const LS = {
  KEY_DONORS: "bh_v4_donors",
  KEY_HOSPITALS: "bh_v4_hospitals",
  KEY_REQUESTS: "bh_v4_requests",
  KEY_IDS: "bh_v4_ids",

  load() {
    // If localStorage has data use it, otherwise seed with defaults
    const d = localStorage.getItem(this.KEY_DONORS);
    const h = localStorage.getItem(this.KEY_HOSPITALS);
    const r = localStorage.getItem(this.KEY_REQUESTS);

    donors = d ? JSON.parse(d) : JSON.parse(JSON.stringify(SEED_DONORS));
    hospitals = h ? JSON.parse(h) : JSON.parse(JSON.stringify(SEED_HOSPITALS));
    bloodRequests = r
      ? JSON.parse(r)
      : JSON.parse(JSON.stringify(SEED_REQUESTS));

    // IDs
    const ids = localStorage.getItem(this.KEY_IDS);
    if (ids) {
      const parsed = JSON.parse(ids);
      nextDonorId = parsed.nextDonorId;
      nextHospitalId = parsed.nextHospitalId;
      nextRequestId = parsed.nextRequestId;
    } else {
      nextDonorId = 1;
      nextHospitalId = 1;
      nextRequestId = 100;
    }

    // Seed first-time only
    if (!d) this.saveDonors();
    if (!h) this.saveHospitals();
    if (!r) this.saveRequests();
  },

  saveDonors() {
    localStorage.setItem(this.KEY_DONORS, JSON.stringify(donors));
    this._saveIds();
  },
  saveHospitals() {
    localStorage.setItem(this.KEY_HOSPITALS, JSON.stringify(hospitals));
    this._saveIds();
  },
  saveRequests() {
    localStorage.setItem(this.KEY_REQUESTS, JSON.stringify(bloodRequests));
    this._saveIds();
  },
  _saveIds() {
    localStorage.setItem(
      this.KEY_IDS,
      JSON.stringify({ nextDonorId, nextHospitalId, nextRequestId }),
    );
  },

  // Dev helper — call LS.reset() in console to wipe all data and start fresh
  reset() {
    [
      this.KEY_DONORS,
      this.KEY_HOSPITALS,
      this.KEY_REQUESTS,
      this.KEY_IDS,
    ].forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
    location.reload();
  },
};

// ─── LIVE DATA ARRAYS (populated from localStorage on load) ──────────────
let donors = [];
let hospitals = [];
let bloodRequests = [];
let nextDonorId = 1;
let nextHospitalId = 1;
let nextRequestId = 100;

// Initialise immediately
LS.load();

// ─── SESSION (tab-level, does not persist across browser close) ───────────
const Session = {
  setDonor(donor) {
    sessionStorage.setItem("bh_donor_session", JSON.stringify(donor));
  },
  setHospital(h) {
    sessionStorage.setItem("bh_hospital_session", JSON.stringify(h));
  },
  getDonor() {
    const d = sessionStorage.getItem("bh_donor_session");
    return d ? JSON.parse(d) : null;
  },
  getHospital() {
    const h = sessionStorage.getItem("bh_hospital_session");
    return h ? JSON.parse(h) : null;
  },
  clearDonor() {
    sessionStorage.removeItem("bh_donor_session");
  },
  clearHospital() {
    sessionStorage.removeItem("bh_hospital_session");
  },
  // Get the live donor object (re-read from in-memory array which was loaded from localStorage)
  liveDonor() {
    const s = this.getDonor();
    return s ? donors.find((d) => d.id === s.id) || s : null;
  },
  liveHospital() {
    const s = this.getHospital();
    return s ? hospitals.find((h) => h.id === s.id) || s : null;
  },
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
  loginDonor(email, password) {
    const d = donors.find((x) => x.email === email && x.password === password);
    if (!d) return { ok: false, msg: "Invalid email or password." };
    Session.setDonor(d);
    return { ok: true, donor: d };
  },
  loginHospital(email, password) {
    const h = hospitals.find(
      (x) => x.email === email && x.password === password,
    );
    if (!h) return { ok: false, msg: "Invalid email or password." };
    if (!h.verified)
      return {
        ok: false,
        msg: "Hospital not yet verified. Please wait for approval.",
      };
    Session.setHospital(h);
    return { ok: true, hospital: h };
  },
  registerDonor(data) {
    if (donors.find((x) => x.email === data.email))
      return { ok: false, msg: "Email already registered." };
    const err = Validation.getError(data);
    if (err) return { ok: false, msg: err };
    const d = {
      id: nextDonorId++,
      ...data,
      available: true,
      donations: [],
      responses: [],
    };
    donors.push(d);
    LS.saveDonors(); // ← persist immediately
    Session.setDonor(d);
    return { ok: true, donor: d };
  },

  registerHospital(data) {
    if (hospitals.find((x) => x.email === data.email))
      return { ok: false, msg: "Email already registered." };
    const err = Validation.getError(data);
    if (err) return { ok: false, msg: err };
    const h = { id: nextHospitalId++, ...data, verified: true };
    hospitals.push(h);
    LS.saveHospitals(); // ← persist immediately
    Session.setHospital(h);
    return { ok: true, hospital: h };
  },
  logout() {
    // Clear any active donor/hospital sessions and return to landing page
    Session.clearDonor();
    Session.clearHospital();
    window.location.href = "index.html";
  },
};

const Auths = {
  registerHospital: async function (data) {
    console.log("here data on app : ", data);
    // Frontend checks (keep these)
    if (hospitals.find((x) => x.email === data.email)) {
      return { ok: false, msg: "Email already registered." };
    }

    const err = Validation.getError(data);
    if (err) return { ok: false, msg: err };

    try {
      // 🔹 Send data to backend
      const res = await axios.post(`${backendURL}/register-hospital`, data);

      // Expecting backend to return created hospital
      const hospitalFromServer = res.data;

      const h = {
        id: hospitalFromServer.id ?? nextHospitalId++,
        ...hospitalFromServer,
        verified: hospitalFromServer.verified ?? true,
      };

      // 🔹 Keep localStorage in sync (important for your app)
      hospitals.push(h);
      LS.saveHospitals();
      Session.setHospital(h);

      return { ok: true, hospital: h };
    } catch (error) {
      // 🔹 Clean error handling
      const msg =
        error.response?.data?.message ||
        error.message ||
        "Hospital registration failed.";

      return { ok: false, msg };
    }
  },
}
// ─── MATCHING ALGORITHM ───────────────────────────────────────────────────
const Matching = {
  /**
   * Get all ACTIVE requests visible to a donor.
   * Rules: same CITY + same BLOOD TYPE.
   * Which hospital issued the request is irrelevant.
   */
  getRequestsForDonor(donor) {
    if (!donor.available) return [];
    return bloodRequests.filter(
      (r) =>
        r.city === donor.city &&
        r.bloodType === donor.bloodType &&
        r.status === "active",
    );
  },

  getDonorsForCity(city, bloodType) {
    return donors.filter(
      (d) => d.city === city && d.bloodType === bloodType && d.available,
    );
  },

  getHospitalRequests(hospitalId) {
    // All requests created by this hospital
    return bloodRequests.filter((r) => r.hospitalId === hospitalId);
  },

  getRespondersForRequest(requestId) {
    const req = bloodRequests.find((r) => r.id === requestId);
    if (!req) return [];
    return donors.filter((d) => req.responders.includes(d.id));
  },

  respondToRequest(donorId, requestId) {
    // Always re-read from live array (could have been updated by another page)
    const req = bloodRequests.find((r) => r.id === requestId);
    const donor = donors.find((d) => d.id === donorId);
    if (!req || !donor)
      return { ok: false, msg: "Request or donor not found." };
    if (req.responders.includes(donorId))
      return { ok: false, msg: "Already responded." };

    req.responders.push(donorId);
    if (!donor.responses.includes(requestId)) donor.responses.push(requestId);

    LS.saveRequests(); // ← hospital will see this responder in real time
    LS.saveDonors();
    Session.setDonor(donor);
    return { ok: true };
  },

  createRequest(data) {
    const req = {
      id: nextRequestId++,
      ...data,
      status: "active",
      timestamp: new Date().toISOString(),
      responders: [],
    };
    bloodRequests.unshift(req);
    LS.saveRequests(); // ← ALL donor pages will now see this request
    return req;
  },

  markFulfilled(requestId) {
    const req = bloodRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = "fulfilled";
      LS.saveRequests();
    }
  },

  getMatchCountPreview(bloodType, city) {
    return donors.filter(
      (d) => d.bloodType === bloodType && d.city === city && d.available,
    );
  },
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

document.addEventListener("DOMContentLoaded", buildNav);

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
