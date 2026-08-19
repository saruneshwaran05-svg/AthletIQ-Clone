// AthletIQ Application State & Logic
let currentUser = null;
let currentToken = null;
let loginRole = 'STUDENT';
let registerRole = 'STUDENT';
let activeCharts = {};

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initApp();
  if (window.lucide) lucide.createIcons();
  
  // Default date on practice form to today
  const dateInput = document.getElementById('prac-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
});

function initTheme() {
  const savedTheme = localStorage.getItem('athletiq_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  applyTheme(isDark);
}

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  }
  localStorage.setItem('athletiq_theme', isDark ? 'dark' : 'light');
  if (window.lucide) lucide.createIcons();
}

function initApp() {
  currentToken = localStorage.getItem('athletiq_token') || sessionStorage.getItem('athletiq_token');
  const userStr = localStorage.getItem('athletiq_user') || sessionStorage.getItem('athletiq_user');
  
  if (currentToken && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      showAppWorkspace();
    } catch (e) {
      handleLogout();
    }
  } else {
    showLandingPage();
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  
  let bgClass = 'bg-slate-800 text-white';
  if (type === 'success') bgClass = 'bg-emerald-600 text-white';
  if (type === 'error') bgClass = 'bg-rose-600 text-white';
  if (type === 'warning') bgClass = 'bg-amber-600 text-white';

  toast.className = `${bgClass} px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center justify-between space-x-3 pointer-events-auto transition transform duration-300 translate-y-2 opacity-0 max-w-sm`;
  toast.innerHTML = `<span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Dark Mode Toggle
function toggleDarkMode() {
  const isDark = !document.documentElement.classList.contains('dark');
  applyTheme(isDark);
}

// Password Hide / Show Toggle
function togglePasswordVisibility(inputId, buttonId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  let btn = typeof buttonId === 'string' ? document.getElementById(buttonId) : buttonId;
  if (btn) {
    const iconName = isPassword ? 'eye-off' : 'eye';
    btn.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4"></i>`;
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

function hideAuthErrors() {
  const loginAlert = document.getElementById('login-error-alert');
  if (loginAlert) loginAlert.classList.add('hidden');
  const regAlert = document.getElementById('register-error-alert');
  if (regAlert) regAlert.classList.add('hidden');
}

// View Switches
function showLandingPage() {
  document.getElementById('landing-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showAppWorkspace() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  window.scrollTo(0, 0);

  document.getElementById('landing-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  const userRole = (currentUser.role || '').toUpperCase();

  // Update user badge
  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('user-display-role').textContent = userRole;
  document.getElementById('user-avatar-badge').textContent = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  // Role based navigation setup
  if (userRole === 'STUDENT') {
    document.getElementById('student-nav-group').classList.remove('hidden');
    document.getElementById('coach-nav-group').classList.add('hidden');
    navTo('dashboard');
  } else if (userRole === 'COACH') {
    document.getElementById('student-nav-group').classList.add('hidden');
    document.getElementById('coach-nav-group').classList.remove('hidden');
    navTo('coach-dashboard');
  }
}

// Navigation Router
function navTo(viewName) {
  window.scrollTo(0, 0);
  const mainScroll = document.querySelector('#app-view main');
  if (mainScroll) mainScroll.scrollTop = 0;

  const views = [
    'dashboard', 'my-sports', 'practice', 'history', 'analytics', 
    'ai-recs', 'goals', 'coach-link', 'coach-dashboard', 'coach-requests', 'coach-students'
  ];

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  // Trigger data fetches per view
  if (viewName === 'dashboard') {
    populateStudentSportFilters();
    loadStudentDashboard();
  }
  if (viewName === 'my-sports') loadStudentSports();
  if (viewName === 'practice') loadPracticeFormSports();
  if (viewName === 'history') {
    populateStudentSportFilters();
    loadPracticeHistory();
  }
  if (viewName === 'analytics') {
    populateStudentSportFilters();
    loadAnalyticsCharts();
  }
  if (viewName === 'ai-recs') loadAIRecommendations();
  if (viewName === 'goals') loadGoals();
  if (viewName === 'coach-link') searchCoaches();
  if (viewName === 'coach-dashboard') loadCoachDashboard();
  if (viewName === 'coach-requests') loadCoachRequests();
  if (viewName === 'coach-students') loadCoachStudents();

  lucide.createIcons();
}

// Authentication Modals
function openAuthModal(tab, targetRole = null) {
  document.getElementById('auth-modal').classList.remove('hidden');
  hideAuthErrors();
  switchAuthTab(tab);

  const roleToSet = targetRole || 'STUDENT';
  setLoginRole(roleToSet);
  setRegisterRole(roleToSet);

  if (window.lucide) lucide.createIcons();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  hideAuthErrors();
}

function switchAuthTab(tab) {
  hideAuthErrors();
  if (tab === 'login') {
    document.getElementById('login-form-container').classList.remove('hidden');
    document.getElementById('register-form-container').classList.add('hidden');
  } else {
    document.getElementById('login-form-container').classList.add('hidden');
    document.getElementById('register-form-container').classList.remove('hidden');
  }
}

function getSavedAccountsList() {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('athletiq_saved_accounts_v2')) || [];
  } catch (e) { list = []; }

  // Fallback / migration from legacy role-based keys if v2 list is empty
  if (list.length === 0) {
    ['STUDENT', 'COACH'].forEach(r => {
      const legacy = getSavedCredentials(r);
      legacy.forEach(item => {
        if (item && item.email && !list.some(a => a.email.toLowerCase() === item.email.toLowerCase())) {
          list.push({
            name: item.name || (item.email.split('@')[0]),
            email: item.email,
            password: item.password || '',
            role: r
          });
        }
      });
    });
  }
  return list;
}

function getSavedCredentials(role) {
  const keyList = role === 'STUDENT' ? 'athletiq_remembered_students' : 'athletiq_remembered_coaches';
  let raw = [];
  try {
    raw = JSON.parse(localStorage.getItem(keyList)) || [];
  } catch (e) { raw = []; }

  // Handle legacy string entries or structured credential objects
  return raw.map(item => {
    if (typeof item === 'string') {
      return { email: item, password: '' };
    }
    return item;
  }).filter(item => item && item.email);
}

function handleLoginEmailInput(emailVal) {
  if (!emailVal) {
    showSavedAccountsPopover('');
    return;
  }
  const cleanEmail = emailVal.trim().toLowerCase();
  const savedCreds = getSavedCredentials(loginRole);
  const matched = savedCreds.find(c => c.email.toLowerCase() === cleanEmail);

  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('login-remember-me');

  if (matched) {
    if (passwordInput && matched.password) {
      passwordInput.value = matched.password;
    }
    if (rememberCheckbox) {
      rememberCheckbox.checked = true;
    }
  }

  // Also update popover filtering dynamically
  showSavedAccountsPopover(emailVal);
}

function showSavedAccountsPopover(filterVal = '') {
  const popover = document.getElementById('login-saved-accounts-popover');
  const container = document.getElementById('saved-accounts-popover-list');
  if (!popover || !container) return;

  const accounts = getSavedAccountsList();
  const searchVal = filterVal ? filterVal.trim().toLowerCase() : '';

  // Filter accounts strictly by current active role (STUDENT for student login, COACH for coach login)
  const filtered = accounts.filter(a => {
    if (a.role && a.role.toUpperCase() !== loginRole.toUpperCase()) return false;
    if (!searchVal) return true;
    return a.email.toLowerCase().includes(searchVal) || (a.name && a.name.toLowerCase().includes(searchVal));
  });

  if (filtered.length === 0) {
    popover.classList.add('hidden');
    return;
  }

  container.innerHTML = '';
  filtered.forEach(acc => {
    const displayName = acc.name || (acc.email ? acc.email.split('@')[0] : 'User');

    container.innerHTML += `
      <div onclick="selectSavedAccount('${acc.email}')" 
        class="p-2.5 rounded-xl hover:bg-slate-800/90 cursor-pointer flex items-center justify-between transition border border-transparent hover:border-slate-700/80 group">
        <div>
          <div class="font-extrabold text-xs text-white group-hover:text-brand-300 transition flex items-center space-x-1.5">
            <span>${displayName}</span>
          </div>
          <div class="text-[11px] text-slate-400 font-medium">${acc.email}</div>
        </div>
        <button type="button" onclick="deleteSingleRememberedLogin('${acc.email}', event)" title="Delete saved login" class="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-700/50 transition">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  });

  if (window.lucide) window.lucide.createIcons();
  popover.classList.remove('hidden');
}

function clearAllRememberedLogins() {
  const keysToClear = [
    'athletiq_remembered_students',
    'athletiq_remembered_coaches',
    'athletiq_saved_accounts_v2',
    'athletiq_last_remembered_student_cred',
    'athletiq_last_remembered_coach_cred',
    'athletiq_last_remembered_student_email',
    'athletiq_last_remembered_coach_email',
    'athletiq_remember_email'
  ];
  keysToClear.forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('login-remember-me');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (rememberCheckbox) rememberCheckbox.checked = false;

  const popover = document.getElementById('login-saved-accounts-popover');
  if (popover) popover.classList.add('hidden');

  showToast('All remembered logins cleared successfully', 'info');
}

function deleteSingleRememberedLogin(email, e) {
  if (e) e.stopPropagation();
  if (!email) return;

  const cleanEmail = email.trim().toLowerCase();

  ['athletiq_remembered_students', 'athletiq_remembered_coaches', 'athletiq_saved_accounts_v2'].forEach(key => {
    try {
      let raw = JSON.parse(localStorage.getItem(key)) || [];
      if (Array.isArray(raw)) {
        raw = raw.filter(item => {
          const itemEmail = typeof item === 'string' ? item : item.email;
          return itemEmail && itemEmail.toLowerCase() !== cleanEmail;
        });
        localStorage.setItem(key, JSON.stringify(raw));
      }
    } catch (err) {}
  });

  ['athletiq_last_remembered_student_cred', 'athletiq_last_remembered_coach_cred'].forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.email && parsed.email.toLowerCase() === cleanEmail) {
          localStorage.removeItem(key);
        }
      }
    } catch (err) {}
  });

  const emailInput = document.getElementById('login-email');
  if (emailInput && emailInput.value.trim().toLowerCase() === cleanEmail) {
    emailInput.value = '';
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) passwordInput.value = '';
  }

  showSavedAccountsPopover();
}

function selectSavedAccount(email) {
  if (!email) return;
  const accounts = getSavedAccountsList();
  const matched = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('login-remember-me');

  if (matched) {
    if (emailInput) emailInput.value = matched.email;
    if (passwordInput && matched.password) passwordInput.value = matched.password;
    if (rememberCheckbox) rememberCheckbox.checked = true;
    if (matched.role && matched.role !== loginRole) {
      setLoginRole(matched.role);
    }
  } else {
    if (emailInput) emailInput.value = email;
  }

  const popover = document.getElementById('login-saved-accounts-popover');
  if (popover) popover.classList.add('hidden');
  hideAuthErrors();
}

// Global click listener to hide saved accounts popover when clicking outside
document.addEventListener('click', (e) => {
  const popover = document.getElementById('login-saved-accounts-popover');
  const emailInput = document.getElementById('login-email');
  if (!popover || !emailInput) return;
  if (!popover.contains(e.target) && e.target !== emailInput && !emailInput.contains(e.target)) {
    popover.classList.add('hidden');
  }
});

function selectRememberedEmail(email) {
  selectSavedAccount(email);
}

// Remember Me & Email Suggestions Helper
function updateEmailSuggestions(role) {
  const datalist = document.getElementById('login-email-suggestions');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const rememberCheckbox = document.getElementById('login-remember-me');
  if (!emailInput) return;

  if (datalist) datalist.innerHTML = '';

  const savedCreds = getSavedCredentials(role);
  let lastCred = null;
  const keyLast = role === 'STUDENT' ? 'athletiq_last_remembered_student_cred' : 'athletiq_last_remembered_coach_cred';

  try {
    const rawLast = localStorage.getItem(keyLast);
    if (rawLast) {
      lastCred = JSON.parse(rawLast);
    }
  } catch (e) { lastCred = null; }

  // Fallback for legacy key
  if (!lastCred) {
    const legacyEmail = role === 'STUDENT'
      ? (localStorage.getItem('athletiq_last_remembered_student_email') || localStorage.getItem('athletiq_remember_email'))
      : localStorage.getItem('athletiq_last_remembered_coach_email');
    if (legacyEmail) {
      lastCred = savedCreds.find(c => c.email.toLowerCase() === legacyEmail.toLowerCase()) || { email: legacyEmail, password: '' };
    }
  }

  if (!lastCred && savedCreds.length > 0) {
    lastCred = savedCreds[savedCreds.length - 1];
  }

  // Populate Datalist options (shows in browser email icon bar / suggestion popover)
  if (datalist) {
    savedCreds.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.email;
      datalist.appendChild(opt);
    });
  }

  // Pre-fill last remembered credentials for active role
  if (lastCred && lastCred.email) {
    emailInput.value = lastCred.email;
    if (passwordInput && lastCred.password) {
      passwordInput.value = lastCred.password;
    } else if (passwordInput) {
      passwordInput.value = '';
    }
    if (rememberCheckbox) rememberCheckbox.checked = true;
  } else {
    emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (rememberCheckbox) rememberCheckbox.checked = false;
  }
}

function saveRememberedCredentials(email, password, role, shouldRemember, name = '') {
  if (!email) return;
  const cleanEmail = email.trim();
  const keyList = role === 'STUDENT' ? 'athletiq_remembered_students' : 'athletiq_remembered_coaches';
  const keyLast = role === 'STUDENT' ? 'athletiq_last_remembered_student_cred' : 'athletiq_last_remembered_coach_cred';

  let savedCreds = getSavedCredentials(role);
  let savedAccounts = getSavedAccountsList();

  if (shouldRemember) {
    const accName = name || (cleanEmail.split('@')[0]);
    const newCred = { name: accName, email: cleanEmail, password: password || '', role: role };

    const existingIdx = savedCreds.findIndex(c => c.email.toLowerCase() === cleanEmail.toLowerCase());
    if (existingIdx >= 0) {
      savedCreds[existingIdx] = newCred;
    } else {
      savedCreds.push(newCred);
    }

    const accIdx = savedAccounts.findIndex(a => a.email.toLowerCase() === cleanEmail.toLowerCase());
    if (accIdx >= 0) {
      savedAccounts[accIdx] = newCred;
    } else {
      savedAccounts.push(newCred);
    }

    try {
      localStorage.setItem(keyList, JSON.stringify(savedCreds));
      localStorage.setItem(keyLast, JSON.stringify(newCred));
      localStorage.setItem('athletiq_saved_accounts_v2', JSON.stringify(savedAccounts));
    } catch (e) {}
  } else {
    savedCreds = savedCreds.filter(c => c.email.toLowerCase() !== cleanEmail.toLowerCase());
    savedAccounts = savedAccounts.filter(a => a.email.toLowerCase() !== cleanEmail.toLowerCase());
    try {
      localStorage.setItem(keyList, JSON.stringify(savedCreds));
      localStorage.setItem('athletiq_saved_accounts_v2', JSON.stringify(savedAccounts));
      const rawLast = localStorage.getItem(keyLast);
      if (rawLast) {
        const parsed = JSON.parse(rawLast);
        if (parsed.email && parsed.email.toLowerCase() === cleanEmail.toLowerCase()) {
          localStorage.removeItem(keyLast);
        }
      }
    } catch (e) {}
  }
}

function saveRememberedEmail(email, role, shouldRemember) {
  const passwordInput = document.getElementById('login-password');
  const password = passwordInput ? passwordInput.value : '';
  saveRememberedCredentials(email, password, role, shouldRemember);
}

function setLoginRole(role) {
  loginRole = role;
  hideAuthErrors();
  const btnStudent = document.getElementById('login-role-btn-student');
  const btnCoach = document.getElementById('login-role-btn-coach');
  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');
  const submitBtn = document.getElementById('login-submit-btn');
  const emailLabel = document.getElementById('login-email-label');
  const emailInput = document.getElementById('login-email');

  if (role === 'STUDENT') {
    if (btnStudent) btnStudent.className = 'py-2.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md transition-all duration-200';
    if (btnCoach) btnCoach.className = 'py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200';
    if (title) title.textContent = 'Student Portal Login';
    if (subtitle) subtitle.textContent = 'Sign in with your Student credentials to access Student Dashboard';
    if (emailLabel) emailLabel.textContent = 'Student Email Address';
    if (emailInput) emailInput.placeholder = 'student@example.com';
    if (submitBtn) {
      submitBtn.innerHTML = `<span>Sign In as Student</span>`;
      submitBtn.className = 'w-full py-3 bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700 hover:from-brand-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-brand-500/25 flex items-center justify-center space-x-2';
    }
  } else {
    if (btnCoach) btnCoach.className = 'py-2.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md transition-all duration-200';
    if (btnStudent) btnStudent.className = 'py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200';
    if (title) title.textContent = 'Coach Portal Login';
    if (subtitle) subtitle.textContent = 'Sign in with your Coach credentials to access Coach Dashboard';
    if (emailLabel) emailLabel.textContent = 'Coach Email Address';
    if (emailInput) emailInput.placeholder = 'coach@example.com';
    if (submitBtn) {
      submitBtn.innerHTML = `<span>Sign In as Coach</span>`;
      submitBtn.className = 'w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2';
    }
  }

  const popover = document.getElementById('login-saved-accounts-popover');
  if (popover) popover.classList.add('hidden');

  updateEmailSuggestions(role);
}

function setRegisterRole(role) {
  registerRole = role;
  hideAuthErrors();
  const btnStudent = document.getElementById('role-btn-student');
  const btnCoach = document.getElementById('role-btn-coach');
  const studentExtra = document.getElementById('student-extra-fields');
  const coachExtra = document.getElementById('coach-extra-fields');

  if (role === 'STUDENT') {
    if (btnStudent) btnStudent.className = 'py-2.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md transition-all';
    if (btnCoach) btnCoach.className = 'py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all';
    if (studentExtra) studentExtra.classList.remove('hidden');
    if (coachExtra) coachExtra.classList.add('hidden');
  } else {
    if (btnCoach) btnCoach.className = 'py-2.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md transition-all';
    if (btnStudent) btnStudent.className = 'py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all';
    if (coachExtra) coachExtra.classList.remove('hidden');
    if (studentExtra) studentExtra.classList.add('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthErrors();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('login-remember-me')?.checked || false;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: loginRole })
    });
    const data = await res.json();
    if (!res.ok) {
      let msg = 'Login failed';
      if (typeof data.detail === 'string') {
        msg = data.detail;
      } else if (Array.isArray(data.detail) && data.detail.length > 0) {
        msg = data.detail.map(d => d.msg || d.detail || 'Validation error').join(', ');
      }
      throw new Error(msg);
    }

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('athletiq_token', data.access_token);
    storage.setItem('athletiq_user', JSON.stringify(data.user));

    saveRememberedCredentials(email, password, loginRole, rememberMe, (data && data.user && data.user.name) ? data.user.name : '');

    currentUser = data.user;
    currentToken = data.access_token;

    closeAuthModal();
    showToast(`Logged in successfully as ${data.user.role}`, 'success');
    showAppWorkspace();
  } catch (err) {
    const loginAlert = document.getElementById('login-error-alert');
    const loginText = document.getElementById('login-error-text');
    if (loginAlert && loginText) {
      loginText.textContent = err.message || 'Invalid email or password';
      loginAlert.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAuthErrors();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const rememberMe = document.getElementById('reg-remember-me')?.checked || false;

  if (password !== confirmPassword) {
    const regAlert = document.getElementById('register-error-alert');
    const regText = document.getElementById('register-error-text');
    if (regAlert && regText) {
      regText.textContent = 'Passwords do not match';
      regAlert.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
    showToast('Passwords do not match', 'error');
    return;
  }

  let endpoint = '/api/auth/register/student';
  let body = { name, email, password, confirm_password: confirmPassword };

  if (registerRole === 'STUDENT') {
    body.date_of_birth = document.getElementById('reg-dob').value || null;
    body.preferred_sport = document.getElementById('reg-preferred-sport').value;
  } else {
    endpoint = '/api/auth/register/coach';
    body.coaching_specialization = document.getElementById('reg-specialization').value || 'General Coach';
    body.experience_years = parseFloat(document.getElementById('reg-experience').value) || 1.0;
    body.certification = document.getElementById('reg-certification').value || null;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      let msg = 'Registration failed';
      if (typeof data.detail === 'string') {
        msg = data.detail;
      } else if (Array.isArray(data.detail) && data.detail.length > 0) {
        msg = data.detail.map(d => d.msg || d.detail || 'Validation error').join(', ');
      }
      throw new Error(msg);
    }

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('athletiq_token', data.access_token);
    storage.setItem('athletiq_user', JSON.stringify(data.user));

    saveRememberedCredentials(email, password, registerRole, rememberMe, name);

    currentUser = data.user;
    currentToken = data.access_token;

    closeAuthModal();
    showToast(`Account created successfully as ${registerRole}!`, 'success');
    showAppWorkspace();
  } catch (err) {
    const regAlert = document.getElementById('register-error-alert');
    const regText = document.getElementById('register-error-text');
    if (regAlert && regText) {
      regText.textContent = err.message || 'Registration failed';
      regAlert.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    }
    showToast(err.message, 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('athletiq_token');
  localStorage.removeItem('athletiq_user');
  sessionStorage.removeItem('athletiq_token');
  sessionStorage.removeItem('athletiq_user');
  currentUser = null;
  currentToken = null;
  showLandingPage();
  showToast('Logged out', 'info');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentToken}`
  };
}

async function safeFetchJson(url, options = {}) {
  const reqHeaders = Object.assign({}, authHeaders(), options.headers || {});
  const config = Object.assign({}, options, { headers: reqHeaders });
  const res = await fetch(url, config);
  const contentType = res.headers.get('content-type') || '';
  let data = {};
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`);
    }
    return { text };
  }
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }
  return data;
}

// STUDENT DASHBOARD
async function loadStudentDashboard(sportId = null) {
  document.getElementById('dashboard-welcome-heading').textContent = `Welcome, ${currentUser.name}!`;
  loadNotifications();

  const sel = document.getElementById('dash-sport-filter');
  const filterId = sportId !== null ? sportId : (sel ? sel.value : '');

  try {
    let url = '/api/analytics/overview';
    if (filterId) url += `?sport_id=${filterId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();

    document.getElementById('dash-card-hours').textContent = `${data.total_practice_hours} hrs`;

    const labelEl = document.getElementById('dash-card-sports-label');
    const subEl = document.getElementById('dash-card-sports-sub');
    if (filterId && data.sport_name) {
      if (labelEl) labelEl.textContent = 'Selected Sport';
      if (subEl) subEl.textContent = 'Active filter';
      document.getElementById('dash-card-sports').textContent = data.sport_name;
    } else {
      if (labelEl) labelEl.textContent = 'Active Sports';
      if (subEl) subEl.textContent = 'Sports tracked';
      document.getElementById('dash-card-sports').textContent = data.active_sports;
    }

    if (data.min_rating !== null && data.min_rating !== undefined && data.max_rating !== null && data.max_rating !== undefined) {
      document.getElementById('dash-card-rating').innerHTML = `${data.average_rating} <span class="text-xs font-normal text-slate-400">/ 10</span> <div class="text-[10px] text-slate-500 font-semibold mt-0.5">Min: <span class="text-blue-600 dark:text-blue-400">${data.min_rating}</span> | Max: <span class="text-emerald-600 dark:text-emerald-400">${data.max_rating}</span></div>`;
    } else {
      document.getElementById('dash-card-rating').textContent = `${data.average_rating} / 10`;
    }
    document.getElementById('dash-card-improvement').textContent = `${data.improvement_score > 0 ? '+' : ''}${data.improvement_score}%`;

    const emptyBox = document.getElementById('dash-empty-state');
    const dataBox = document.getElementById('dash-data-container');

    if (!data.has_data) {
      emptyBox.classList.remove('hidden');
      dataBox.classList.add('hidden');
    } else {
      emptyBox.classList.add('hidden');
      dataBox.classList.remove('hidden');
      loadDashboardCharts(filterId);
      loadDashboardPreviews(filterId);
    }
  } catch (err) {
    console.error('Error loading dashboard overview:', err);
  }
}

function onDashboardSportFilterChange(sportId) {
  loadStudentDashboard(sportId);
}

async function populateStudentSportFilters() {
  try {
    const res = await fetch('/api/sports/student', { headers: authHeaders() });
    const sports = await res.json();

    const selects = ['dash-sport-filter', 'analytics-sport-filter', 'history-sport-filter'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentVal = el.value;
      let defaultLabel = '🏆 All Sports Combined';
      if (id === 'history-sport-filter') defaultLabel = '🏆 All Sports';
      
      el.innerHTML = `<option value="">${defaultLabel}</option>`;
      if (sports && sports.length > 0) {
        sports.forEach(s => {
          const icon = getSportIcon(s.name);
          el.innerHTML += `<option value="${s.sport_id}">${icon} ${s.name}</option>`;
        });
      }
      if (currentVal) el.value = currentVal;
    });
  } catch (e) { console.error('Error populating sport filters:', e); }
}

function getChartConfig(data) {
  const palette = [
    { border: '#2563EB', bg: '#2563EB' },
    { border: '#10B981', bg: '#10B981' },
    { border: '#F97316', bg: '#F97316' },
    { border: '#8B5CF6', bg: '#8B5CF6' },
    { border: '#EC4899', bg: '#EC4899' },
    { border: '#06B6D4', bg: '#06B6D4' }
  ];

  if (data.by_sport && data.by_sport.length > 0) {
    if (data.by_sport.length === 1) {
      const sp = data.by_sport[0];
      return {
        labels: sp.dates,
        hoursDatasets: [{
          label: `${sp.sport_name} Practice Duration (Hours)`,
          data: sp.practice_hours,
          backgroundColor: '#2563EB',
          borderRadius: 6
        }],
        ratingDatasets: [{
          label: `${sp.sport_name} Coach Rating Trajectory (1-10)`,
          data: sp.ratings,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        }]
      };
    }

    // Multiple sports mode: render separate isolated dataset lines & bars for each sport
    const allDates = data.dates;

    const hoursDatasets = data.by_sport.map((sp, idx) => {
      const color = palette[idx % palette.length];
      const hoursMap = allDates.map(d => {
        const sIdxs = sp.dates.flatMap((sd, i) => sd === d ? [i] : []);
        if (sIdxs.length === 0) return null;
        return sIdxs.reduce((sum, i) => sum + sp.practice_hours[i], 0);
      });

      return {
        label: `${sp.sport_name} Duration (Hours)`,
        data: hoursMap,
        backgroundColor: color.bg,
        borderRadius: 6
      };
    });

    const ratingDatasets = data.by_sport.map((sp, idx) => {
      const color = palette[idx % palette.length];
      const ratingMap = allDates.map(d => {
        const sIdxs = sp.dates.flatMap((sd, i) => sd === d ? [i] : []);
        if (sIdxs.length === 0) return null;
        const validR = sIdxs.map(i => sp.ratings[i]).filter(r => r > 0);
        if (validR.length === 0) return null;
        return Math.round((validR.reduce((sum, r) => sum + r, 0) / validR.length) * 10) / 10;
      });

      return {
        label: `${sp.sport_name} Coach Rating`,
        data: ratingMap,
        borderColor: color.border,
        backgroundColor: color.border + '20',
        fill: false,
        tension: 0.3,
        spanGaps: true
      };
    });

    return { labels: allDates, hoursDatasets, ratingDatasets };
  }

  // Fallback single dataset
  return {
    labels: data.dates,
    hoursDatasets: [{
      label: 'Practice Duration (Hours)',
      data: data.practice_hours,
      backgroundColor: '#2563EB',
      borderRadius: 6
    }],
    ratingDatasets: [{
      label: 'Coach Rating Score Trajectory (1-10)',
      data: data.ratings,
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.3
    }]
  };
}

async function loadDashboardCharts(sportId = null) {
  try {
    const sel = document.getElementById('dash-sport-filter');
    const filterId = sportId !== null ? sportId : (sel ? sel.value : '');
    let url = '/api/analytics/charts';
    if (filterId) url += `?sport_id=${filterId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (!data.has_data) return;

    const chartConfig = getChartConfig(data);

    // Hours Chart
    const ctx1 = document.getElementById('dashHoursChart').getContext('2d');
    if (activeCharts.dashHours) activeCharts.dashHours.destroy();
    activeCharts.dashHours = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: chartConfig.labels,
        datasets: chartConfig.hoursDatasets
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // Rating Chart (Performance Rating Trajectory)
    const ctx2 = document.getElementById('dashRatingChart').getContext('2d');
    if (activeCharts.dashRating) activeCharts.dashRating.destroy();
    activeCharts.dashRating = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: chartConfig.labels,
        datasets: chartConfig.ratingDatasets
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } catch (e) {
    console.error('Error loading dashboard charts:', e);
  }
}

async function loadDashboardPreviews(sportId = null) {
  const sel = document.getElementById('dash-sport-filter');
  const filterId = sportId !== null ? sportId : (sel ? sel.value : '');

  // Load AI Recommendations & populate AI Suggestions widget
  try {
    let recsUrl = '/api/ai/recommendations';
    if (filterId) recsUrl += `?sport_id=${filterId}`;

    const res = await fetch(recsUrl, { headers: authHeaders() });
    const recs = await res.json();
    
    const widgetList = document.getElementById('dashboard-ai-suggestions-list');
    const container = document.getElementById('dash-ai-recs-list');
    if (container) container.innerHTML = '';
    if (widgetList) widgetList.innerHTML = '';

    if (!recs || recs.length === 0) {
      if (container) container.innerHTML = '<p class="text-xs text-slate-400">No AI recommendations generated yet for this selection.</p>';
      if (widgetList) widgetList.innerHTML = '<p class="text-xs text-slate-500 italic p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl">No AI suggestions found for this selection. Record practice sessions to get sport-specific drill recommendations!</p>';
    } else {
      recs.slice(0, 3).forEach(r => {
        const icon = getSportIcon(r.sport_name);
        if (container) {
          container.innerHTML += `
            <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-1">
                <span class="badge-ai font-bold text-[10px]">🤖 AI Recommendation</span>
                <span class="text-[11px] font-extrabold px-2 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                  ${icon} ${r.sport_name}
                </span>
              </div>
              <h4 class="text-xs font-bold text-slate-900 dark:text-white mt-1">${r.title}</h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">${r.recommendation_text}</p>
            </div>
          `;
        }

        if (widgetList) {
          widgetList.innerHTML += `
            <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-brand-200 dark:border-brand-800/60 shadow-sm flex items-start space-x-3">
              <div class="w-8 h-8 rounded-lg bg-accent-500/10 text-accent-500 flex items-center justify-center font-bold text-sm flex-shrink-0">⚡</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-slate-900 dark:text-white">${r.sport_name}: ${r.title}</span>
                  <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">${r.priority} PRIORITY</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 mt-1"><b>AI Suggestion:</b> ${r.recommendation_text}</p>
                <div class="text-[10px] text-slate-400 mt-1">Detected Issue: ${r.detected_issue}</div>
              </div>
            </div>
          `;
        }
      });
    }
  } catch (e) { console.error(e); }

  // Load Coach Feedback
  try {
    let fbUrl = '/api/coach/feedback';
    if (filterId) fbUrl += `?sport_id=${filterId}`;

    const res = await fetch(fbUrl, { headers: authHeaders() });
    const feedbacks = await res.json();
    const container = document.getElementById('dash-coach-feedback-list');
    if (container) container.innerHTML = '';

    if (!feedbacks || feedbacks.length === 0) {
      if (container) container.innerHTML = '<p class="text-xs text-slate-400">No coach feedback logged for this selection.</p>';
    } else {
      feedbacks.slice(0, 3).forEach(f => {
        const replyStatus = f.student_reply ? `
          <div class="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
            💬 Your Reply: "${f.student_reply}"
          </div>
        ` : `
          <button onclick="openSuggestionDetailModalFromFeedback(${f.feedback_id})" class="mt-2 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-[10px] shadow-sm flex items-center space-x-1">
            <span>💬 Reply to Coach</span>
          </button>
        `;

        if (container) {
          container.innerHTML += `
            <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-1">
                <span class="badge-coach font-bold">🧑‍🏫 Coach Feedback</span>
                <span class="text-[10px] text-slate-400">Coach ${f.coach_name} (${f.sport_name})</span>
              </div>
              <p class="text-xs text-slate-700 dark:text-slate-200 mt-1">"${f.feedback_text}"</p>
              ${f.recommended_drill ? `<div class="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mt-1">Drill: ${f.recommended_drill} (${f.practice_duration_minutes}m)</div>` : ''}
              ${replyStatus}
            </div>
          `;
        }
      });
    }
  } catch (e) { console.error(e); }
}

// MY SPORTS
async function loadStudentSports() {
  try {
    const res = await fetch('/api/sports/student', { headers: authHeaders() });
    const sports = await res.json();
    const container = document.getElementById('my-sports-list');
    container.innerHTML = '';

    if (!sports || sports.length === 0) {
      container.innerHTML = `
        <div class="col-span-full empty-state-box">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">No sports added yet</h3>
          <p class="text-xs text-slate-500 mt-1">Add indoor or outdoor sports to start tracking practice sessions.</p>
          <button onclick="openAddSportModal()" class="mt-4 px-4 py-2 bg-brand-600 text-white font-bold rounded-xl text-xs">+ Add First Sport</button>
        </div>
      `;
      return;
    }

    sports.forEach(s => {
      container.innerHTML += `
        <div class="sport-card p-5 relative">
          <div class="flex items-center justify-between mb-3">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${s.category === 'OUTDOOR' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'}">
              ${s.category}
            </span>
            <button onclick="deleteStudentSport(${s.sport_id})" class="text-slate-400 hover:text-red-500 transition" title="Remove Sport">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">${s.name}</h3>
          <div class="text-xs text-slate-500 mt-1">Skill: <span class="font-semibold text-slate-800 dark:text-slate-200">${s.skill_level}</span> (${s.experience_years} yrs exp)</div>
          ${s.training_goal ? `<div class="mt-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs text-slate-600 dark:text-slate-300">Goal: ${s.training_goal}</div>` : ''}
          <div class="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700/50 pt-3">
            <span>Sessions logged: <b>${s.sessions_count}</b></span>
            <button onclick="navTo('practice')" class="text-brand-600 font-bold hover:underline">Log Practice &rarr;</button>
          </div>
        </div>
      `;
    });
    lucide.createIcons();
  } catch (e) {
    console.error('Error loading sports:', e);
  }
}

function openAddSportModal() {
  document.getElementById('add-sport-modal').classList.remove('hidden');
}

function closeAddSportModal() {
  document.getElementById('add-sport-modal').classList.add('hidden');
}

async function submitAddSport(e) {
  e.preventDefault();
  const name = document.getElementById('add-sport-name').value;
  const category = document.getElementById('add-sport-category').value;
  const skill_level = document.getElementById('add-sport-skill').value;
  const experience_years = parseFloat(document.getElementById('add-sport-exp').value) || 0;
  const training_goal = document.getElementById('add-sport-goal').value;

  try {
    const res = await fetch('/api/sports/student', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sport_name: name, category, skill_level, experience_years, training_goal })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to add sport');

    closeAddSportModal();
    showToast('Sport added successfully', 'success');
    loadStudentSports();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteStudentSport(sportId) {
  if (!confirm('Are you sure you want to remove this sport from your profile?')) return;
  try {
    const res = await fetch(`/api/sports/student/${sportId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to remove sport');
    showToast('Sport removed');
    loadStudentSports();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// RECORD PRACTICE SESSION & DYNAMIC METRICS
async function loadPracticeFormSports() {
  try {
    const res = await fetch('/api/sports/student', { headers: authHeaders() });
    const sports = await res.json();
    const select = document.getElementById('prac-sport-select');
    select.innerHTML = '<option value="">-- Choose Sport --</option>';

    if (!sports || sports.length === 0) {
      select.innerHTML = '<option value="">No sports added. Please add a sport first in My Sports.</option>';
      return;
    }

    sports.forEach(s => {
      select.innerHTML += `<option value="${s.sport_id}" data-name="${s.name}">${s.name} (${s.category})</option>`;
    });
  } catch (e) { console.error(e); }
}

async function onPracticeSportChange() {
  const select = document.getElementById('prac-sport-select');
  const selectedOpt = select.options[select.selectedIndex];
  const sportName = selectedOpt ? selectedOpt.getAttribute('data-name') : null;
  const container = document.getElementById('dynamic-metrics-container');

  if (!sportName) {
    container.innerHTML = '<p class="text-xs text-slate-500 italic col-span-2">Select a sport above to load sport-specific metrics fields.</p>';
    return;
  }

  try {
    const res = await fetch(`/api/practice/templates/${encodeURIComponent(sportName)}`);
    const fields = await res.json();
    container.innerHTML = '';

    fields.forEach(f => {
      container.innerHTML += `
        <div>
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">${f.label} (${f.unit})</label>
          <input type="${f.type}" data-metric-name="${f.name}" data-metric-unit="${f.unit}" value="0" min="0" class="metric-field-input w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
        </div>
      `;
    });
  } catch (e) { console.error(e); }
}

async function submitPracticeSession(e) {
  e.preventDefault();
  const sport_id = parseInt(document.getElementById('prac-sport-select').value);
  const date = document.getElementById('prac-date').value;
  const duration_minutes = parseInt(document.getElementById('prac-duration').value);
  const training_type = document.getElementById('prac-type').value;
  const intensity = document.getElementById('prac-intensity').value;
  const training_area = document.getElementById('prac-area').value;
  const notes = document.getElementById('prac-notes').value;

  if (!sport_id) {
    showToast('Please select a sport', 'error');
    return;
  }

  // Collect dynamic metrics
  const metricInputs = document.querySelectorAll('.metric-field-input');
  const metrics = [];
  metricInputs.forEach(inp => {
    metrics.push({
      metric_name: inp.getAttribute('data-metric-name'),
      metric_value: floatVal(inp.value),
      metric_unit: inp.getAttribute('data-metric-unit')
    });
  });

  // Collect problem/struggle
  const probDesc = document.getElementById('prob-description').value;
  const probSev = document.getElementById('prob-severity').value;
  const problems = [];
  if (probDesc && probDesc.trim()) {
    problems.push({ description: probDesc.trim(), severity: probSev });
  }

  const payload = {
    sport_id, date, duration_minutes, intensity, training_type,
    training_area, notes, metrics, problems
  };

  try {
    const res = await fetch('/api/practice/sessions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to record session');

    showToast('Practice session recorded successfully!', 'success');
    navTo('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function floatVal(v) {
  const parsed = parseFloat(v);
  return isNaN(parsed) ? 0.0 : parsed;
}

// PRACTICE HISTORY
async function loadPracticeHistory(sportId = null) {
  try {
    const sel = document.getElementById('history-sport-filter');
    const filterId = sportId !== null ? sportId : (sel ? sel.value : '');
    let url = '/api/practice/sessions';
    if (filterId) url += `?sport_id=${filterId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const sessions = await res.json();
    const container = document.getElementById('history-container');
    container.innerHTML = '';

    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">No practice records found</h3>
          <p class="text-xs text-slate-500 mt-1">${filterId ? 'No recorded practice sessions for the selected sport.' : 'Start tracking your first practice session to view historical entries.'}</p>
          <button onclick="navTo('practice')" class="mt-4 px-4 py-2 bg-brand-600 text-white font-bold rounded-xl text-xs">+ Record Practice Session</button>
        </div>
      `;
      return;
    }

    sessions.forEach(s => {
      const icon = getSportIcon(s.sport_name);
      let metricsHtml = s.metrics.map(m => `<span class="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-semibold text-slate-700 dark:text-slate-300 mr-1 mb-1">${m.metric_name.replace('_', ' ')}: <b>${m.metric_value}</b> ${m.metric_unit}</span>`).join('');
      let probHtml = s.problems.map(p => `<div class="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1">⚠️ Issue: ${p.description} (${p.severity})</div>`).join('');

      container.innerHTML += `
        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-base">${icon}</span>
              <span class="font-bold text-sm text-slate-900 dark:text-white">${s.sport_name}</span>
              <span class="text-xs text-slate-400">• ${s.date}</span>
            </div>
            <button onclick="deletePracticeSession(${s.session_id})" class="text-slate-400 hover:text-red-500 text-xs font-semibold">Delete</button>
          </div>
          <div class="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300 mb-2">
            <span>Duration: <b>${s.duration_minutes}m</b></span>
            <span>Coach Rating: <b>${s.coach_rating ? s.coach_rating + '/10' : '<span class="text-amber-500 font-semibold">Unrated</span>'}</b></span>
            <span>Type: <b>${s.training_type.replace('_', ' ')}</b></span>
          </div>
          ${metricsHtml ? `<div class="my-2">${metricsHtml}</div>` : ''}
          ${probHtml}
          ${s.notes ? `<div class="mt-2 text-xs italic text-slate-500">"${s.notes}"</div>` : ''}
        </div>
      `;
    });
  } catch (e) { console.error(e); }
}

async function deletePracticeSession(sessionId) {
  if (!confirm('Are you sure you want to delete this session record?')) return;
  try {
    const res = await fetch(`/api/practice/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete session');
    showToast('Practice session deleted');
    const sel = document.getElementById('history-sport-filter');
    loadPracticeHistory(sel ? sel.value : null);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// PERFORMANCE ANALYTICS
async function loadAnalyticsCharts(sportId = null) {
  try {
    const sel = document.getElementById('analytics-sport-filter');
    const filterId = sportId !== null ? sportId : (sel ? sel.value : '');
    let url = '/api/analytics/charts';
    if (filterId) url += `?sport_id=${filterId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();

    const emptyBox = document.getElementById('analytics-empty');
    const contentBox = document.getElementById('analytics-content');

    if (!data.has_data) {
      emptyBox.classList.remove('hidden');
      contentBox.classList.add('hidden');
      return;
    }

    emptyBox.classList.add('hidden');
    contentBox.classList.remove('hidden');

    const chartConfig = getChartConfig(data);

    // Hours Chart
    const ctx1 = document.getElementById('analyticsHoursChart').getContext('2d');
    if (activeCharts.analyticsHours) activeCharts.analyticsHours.destroy();
    activeCharts.analyticsHours = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: chartConfig.labels,
        datasets: chartConfig.hoursDatasets
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // Rating Chart (Performance Rating Trajectory)
    const ctx2 = document.getElementById('analyticsRatingChart').getContext('2d');
    if (activeCharts.analyticsRating) activeCharts.analyticsRating.destroy();
    activeCharts.analyticsRating = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: chartConfig.labels,
        datasets: chartConfig.ratingDatasets
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    loadPerSportStatistics(filterId);
  } catch (e) { console.error(e); }
}

function renderSportStatCard(sp, isCompact = false) {
  const icon = getSportIcon(sp.sport_name);
  const metricsHtml = (sp.metrics && sp.metrics.length > 0)
    ? sp.metrics.map(m => `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1">
              <span>🎯</span>
              <span>${m.metric_name}</span>
            </span>
            <span class="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-600/80 rounded-md text-slate-700 dark:text-slate-200 font-bold">${m.total_records} logs</span>
          </div>
          <div class="grid grid-cols-3 gap-1.5 text-center p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Min Score</span>
              <span class="font-extrabold text-blue-600 dark:text-blue-400 text-xs">${m.min} ${m.unit}</span>
            </div>
            <div>
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Max Score</span>
              <span class="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">${m.max} ${m.unit}</span>
            </div>
            <div>
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Avg Score</span>
              <span class="font-extrabold text-indigo-600 dark:text-indigo-400 text-xs">${m.average} ${m.unit}</span>
            </div>
          </div>
          ${m.all_values && m.all_values.length > 0 ? `
            <div class="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 flex items-center space-x-1 flex-wrap">
              <span class="font-bold text-slate-700 dark:text-slate-300">All Scorings:</span>
              <span class="font-mono bg-slate-100 dark:bg-slate-900/60 px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-200 font-semibold">[${m.all_values.join(', ')}] ${m.unit}</span>
            </div>
          ` : ''}
        </div>
      `).join('')
    : `<p class="text-[11px] text-slate-400 italic py-1">No metric records logged yet.</p>`;

  const strugglesHtml = (sp.struggles && sp.struggles.length > 0)
    ? `<div class="mt-2 text-xs">
        <span class="font-bold text-rose-600 dark:text-rose-400">⚠️ Key Struggle Areas:</span>
        <div class="flex flex-wrap gap-1 mt-1">
          ${sp.struggles.map(st => `<span class="px-2 py-0.5 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded text-[10px] font-semibold border border-rose-200 dark:border-rose-800">${st.issue} (${st.count}x)</span>`).join('')}
        </div>
       </div>`
    : '';

  const improvementBadge = (sp.improvement_score !== undefined && sp.improvement_score !== 0)
    ? `<span class="text-[11px] font-extrabold ${sp.improvement_score > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}">
        ${sp.improvement_score > 0 ? '+' : ''}${sp.improvement_score}% rating trend
       </span>`
    : '';

  const allRatingsBadges = (sp.all_ratings && sp.all_ratings.length > 0)
    ? `<div class="mt-2 text-xs bg-slate-50 dark:bg-slate-700/30 p-2 rounded-xl border border-slate-100 dark:border-slate-700/60">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
            <span>⭐</span>
            <span>All Coach Ratings Logged (${sp.all_ratings.length}):</span>
          </span>
          <span class="text-[10px] text-slate-400 font-medium">Min: <b class="text-blue-600 dark:text-blue-400">${sp.min_rating ?? 'N/A'}</b> | Max: <b class="text-emerald-600 dark:text-emerald-400">${sp.max_rating ?? 'N/A'}</b></span>
        </div>
        <div class="flex flex-wrap gap-1">
          ${sp.all_ratings.map((r, idx) => `
            <span class="px-2 py-0.5 bg-brand-50 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 rounded-md text-[10px] font-extrabold border border-brand-200 dark:border-brand-800" title="Session #${idx+1} Rating">${r}/10</span>
          `).join('')}
        </div>
       </div>`
    : '';

  return `
    <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
        <div class="flex items-center space-x-2.5">
          <span class="text-2xl">${icon}</span>
          <div>
            <h4 class="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
              <span>${sp.sport_name}</span>
              <span class="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300 rounded text-[10px] font-bold uppercase">${sp.category}</span>
            </h4>
            <div class="text-[11px] text-slate-500">Skill: <b>${sp.skill_level}</b> • Last Practice: <b>${sp.last_practice_date}</b></div>
          </div>
        </div>
        ${improvementBadge}
      </div>

      <!-- Quick Stats Grid with Min / Max -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center bg-slate-50 dark:bg-slate-700/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase">Hours</div>
          <div class="text-sm font-extrabold text-brand-600 dark:text-brand-400">${sp.total_hours}h</div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase">Sessions</div>
          <div class="text-sm font-extrabold text-slate-800 dark:text-slate-100">${sp.session_count}</div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase">Min / Max Rating</div>
          <div class="text-xs font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
            ${sp.min_rating !== null && sp.min_rating !== undefined ? `<span class="text-blue-600 dark:text-blue-400">${sp.min_rating}</span> / <span class="text-emerald-600 dark:text-emerald-400">${sp.max_rating}</span>` : 'N/A'}
          </div>
        </div>
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase">Avg Rating</div>
          <div class="text-sm font-extrabold ${sp.average_rating > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}">${sp.average_rating > 0 ? sp.average_rating + '/10' : 'N/A'}</div>
        </div>
      </div>

      ${allRatingsBadges}

      <!-- Dynamic Metric Breakdown with Min, Max, Avg, and All Scorings -->
      <div class="space-y-2">
        <div class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Sport Metrics & Scorings Breakdown</div>
        ${metricsHtml}
      </div>

      ${strugglesHtml}
    </div>
  `;
}

async function loadPerSportStatistics(sportId = null) {
  try {
    const container = document.getElementById('analytics-per-sport-container');
    if (!container) return;

    let url = '/api/analytics/sports-statistics';
    if (sportId) url += `?sport_id=${sportId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();

    container.innerHTML = '';
    if (!data.sports || data.sports.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl col-span-2 text-center">No sport statistics available yet. Select your sports and log practice sessions.</p>`;
      return;
    }

    const listToDisplay = sportId ? data.sports.filter(s => s.sport_id == sportId) : data.sports;
    if (listToDisplay.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl col-span-2 text-center">No statistics found for selected sport filter.</p>`;
      return;
    }

    listToDisplay.forEach(sp => {
      container.innerHTML += renderSportStatCard(sp);
    });
  } catch (err) {
    console.error('Error loading per sport statistics:', err);
  }
}

// AI RECOMMENDATIONS & SPORT ISOLATION LOGIC
let currentAISportFilter = null;

function getSportIcon(sportName) {
  if (!sportName) return '🏆';
  const lower = sportName.toLowerCase();
  if (lower.includes('cricket')) return '🏏';
  if (lower.includes('football') || lower.includes('soccer')) return '⚽';
  if (lower.includes('basketball')) return '🏀';
  if (lower.includes('badminton')) return '🏸';
  if (lower.includes('tennis')) return '🎾';
  if (lower.includes('chess')) return '♟️';
  if (lower.includes('volleyball')) return '🏐';
  if (lower.includes('run') || lower.includes('athletics')) return '🏃';
  if (lower.includes('swim')) return '🏊';
  if (lower.includes('cycling') || lower.includes('bike')) return '🚴';
  if (lower.includes('weight') || lower.includes('gym')) return '🏋️';
  if (lower.includes('martial') || lower.includes('boxing') || lower.includes('karate')) return '🥋';
  if (lower.includes('table tennis') || lower.includes('ping pong')) return '🏓';
  if (lower.includes('golf')) return '⛳';
  return '🏆';
}

async function triggerAIAnalysis(sportId = null) {
  try {
    let url = '/api/ai/analyze';
    if (sportId) url += `?sport_id=${sportId}`;
    const res = await fetch(url, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    showToast(data.message, data.has_sufficient_data ? 'success' : 'warning');
    loadAIRecommendations(currentAISportFilter);
  } catch (err) {
    showToast('Failed to run AI analysis', 'error');
  }
}

function onAiSessionSelect(sessionId) {
  if (!sessionId) return;
  renderAiSessionDetailCard(parseInt(sessionId));
}

function formatAiText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map(line => {
    line = line.trim();
    if (!line) return '<div class="h-1.5"></div>';
    if (line.startsWith('🛠️') || line.startsWith('🧠') || line.startsWith('🧘') || line.startsWith('⚡') || line.startsWith('⚙️') || line.startsWith('🎯') || line.startsWith('📊') || line.startsWith('🔍') || line.startsWith('🚀') || line.startsWith('💡') || line.startsWith('✅') || line.startsWith('⭐') || line.startsWith('📝')) {
      return `<div class="font-extrabold text-slate-900 dark:text-white mt-2.5 mb-1 text-xs flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-700/80 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-600/50 shadow-2xs"><span>${line}</span></div>`;
    }
    if (line.startsWith('•') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
      return `<div class="pl-2 text-slate-700 dark:text-slate-200 text-xs leading-relaxed font-medium mb-1 flex items-start space-x-1.5"><span class="text-brand-600 dark:text-brand-400 font-bold select-none">•</span><span class="flex-1">${line.replace(/^•\s*/, '')}</span></div>`;
    }
    return `<div class="text-slate-700 dark:text-slate-200 text-xs leading-relaxed mb-1">${line}</div>`;
  }).join('');
}

function renderAiSessionDetailCard(sessionId) {
  const card = document.getElementById('ai-session-detail-card');
  if (!card) return;

  const s = cachedSessionAnalytics.find(item => item.session_id === sessionId);
  if (!s) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const icon = getSportIcon(s.sport_name);
  const metricsHtml = (s.metrics && s.metrics.length > 0) ?
    s.metrics.map(m => `<span class="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">${m.metric_name}: <b class="text-brand-600 dark:text-brand-400">${m.metric_value}</b> ${m.metric_unit}</span>`).join(' ')
    : '<span class="text-xs text-slate-400 italic">No specific metric values logged for this session</span>';

  const probsHtml = (s.problems && s.problems.length > 0) ?
    s.problems.map(p => `<div class="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg text-xs text-rose-800 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-900/60">⚠️ <b>Logged Issue:</b> ${p.description} (${p.severity} Severity)</div>`).join('')
    : '<div class="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 font-medium">✅ Execution smooth with zero logged struggles.</div>';

  const coachRatingBadge = s.coach_rating ? 
    `<span class="px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-extrabold rounded-xl text-xs flex items-center space-x-1 shadow-sm"><span>⭐ Coach Rating: ${s.coach_rating}/10</span></span>` :
    `<span class="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 font-bold rounded-xl text-xs flex items-center space-x-1 shadow-sm"><span>⏳ Pending Coach Rating</span></span>`;

  let sessionRecsHtml = '';
  if (s.session_recommendations && s.session_recommendations.length > 0) {
    s.session_recommendations.forEach(r => {
      let prioBadge = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300';
      if (r.priority === 'HIGH') prioBadge = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';
      if (r.priority === 'MEDIUM') prioBadge = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';

      const existingGoal = window.cachedActiveGoals ? window.cachedActiveGoals.find(g => g.title === r.title) : null;
      let goalBtnHtml = '';
      if (existingGoal) {
        if (existingGoal.status === 'COMPLETED' || existingGoal.progress_percentage >= 100) {
          goalBtnHtml = `<span class="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg text-[11px]">🎉 Goal Achieved! (100%)</span>`;
        } else {
          goalBtnHtml = `<span class="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-extrabold rounded-lg text-[11px]">🎯 Goal Active (${existingGoal.progress_percentage || 0}%)</span>`;
        }
      } else {
        goalBtnHtml = `
          <button onclick="adoptAiGoal(${r.recommendation_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-lg text-xs shadow-sm transition">
            <span>🎯 Set as Target Goal</span>
          </button>
        `;
      }

      sessionRecsHtml += `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded border ${prioBadge}">${r.priority} PRIORITY DRILL</span>
            <span class="text-[10px] text-slate-400">Session AI Recommendation</span>
          </div>
          <div class="font-bold text-xs text-slate-900 dark:text-white mb-1">${r.title}</div>
          <div class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-700/40 p-3 rounded-lg border border-slate-100 dark:border-slate-700/80">${formatAiText(r.recommendation_text)}</div>
          ${r.evidence ? `<div class="text-[11px] text-slate-500 italic mt-1">Evidence: ${r.evidence}</div>` : ''}
          <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
            ${goalBtnHtml}
            <span class="text-[10px] text-brand-600 dark:text-brand-400 font-semibold">${r.suggested_goal || ''}</span>
          </div>
        </div>
      `;
    });
  } else {
    sessionRecsHtml = '<div class="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">Click "Run AI Analysis" above to generate session-wise corrective drill routines.</div>';
  }

  let coachFeedbackHtml = '';
  if (s.coach_feedbacks && s.coach_feedbacks.length > 0) {
    s.coach_feedbacks.forEach(cf => {
      let replyStatus = '';
      if (cf.student_reply) {
        replyStatus = `
          <div class="mt-2.5 p-2.5 bg-brand-50 dark:bg-brand-950/40 rounded-lg border border-brand-200 dark:border-brand-800 text-xs">
            <div class="font-bold text-brand-700 dark:text-brand-300">💬 Your Reply to Coach:</div>
            <div class="text-slate-800 dark:text-slate-200 italic mt-0.5">${cf.student_reply}</div>
          </div>
        `;
      } else {
        replyStatus = `
          <div class="mt-2 flex items-center justify-end">
            <button onclick="openSuggestionDetailModalFromFeedback(${cf.feedback_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs transition flex items-center space-x-1 shadow-sm">
              <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
              <span>Reply to Coach</span>
            </button>
          </div>
        `;
      }

      coachFeedbackHtml += `
        <div class="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60 space-y-2 text-xs shadow-sm">
          <div class="flex items-center justify-between border-b border-emerald-200/60 dark:border-emerald-900/40 pb-2">
            <div class="flex items-center space-x-2">
              <span class="w-7 h-7 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center text-xs">🧑‍🏫</span>
              <div>
                <span class="font-bold text-slate-900 dark:text-white">Coach ${cf.coach_name}</span>
                <span class="text-[10px] text-slate-500 block">${cf.coaching_specialization || 'Sports Coach'}</span>
              </div>
            </div>
            <span class="px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 uppercase">
              ${cf.priority || 'MEDIUM'} PRIORITY
            </span>
          </div>

          ${cf.observed_strength ? `<div class="text-slate-700 dark:text-slate-300"><b class="text-emerald-700 dark:text-emerald-400">💪 Observed Strength:</b> ${cf.observed_strength}</div>` : ''}
          ${cf.observed_weakness ? `<div class="text-slate-700 dark:text-slate-300"><b class="text-rose-600 dark:text-rose-400">⚠️ Observed Weakness:</b> ${cf.observed_weakness}</div>` : ''}
          
          <div class="p-3 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200 leading-relaxed border border-emerald-100 dark:border-emerald-900/40">
            <b class="text-emerald-700 dark:text-emerald-400 block mb-0.5">📋 Professional Coaching Feedback:</b>
            ${cf.feedback_text}
          </div>

          ${cf.recommended_drill ? `
            <div class="p-2.5 bg-sportsgreen-500/10 rounded-lg text-[11px] text-slate-700 dark:text-slate-200 font-semibold border border-sportsgreen-500/20">
              <b>🏋️ Recommended Coach Drill:</b> ${cf.recommended_drill} (${cf.practice_duration_minutes || 30} mins)
            </div>
          ` : ''}

          ${replyStatus}
        </div>
      `;
    });
  } else if (s.coach_rating) {
    coachFeedbackHtml = `
      <div class="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/60 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">🧑‍🏫</span>
          <div>
            <b class="text-emerald-800 dark:text-emerald-300 font-extrabold text-sm block">Coach Rating Logged: ${s.coach_rating}/10</b>
            <span class="text-[11px] text-slate-500">Your coach has evaluated and rated this session's performance.</span>
          </div>
        </div>
        <span class="px-3.5 py-1.5 bg-emerald-600 text-white font-extrabold rounded-xl text-xs shadow-md">${s.coach_rating} / 10</span>
      </div>
    `;
  } else {
    coachFeedbackHtml = `
      <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 italic flex items-center space-x-2">
        <span>⏳</span>
        <span>No direct written coach feedback or rating submitted yet for this session. Connect with a coach to receive direct professional feedback.</span>
      </div>
    `;
  }

  card.innerHTML = `
    <!-- Session Overview Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
      <div class="flex items-center space-x-3">
        <div class="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
          ${icon}
        </div>
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>${s.sport_name}: ${s.training_type.replace('_',' ')}</span>
            <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              ${s.intensity} INTENSITY
            </span>
          </h3>
          <div class="text-xs text-slate-500 font-medium mt-0.5">
            📅 Date: <b>${s.date}</b> • Duration: <b>${s.duration_minutes} mins</b> ${s.training_area ? `• Focus: <b>${s.training_area}</b>` : ''}
          </div>
        </div>
      </div>
      <div>
        ${coachRatingBadge}
      </div>
    </div>

    <!-- Logged Metrics & Struggles -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <div class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Logged Performance Metrics</div>
        <div class="flex flex-wrap gap-2">${metricsHtml}</div>
      </div>
      <div class="space-y-1.5">
        <div class="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Session Struggles & Issues</div>
        <div class="space-y-1.5">${probsHtml}</div>
      </div>
    </div>

    <!-- 🤖 AI Feedback & Recommendations -->
    <div class="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      <h4 class="text-xs font-extrabold text-brand-600 dark:text-brand-400 uppercase tracking-wider flex items-center space-x-1.5">
        <i data-lucide="sparkles" class="w-4 h-4 text-accent-500"></i>
        <span>🤖 AI Diagnosis & Session Drill Recommendations</span>
      </h4>

      <div class="p-3.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800/60 text-xs">
        <div class="font-extrabold text-brand-700 dark:text-brand-300 flex items-center space-x-1.5 mb-1">
          <span>💡 AI Session Diagnosis & Technical Analysis:</span>
        </div>
        <div class="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">${formatAiText(s.ai_session_feedback)}</div>
      </div>

      <div class="space-y-2.5">${sessionRecsHtml}</div>
    </div>

    <!-- 🧑‍🏫 Coach Feedback Section -->
    <div class="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      <h4 class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
        <i data-lucide="user-check" class="w-4 h-4 text-sportsgreen-500"></i>
        <span>🧑‍🏫 Coach Feedback & Performance Evaluation</span>
      </h4>

      ${coachFeedbackHtml}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

async function loadAIRecommendations(selectedSportId = null) {
  currentAISportFilter = selectedSportId;
  try {
    // 1. Fetch sports with logged practice sessions
    const sportsRes = await fetch('/api/ai/sports', { headers: authHeaders() });
    const sportsList = await sportsRes.json();

    // 2. Fetch AI Recommendations, Analyses & Session-wise Analytics
    let recsUrl = '/api/ai/recommendations';
    let analUrl = '/api/ai/analyses';
    let sessUrl = '/api/ai/session-analytics';
    if (selectedSportId) {
      recsUrl += `?sport_id=${selectedSportId}`;
      analUrl += `?sport_id=${selectedSportId}`;
      sessUrl += `?sport_id=${selectedSportId}`;
    }

    const [recsRes, analRes, sessRes, goalsRes] = await Promise.all([
      fetch(recsUrl, { headers: authHeaders() }),
      fetch(analUrl, { headers: authHeaders() }),
      fetch(sessUrl, { headers: authHeaders() }),
      fetch('/api/goals', { headers: authHeaders() })
    ]);

    const recs = recsRes.ok ? await recsRes.json() : [];
    const analyses = analRes.ok ? await analRes.json() : [];
    const sessionAnalytics = sessRes.ok ? await sessRes.json() : [];
    const activeGoals = goalsRes.ok ? await goalsRes.json() : [];
    window.cachedActiveGoals = activeGoals;

    cachedSessionAnalytics = Array.isArray(sessionAnalytics) ? sessionAnalytics : [];

    // Populate Session Selector Dropdown
    const sessDropdown = document.getElementById('ai-session-dropdown');
    if (sessDropdown) {
      sessDropdown.innerHTML = '';
      if (!cachedSessionAnalytics || cachedSessionAnalytics.length === 0) {
        sessDropdown.innerHTML = '<option value="">No sessions recorded yet</option>';
        document.getElementById('ai-session-detail-card').classList.add('hidden');
      } else {
        cachedSessionAnalytics.forEach(s => {
          const cRatingStr = s.coach_rating ? `Coach Rating: ${s.coach_rating}/10` : 'Unrated';
          sessDropdown.innerHTML += `
            <option value="${s.session_id}">📅 ${s.date} - ${s.sport_name} (${s.duration_minutes}m ${s.training_type.replace('_',' ')}) • ${cRatingStr}</option>
          `;
        });
        // Render first session details by default
        renderAiSessionDetailCard(cachedSessionAnalytics[0].session_id);
      }
    }

    const tabsWrapper = document.getElementById('ai-sport-tabs-wrapper');
    const tabsContainer = document.getElementById('ai-sport-tabs');
    const mainContainer = document.getElementById('ai-recs-container');
    mainContainer.innerHTML = '';

    // Render Sport Filter Tabs if sports exist
    if (sportsList && sportsList.length > 0) {
      if (tabsWrapper) tabsWrapper.classList.remove('hidden');
      if (tabsContainer) {
        tabsContainer.innerHTML = `
          <button onclick="loadAIRecommendations(null)" 
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${selectedSportId === null ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
            <span>🌟 All Sports (${sportsList.length})</span>
          </button>
        `;

        sportsList.forEach(sp => {
          const icon = getSportIcon(sp.sport_name);
          const isActive = selectedSportId === sp.sport_id;
          tabsContainer.innerHTML += `
            <button onclick="loadAIRecommendations(${sp.sport_id})" 
              class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${isActive ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
              <span>${icon} ${sp.sport_name}</span>
              <span class="text-[10px] opacity-75">(${sp.session_count})</span>
            </button>
          `;
        });
      }
    } else {
      if (tabsWrapper) tabsWrapper.classList.add('hidden');
    }

    if (!recs || recs.length === 0) {
      mainContainer.innerHTML = `
        <div class="empty-state-box p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="w-16 h-16 bg-brand-50 dark:bg-brand-900/30 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="sparkles" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">No AI Analysis generated yet</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1">Record practice sessions to trigger isolated, high-level ML performance analysis & domain-specific drill recommendations for each of your sports.</p>
          <div class="flex items-center justify-center space-x-3 mt-5">
            <button onclick="triggerAIAnalysis()" class="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-accent-500 text-white font-bold rounded-xl text-xs shadow-md">
              ⚡ Run AI Analysis Now
            </button>
            <button onclick="navTo('practice')" class="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs">
              + Record Practice Session
            </button>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Group recommendations, analyses, and sessions by sport_name
    const groupedData = {};
    
    // Map analyses by sport_name
    const analysisMap = {};
    if (Array.isArray(analyses)) {
      analyses.forEach(a => {
        analysisMap[a.sport_name] = a;
      });
    }

    // Map sessions by sport_name
    const sessionsMap = {};
    if (Array.isArray(sessionAnalytics)) {
      sessionAnalytics.forEach(s => {
        if (!sessionsMap[s.sport_name]) sessionsMap[s.sport_name] = [];
        sessionsMap[s.sport_name].push(s);
      });
    }

    recs.forEach(r => {
      if (!groupedData[r.sport_name]) {
        groupedData[r.sport_name] = {
          sport_id: r.sport_id,
          sport_name: r.sport_name,
          sport_category: r.sport_category || 'OUTDOOR',
          analysis: analysisMap[r.sport_name] || null,
          sessions: sessionsMap[r.sport_name] || [],
          recommendations: []
        };
      }
      const isDup = groupedData[r.sport_name].recommendations.some(item => item.title.trim().toLowerCase() === r.title.trim().toLowerCase());
      if (!isDup) {
        groupedData[r.sport_name].recommendations.push(r);
      }
    });

    // Render grouped per-sport recommendation sections
    Object.values(groupedData).forEach(group => {
      const icon = getSportIcon(group.sport_name);
      const analysis = group.analysis;
      
      let trendBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
      let trendLabel = '📊 CONSISTENCY';
      if (analysis) {
        if (analysis.trend_type === 'IMPROVEMENT') {
          trendBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
          trendLabel = '📈 UPWARD PROGRESSION';
        } else if (analysis.trend_type === 'DECLINE') {
          trendBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
          trendLabel = '🔻 PERFORMANCE DIP';
        }
      }

      let recsHtml = '';
      group.recommendations.forEach(r => {
        let prioBadge = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300';
        if (r.priority === 'HIGH') prioBadge = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';
        if (r.priority === 'MEDIUM') prioBadge = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';

        const existingGoal = activeGoals.find(g => g.title === r.title);
        let goalBtnHtml = '';
        if (existingGoal) {
          if (existingGoal.status === 'COMPLETED' || existingGoal.progress_percentage >= 100) {
            goalBtnHtml = `<span class="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg text-xs flex items-center space-x-1"><span>🎉 Goal Achieved! (100%)</span></span>`;
          } else {
            goalBtnHtml = `<span class="px-3 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-extrabold rounded-lg text-xs flex items-center space-x-1"><span>🎯 Goal Active (${existingGoal.progress_percentage || 0}% Progress)</span></span>`;
          }
        } else {
          goalBtnHtml = `
            <button onclick="adoptAiGoal(${r.recommendation_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-lg text-xs shadow-sm flex items-center space-x-1 transition">
              <span>🎯 Set as Target Goal</span>
            </button>
          `;
        }

        recsHtml += `
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition space-y-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg border ${prioBadge}">
                ${r.priority} PRIORITY DRILL
              </span>
              <span class="text-[11px] font-medium text-slate-400">
                Created: ${new Date(r.created_at || Date.now()).toLocaleDateString()}
              </span>
            </div>

            <h4 class="text-base font-bold text-slate-900 dark:text-white mt-1 mb-1">${r.title}</h4>
            
            <div class="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center space-x-1">
              <span>⚠️ Diagnosis: ${r.detected_issue}</span>
            </div>

            <div class="bg-slate-50 dark:bg-slate-700/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              <b class="text-brand-600 dark:text-brand-400 font-bold block mb-1">🎯 Actionable Coaching Routine:</b>
              ${formatAiText(r.recommendation_text)}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
              <div class="text-slate-500 dark:text-slate-400">
                <span class="font-bold text-slate-700 dark:text-slate-300">Empirical Evidence:</span><br/>
                ${r.evidence}
              </div>
              ${r.suggested_goal ? `
                <div class="text-slate-500 dark:text-slate-400">
                  <span class="font-bold text-slate-700 dark:text-slate-300">Suggested Target Goal:</span><br/>
                  <span class="text-brand-600 dark:text-brand-400 font-semibold">${r.suggested_goal}</span>
                </div>
              ` : ''}
            </div>

            <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              ${goalBtnHtml}
              <span class="text-[10px] text-slate-400">Auto-Tracked Goal</span>
            </div>
          </div>
        `;
      });

      mainContainer.innerHTML += `
        <div class="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
          <!-- Sport Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
                ${icon}
              </div>
              <div>
                <h3 class="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
                  <span>${group.sport_name}</span>
                  <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    ${group.sport_category}
                  </span>
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">Isolated Sport AI Recommendations & Tactical Guidance</p>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-xs font-bold px-3 py-1.5 rounded-xl ${trendBadgeClass}">
                ${trendLabel}
              </span>
              <button onclick="triggerAIAnalysis(${group.sport_id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition">
                ↻ Re-analyze ${group.sport_name}
              </button>
            </div>
          </div>

          <!-- High Level Tactical Diagnosis Card -->
          ${analysis ? `
            <div class="bg-gradient-to-r from-brand-500/10 via-accent-500/5 to-transparent p-4 rounded-xl border border-brand-500/20">
              <div class="text-xs font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <span>🧠 AI Tactical Diagnosis (${group.sport_name})</span>
              </div>
              <div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                ${formatAiText(analysis.analysis_text)}
              </div>
              <div class="text-[11px] text-slate-400 mt-2 font-semibold">
                Evidence: ${analysis.supporting_evidence}
              </div>
            </div>
          ` : ''}

          <!-- Session-Wise AI Analytics (Date Included) -->
          ${group.sessions && group.sessions.length > 0 ? `
            <div class="space-y-3 pt-2">
              <h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <span>📅 Session-Wise AI Analytics (${group.sessions.length} sessions logged)</span>
              </h4>
              <div class="grid grid-cols-1 gap-2.5">
                ${group.sessions.map(s => `
                  <div class="p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    <div class="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                      <span>📅 Date: ${s.date} (${s.duration_minutes}m ${s.training_type.replace('_',' ')})</span>
                      <span class="px-2 py-0.5 rounded text-[10px] ${s.coach_rating ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'} font-extrabold">
                        Coach Rating: ${s.coach_rating ? s.coach_rating + '/10' : 'Pending'}
                      </span>
                    </div>
                    <p class="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                      💡 <b>AI Session Evaluation:</b> ${s.ai_session_feedback || 'Session recorded successfully.'}
                    </p>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Recommendations Grid -->
          <div class="space-y-4">
            <h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
              Specific ${group.sport_name} Corrective Routines (${group.recommendations.length})
            </h4>
            <div class="grid grid-cols-1 gap-4">
              ${recsHtml}
            </div>
          </div>
        </div>
      `;
    });

    if (window.lucide) lucide.createIcons();

  } catch (e) { 
    console.error('Error loading AI recommendations:', e); 
  }
}

// GOALS
async function loadGoals() {
  try {
    const res = await fetch('/api/goals', { headers: authHeaders() });
    const goals = await res.json();
    const container = document.getElementById('goals-list');
    container.innerHTML = '';

    if (!goals || goals.length === 0) {
      container.innerHTML = `
        <div class="col-span-full empty-state-box">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">No sports goals created yet</h3>
          <p class="text-xs text-slate-500 mt-1">Set athletic targets (e.g., reduce bowling wides, improve serve accuracy) to track automated progress.</p>
          <button onclick="openGoalModal()" class="mt-4 px-4 py-2 bg-brand-600 text-white font-bold rounded-xl text-xs">+ Set First Goal</button>
        </div>
      `;
      return;
    }

    goals.forEach(g => {
      container.innerHTML += `
        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-brand-600">${g.sport_name}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${g.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${g.status}</span>
          </div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">${g.title}</h3>
          <div class="mt-3">
            <div class="flex justify-between text-xs text-slate-500 mb-1">
              <span>Target: ${g.target_value} ${g.unit}</span>
              <span>${g.progress_percentage}%</span>
            </div>
            <div class="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div class="bg-brand-600 h-full rounded-full transition-all duration-500" style="width: ${g.progress_percentage}%"></div>
            </div>
          </div>
          <div class="mt-3 text-[11px] text-slate-400">Deadline: ${g.deadline}</div>
        </div>
      `;
    });
  } catch (e) { console.error(e); }
}

async function openGoalModal() {
  try {
    const res = await fetch('/api/sports/student', { headers: authHeaders() });
    const sports = await res.json();
    const select = document.getElementById('goal-sport-select');
    select.innerHTML = '';

    sports.forEach(s => {
      select.innerHTML += `<option value="${s.sport_id}">${s.name}</option>`;
    });

    document.getElementById('goal-modal').classList.remove('hidden');
  } catch (e) { console.error(e); }
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.add('hidden');
}

async function submitGoal(e) {
  e.preventDefault();
  const sport_id = parseInt(document.getElementById('goal-sport-select').value);
  const title = document.getElementById('goal-title').value;
  const target_value = floatVal(document.getElementById('goal-target').value);
  const deadline = document.getElementById('goal-deadline').value;

  try {
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sport_id, title, target_value, deadline })
    });
    if (!res.ok) throw new Error('Failed to create goal');
    closeGoalModal();
    showToast('Goal set successfully', 'success');
    loadGoals();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// COACH SEARCH & CONNECTIONS
async function searchCoaches() {
  const q = document.getElementById('coach-search-q').value;
  try {
    const res = await fetch(`/api/coach/search?q=${encodeURIComponent(q || '')}`, { headers: authHeaders() });
    const coaches = await res.json();
    const container = document.getElementById('coaches-list');
    container.innerHTML = '';

    if (!coaches || coaches.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500 col-span-full">No registered coaches found matching search.</p>';
      return;
    }

    coaches.forEach(c => {
      let btnHtml = '';
      if (c.connection_status === 'PENDING') {
        btnHtml = `<span class="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-extrabold rounded-lg text-xs">Request Pending</span>`;
      } else if (c.connection_status === 'ACCEPTED') {
        btnHtml = `<span class="px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-extrabold rounded-lg text-xs">Connected</span>`;
      } else if (c.is_eligible === false) {
        btnHtml = `
          <button disabled title="${c.lock_reason || 'Sport not in your sports profile'}" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-400 font-bold rounded-lg text-xs cursor-not-allowed flex items-center space-x-1">
            <span>🔒 Locked (${c.coach_sport || 'Sport Not Tracked'})</span>
          </button>
        `;
      } else {
        btnHtml = `<button onclick="connectCoach(${c.user_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs shadow-sm transition">Connect with Coach</button>`;
      }

      let sportBadge = c.is_eligible === false ?
        `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">🔒 Not in Your Sports Profile (${c.coach_sport})</span>` :
        `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">✓ Matches Your Sport (${c.coach_sport || c.coaching_specialization})</span>`;

      container.innerHTML += `
        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center space-x-2 mb-0.5">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Coach ${c.name}</h3>
              ${sportBadge}
            </div>
            <div class="text-xs text-brand-600 font-semibold">${c.coaching_specialization}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${c.experience_years} years experience ${c.certification ? '• ' + c.certification : ''}</div>
          </div>
          <div>${btnHtml}</div>
        </div>
      `;
    });
  } catch (e) { console.error(e); }
}

async function connectCoach(coachId) {
  try {
    const res = await fetch(`/api/coach/connect/${coachId}`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to send request');

    showToast('Connection request sent!', 'success');
    searchCoaches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// COACH DASHBOARD & STUDENTS MANAGEMENT
async function loadCoachDashboard() {
  loadNotifications();
  try {
    const resStudents = await fetch('/api/coach/students', { headers: authHeaders() });
    const students = await resStudents.json();

    const resReqs = await fetch('/api/coach/requests', { headers: authHeaders() });
    const reqs = await resReqs.json();

    const emptyBox = document.getElementById('coach-dash-empty');
    const gridBox = document.getElementById('coach-students-grid');

    if (!Array.isArray(students) || !Array.isArray(reqs)) {
      if (emptyBox) emptyBox.classList.remove('hidden');
      if (gridBox) gridBox.innerHTML = '';
      return;
    }

    document.getElementById('coach-card-students').textContent = students.length;
    document.getElementById('coach-card-pending').textContent = reqs.length;

    if (students.length === 0) {
      emptyBox.classList.remove('hidden');
      gridBox.innerHTML = '';
    } else {
      emptyBox.classList.add('hidden');
      renderCoachStudentCards(students, gridBox);
    }
  } catch (e) { console.error(e); }
}

function renderCoachStudentCards(students, container) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(students)) return;
  students.forEach(s => {
    container.innerHTML += `
      <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">${s.student_name}</h3>
        <div class="text-xs text-slate-500 mb-2">Primary Sport: ${s.preferred_sport || 'N/A'}</div>
        <div class="text-xs text-slate-600 dark:text-slate-300">Total Practice Logged: <b>${s.total_hours} hrs</b> (${s.total_sessions} sessions)</div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button onclick="openCoachStudentDetailModal(${s.student_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs flex items-center space-x-1 shadow-sm">
            <span>⚡ AI Analytics & Rate Sessions</span>
          </button>
          <button onclick="openCoachFeedbackModal(${s.student_id}, '${s.student_name}')" class="px-3 py-1.5 bg-sportsgreen-600 hover:bg-sportsgreen-700 text-white font-bold rounded-lg text-xs">+ Feedback</button>
        </div>
      </div>
    `;
  });
}

// COACH STUDENT DETAIL & SESSION RATING MODAL HANDLER
async function openCoachStudentDetailModal(studentId) {
  try {
    const data = await safeFetchJson(`/api/coach/students/${studentId}`);
    const s = data.student;

    const idEl = document.getElementById('csd-student-id');
    if (idEl) idEl.value = studentId;

    const nameEl = document.getElementById('csd-name');
    if (nameEl) nameEl.textContent = s.name;

    const avatarEl = document.getElementById('csd-avatar');
    if (avatarEl) avatarEl.textContent = s.name ? s.name.charAt(0).toUpperCase() : 'S';

    const infoEl = document.getElementById('csd-info');
    if (infoEl) infoEl.textContent = `${s.email} • Coached Sport Filter: ${data.coached_sport_filter}`;

    // Populate Sport select options for Drill performance suggestion form
    const sportSelect = document.getElementById('csd-sport-select');
    if (sportSelect) {
      sportSelect.innerHTML = '';
      if (data.sports && data.sports.length > 0) {
        data.sports.forEach(sp => {
          sportSelect.innerHTML += `<option value="${sp.sport_id}">${sp.name || sp.sport_name}</option>`;
        });
      } else if (data.sports_statistics && data.sports_statistics.length > 0) {
        data.sports_statistics.forEach(sp => {
          sportSelect.innerHTML += `<option value="${sp.sport_id}">${sp.sport_name}</option>`;
        });
      } else {
        sportSelect.innerHTML = '<option value="">No sport available</option>';
      }
    }

    // Populate Session select options if element exists
    const sessionSelect = document.getElementById('csd-session-select');
    if (sessionSelect) {
      sessionSelect.innerHTML = '<option value="">All Sessions (General Drill Suggestion)</option>';
      if (data.sessions && data.sessions.length > 0) {
        data.sessions.forEach(sess => {
          sessionSelect.innerHTML += `<option value="${sess.session_id}">Session ${sess.date} (${sess.sport_name})</option>`;
        });
      }
    }

    // Render Per-Sport Statistics in Coach Student Detail Modal
    const coachStatsContainer = document.getElementById('csd-per-sport-stats-container');
    if (coachStatsContainer) {
      coachStatsContainer.innerHTML = '';
      if (data.sports_statistics && data.sports_statistics.length > 0) {
        data.sports_statistics.forEach(sp => {
          coachStatsContainer.innerHTML += renderSportStatCard(sp, true);
        });
      } else {
        coachStatsContainer.innerHTML = `<p class="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl col-span-2">No sport statistics logged for this student yet.</p>`;
      }
    }

    // Render AI Suggestions for coached sports
    const aiContainer = document.getElementById('csd-ai-suggestions-container');
    if (aiContainer) {
      aiContainer.innerHTML = '';

      if (!data.ai_recommendations || data.ai_recommendations.length === 0) {
        aiContainer.innerHTML = `<p class="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">No AI suggestions generated yet for coached sport (${data.coached_sport_filter}). Record sessions and run AI analysis.</p>`;
      } else {
        data.ai_recommendations.forEach(r => {
          aiContainer.innerHTML += `
            <div class="p-3.5 bg-brand-50/60 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800 text-xs">
              <div class="flex justify-between font-bold text-brand-700 dark:text-brand-300 mb-1">
                <span>⚡ ${r.sport_name}: ${r.title}</span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-brand-200 dark:bg-brand-800 text-brand-900 dark:text-brand-100 font-extrabold">${r.priority} PRIORITY</span>
              </div>
              <div class="text-slate-700 dark:text-slate-200 mb-1"><b>Recommendation:</b> ${r.recommendation_text}</div>
              <div class="text-[11px] text-slate-500"><b>Issue:</b> ${r.detected_issue} | <b>Evidence:</b> ${r.evidence}</div>
            </div>
          `;
        });
      }

      // Render History of Coach Drill Suggestions & Student Replies
      if (data.coach_feedbacks && data.coach_feedbacks.length > 0) {
        let fbHtml = '<div class="space-y-2 text-xs pt-3 mt-3 border-t border-slate-200 dark:border-slate-700"><h4 class="font-extrabold text-slate-800 dark:text-slate-200 flex items-center space-x-1"><span>💬 Sent Suggestions & Student Replies</span></h4>';
        data.coach_feedbacks.forEach(f => {
          const replyHtml = f.student_reply ? `
            <div class="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-[11px]">
                <span>💬 Student Reply Received:</span>
                <span class="text-[10px] text-slate-400 font-normal">${new Date(f.student_reply_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <p class="text-slate-800 dark:text-slate-200 mt-1 font-medium italic">"${f.student_reply}"</p>
            </div>
          ` : `<div class="mt-1 text-[10px] text-slate-400 italic">⏳ Waiting for student reply...</div>`;

          fbHtml += `
            <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
              <div class="flex justify-between font-bold text-slate-900 dark:text-white">
                <span>${f.sport_name}: ${f.recommended_drill || 'Coaching Feedback'}</span>
                <span class="text-[10px] text-slate-400">${new Date(f.created_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <p class="text-slate-600 dark:text-slate-300">${f.feedback_text}</p>
              ${replyHtml}
            </div>
          `;
        });
        fbHtml += '</div>';
        aiContainer.innerHTML += fbHtml;
      }
    }

    // Render Session-Wise Analytics & Rating Generator
    const sessContainer = document.getElementById('csd-sessions-container');
    if (sessContainer) {
      sessContainer.innerHTML = '';
      if (!data.sessions || data.sessions.length === 0) {
        sessContainer.innerHTML = `<p class="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">No sessions logged for ${data.coached_sport_filter}.</p>`;
      } else {
        data.sessions.forEach(sess => {
          const metricsHtml = sess.metrics ? sess.metrics.map(m => `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300 mr-1">${m.metric_name}: <b>${m.metric_value}</b> ${m.metric_unit || ''}</span>`).join('') : '';
          const probsHtml = sess.problems ? sess.problems.map(p => `<div class="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1">⚠️ Issue: ${p.description}</div>`).join('') : '';
          
          let ratingButtons = '';
          for (let r = 1; r <= 10; r++) {
            const isSelected = sess.coach_rating === r;
            const bgBtn = isSelected ? 'bg-emerald-600 text-white font-extrabold shadow-sm scale-105' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50';
            ratingButtons += `<button onclick="rateStudentSession(${sess.session_id}, ${r}, ${studentId})" class="w-7 h-7 rounded-lg text-xs transition transform ${bgBtn}">${r}</button>`;
          }

          sessContainer.innerHTML += `
            <div class="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-sm">
              <div class="flex items-center justify-between text-xs">
                <div class="font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
                  <span>📅 Date: ${sess.date}</span>
                  <span class="px-2 py-0.5 bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-300 rounded font-bold">${sess.sport_name}</span>
                </div>
                <div class="text-slate-500 font-semibold">
                  Current Coach Rating: <b class="${sess.coach_rating ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-amber-500'}">${sess.coach_rating ? sess.coach_rating + '/10' : 'Unrated'}</b>
                </div>
              </div>

              <div class="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span>Duration: <b>${sess.duration_minutes}m</b></span>
                <span>Intensity: <b>${sess.intensity}</b></span>
                <span>Type: <b>${(sess.training_type || '').replace('_', ' ')}</b></span>
              </div>

              ${metricsHtml ? `<div class="pt-1">${metricsHtml}</div>` : ''}
              ${probsHtml}

              <!-- Coach Rating Generator Bar -->
              <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
                <span class="text-[11px] font-bold text-slate-500">Generate Coach Rating (1-10):</span>
                <div class="flex space-x-1">${ratingButtons}</div>
              </div>
            </div>
          `;
        });
      }
    }

    const modal = document.getElementById('coach-student-detail-modal');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeCoachStudentDetailModal() {
  const modal = document.getElementById('coach-student-detail-modal');
  if (modal) modal.classList.add('hidden');
}

async function rateStudentSession(sessionId, rating, studentId) {
  try {
    const data = await safeFetchJson(`/api/coach/sessions/${sessionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ coach_rating: rating })
    });
    showToast(`Coach Rating ${rating}/10 generated successfully!`, 'success');
    openCoachStudentDetailModal(studentId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCoachRequests() {
  try {
    const requests = await safeFetchJson('/api/coach/requests');
    const container = document.getElementById('coach-requests-list');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(requests) || requests.length === 0) {
      container.innerHTML = '<div class="empty-state-box"><h3 class="text-base font-bold">No pending connection requests</h3></div>';
      return;
    }

    requests.forEach(req => {
      const lockWarning = req.eligibility_warning ? `
        <div class="mt-2 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-[11px] font-medium flex items-center space-x-1.5">
          <span>⚠️</span>
          <span>${req.eligibility_warning}</span>
        </div>
      ` : '';

      const buttonsHtml = req.is_eligible !== false ? `
        <div class="flex items-center space-x-2">
          <button onclick="respondCoachRequest(${req.connection_id}, true)" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm">Accept</button>
          <button onclick="respondCoachRequest(${req.connection_id}, false)" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow-sm">Reject</button>
        </div>
      ` : `
        <button onclick="respondCoachRequest(${req.connection_id}, false)" class="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white font-bold rounded-lg text-xs shadow-sm">Reject Request</button>
      `;

      container.innerHTML += `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">${req.student_name}</h4>
            <div class="text-xs text-slate-500">${req.student_email} • Sport: ${req.preferred_sport || 'N/A'}</div>
            ${lockWarning}
          </div>
          <div>${buttonsHtml}</div>
        </div>
      `;
    });
  } catch (e) { console.error(e); }
}

// COACH FEEDBACK MODAL
async function openCoachFeedbackModal(studentId, studentName) {
  const idEl = document.getElementById('fb-student-id');
  if (idEl) idEl.value = studentId;

  const nameEl = document.getElementById('feedback-student-name');
  if (nameEl) nameEl.textContent = `Submitting feedback for ${studentName}`;

  try {
    const data = await safeFetchJson(`/api/coach/students/${studentId}`);
    const select = document.getElementById('fb-sport-id');
    if (select) {
      select.innerHTML = '';
      if (data.sports && data.sports.length > 0) {
        data.sports.forEach(s => {
          select.innerHTML += `<option value="${s.sport_id}">${s.name || s.sport_name}</option>`;
        });
      } else if (data.sports_statistics && data.sports_statistics.length > 0) {
        data.sports_statistics.forEach(s => {
          select.innerHTML += `<option value="${s.sport_id}">${s.sport_name}</option>`;
        });
      } else {
        select.innerHTML = '<option value="">No sport available</option>';
      }
    }

    const modal = document.getElementById('coach-feedback-modal');
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeCoachFeedbackModal() {
  const modal = document.getElementById('coach-feedback-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitCoachFeedback(e) {
  e.preventDefault();
  const student_id = parseInt(document.getElementById('fb-student-id').value);
  const sport_id = parseInt(document.getElementById('fb-sport-id').value);
  const observed_strength = document.getElementById('fb-strength').value;
  const observed_weakness = document.getElementById('fb-weakness').value;
  const feedback_text = document.getElementById('fb-text').value;
  const recommended_drill = document.getElementById('fb-drill').value;
  const practice_duration_minutes = parseInt(document.getElementById('fb-duration').value) || 20;

  if (!sport_id) {
    showToast('Please select a valid sport for feedback', 'error');
    return;
  }

  try {
    await safeFetchJson('/api/coach/feedback', {
      method: 'POST',
      body: JSON.stringify({
        student_id, sport_id, observed_strength, observed_weakness,
        feedback_text, recommended_drill, practice_duration_minutes
      })
    });

    closeCoachFeedbackModal();
    showToast('Coach feedback submitted successfully!', 'success');
    loadCoachDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// PDF REPORT DOWNLOAD
async function downloadPdfReport() {
  try {
    const res = await fetch('/api/reports/download-pdf', { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Report cannot be generated because no performance data is available.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AthletIQ_Report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Performance Report PDF downloaded!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// SUBMIT DRILL SUGGESTION FROM COACH STUDENT DETAIL MODAL
async function submitDrillSuggestionFromModal(e) {
  e.preventDefault();
  const studentEl = document.getElementById('csd-student-id');
  const sportEl = document.getElementById('csd-sport-select');
  const drillNameEl = document.getElementById('csd-drill-name');
  const feedbackEl = document.getElementById('csd-feedback-text');
  const durationEl = document.getElementById('csd-drill-duration');
  const priorityEl = document.getElementById('csd-priority');
  const sessionSelect = document.getElementById('csd-session-select');

  const student_id = studentEl ? parseInt(studentEl.value) : null;
  const sport_id = sportEl ? parseInt(sportEl.value) : null;
  const session_id = (sessionSelect && sessionSelect.value) ? parseInt(sessionSelect.value) : null;
  const recommended_drill = drillNameEl ? drillNameEl.value.trim() : '';
  const feedback_text = feedbackEl ? feedbackEl.value.trim() : '';
  const practice_duration_minutes = durationEl ? (parseInt(durationEl.value) || 25) : 25;
  const priority = priorityEl ? priorityEl.value : 'MEDIUM';

  if (!student_id) {
    showToast('Student reference missing', 'error');
    return;
  }

  if (!sport_id) {
    showToast('Please select a sport for the student', 'error');
    return;
  }

  if (!recommended_drill) {
    showToast('Please enter a recommended drill name', 'error');
    return;
  }

  if (!feedback_text) {
    showToast('Please enter drill performance coaching suggestions', 'error');
    return;
  }

  try {
    await safeFetchJson('/api/coach/feedback', {
      method: 'POST',
      body: JSON.stringify({
        student_id,
        sport_id,
        session_id,
        feedback_text,
        recommended_drill,
        practice_duration_minutes,
        priority,
        observed_strength: 'Drill performance evaluation',
        observed_weakness: 'Performance drill target'
      })
    });

    showToast('Drill performance suggestion sent to student successfully!', 'success');
    if (drillNameEl) drillNameEl.value = '';
    if (feedbackEl) feedbackEl.value = '';
    
    // Refresh modal details and coach students list
    openCoachStudentDetailModal(student_id);
    loadCoachDashboard();
  } catch (err) {
    showToast(err.message || 'Failed to send drill suggestion', 'error');
  }
}

async function adoptAiGoal(recId) {
  try {
    const res = await fetch(`/api/goals/from-ai/${recId}`, {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to set target goal');

    showToast('🎯 Target Goal set from AI Suggestion successfully!', 'success');
    if (typeof loadAIRecommendations === 'function') loadAIRecommendations(currentAISportFilter);
    if (typeof loadDashboardPreviews === 'function') loadDashboardPreviews();
    loadNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// NOTIFICATIONS & NOTIFICATION BAR WIDGET
async function loadNotifications() {
  const token = currentToken || localStorage.getItem('athletiq_token');
  if (!token) return;

  try {
    const res = await fetch('/api/notifications', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const badge = document.getElementById('notif-badge-count');
    if (badge) {
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Render Pending Connection Requests (Coach view)
    const coachReqsBox = document.getElementById('notif-coach-requests-container');
    const reqsList = document.getElementById('notif-requests-list');
    if (coachReqsBox && reqsList) {
      if (Array.isArray(data.pending_requests) && data.pending_requests.length > 0) {
        coachReqsBox.classList.remove('hidden');
        reqsList.innerHTML = '';
        data.pending_requests.forEach(r => {
          reqsList.innerHTML += `
            <div class="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-sm flex items-center justify-between gap-2">
              <div class="truncate">
                <div class="font-bold text-slate-900 dark:text-white truncate text-xs">${r.student_name}</div>
                <div class="text-[10px] text-slate-500">${r.preferred_sport || 'General Student'}</div>
              </div>
              <div class="flex items-center space-x-1 flex-shrink-0">
                <button onclick="respondRequestFromNotification(${r.connection_id}, true)" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded text-[10px] shadow-sm">Accept</button>
                <button onclick="respondRequestFromNotification(${r.connection_id}, false)" class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded text-[10px]">Reject</button>
              </div>
            </div>
          `;
        });
      } else {
        coachReqsBox.classList.add('hidden');
      }
    }

    // Render Notification Items
    const notifList = document.getElementById('notif-list');
    if (notifList) {
      notifList.innerHTML = '';
      if (!data.notifications || data.notifications.length === 0) {
        notifList.innerHTML = '<div class="p-4 text-center text-slate-400 italic text-xs">No notifications yet.</div>';
      } else {
        data.notifications.forEach(n => {
          let typeIcon = '🔔';
          let bgStyle = n.is_read ? 'bg-white dark:bg-slate-800' : 'bg-brand-50/50 dark:bg-brand-900/20 font-semibold';
          if (n.type === 'AI_SUGGESTION') typeIcon = '⚡';
          if (n.type === 'DRILL_SUGGESTION' || n.type === 'FEEDBACK') typeIcon = '🎯';
          if (n.type === 'COACH_REQUEST') typeIcon = '📩';
          if (n.type === 'COACH_RATING') typeIcon = '🏅';
          if (n.type === 'STUDENT_REPLY') typeIcon = '💬';
          if (n.type === 'GOAL_ACHIEVED') typeIcon = '🎉';
          if (n.type === 'GOAL_ADOPTED') typeIcon = '🎯';

          const encTitle = encodeURIComponent(n.title);
          const encMsg = encodeURIComponent(n.message);

          notifList.innerHTML += `
            <div onclick="handleNotificationClick(${n.notification_id}, '${n.type}', '${encTitle}', '${encMsg}')" class="p-3 ${bgStyle} hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer flex items-start space-x-2.5">
              <span class="text-sm flex-shrink-0">${typeIcon}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-900 dark:text-white text-xs truncate">${n.title}</span>
                  <span class="text-[9px] text-slate-400 flex-shrink-0">${new Date(n.created_at || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">${n.message}</p>
              </div>
            </div>
          `;
        });
      }
    }

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
}

async function handleNotificationClick(notifId, type, encodedTitle, encodedMsg) {
  const title = decodeURIComponent(encodedTitle);
  const msg = decodeURIComponent(encodedMsg);

  markNotificationRead(notifId);

  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  if (type === 'DRILL_SUGGESTION' || type === 'FEEDBACK') {
    openSuggestionDetailModalDirect(title, msg);
  } else if (type === 'AI_SUGGESTION') {
    navTo('ai-recs');
  } else if (type === 'STUDENT_REPLY') {
    if (currentUser && currentUser.role === 'COACH') {
      navTo('coach-students');
    }
  }
}

async function openSuggestionDetailModalFromFeedback(feedbackId) {
  try {
    const res = await fetch('/api/coach/feedback', { headers: authHeaders() });
    const feedbacks = await res.json();
    const fb = feedbacks.find(f => f.feedback_id === feedbackId) || (feedbacks.length > 0 ? feedbacks[0] : null);
    
    if (fb) {
      document.getElementById('sdm-feedback-id').value = fb.feedback_id;
      document.getElementById('sdm-title').textContent = fb.recommended_drill ? `Drill Suggestion: ${fb.recommended_drill}` : 'Coach Feedback';
      document.getElementById('sdm-coach-info').textContent = `From Coach ${fb.coach_name} (${fb.coaching_specialization || 'Specialist'})`;
      document.getElementById('sdm-drill-name').textContent = `Target Drill: ${fb.recommended_drill || 'Performance Practice'}`;
      document.getElementById('sdm-text').textContent = fb.feedback_text;
      document.getElementById('sdm-details').textContent = `Sport: ${fb.sport_name} • Duration: ${fb.practice_duration_minutes || 20} mins • Priority: ${fb.priority || 'MEDIUM'}`;

      const replyBox = document.getElementById('sdm-existing-reply-box');
      const replyForm = document.getElementById('sdm-reply-form');
      if (fb.student_reply) {
        document.getElementById('sdm-existing-reply-text').textContent = `"${fb.student_reply}"`;
        document.getElementById('sdm-existing-reply-time').textContent = `Sent on ${new Date(fb.student_reply_at || Date.now()).toLocaleString()}`;
        replyBox.classList.remove('hidden');
        replyForm.classList.add('hidden');
      } else {
        replyBox.classList.add('hidden');
        replyForm.classList.remove('hidden');
        document.getElementById('sdm-reply-input').value = '';
      }

      document.getElementById('suggestion-detail-modal').classList.remove('hidden');
    }
  } catch(e) { console.error(e); }
}

function openSuggestionDetailModalDirect(title, msg) {
  fetch('/api/coach/feedback', { headers: authHeaders() })
    .then(r => r.json())
    .then(feedbacks => {
      if (Array.isArray(feedbacks) && feedbacks.length > 0) {
        openSuggestionDetailModalFromFeedback(feedbacks[0].feedback_id);
      } else {
        document.getElementById('sdm-title').textContent = title;
        document.getElementById('sdm-text').textContent = msg;
        document.getElementById('sdm-existing-reply-box').classList.add('hidden');
        document.getElementById('sdm-reply-form').classList.remove('hidden');
        document.getElementById('suggestion-detail-modal').classList.remove('hidden');
      }
    }).catch(e => console.error(e));
}

function closeSuggestionDetailModal() {
  const modal = document.getElementById('suggestion-detail-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitStudentReplyFromModal(e) {
  e.preventDefault();
  const feedback_id = parseInt(document.getElementById('sdm-feedback-id').value);
  const reply_text = document.getElementById('sdm-reply-input').value;

  if (!feedback_id || !reply_text) {
    showToast('Please enter your reply text', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/coach/feedback/${feedback_id}/reply`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ reply_text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to send reply');

    showToast('Reply sent to coach successfully!', 'success');
    closeSuggestionDetailModal();
    loadNotifications();
    loadDashboardPreviews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleNotificationDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');
  if (!dropdown.classList.contains('hidden')) {
    loadNotifications();
  }
}

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-bell-btn');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

async function markAllNotificationsRead() {
  try {
    const res = await fetch('/api/notifications/read-all', { method: 'PUT', headers: authHeaders() });
    if (res.ok) {
      loadNotifications();
    }
  } catch (e) { console.error(e); }
}

async function markNotificationRead(notifId) {
  try {
    await fetch(`/api/notifications/${notifId}/read`, { method: 'PUT', headers: authHeaders() });
    loadNotifications();
  } catch (e) { console.error(e); }
}

async function respondRequestFromNotification(connectionId, accept) {
  try {
    const res = await fetch(`/api/coach/requests/${connectionId}/respond?accept=${accept}`, {
      method: 'POST',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to respond to request');
    showToast(`Connection request ${accept ? 'accepted' : 'rejected'} successfully!`, 'success');
    loadNotifications();
    if (typeof loadCoachDashboard === 'function') loadCoachDashboard();
    if (typeof loadCoachStudents === 'function') loadCoachStudents();
    if (typeof loadCoachRequests === 'function') loadCoachRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Auto-poll notifications every 10 seconds
setInterval(() => {
  if (currentToken || localStorage.getItem('athletiq_token')) {
    loadNotifications();
  }
}, 10000);
