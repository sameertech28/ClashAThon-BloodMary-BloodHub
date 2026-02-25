const fs = require('fs');
let html = fs.readFileSync('donor.html', 'utf8');
const anchor = '<script src="app.js"></script>';
const idx = html.indexOf(anchor);
if (idx !== -1) {
    const before = html.substring(0, idx + anchor.length);
    const correctScript = `
    <script>
      let currentDonor = null;
      let currentRequests = [];

      // ── Check if already logged in ─────────────────────────
      window.addEventListener('load', () => {
        const saved = Session.liveDonor();
        if (saved) {
          currentDonor = saved;
          showDashboard();
        }
      });

      // ── Auth Toggles ───────────────────────────────────────
      function switchToRegister() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('register-view').style.display = 'flex';
      }
      function switchToLogin() {
        document.getElementById('register-view').style.display = 'none';
        document.getElementById('forgot-view').style.display = 'none';
        document.getElementById('login-view').style.display = 'flex';
      }
      function switchToForgot() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('register-view').style.display = 'none';
        document.getElementById('forgot-view').style.display = 'flex';
      }

      function handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const msgBox = document.getElementById('forgot-message');

        msgBox.style.display = 'block';
        msgBox.innerHTML = '<i class="fas fa-paper-plane"></i> Recovery link sent to <strong>' + email + '</strong>! Please check your inbox.';
        showNotif('Recovery link sent successfully!', 'success');

        setTimeout(() => {
          if (document.getElementById('forgot-view').style.display === 'flex') {
            switchToLogin();
            msgBox.style.display = 'none';
          }
        }, 6000);
      }

      // ── Login ───────────────────────────────────────────────
      async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const res = await Auth.loginDonor(email, pass);
        if (!res.ok) {
          const el = document.getElementById('login-error');
          el.style.display = 'flex';
          el.innerHTML = '<i class="fas fa-circle-xmark"></i> ' + res.msg;
          return;
        }
        currentDonor = res.donor;
        showDashboard();
        showNotif('Welcome back, ' + currentDonor.name.split(' ')[0] + '! 🩸', 'success');
      }

      // ── Register ────────────────────────────────────────────
      async function handleRegister(e) {
        e.preventDefault();
        const data = {
          name: document.getElementById('reg-name').value,
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-pass').value,
          phone: '+977' + document.getElementById('reg-phone').value,
          blood_type: document.getElementById('reg-blood').value,
          city: document.getElementById('reg-city').value,
        };
        const res = await Auth.registerDonor(data);
        if (!res.ok) {
          const el = document.getElementById('reg-error');
          el.style.display = 'flex';
          el.innerHTML = '<i class="fas fa-circle-xmark"></i> ' + res.msg;
          return;
        }
        
        const loginRes = await Auth.loginDonor(data.email, data.password);
        if (loginRes.ok) {
            currentDonor = loginRes.donor;
            showDashboard();
            showNotif('Welcome, ' + currentDonor.name.split(' ')[0] + '! You are now a BLOODHUB Hero! 🎉', 'success');
        }
      }

      // ── Logout ──────────────────────────────────────────────
      function handleLogout() {
        Auth.logout();
      }

      // ── Show Dashboard ──────────────────────────────────────
      function showDashboard() {
        document.getElementById('auth-panel').style.display = 'none';
        document.getElementById('dashboard-panel').style.display = 'block';
        populateDashboard();
        refreshDashboardData();
      }

      async function refreshDashboardData() {
          currentRequests = await Matching.getRequestsForDonor();
          renderMatchingRequests();
          renderMyResponses();
      }

      function populateDashboard() {
        const d = currentDonor;
        const bType = d.bloodType || d.blood_type;
        document.getElementById('dash-welcome').textContent = 'Welcome back, ' + d.name + '!';
        document.getElementById('dash-sub').textContent = 'Blood Type ' + bType + ' · ' + d.city + ' · Dashboard';
        document.getElementById('dash-blood-badge').innerHTML = bloodBadgeHTML(bType, 'lg');
        document.getElementById('dash-pname').textContent = d.name;
        document.getElementById('dash-pcity').innerHTML = '<i class="fas fa-location-dot"></i> ' + d.city;
        document.getElementById('dash-pphone').innerHTML = '<i class="fas fa-phone"></i> ' + d.phone;
        document.getElementById('avail-toggle').checked = d.available === 1 || d.available === true;
        document.getElementById('avail-label').textContent = d.available ? 'Available to Donate' : 'Unavailable';
        document.getElementById('dash-match-sub').textContent = 'Showing active requests in ' + d.city + ' for blood type ' + bType;
      }

      // ── Render Matching Requests ────────────────────────────
      function renderMatchingRequests() {
        const d = currentDonor;
        const box = document.getElementById('matching-requests-container');
        const bType = d.bloodType || d.blood_type;
        const matches = currentRequests.filter(r => r.status !== 'Fulfilled' && r.status !== 'Closed' && !r.responders.includes(d.id));

        if (!d.available) {
          box.innerHTML = '<div class="empty-state card"><i class="fas fa-toggle-off"></i><h4>You\\'re currently unavailable</h4><p>Toggle your availability to see matching emergency requests.</p></div>';
          return;
        }

        if (matches.length === 0) {
          box.innerHTML = '<div class="empty-state card"><i class="fas fa-circle-check" style="color:var(--success);"></i><h4>No active requests right now</h4><p>No blood requests in ' + d.city + ' for type ' + bType + ' at this moment. You\\'ll be alerted when a new one arrives!</p></div>';
          return;
        }

        box.innerHTML = matches.map(req => {
          return '<div class="request-card ' + (req.urgency ? req.urgency.toLowerCase() : 'normal') + '" style="margin-bottom:1rem;">' +
            '<div class="request-card-header">' +
              bloodBadgeHTML(req.bloodType) +
              '<div style="flex:1;">' +
                '<div style="font-weight:700; font-family:var(--font-heading); color:var(--gray-900);">' + req.hospitalName + '</div>' +
                '<div style="font-size:0.82rem; color:var(--gray-600);"><i class="fas fa-location-dot"></i> ' + req.city + '</div>' +
              '</div>' +
              urgencyBadgeHTML(req.urgency || 'Normal') +
            '</div>' +
            '<div class="request-card-body">' +
              '<p style="font-size:0.92rem; color:var(--gray-800); margin-bottom:0.75rem;">' + req.patientCondition + '</p>' +
              '<div style="display:flex; gap:1.5rem; flex-wrap:wrap;">' +
                '<span class="chip"><i class="fas fa-flask"></i> ' + req.bloodType + '</span>' +
                '<span class="chip"><i class="fas fa-vials"></i> ' + req.quantity + '</span>' +
                '<span class="chip"><i class="fas fa-hospital"></i> ' + req.hospitalName + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="request-card-footer">' +
              '<button class="coming-btn" onclick="respondToRequest(' + req.id + ', this)"><i class="fas fa-hand-fist"></i> 🚨 I\\'M COMING — I Can Donate</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      async function respondToRequest(requestId, btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;
        
        const res = await Matching.respondToRequest(requestId);
        if (!res.ok) {
          showNotif(res.msg, 'error');
          btn.innerHTML = '<i class="fas fa-hand-fist"></i> 🚨 I\\'M COMING — I Can Donate';
          btn.disabled = false;
          return;
        }
        btn.className = 'coming-btn responded';
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Response Sent! Hospital will contact you soon.';
        showNotif('🎉 Your response has been sent to the hospital! They will contact you shortly.', 'success');
        refreshDashboardData();
      }

      // ── My Responses ────────────────────────────────────────
      function renderMyResponses() {
        const d = currentDonor;
        const box = document.getElementById('my-responses-container');
        const responded = currentRequests.filter(r => r.responders.includes(d.id));

        if (responded.length === 0) {
          box.innerHTML = '<div class="card"><p style="color:var(--gray-400); font-size:0.9rem; text-align:center; padding:1rem;">You haven\\'t responded to any requests yet.</p></div>';
          return;
        }
        box.innerHTML = responded.map(r => {
          return '<div class="card" style="margin-bottom:1rem;">' +
            '<div class="flex gap-2">' +
              bloodBadgeHTML(r.bloodType, 'sm') +
              '<div>' +
                '<div style="font-weight:600; font-size:0.9rem;">' + r.hospitalName + '</div>' +
                '<div style="font-size:0.8rem; color:var(--gray-600);">' + r.city + '</div>' +
              '</div>' +
              '<span class="status-badge active" style="margin-left:auto;"><span class="dot dot-green"></span> Awaiting Contact</span>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      // ── Availability Toggle ─────────────────────────────────
      function toggleAvailability() {
        const checked = document.getElementById('avail-toggle').checked;
        currentDonor.available = checked ? 1 : 0;
        document.getElementById('avail-label').textContent = checked ? 'Available to Donate' : 'Unavailable';
        showNotif(
          checked ? 'You are now available for donation requests! 💪' : 'You have been marked as unavailable.',
          checked ? 'success' : 'error'
        );
        renderMatchingRequests();
      }
    </script>
  </body>
</html>
`;
    fs.writeFileSync('donor.html', before + '\n' + correctScript);
}

let hhtml = fs.readFileSync('hospital.html', 'utf8');
const hidx = hhtml.indexOf(anchor);
if (hidx !== -1) {
    const before = hhtml.substring(0, hidx + anchor.length);
    const correctScriptH = `
    <script>
      let currentHospital = null;
      let expandedRequestId = null;
      let myRequests = [];

      window.addEventListener('load', () => {
        const saved = Session.liveHospital();
        if (saved) {
          currentHospital = saved;
          showDashboard();
        }
      });

      function switchToRegister() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('register-view').style.display = 'flex';
      }
      function switchToLogin() {
        document.getElementById('register-view').style.display = 'none';
        document.getElementById('forgot-view').style.display = 'none';
        document.getElementById('login-view').style.display = 'flex';
      }
      function switchToForgot() {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('register-view').style.display = 'none';
        document.getElementById('forgot-view').style.display = 'flex';
      }

      function handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const msgBox = document.getElementById('forgot-message');
        msgBox.style.display = 'block';
        msgBox.innerHTML = '<i class="fas fa-paper-plane"></i> Hospital recovery instructions sent to <strong>' + email + '</strong>.';
        showNotif('Recovery request processed.', 'success');
        setTimeout(() => {
          if (document.getElementById('forgot-view').style.display === 'flex') {
            switchToLogin();
            msgBox.style.display = 'none';
          }
        }, 6000);
      }

      async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const res = await Auth.loginHospital(email, pass);
        if (!res.ok) {
          const el = document.getElementById('login-error');
          el.style.display = 'flex';
          el.innerHTML = '<i class="fas fa-circle-xmark"></i> ' + res.msg;
          return;
        }
        currentHospital = res.hospital;
        showDashboard();
        showNotif('Welcome, ' + currentHospital.name + '!', 'success');
      }

      async function handleRegister(e) {
        e.preventDefault();
        const data = {
          name: document.getElementById('reg-name').value,
          license: document.getElementById('reg-license').value,
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-pass').value,
          phone: '+977' + document.getElementById('reg-phone').value,
          city: document.getElementById('reg-city').value,
        };
        const res = await Auth.registerHospital(data);
        if (!res.ok) {
          const el = document.getElementById('reg-error');
          el.style.display = 'flex';
          el.innerHTML = '<i class="fas fa-circle-xmark"></i> ' + res.msg;
          return;
        }
        const loginRes = await Auth.loginHospital(data.email, data.password);
        if (loginRes.ok) {
            currentHospital = loginRes.hospital;
            showDashboard();
            showNotif(currentHospital.name + ' registered and auto-verified! ✅', 'success');
        }
      }

      function handleLogout() {
        Auth.logout();
      }

      function showDashboard() {
        document.getElementById('auth-panel').style.display = 'none';
        document.getElementById('dashboard-panel').style.display = 'block';
        document.getElementById('dash-title').textContent = currentHospital.name;
        document.getElementById('dash-sub').textContent = currentHospital.city + ' · Dashboard';
        document.getElementById('req-city').value = currentHospital.city;
        refreshDashboardData();
      }

      async function refreshDashboardData() {
          myRequests = await Matching.getHospitalRequests();
          for (let req of myRequests) {
              if (req.status !== 'Fulfilled' && req.status !== 'Closed') {
                  const dash = await Matching.getHospitalDashboard(req.id);
                  if (dash.ok) {
                      req.responses = dash.data.responses;
                  }
              }
          }
          renderActiveRequests();
          updateStats();
      }

      function updateStats() {
        const active = myRequests.filter((r) => r.status !== 'Fulfilled' && r.status !== 'Closed');
        const totalResp = active.reduce((sum, r) => sum + (r.responses ? r.responses.length : 0), 0);
        document.getElementById('stat-active').textContent = active.length;
        document.getElementById('stat-responders').textContent = totalResp;
        document.getElementById('stat-total').textContent = myRequests.length;
      }

      async function handleCreateRequest(e) {
        e.preventDefault();
        const data = {
          hospitalId: currentHospital.id,
          hospitalName: currentHospital.name,
          blood_type: document.getElementById('req-blood').value,
          quantity: document.getElementById('req-qty').value,
          urgency: document.getElementById('req-urgency').value,
          city: currentHospital.city,
          patient_details: document.getElementById('req-condition').value,
        };
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        
        const res = await Matching.createRequest(data);
        if (!res.ok) {
            showNotif(res.msg, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-siren"></i> 🚨 CREATE EMERGENCY REQUEST';
            return;
        }
        
        const matchedDonors = res.data.matchedDonors;
        const el = document.getElementById('create-success');
        el.style.display = 'flex';
        el.innerHTML = '<i class="fas fa-check-circle"></i> Request created! <strong>' + matchedDonors + ' donor' + (matchedDonors !== 1 ? 's' : '') + '</strong> with blood type ' + data.blood_type + ' in ' + data.city + ' alerted.';
        e.target.reset();
        document.getElementById('req-city').value = currentHospital.city;
        setTimeout(() => (el.style.display = 'none'), 6000);
        
        await refreshDashboardData();
        showNotif('🚨 Emergency request sent!', 'success');
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-siren"></i> 🚨 CREATE EMERGENCY REQUEST';
      }

      function renderActiveRequests() {
        const active = myRequests.filter((r) => r.status !== 'Fulfilled' && r.status !== 'Closed');
        const past = myRequests.filter((r) => r.status === 'Fulfilled' || r.status === 'Closed');
        const box = document.getElementById('active-requests-container');
        const pastBox = document.getElementById('past-requests-container');

        if (active.length === 0) {
          box.innerHTML = '<div class="empty-state card"><i class="fas fa-check-circle" style="color:var(--success);"></i><h4>No active requests</h4><p>Create a new blood request using the form on the left.</p></div>';
        } else {
          box.innerHTML = active.map((req) => {
              const responders = req.responses || [];
              const isExpanded = expandedRequestId === req.id;
              return '<div class="request-card ' + (req.urgency ? req.urgency.toLowerCase() : 'normal') + '" style="margin-bottom:1rem;">' +
                '<div class="request-card-header">' +
                  bloodBadgeHTML(req.bloodType, 'sm') +
                  '<div style="flex:1;">' +
                    '<div style="font-weight:700; font-family:var(--font-heading); font-size:0.95rem;">' + req.bloodType + ' Blood Needed</div>' +
                    '<div style="font-size:0.78rem; color:var(--gray-600);">' + req.quantity + '</div>' +
                  '</div>' +
                  urgencyBadgeHTML(req.urgency || 'Normal') +
                  '<span class="status-badge active"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Active</span>' +
                '</div>' +
                '<div class="request-card-body">' +
                  '<p style="font-size:0.88rem; color:var(--gray-700); margin-bottom:0.75rem;">' + req.patientCondition + '</p>' +
                  '<div class="flex gap-2" style="flex-wrap:wrap;">' +
                    '<span class="chip"><i class="fas fa-users"></i> <strong>' + responders.length + '</strong> Responder' + (responders.length !== 1 ? 's' : '') + '</span>' +
                    '<span class="chip"><i class="fas fa-location-dot"></i> ' + req.city + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="request-card-footer">' +
                  '<div style="display:flex; gap:1rem; justify-content:space-between; align-items:center; flex-wrap:wrap;">' +
                    '<button class="btn btn-outline btn-sm" onclick="toggleResponders(' + req.id + ')">' +
                      '<i class="fas fa-users"></i> ' + (isExpanded ? 'Hide' : 'View') + ' Responders (' + responders.length + ')' +
                    '</button>' +
                    '<button class="btn btn-sm" style="background:var(--gray-100); color:var(--gray-600); border-radius:var(--radius-full); border:none; cursor:pointer;" onclick="markFulfilled(' + req.id + ')">' +
                      '<i class="fas fa-check"></i> Mark Fulfilled' +
                    '</button>' +
                  '</div>' +
                  (isExpanded ? renderRespondersTable(responders, req.id) : '') +
                '</div>' +
              '</div>';
          }).join('');
        }

        if (past.length === 0) {
          pastBox.innerHTML = '<div class="card"><p style="color:var(--gray-400); font-size:0.88rem; text-align:center; padding:0.75rem;">No past requests yet.</p></div>';
        } else {
          pastBox.innerHTML = past.slice(0, 5).map((req) => 
            '<div class="card" style="margin-bottom:0.75rem; display:flex; align-items:center; gap:1rem;">' +
              bloodBadgeHTML(req.bloodType, 'sm') +
              '<div style="flex:1;">' +
                '<div style="font-weight:600; font-size:0.88rem;">' + req.bloodType + ' - ' + req.quantity + '</div>' +
                '<div style="font-size:0.78rem; color:var(--gray-600);">' + req.status + '</div>' +
              '</div>' +
              '<span class="status-badge fulfilled">Fulfilled</span>' +
            '</div>'
          ).join('');
        }
      }

      function renderRespondersTable(responders, reqId) {
        if (responders.length === 0) {
          return '<div style="margin-top:1rem; padding:1.5rem; background:var(--gray-50); border-radius:var(--radius-sm); text-align:center;">' +
            '<i class="fas fa-hourglass-half" style="color:var(--gray-400); margin-bottom:0.5rem;"></i>' +
            '<p style="font-size:0.88rem; color:var(--gray-400);">No donors have responded yet. Matching donors can see this request in their dashboard.</p>' +
          '</div>';
        }
        return '<div class="responders-panel" style="margin-top:1rem;">' +
          '<div class="responders-panel-header">' +
            '<span><i class="fas fa-users"></i> Donor Responders</span>' +
            '<span>' + responders.length + ' ready to donate</span>' +
          '</div>' +
          '<div class="table-wrapper">' +
            '<table>' +
              '<thead><tr><th>Donor</th><th>Blood Type</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead>' +
              '<tbody>' +
                responders.map((d) => 
                  '<tr>' +
                    '<td><strong>' + d.name + '</strong></td>' +
                    '<td>' + bloodBadgeHTML(d.blood_type, 'sm') + '</td>' +
                    '<td><code>' + d.phone + '</code></td>' +
                    '<td><span class="status-badge active"><span class="dot dot-green"></span> Coming</span></td>' +
                    '<td><button class="btn btn-primary btn-sm" onclick="contactDonor(\\'' + d.name + '\\', \\'' + d.phone + '\\')">' +
                      '<i class="fas fa-phone"></i> Contact' +
                    '</button></td>' +
                  '</tr>'
                ).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      }

      function toggleResponders(reqId) {
        expandedRequestId = expandedRequestId === reqId ? null : reqId;
        renderActiveRequests();
      }

      async function markFulfilled(reqId) {
        await Matching.markFulfilled(reqId);
        showNotif('Request marked as fulfilled. Great work! 🙌', 'success');
        refreshDashboardData();
      }

      function contactDonor(name, phone) {
        showNotif('📞 Contacting ' + name + ' at ' + phone, 'success');
        alert('Contact Donor:\\n\\nName: ' + name + '\\nPhone: ' + phone + '\\n\\nIn production, this would initiate a masked call or send a notification.');
      }
    </script>
  </body>
</html>
`;
    fs.writeFileSync('hospital.html', before + '\n' + correctScriptH);
}
