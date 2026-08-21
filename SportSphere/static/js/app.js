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

async function initApp() {
  currentToken = localStorage.getItem('athletiq_token') || sessionStorage.getItem('athletiq_token');
  const userStr = localStorage.getItem('athletiq_user') || sessionStorage.getItem('athletiq_user');
  
  if (currentToken && userStr) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const liveUser = await res.json();
        currentUser = liveUser;
        const storage = localStorage.getItem('athletiq_token') ? localStorage : sessionStorage;
        storage.setItem('athletiq_user', JSON.stringify(liveUser));
        showAppWorkspace();
      } else {
        console.warn('Stored session is invalid or user account no longer exists in DB. Logging out.');
        handleLogout();
      }
    } catch (e) {
      console.warn('Session verification error:', e);
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

let currentActiveView = 'dashboard';
let previousActiveView = 'dashboard';

// Navigation Router
function navTo(viewName) {
  if (viewName === 'ask-ai') {
    if (typeof toggleAskAiFloatingPanel === 'function') {
      toggleAskAiFloatingPanel(true);
    }
    return;
  }

  window.scrollTo(0, 0);
  const mainScroll = document.querySelector('#app-view main');
  if (mainScroll) mainScroll.scrollTop = 0;

  if (viewName !== 'public-profile') {
    previousActiveView = currentActiveView;
  }
  currentActiveView = viewName;

  const views = [
    'dashboard', 'my-sports', 'practice', 'history', 'analytics', 
    'ai-recs', 'goals', 'coach-link', 'coach-dashboard', 'coach-requests', 'coach-students',
    'profile', 'public-profile'
  ];

  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  // Update top bar page title
  const topBarTitle = document.getElementById('top-bar-page-name');
  if (topBarTitle) {
    const titles = {
      'dashboard': 'Dashboard',
      'ask-ai': 'AthletIQ AskAI Assistant',
      'my-sports': 'My Sports',
      'practice': 'Record Practice Session',
      'history': 'Practice History',
      'analytics': 'Performance Analytics',
      'ai-recs': 'AI Recommendations',
      'goals': 'Sports Goals',
      'coach-link': 'Find & Link Coach',
      'coach-dashboard': 'Coach Dashboard',
      'coach-requests': 'Connection Requests',
      'coach-students': 'My Students',
      'profile': 'My Profile',
      'public-profile': 'Athlete / Coach Profile'
    };
    topBarTitle.textContent = titles[viewName] || 'Dashboard';
  }

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
  if (viewName === 'profile') loadUserProfilePage();

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
  const rawEmail = document.getElementById('login-email').value || '';
  const email = rawEmail.trim();
  const password = document.getElementById('login-password').value || '';
  const rememberMe = document.getElementById('login-remember-me')?.checked || false;

  localStorage.removeItem('athletiq_token');
  localStorage.removeItem('athletiq_user');
  sessionStorage.removeItem('athletiq_token');
  sessionStorage.removeItem('athletiq_user');

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
    if (email) {
      deleteSingleRememberedLogin(email);
    }
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

async function openForgotPassword() {
  const emailInput = document.getElementById('login-email')?.value || '';
  if (window.Swal) {
    const { value: email } = await Swal.fire({
      title: 'Reset Password',
      text: 'Enter your registered email address to reset your password:',
      input: 'email',
      inputValue: emailInput,
      inputPlaceholder: 'user@example.com',
      showCancelButton: true,
      confirmButtonText: 'Reset Password',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b'
    });

    if (!email) return;

    try {
      const data = await safeFetchJson('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      Swal.fire({
        icon: 'success',
        title: 'Password Reset',
        text: data.message || 'Password has been reset to: password123',
        confirmButtonColor: '#2563eb'
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Reset Failed',
        text: err.message || 'Account with this email does not exist',
        confirmButtonColor: '#ef4444'
      });
    }
  } else {
    const email = prompt('Enter your registered email address to reset your password:', emailInput);
    if (!email) return;
    try {
      const data = await safeFetchJson('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      alert(data.message || 'Password reset successfully');
    } catch (err) {
      alert(err.message || 'Reset failed');
    }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAuthErrors();
  const rawName = document.getElementById('reg-name').value || '';
  const name = rawName.trim();
  const rawEmail = document.getElementById('reg-email').value || '';
  const email = rawEmail.trim();
  const password = document.getElementById('reg-password').value || '';
  const confirmPassword = document.getElementById('reg-confirm-password').value || '';
  const rememberMe = document.getElementById('reg-remember-me')?.checked || false;

  localStorage.removeItem('athletiq_token');
  localStorage.removeItem('athletiq_user');
  sessionStorage.removeItem('athletiq_token');
  sessionStorage.removeItem('athletiq_user');

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

  if (res.status === 401 && !url.includes('/api/auth/login')) {
    console.warn('Received 401 Unauthorized from server. Expired session or user account missing.');
    handleLogout();
    showToast('Session expired or account no longer exists. Please log in again.', 'warning');
    throw new Error('Session expired or user account missing');
  }

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
    let msg = 'Request failed';
    if (typeof data.detail === 'string') {
      msg = data.detail;
    } else if (Array.isArray(data.detail) && data.detail.length > 0) {
      msg = data.detail.map(d => (d.msg || d.detail || JSON.stringify(d))).join(', ');
    } else if (data.message) {
      msg = data.message;
    } else {
      msg = `Server Error (${res.status})`;
    }
    throw new Error(msg);
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

function updateSportFilterIcon(selectId, iconContainerId) {
  const sel = document.getElementById(selectId);
  const iconContainer = document.getElementById(iconContainerId);
  if (!sel || !iconContainer) return;
  const selectedText = (sel.options && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) ? sel.options[sel.selectedIndex].text : '';
  if (!sel.value || selectedText.includes('All Sports')) {
    iconContainer.innerHTML = '<i data-lucide="layers" class="w-4 h-4 text-brand-600 dark:text-brand-400"></i>';
  } else {
    iconContainer.innerHTML = getSportIcon(selectedText, 'w-4 h-4 text-brand-600 dark:text-brand-400 inline-block');
  }
  if (window.lucide) lucide.createIcons();
}

function onDashboardSportFilterChange(sportId) {
  updateSportFilterIcon('dash-sport-filter', 'dash-sport-filter-icon');
  loadStudentDashboard(sportId);
}

function onHistorySportFilterChange(sportId) {
  updateSportFilterIcon('history-sport-filter', 'history-sport-filter-icon');
  loadPracticeHistory(sportId);
}

function onAnalyticsSportFilterChange(sportId) {
  updateSportFilterIcon('analytics-sport-filter', 'analytics-sport-filter-icon');
  loadAnalyticsCharts(sportId);
}

async function populateStudentSportFilters() {
  try {
    const res = await fetch('/api/sports/student', { headers: authHeaders() });
    const sports = await res.json();

    const selects = [
      { id: 'dash-sport-filter', iconId: 'dash-sport-filter-icon', defaultLabel: 'All Sports Combined' },
      { id: 'analytics-sport-filter', iconId: 'analytics-sport-filter-icon', defaultLabel: 'All Sports Combined' },
      { id: 'history-sport-filter', iconId: 'history-sport-filter-icon', defaultLabel: 'All Sports' }
    ];
    selects.forEach(({ id, iconId, defaultLabel }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentVal = el.value;
      
      el.innerHTML = `<option value="" class="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold">${defaultLabel}</option>`;
      if (sports && sports.length > 0) {
        sports.forEach(s => {
          el.innerHTML += `<option value="${s.sport_id}" class="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold">${s.name}</option>`;
        });
      }
      if (currentVal) el.value = currentVal;
      updateSportFilterIcon(id, iconId);
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
    window.cachedDashboardRecs = recs || [];
    
    const container = document.getElementById('dash-ai-recs-list');
    if (container) container.innerHTML = '';

    if (!recs || recs.length === 0) {
      if (container) container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">No AI recommendations generated yet for this selection.</p>';
    } else {
      recs.slice(0, 3).forEach(r => {
        const icon = getSportIcon(r.sport_name, 'w-3.5 h-3.5 text-brand-600 dark:text-brand-400');
        let prioBadge = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        if (r.priority === 'HIGH') prioBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';

        if (container) {
          container.innerHTML += `
            <div class="p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-xs transition space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded ${prioBadge}">
                  ${r.priority} PRIORITY
                </span>
                <span class="text-[11px] font-extrabold px-2 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 flex items-center space-x-1">
                  ${icon} <span>${r.sport_name}</span>
                </span>
              </div>
              <h4 class="text-xs font-bold text-slate-900 dark:text-white mt-1">${r.title}</h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                <b class="text-slate-800 dark:text-slate-200">Diagnosis:</b> ${r.detected_issue}
              </p>
              <div class="pt-2 border-t border-slate-200/80 dark:border-slate-600/60 flex items-center justify-between">
                <button onclick="openAiRecDetailModal(${r.recommendation_id})" class="text-[11px] font-extrabold text-brand-600 dark:text-brand-400 hover:underline flex items-center space-x-1">
                  <span>View Full Drill Plan & Mechanics</span>
                  <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
                ${r.suggested_goal ? `<span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[140px] flex items-center"><i data-lucide="target" class="w-3 h-3 inline mr-1 text-emerald-600 dark:text-emerald-400 flex-shrink-0"></i><span class="truncate">${r.suggested_goal}</span></span>` : ''}
              </div>
            </div>
          `;
        }
      });
      if (window.lucide) lucide.createIcons();
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
          <div class="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold flex items-center space-x-1.5">
            <i data-lucide="message-square" class="w-3.5 h-3.5 flex-shrink-0"></i>
            <span>Your Reply: "${f.student_reply}"</span>
          </div>
        ` : `
          <button onclick="openSuggestionDetailModalFromFeedback(${f.feedback_id})" class="mt-2 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-[10px] shadow-sm flex items-center space-x-1">
            <i data-lucide="message-square" class="w-3 h-3"></i>
            <span>Reply to Coach</span>
          </button>
        `;

        if (container) {
          container.innerHTML += `
            <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-1">
                <span class="badge-coach font-bold flex items-center space-x-1"><i data-lucide="award" class="w-3 h-3 text-white"></i><span>Coach Feedback</span></span>
                <span class="text-[10px] text-slate-400">Coach ${f.coach_name} (${f.sport_name})</span>
              </div>
              <p class="text-xs text-slate-700 dark:text-slate-200 mt-1">"${f.feedback_text}"</p>
              ${f.recommended_drill ? `<div class="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mt-1 flex items-center space-x-1"><i data-lucide="dumbbell" class="w-3.5 h-3.5"></i><span>Drill: ${f.recommended_drill} (${f.practice_duration_minutes}m)</span></div>` : ''}
              ${replyStatus}
            </div>
          `;
        }
      });
    }
  } catch (e) { console.error(e); }
}

// AI RECOMMENDATION DETAIL MODAL
async function openAiRecDetailModal(recId) {
  const dashRecs = window.cachedDashboardRecs || [];
  const fullRecs = window.cachedFullRecs || [];
  let r = dashRecs.find(item => item.recommendation_id == recId) || 
          fullRecs.find(item => item.recommendation_id == recId);
  
  if (!r && Array.isArray(window.cachedSessionAnalytics)) {
    for (const s of window.cachedSessionAnalytics) {
      if (s.session_recommendations) {
        const found = s.session_recommendations.find(item => item.recommendation_id == recId);
        if (found) {
          r = { ...found, sport_name: s.sport_name };
          break;
        }
      }
    }
  }

  if (!r) {
    try {
      const res = await fetch('/api/ai/recommendations', { headers: authHeaders() });
      if (res.ok) {
        const allRecs = await res.json();
        r = allRecs.find(item => item.recommendation_id == recId);
      }
    } catch (e) {
      console.error('Error fetching recommendation for modal:', e);
    }
  }

  if (!r) {
    showToast('Recommendation details not found', 'error');
    return;
  }

  const modal = document.getElementById('ai-rec-detail-modal');
  if (!modal) return;

  const titleEl = document.getElementById('ardm-title');
  if (titleEl) titleEl.textContent = r.title || 'AI Recommendation Plan';
  
  const sportEl = document.getElementById('ardm-sport-name');
  if (sportEl) sportEl.textContent = r.sport_name || 'Athletics';
  
  const issueEl = document.getElementById('ardm-detected-issue');
  if (issueEl) issueEl.textContent = r.detected_issue || 'General Form & Mechanics Optimization';
  
  const evidenceEl = document.getElementById('ardm-evidence');
  if (evidenceEl) evidenceEl.textContent = r.evidence || 'Analyzed across logged workouts.';
  
  const goalEl = document.getElementById('ardm-suggested-goal');
  if (goalEl) goalEl.textContent = r.suggested_goal || 'Maintain consistent execution in next workout.';
  
  const textContainer = document.getElementById('ardm-text');
  if (textContainer) textContainer.innerHTML = formatAiText(r.recommendation_text || '');

  const badge = document.getElementById('ardm-priority-badge');
  if (badge) {
    badge.textContent = `${r.priority || 'MEDIUM'} PRIORITY`;
    if (r.priority === 'HIGH') {
      badge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
    } else {
      badge.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    }
  }

  const btnContainer = document.getElementById('ardm-action-btn-container');
  if (btnContainer) {
    const activeGoals = window.cachedActiveGoals || [];
    const existingGoal = activeGoals.find(g => g.title === r.title);
    if (existingGoal) {
      btnContainer.innerHTML = `<span class="px-3.5 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-xl text-xs flex items-center space-x-1"><i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i><span>Goal Active</span></span>`;
    } else {
      btnContainer.innerHTML = `
        <button onclick="adoptAiGoal(${r.recommendation_id}); closeAiRecDetailModal();" class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/20 flex items-center space-x-1.5">
          <i data-lucide="target" class="w-3.5 h-3.5 text-white"></i>
          <span>Set as Target Goal</span>
        </button>
      `;
    }
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeAiRecDetailModal() {
  const modal = document.getElementById('ai-rec-detail-modal');
  if (modal) modal.classList.add('hidden');
}

window.openAiRecDetailModal = openAiRecDetailModal;
window.closeAiRecDetailModal = closeAiRecDetailModal;

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
      const icon = getSportIcon(s.sport_name, 'w-5 h-5 text-brand-600 dark:text-brand-400');
      let metricsHtml = s.metrics.map(m => `<span class="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-semibold text-slate-700 dark:text-slate-300 mr-1 mb-1">${m.metric_name.replace('_', ' ')}: <b>${m.metric_value}</b> ${m.metric_unit}</span>`).join('');
      let probHtml = s.problems.map(p => `<div class="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1 flex items-center space-x-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500 inline flex-shrink-0"></i><span>Issue: ${p.description} (${p.severity})</span></div>`).join('');

      container.innerHTML += `
        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-brand-600">${icon}</div>
              <div>
                <span class="font-bold text-sm text-slate-900 dark:text-white">${s.sport_name}</span>
                <span class="text-xs text-slate-400 block sm:inline sm:ml-1">• ${s.date}</span>
              </div>
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
  const icon = getSportIcon(sp.sport_name, 'w-6 h-6 text-brand-600 dark:text-brand-400');
  const metricsHtml = (sp.metrics && sp.metrics.length > 0)
    ? sp.metrics.map(m => `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
              <i data-lucide="target" class="w-3.5 h-3.5 text-brand-600"></i>
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
        <span class="font-bold text-rose-600 dark:text-rose-400 flex items-center space-x-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500"></i><span>Key Struggle Areas:</span></span>
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
            <i data-lucide="star" class="w-3.5 h-3.5 text-amber-500"></i>
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
          <div class="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 flex-shrink-0">${icon}</div>
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

const SPORT_SVG_ICONS = {
  cricket: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21l9.5-9.5a2.5 2.5 0 0 0 0-3.5l-1.5-1.5a2.5 2.5 0 0 0-3.5 0L2 14l3 7z"/><path d="M14 6l4-4 2 2-4 4"/><circle cx="19.5" cy="19.5" r="2.5"/></svg>`,
  football: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7l3.5 2.5v4L12 16l-3.5-2.5v-4z"/><path d="M12 7V2"/><path d="M15.5 9.5l4.5-2"/><path d="M15.5 13.5l4.5 2"/><path d="M12 16v6"/><path d="M8.5 13.5l-4.5 2"/><path d="M8.5 9.5l-4.5-2"/></svg>`,
  basketball: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2.5 12h19"/><path d="M12 2.5v19"/><path d="M4.9 4.9c4 4 4 10.2 0 14.2"/><path d="M19.1 4.9c-4 4-4 10.2 0 14.2"/></svg>`,
  badminton: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M9.5 14.5L5 2l8 4 6-4-4.5 12.5"/><path d="M7 6l10 5"/><path d="M6 10l9 4.5"/></svg>`,
  tennis: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10"/></svg>`,
  chess: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20h12v2H6z"/><path d="M9 16h6l1 4H8z"/><path d="M9 16c-1.5-2-2-4-2-7 0-3 2-6 6-6 1 2 2 4 1 6l2 1-1 3-3-1"/></svg>`,
  volleyball: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 12a10 10 0 0 1 5-8.66"/><path d="M12 12a10 10 0 0 1-5-8.66"/><path d="M12 12a10 10 0 0 1 0 10"/><path d="M12 12a10 10 0 0 0-8.66 5"/><path d="M12 12a10 10 0 0 0 8.66 5"/></svg>`,
  running: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="4" r="2"/><path d="M15 8l-3 4-3-1-3 4"/><path d="M12 12l2 4 4 1"/><path d="M12 16l-2 5"/></svg>`,
  swimming: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="6" r="2"/><path d="M2 19c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/><path d="M2 15c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/><path d="M9 11l4-2 3 2 4-1"/></svg>`,
  cycling: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M12 17.5V14l-3-3 4-3 3 3h3"/></svg>`,
  weightlifting: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M2 9v6"/><path d="M22 9v6"/><path d="M6 12h12"/><path d="M4 7v10"/><path d="M20 7v10"/></svg>`,
  martial: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6v4c0 3.3-2.7 6-6 6h-4c-3.3 0-6-2.7-6-6v-4z"/><path d="M9 10h6"/><path d="M9 14h6"/><path d="M12 4v16"/></svg>`,
  tabletennis: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M15 15l6 6"/><path d="M13 17l4 4"/><circle cx="19" cy="5" r="2"/></svg>`,
  golf: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18v-14l7 4-7 4"/><path d="M4 21c3-1 6-1 8 0 3-1 6-1 8 0"/><circle cx="16" cy="20" r="1"/></svg>`,
  trophy: (cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-2c-.55 0-1-.45-1-1v-2.34"/><path d="M6 4h12a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V6a2 2 0 0 1 2-2z"/></svg>`
};

function getSportIcon(sportName, className = 'w-5 h-5 inline-block') {
  if (!sportName) return SPORT_SVG_ICONS.trophy(className);
  const lower = sportName.toLowerCase();
  if (lower.includes('cricket')) return SPORT_SVG_ICONS.cricket(className);
  if (lower.includes('football') || lower.includes('soccer')) return SPORT_SVG_ICONS.football(className);
  if (lower.includes('basketball')) return SPORT_SVG_ICONS.basketball(className);
  if (lower.includes('badminton')) return SPORT_SVG_ICONS.badminton(className);
  if (lower.includes('tennis')) return SPORT_SVG_ICONS.tennis(className);
  if (lower.includes('chess')) return SPORT_SVG_ICONS.chess(className);
  if (lower.includes('volleyball')) return SPORT_SVG_ICONS.volleyball(className);
  if (lower.includes('run') || lower.includes('athletics')) return SPORT_SVG_ICONS.running(className);
  if (lower.includes('swim')) return SPORT_SVG_ICONS.swimming(className);
  if (lower.includes('cycling') || lower.includes('bike')) return SPORT_SVG_ICONS.cycling(className);
  if (lower.includes('weight') || lower.includes('gym')) return SPORT_SVG_ICONS.weightlifting(className);
  if (lower.includes('martial') || lower.includes('boxing') || lower.includes('karate')) return SPORT_SVG_ICONS.martial(className);
  if (lower.includes('table tennis') || lower.includes('ping pong')) return SPORT_SVG_ICONS.tabletennis(className);
  if (lower.includes('golf')) return SPORT_SVG_ICONS.golf(className);
  return SPORT_SVG_ICONS.trophy(className);
}

const AI_EMOJI_SVG_MAP = {
  '🛠️': '<i data-lucide="wrench" class="w-4 h-4 text-brand-600 dark:text-brand-400 inline-block mr-1.5 flex-shrink-0"></i>',
  '🛠': '<i data-lucide="wrench" class="w-4 h-4 text-brand-600 dark:text-brand-400 inline-block mr-1.5 flex-shrink-0"></i>',
  '🧠': '<i data-lucide="brain" class="w-4 h-4 text-purple-600 dark:text-purple-400 inline-block mr-1.5 flex-shrink-0"></i>',
  '🧘': '<i data-lucide="heart-pulse" class="w-4 h-4 text-indigo-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '⚡': '<i data-lucide="zap" class="w-4 h-4 text-amber-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '⚙️': '<i data-lucide="settings" class="w-4 h-4 text-slate-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '⚙': '<i data-lucide="settings" class="w-4 h-4 text-slate-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '🎯': '<i data-lucide="target" class="w-4 h-4 text-rose-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '📊': '<i data-lucide="bar-chart-2" class="w-4 h-4 text-blue-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '🔍': '<i data-lucide="search" class="w-4 h-4 text-teal-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '🚀': '<i data-lucide="rocket" class="w-4 h-4 text-emerald-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '💡': '<i data-lucide="lightbulb" class="w-4 h-4 text-amber-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '✅': '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '⭐': '<i data-lucide="star" class="w-4 h-4 text-amber-400 inline-block mr-1.5 flex-shrink-0"></i>',
  '📝': '<i data-lucide="file-text" class="w-4 h-4 text-slate-600 dark:text-slate-300 inline-block mr-1.5 flex-shrink-0"></i>',
  '⚠️': '<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '⚠': '<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '💪': '<i data-lucide="shield-check" class="w-4 h-4 text-emerald-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '📋': '<i data-lucide="clipboard-list" class="w-4 h-4 text-brand-600 inline-block mr-1.5 flex-shrink-0"></i>',
  '🏋️': '<i data-lucide="dumbbell" class="w-4 h-4 text-brand-600 inline-block mr-1.5 flex-shrink-0"></i>',
  '🏋': '<i data-lucide="dumbbell" class="w-4 h-4 text-brand-600 inline-block mr-1.5 flex-shrink-0"></i>',
  '🧑‍🏫': '<i data-lucide="award" class="w-4 h-4 text-emerald-600 inline-block mr-1.5 flex-shrink-0"></i>',
  '💬': '<i data-lucide="message-square" class="w-4 h-4 text-blue-500 inline-block mr-1.5 flex-shrink-0"></i>',
  '📅': '<i data-lucide="calendar" class="w-4 h-4 text-brand-600 inline-block mr-1.5 flex-shrink-0"></i>'
};

function formatAiText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map(line => {
    line = line.trim();
    if (!line) return '<div class="h-1.5"></div>';
    
    for (const [emoji, svgIcon] of Object.entries(AI_EMOJI_SVG_MAP)) {
      if (line.startsWith(emoji)) {
        const cleanTitle = line.slice(emoji.length).trim();
        return `<div class="font-extrabold text-slate-900 dark:text-white mt-2.5 mb-1 text-xs flex items-center bg-slate-100 dark:bg-slate-700/80 px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-600/50 shadow-2xs">${svgIcon}<span>${cleanTitle}</span></div>`;
      }
    }

    if (line.startsWith('•') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
      return `<div class="pl-2 text-slate-700 dark:text-slate-200 text-xs leading-relaxed font-medium mb-1 flex items-start space-x-1.5"><span class="text-brand-600 dark:text-brand-400 font-bold select-none">•</span><span class="flex-1">${line.replace(/^•\s*/, '')}</span></div>`;
    }
    return `<div class="text-slate-700 dark:text-slate-200 text-xs leading-relaxed mb-1">${line}</div>`;
  }).join('');
}

function onAiSessionSelect(sessionId) {
  if (!sessionId) {
    const card = document.getElementById('ai-session-detail-card');
    if (card) card.classList.add('hidden');
    return;
  }
  renderAiSessionDetailCard(sessionId);
}
window.onAiSessionSelect = onAiSessionSelect;

function renderAiSessionDetailCard(sessionId) {
  const card = document.getElementById('ai-session-detail-card');
  if (!card) return;

  const s = cachedSessionAnalytics.find(item => item.session_id == sessionId);
  if (!s) {
    card.classList.add('hidden');
    return;
  }

  // Keep dropdown value in sync
  const sessDropdown = document.getElementById('ai-session-dropdown');
  if (sessDropdown && sessDropdown.value != s.session_id) {
    sessDropdown.value = s.session_id;
  }

  card.classList.remove('hidden');

  const icon = getSportIcon(s.sport_name, 'w-7 h-7 text-brand-600 dark:text-brand-400');
  const metricsHtml = (s.metrics && s.metrics.length > 0) ?
    s.metrics.map(m => `<span class="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">${m.metric_name}: <b class="text-brand-600 dark:text-brand-400">${m.metric_value}</b> ${m.metric_unit}</span>`).join(' ')
    : '<span class="text-xs text-slate-400 italic">No specific metric values logged for this session</span>';

  const probsHtml = (s.problems && s.problems.length > 0) ?
    s.problems.map(p => `<div class="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg text-xs text-rose-800 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-900/60 flex items-center space-x-1.5"><i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500 flex-shrink-0"></i><span><b>Logged Issue:</b> ${p.description} (${p.severity} Severity)</span></div>`).join('')
    : '<div class="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center space-x-1.5"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 flex-shrink-0"></i><span>Execution smooth with zero logged struggles.</span></div>';

  const coachRatingBadge = s.coach_rating ? 
    `<span class="px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-extrabold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm"><i data-lucide="star" class="w-3.5 h-3.5 text-amber-500"></i><span>Coach Rating: ${s.coach_rating}/10</span></span>` :
    `<span class="px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm"><i data-lucide="clock" class="w-3.5 h-3.5 text-amber-600"></i><span>Pending Coach Rating</span></span>`;

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
          goalBtnHtml = `<span class="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg text-[11px] flex items-center space-x-1"><i data-lucide="trophy" class="w-3.5 h-3.5 text-emerald-600"></i><span>Goal Achieved! (100%)</span></span>`;
        } else {
          goalBtnHtml = `<span class="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-extrabold rounded-lg text-[11px] flex items-center space-x-1"><i data-lucide="target" class="w-3.5 h-3.5 text-amber-600"></i><span>Goal Active (${existingGoal.progress_percentage || 0}%)</span></span>`;
        }
      } else {
        goalBtnHtml = `
          <button onclick="adoptAiGoal(${r.recommendation_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-lg text-xs shadow-sm transition flex items-center space-x-1">
            <i data-lucide="target" class="w-3.5 h-3.5 text-white"></i>
            <span>Set as Target Goal</span>
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
            <div class="font-bold text-brand-700 dark:text-brand-300 flex items-center space-x-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5"></i><span>Your Reply to Coach:</span></div>
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
              <span class="w-7 h-7 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center text-xs"><i data-lucide="award" class="w-4 h-4 text-white"></i></span>
              <div>
                <span class="font-bold text-slate-900 dark:text-white">Coach ${cf.coach_name}</span>
                <span class="text-[10px] text-slate-500 block">${cf.coaching_specialization || 'Sports Coach'}</span>
              </div>
            </div>
            <span class="px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 uppercase">
              ${cf.priority || 'MEDIUM'} PRIORITY
            </span>
          </div>

          ${cf.observed_strength ? `<div class="text-slate-700 dark:text-slate-300 flex items-start space-x-1"><i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-600 inline flex-shrink-0 mt-0.5"></i><span><b class="text-emerald-700 dark:text-emerald-400">Observed Strength:</b> ${cf.observed_strength}</span></div>` : ''}
          ${cf.observed_weakness ? `<div class="text-slate-700 dark:text-slate-300 flex items-start space-x-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500 inline flex-shrink-0 mt-0.5"></i><span><b class="text-rose-600 dark:text-rose-400">Observed Weakness:</b> ${cf.observed_weakness}</span></div>` : ''}
          
          <div class="p-3 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-200 leading-relaxed border border-emerald-100 dark:border-emerald-900/40">
            <b class="text-emerald-700 dark:text-emerald-400 flex items-center space-x-1 mb-0.5"><i data-lucide="clipboard-list" class="w-3.5 h-3.5 text-emerald-600"></i><span>Professional Coaching Feedback:</span></b>
            ${cf.feedback_text}
          </div>

          ${cf.recommended_drill ? `
            <div class="p-2.5 bg-sportsgreen-500/10 rounded-lg text-[11px] text-slate-700 dark:text-slate-200 font-semibold border border-sportsgreen-500/20 flex items-center space-x-1.5">
              <i data-lucide="dumbbell" class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"></i>
              <span><b>Recommended Coach Drill:</b> ${cf.recommended_drill} (${cf.practice_duration_minutes || 30} mins)</span>
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
          <span class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center flex-shrink-0"><i data-lucide="award" class="w-6 h-6"></i></span>
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
        <i data-lucide="clock" class="w-4 h-4 text-slate-400 flex-shrink-0"></i>
        <span>No direct written coach feedback or rating submitted yet for this session. Connect with a coach to receive direct professional feedback.</span>
      </div>
    `;
  }

  card.innerHTML = `
    <!-- Session Overview Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
      <div class="flex items-center space-x-3">
        <div class="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center flex-shrink-0 shadow-inner">
          ${icon}
        </div>
        <div>
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>${s.sport_name}: ${s.training_type.replace('_',' ')}</span>
            <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              ${s.intensity} INTENSITY
            </span>
          </h3>
          <div class="text-xs text-slate-500 font-medium mt-0.5 flex items-center flex-wrap gap-2">
            <span class="flex items-center space-x-1"><i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i><span>Date: <b>${s.date}</b></span></span>
            <span>•</span>
            <span class="flex items-center space-x-1"><i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i><span>Duration: <b>${s.duration_minutes} mins</b></span></span>
            ${s.training_area ? `<span>•</span><span class="flex items-center space-x-1"><i data-lucide="target" class="w-3.5 h-3.5 text-slate-400"></i><span>Focus: <b>${s.training_area}</b></span></span>` : ''}
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

    <!-- AI Feedback & Recommendations -->
    <div class="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      <h4 class="text-xs font-extrabold text-brand-600 dark:text-brand-400 uppercase tracking-wider flex items-center space-x-1.5">
        <i data-lucide="sparkles" class="w-4 h-4 text-accent-500"></i>
        <span>AI Diagnosis & Session Drill Recommendations</span>
      </h4>

      <div class="p-3.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800/60 text-xs">
        <div class="font-extrabold text-brand-700 dark:text-brand-300 flex items-center space-x-1.5 mb-1">
          <i data-lucide="lightbulb" class="w-4 h-4 text-amber-500"></i>
          <span>AI Session Diagnosis & Technical Analysis:</span>
        </div>
        <div class="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">${formatAiText(s.ai_session_feedback)}</div>
      </div>

      <div class="space-y-2.5">${sessionRecsHtml}</div>
    </div>

    <!-- Coach Feedback Section -->
    <div class="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      <h4 class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
        <i data-lucide="user-check" class="w-4 h-4 text-sportsgreen-500"></i>
        <span>Coach Feedback & Performance Evaluation</span>
      </h4>

      ${coachFeedbackHtml}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

async function triggerAIAnalysis(sportId = null) {
  const targetSportId = (sportId !== null && sportId !== undefined && sportId !== '') ? sportId : (currentAISportFilter || null);
  
  // Find Run AI Analysis buttons to show spinning indicator
  const runBtns = document.querySelectorAll('button[onclick*="triggerAIAnalysis"]');
  runBtns.forEach(b => {
    b.disabled = true;
    b.dataset.origHtml = b.innerHTML;
    b.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i><span>Analyzing...</span>`;
  });
  if (window.lucide) lucide.createIcons();

  showToast('Running AI ML Performance Analysis...', 'info');

  try {
    let url = '/api/ai/analyze';
    if (targetSportId) {
      url += `?sport_id=${targetSportId}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders()
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.message || 'Failed to run AI analysis');
    }

    if (data.has_sufficient_data === false) {
      showToast(data.message || 'Record practice sessions before running AI analysis.', 'warning');
    } else {
      showToast(data.message || 'AI Performance Analysis completed successfully!', 'success');
    }

    // Refresh views
    if (typeof loadAIRecommendations === 'function') {
      await loadAIRecommendations(currentAISportFilter);
    }
    if (typeof loadDashboardPreviews === 'function') {
      await loadDashboardPreviews();
    }
    if (typeof loadAnalyticsCharts === 'function' && typeof currentView !== 'undefined' && currentView === 'analytics') {
      await loadAnalyticsCharts();
    }
    if (typeof loadNotifications === 'function') {
      loadNotifications();
    }
  } catch (err) {
    console.error('AI Analysis error:', err);
    showToast(err.message || 'Error executing AI Analysis', 'error');
  } finally {
    runBtns.forEach(b => {
      b.disabled = false;
      if (b.dataset.origHtml) b.innerHTML = b.dataset.origHtml;
    });
    if (window.lucide) lucide.createIcons();
  }
}
window.triggerAIAnalysis = triggerAIAnalysis;

async function loadAIRecommendations(selectedSportId = null) {
  currentAISportFilter = selectedSportId;
  try {
    // 1. Fetch sports with logged practice sessions
    const sportsRes = await fetch('/api/ai/sports', { headers: authHeaders() });
    const sportsList = sportsRes.ok ? await sportsRes.json() : [];

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
    window.cachedFullRecs = recs || [];
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
        sessDropdown.innerHTML = '<option value="">No practice sessions found for this selection</option>';
        const detailCard = document.getElementById('ai-session-detail-card');
        if (detailCard) detailCard.classList.add('hidden');
      } else {
        cachedSessionAnalytics.forEach(s => {
          const cRatingStr = s.coach_rating ? `Coach Rating: ${s.coach_rating}/10` : 'Unrated';
          sessDropdown.innerHTML += `
            <option value="${s.session_id}">${s.date} - ${s.sport_name} (${s.duration_minutes}m ${s.training_type.replace('_',' ')}) • ${cRatingStr}</option>
          `;
        });
        sessDropdown.onchange = function() {
          onAiSessionSelect(this.value);
        };
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
            <span><i data-lucide="layers" class="w-3.5 h-3.5 inline mr-1"></i> All Sports (${sportsList.length})</span>
          </button>
        `;

        sportsList.forEach(sp => {
          const icon = getSportIcon(sp.sport_name, 'w-3.5 h-3.5 inline');
          const isActive = selectedSportId == sp.sport_id;
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

    if ((!recs || recs.length === 0) && (!analyses || analyses.length === 0) && (!sessionAnalytics || sessionAnalytics.length === 0)) {
      mainContainer.innerHTML = `
        <div class="empty-state-box p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="w-16 h-16 bg-brand-50 dark:bg-brand-900/30 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="sparkles" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">No AI Analysis generated yet</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mt-1">Record practice sessions to trigger isolated, high-level ML performance analysis & domain-specific drill recommendations for each of your sports.</p>
          <div class="flex items-center justify-center space-x-3 mt-5">
            <button onclick="triggerAIAnalysis(${selectedSportId ? selectedSportId : ''})" class="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-accent-500 text-white font-bold rounded-xl text-xs shadow-md flex items-center space-x-1.5">
              <i data-lucide="zap" class="w-4 h-4 text-white"></i>
              <span>Run AI Analysis Now</span>
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

    // Initialize groupedData from sportsList to ensure all sports with logged sessions appear
    if (Array.isArray(sportsList)) {
      sportsList.forEach(sp => {
        if (!selectedSportId || selectedSportId == sp.sport_id) {
          groupedData[sp.sport_name] = {
            sport_id: sp.sport_id,
            sport_name: sp.sport_name,
            sport_category: sp.sport_category || 'OUTDOOR',
            analysis: analysisMap[sp.sport_name] || null,
            sessions: sessionsMap[sp.sport_name] || [],
            recommendations: []
          };
        }
      });
    }

    // Attach recommendations
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
      const icon = getSportIcon(group.sport_name, 'w-7 h-7 text-brand-600 dark:text-brand-400');
      const analysis = group.analysis;
      
      let trendBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
      let trendLabel = '<i data-lucide="bar-chart-2" class="w-3.5 h-3.5 inline mr-1"></i> CONSISTENCY';
      if (analysis) {
        if (analysis.trend_type === 'IMPROVEMENT') {
          trendBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
          trendLabel = '<i data-lucide="trending-up" class="w-3.5 h-3.5 inline mr-1 text-emerald-600"></i> UPWARD PROGRESSION';
        } else if (analysis.trend_type === 'DECLINE') {
          trendBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
          trendLabel = '<i data-lucide="trending-down" class="w-3.5 h-3.5 inline mr-1 text-rose-600"></i> PERFORMANCE DIP';
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
            goalBtnHtml = `<span class="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg text-xs flex items-center space-x-1.5"><i data-lucide="trophy" class="w-3.5 h-3.5 text-emerald-600"></i><span>Goal Achieved! (100%)</span></span>`;
          } else {
            goalBtnHtml = `<span class="px-3 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-extrabold rounded-lg text-xs flex items-center space-x-1.5"><i data-lucide="target" class="w-3.5 h-3.5 text-amber-600"></i><span>Goal Active (${existingGoal.progress_percentage || 0}% Progress)</span></span>`;
          }
        } else {
          goalBtnHtml = `
            <button onclick="adoptAiGoal(${r.recommendation_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-lg text-xs shadow-sm flex items-center space-x-1 transition">
              <i data-lucide="target" class="w-3.5 h-3.5 text-white"></i>
              <span>Set as Target Goal</span>
            </button>
          `;
        }

        let coachAdviceSection = '';
        if (r.coach_suggestion) {
          coachAdviceSection = `
            <div class="mt-3 p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-1.5 shadow-sm">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                  <span class="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-[10px]"><i data-lucide="award" class="w-3.5 h-3.5 text-white"></i></span>
                  <span class="font-extrabold text-emerald-800 dark:text-emerald-300">Coach ${r.coach_name || 'Coach'}'s Direct Advice</span>
                </div>
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">${new Date(r.coach_suggested_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <p class="text-slate-800 dark:text-slate-200 font-medium leading-relaxed pl-8">
                "${r.coach_suggestion}"
              </p>
            </div>
          `;
        }

        let coachInputSection = '';
        if (currentUser && currentUser.role === 'COACH') {
          coachInputSection = `
            <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2">
              <label class="block text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                <i data-lucide="edit-3" class="w-3.5 h-3.5 text-emerald-600"></i>
                <span>Attach Coach Advice on this AI Recommendation:</span>
              </label>
              <div class="flex gap-2">
                <input type="text" id="coach-ai-input-${r.recommendation_id}" 
                  placeholder="${r.coach_suggestion ? 'Update your coach advice...' : 'Enter your specific coaching advice on this recommendation...'}" 
                  value="${r.coach_suggestion || ''}"
                  class="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                <button onclick="submitCoachAiSuggestion(${r.recommendation_id})" 
                  class="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-sm transition flex items-center space-x-1">
                  <span>${r.coach_suggestion ? 'Update' : 'Post Advice'}</span>
                </button>
              </div>
            </div>
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
              <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500"></i>
              <span>Diagnosis: ${r.detected_issue}</span>
            </div>

            <div class="bg-slate-50 dark:bg-slate-700/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              <b class="text-brand-600 dark:text-brand-400 font-bold flex items-center space-x-1 mb-1"><i data-lucide="target" class="w-3.5 h-3.5 text-brand-600"></i><span>Actionable AI Routine:</span></b>
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

            ${coachAdviceSection}
            ${coachInputSection}

            <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              ${goalBtnHtml}
              <span class="text-[10px] text-slate-400">AI-Guided Action</span>
            </div>
          </div>
        `;
      });

      mainContainer.innerHTML += `
        <div class="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
          <!-- Sport Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center flex-shrink-0 shadow-inner">
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
              <button onclick="triggerAIAnalysis(${group.sport_id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center space-x-1">
                <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
                <span>Re-analyze ${group.sport_name}</span>
              </button>
            </div>
          </div>

          <!-- High Level Tactical Diagnosis Card -->
          ${analysis ? `
            <div class="bg-gradient-to-r from-brand-500/10 via-accent-500/5 to-transparent p-4 rounded-xl border border-brand-500/20">
              <div class="text-xs font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <i data-lucide="brain" class="w-4 h-4 text-brand-600"></i>
                <span>AI Tactical Diagnosis (${group.sport_name})</span>
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
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Session-Wise AI Analytics (${group.sessions.length} sessions logged)</span>
              </h4>
              <div class="grid grid-cols-1 gap-2.5">
                ${group.sessions.map(s => `
                  <div class="p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    <div class="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                      <span class="flex items-center space-x-1"><i data-lucide="calendar" class="w-3.5 h-3.5 text-brand-600"></i><span>Date: ${s.date} (${s.duration_minutes}m ${s.training_type.replace('_',' ')})</span></span>
                      <span class="px-2 py-0.5 rounded text-[10px] ${s.coach_rating ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'} font-extrabold">
                        Coach Rating: ${s.coach_rating ? s.coach_rating + '/10' : 'Pending'}
                      </span>
                    </div>
                    <p class="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed flex items-start space-x-1">
                      <i data-lucide="lightbulb" class="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5"></i>
                      <span><b>AI Session Evaluation:</b> ${s.ai_session_feedback || 'Session recorded successfully.'}</span>
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
              ${recsHtml || `<div class="text-xs text-slate-400 italic p-3.5 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700">No specific drill recommendations generated for ${group.sport_name} yet. Click "Re-analyze ${group.sport_name}" above to generate data-driven corrective routines.</div>`}
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
            <i data-lucide="lock" class="w-3.5 h-3.5"></i>
            <span>Locked (${c.coach_sport || 'Sport Not Tracked'})</span>
          </button>
        `;
      } else {
        btnHtml = `<button onclick="connectCoach(${c.user_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs shadow-sm transition">Connect with Coach</button>`;
      }

      let sportBadge = c.is_eligible === false ?
        `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 flex items-center space-x-1"><i data-lucide="lock" class="w-3 h-3 inline"></i><span>Not in Your Sports Profile (${c.coach_sport})</span></span>` :
        `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center space-x-1"><i data-lucide="check" class="w-3 h-3 inline"></i><span>Matches Your Sport (${c.coach_sport || c.coaching_specialization})</span></span>`;

      container.innerHTML += `
        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="cursor-pointer" onclick="openPublicProfileModal(${c.user_id}, 'COACH')">
            <div class="flex items-center space-x-2 mb-0.5">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white hover:text-brand-600 transition">Coach ${c.name}</h3>
              ${sportBadge}
            </div>
            <div class="text-xs text-brand-600 font-semibold">${c.coaching_specialization}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${c.experience_years} years experience ${c.certification ? '• ' + c.certification : ''}</div>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="openPublicProfileModal(${c.user_id}, 'COACH')" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs flex items-center space-x-1 transition shadow-sm">
              <i data-lucide="user" class="w-3.5 h-3.5"></i>
              <span>View Profile</span>
            </button>
            ${btnHtml}
          </div>
        </div>
      `;
    });
    if (window.lucide) lucide.createIcons();
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
    const studentNameEscaped = (s.student_name || 'Student').replace(/'/g, "\\'");
    container.innerHTML += `
      <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div class="cursor-pointer" onclick="openPublicProfileModal(${s.student_id}, 'STUDENT')">
            <h3 class="text-base font-bold text-slate-900 dark:text-white hover:text-brand-600 transition">${s.student_name}</h3>
            <div class="text-xs text-slate-500">Primary Sport: ${s.preferred_sport || 'N/A'}</div>
          </div>
          <button onclick="openPublicProfileModal(${s.student_id}, 'STUDENT')" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs flex items-center space-x-1 transition shadow-sm">
            <i data-lucide="user" class="w-3.5 h-3.5"></i>
            <span>Profile</span>
          </button>
        </div>
        <div class="text-xs text-slate-600 dark:text-slate-300">Total Practice Logged: <b>${s.total_hours} hrs</b> (${s.total_sessions} sessions)</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button onclick="openCoachStudentDetailModal(${s.student_id})" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 shadow-sm transition">
            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
            <span>AI Analytics & Rate Sessions</span>
          </button>
          <button onclick="openCoachFeedbackModal(${s.student_id}, '${studentNameEscaped}')" class="px-3 py-1.5 bg-sportsgreen-600 hover:bg-sportsgreen-700 text-white font-bold rounded-lg text-xs transition">+ Feedback</button>
        </div>
      </div>
    `;
  });
  if (window.lucide) lucide.createIcons();
}

function switchCsdTab(tabName) {
  const tabs = ['ratings', 'ai', 'feedback', 'stats'];
  tabs.forEach(t => {
    const btn = document.getElementById(`csd-btn-${t}`);
    const panel = document.getElementById(`csd-panel-${t}`);
    if (btn && panel) {
      if (t === tabName) {
        btn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center space-x-1.5 bg-emerald-600 text-white shadow-sm';
        panel.classList.remove('hidden');
      } else {
        btn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600';
        panel.classList.add('hidden');
      }
    }
  });
}

async function loadCoachStudents() {
  if (!currentUser || currentUser.role !== 'COACH') return;

  try {
    const studentsData = await safeFetchJson('/api/coach/students');
    const students = Array.isArray(studentsData) ? studentsData : [];

    const fullList = document.getElementById('coach-students-full-list');
    if (fullList) {
      fullList.innerHTML = '';
      if (students.length === 0) {
        fullList.innerHTML = `
          <div class="empty-state-box col-span-2">
            <h3 class="text-base font-bold text-slate-900 dark:text-white">No connected student athletes found</h3>
            <p class="text-xs text-slate-500 mt-1">Accept connection requests to start monitoring athletes.</p>
          </div>
        `;
      } else {
        students.forEach(st => {
          const stName = st.name || st.student_name || 'Student Athlete';
          const stEmail = st.email || st.student_email || '';
          const stId = st.user_id || st.student_id;
          const stHours = (st.total_practice_hours !== undefined) ? st.total_practice_hours : (st.total_hours || 0);

          fullList.innerHTML += `
            <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3 cursor-pointer" onclick="openPublicProfileModal(${stId}, 'STUDENT')">
                  <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-black flex items-center justify-center text-lg shadow-sm">
                    ${stName ? stName.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div>
                    <h3 class="font-extrabold text-sm text-slate-900 dark:text-white hover:text-emerald-600 transition">${stName}</h3>
                    <p class="text-xs text-slate-500 font-medium">${stEmail}</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] uppercase tracking-wider">
                  ${st.preferred_sport || 'Student Athlete'}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Total Workouts</span>
                  <span class="font-extrabold text-slate-800 dark:text-slate-200">${st.total_sessions || 0} sessions</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Total Practice</span>
                  <span class="font-extrabold text-slate-800 dark:text-slate-200">${stHours} hrs</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button onclick="openPublicProfileModal(${stId}, 'STUDENT')" class="py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5">
                  <i data-lucide="user" class="w-4 h-4"></i>
                  <span>View Profile</span>
                </button>
                <button onclick="openCoachStudentDetailModal(${stId})" class="py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-1.5">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                  <span>AI Insights</span>
                </button>
              </div>
            </div>
          `;
        });
      }
      if (window.lucide) lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to load coach students list:', err);
  }
}

// COACH STUDENT DETAIL & SESSION RATING MODAL HANDLER
async function openCoachStudentDetailModal(studentId) {
  switchCsdTab('ratings');
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
          let coachAdviceBlock = '';
          if (r.coach_suggestion) {
            coachAdviceBlock = `
              <div class="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs">
                <b class="text-emerald-800 dark:text-emerald-300 flex items-center space-x-1"><i data-lucide="award" class="w-3.5 h-3.5 text-emerald-600"></i><span>Your Attached Advice:</span></b> "${r.coach_suggestion}"
              </div>
            `;
          }

          aiContainer.innerHTML += `
            <div class="p-3.5 bg-brand-50/60 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800 text-xs space-y-2">
              <div class="flex justify-between font-bold text-brand-700 dark:text-brand-300">
                <span class="flex items-center space-x-1"><i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500"></i><span>${r.sport_name}: ${r.title}</span></span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-brand-200 dark:bg-brand-800 text-brand-900 dark:text-brand-100 font-extrabold">${r.priority} PRIORITY</span>
              </div>
              <div class="text-slate-700 dark:text-slate-200"><b>AI Recommendation:</b> ${r.recommendation_text}</div>
              <div class="text-[11px] text-slate-500"><b>Issue:</b> ${r.detected_issue} | <b>Evidence:</b> ${r.evidence}</div>
              
              ${coachAdviceBlock}

              <div class="pt-2 border-t border-brand-200/60 dark:border-brand-800/40 flex gap-2">
                <input type="text" id="coach-ai-input-${r.recommendation_id}" 
                  placeholder="${r.coach_suggestion ? 'Update advice on this AI recommendation...' : 'Add direct advice on this AI recommendation...'}" 
                  value="${r.coach_suggestion || ''}"
                  class="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none">
                <button onclick="submitCoachAiSuggestion(${r.recommendation_id})" 
                  class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-sm">
                  ${r.coach_suggestion ? 'Update' : 'Attach Advice'}
                </button>
              </div>
            </div>
          `;
        });
      }

      // Render History of Coach Drill Suggestions & Student Replies
      if (data.coach_feedbacks && data.coach_feedbacks.length > 0) {
        let fbHtml = '<div class="space-y-2 text-xs pt-3 mt-3 border-t border-slate-200 dark:border-slate-700"><h4 class="font-extrabold text-slate-800 dark:text-slate-200 flex items-center space-x-1"><i data-lucide="message-square" class="w-3.5 h-3.5"></i><span>Sent Suggestions & Student Replies</span></h4>';
        data.coach_feedbacks.forEach(f => {
          const replyHtml = f.student_reply ? `
            <div class="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-[11px]">
                <span class="flex items-center space-x-1"><i data-lucide="message-square" class="w-3.5 h-3.5 text-emerald-600"></i><span>Student Reply Received:</span></span>
                <span class="text-[10px] text-slate-400 font-normal">${new Date(f.student_reply_at || Date.now()).toLocaleDateString()}</span>
              </div>
              <p class="text-slate-800 dark:text-slate-200 mt-1 font-medium italic">"${f.student_reply}"</p>
            </div>
          ` : `<div class="mt-1 text-[10px] text-slate-400 italic flex items-center space-x-1"><i data-lucide="clock" class="w-3 h-3"></i><span>Waiting for student reply...</span></div>`;

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
          const probsHtml = sess.problems ? sess.problems.map(p => `<div class="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1 flex items-center space-x-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500"></i><span>Issue: ${p.description}</span></div>`).join('') : '';
          
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
                  <span class="flex items-center space-x-1"><i data-lucide="calendar" class="w-3.5 h-3.5 text-brand-600"></i><span>Date: ${sess.date}</span></span>
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
          <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500 flex-shrink-0"></i>
          <span>${req.eligibility_warning}</span>
        </div>
      ` : '';

      const buttonsHtml = req.is_eligible !== false ? `
        <div class="flex items-center space-x-2">
          <button onclick="openPublicProfileModal(${req.student_id}, 'STUDENT')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs flex items-center space-x-1 transition shadow-sm">
            <i data-lucide="user" class="w-3.5 h-3.5"></i>
            <span>Profile</span>
          </button>
          <button onclick="respondCoachRequest(${req.connection_id}, true)" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition">Accept</button>
          <button onclick="respondCoachRequest(${req.connection_id}, false)" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow-sm transition">Reject</button>
        </div>
      ` : `
        <div class="flex items-center space-x-2">
          <button onclick="openPublicProfileModal(${req.student_id}, 'STUDENT')" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs flex items-center space-x-1 transition shadow-sm">
            <i data-lucide="user" class="w-3.5 h-3.5"></i>
            <span>Profile</span>
          </button>
          <button onclick="respondCoachRequest(${req.connection_id}, false)" class="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white font-bold rounded-lg text-xs shadow-sm transition">Reject Request</button>
        </div>
      `;

      container.innerHTML += `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="cursor-pointer" onclick="openPublicProfileModal(${req.student_id}, 'STUDENT')">
            <h4 class="font-bold text-sm text-slate-900 dark:text-white hover:text-brand-600 transition">${req.student_name}</h4>
            <div class="text-xs text-slate-500">${req.student_email} • Sport: ${req.preferred_sport || 'N/A'}</div>
            ${lockWarning}
          </div>
          <div>${buttonsHtml}</div>
        </div>
      `;
    });
    if (window.lucide) lucide.createIcons();
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

    showToast('Target Goal set from AI Suggestion successfully!', 'success');
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
          let typeIcon = '<i data-lucide="bell" class="w-4 h-4 text-brand-600"></i>';
          let bgStyle = n.is_read ? 'bg-white dark:bg-slate-800' : 'bg-brand-50/50 dark:bg-brand-900/20 font-semibold';
          if (n.type === 'AI_SUGGESTION') typeIcon = '<i data-lucide="zap" class="w-4 h-4 text-amber-500"></i>';
          if (n.type === 'DRILL_SUGGESTION' || n.type === 'FEEDBACK') typeIcon = '<i data-lucide="target" class="w-4 h-4 text-emerald-500"></i>';
          if (n.type === 'COACH_REQUEST') typeIcon = '<i data-lucide="mail" class="w-4 h-4 text-blue-500"></i>';
          if (n.type === 'COACH_RATING') typeIcon = '<i data-lucide="award" class="w-4 h-4 text-purple-500"></i>';
          if (n.type === 'STUDENT_REPLY') typeIcon = '<i data-lucide="message-square" class="w-4 h-4 text-teal-500"></i>';
          if (n.type === 'GOAL_ACHIEVED') typeIcon = '<i data-lucide="trophy" class="w-4 h-4 text-amber-500"></i>';
          if (n.type === 'GOAL_ADOPTED') typeIcon = '<i data-lucide="target" class="w-4 h-4 text-rose-500"></i>';

          const encTitle = encodeURIComponent(n.title);
          const encMsg = encodeURIComponent(n.message);

          notifList.innerHTML += `
            <div onclick="handleNotificationClick(${n.notification_id}, '${n.type}', '${encTitle}', '${encMsg}')" class="p-3 ${bgStyle} hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer flex items-start space-x-2.5">
              <span class="flex-shrink-0 mt-0.5">${typeIcon}</span>
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to respond to request');
    }
    showToast(`Connection request ${accept ? 'accepted' : 'rejected'} successfully!`, 'success');
    loadNotifications();
    if (typeof loadCoachDashboard === 'function') loadCoachDashboard();
    if (typeof loadCoachStudents === 'function') loadCoachStudents();
    if (typeof loadCoachRequests === 'function') loadCoachRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function respondCoachRequest(connectionId, accept) {
  await respondRequestFromNotification(connectionId, accept);
}

// SUBMIT COACH AI RECOMMENDATION ADVICE
async function submitCoachAiSuggestion(recId) {
  const inputEl = document.getElementById(`coach-ai-input-${recId}`);
  if (!inputEl) return;
  const suggestion = inputEl.value.trim();

  if (!suggestion) {
    showToast('Please enter your coaching advice before posting', 'warning');
    return;
  }

  try {
    await safeFetchJson(`/api/ai/recommendations/${recId}/coach-suggestion`, {
      method: 'POST',
      body: JSON.stringify({ coach_suggestion: suggestion })
    });

    showToast('Coach advice attached to AI recommendation successfully!', 'success');
    if (typeof loadAIRecommendations === 'function') {
      loadAIRecommendations(currentAISportFilter);
    }
  } catch (err) {
    showToast(err.message || 'Failed to attach coach suggestion', 'error');
  }
}

// RICH COACH DASHBOARD IMPLEMENTATION
async function loadCoachDashboard() {
  if (!currentUser || currentUser.role !== 'COACH') return;

  const headingEl = document.getElementById('coach-dashboard-heading');
  const specEl = document.getElementById('coach-banner-spec');
  if (headingEl) headingEl.textContent = `Welcome, Coach ${currentUser.name}!`;
  if (specEl) specEl.textContent = currentUser.coaching_specialization || 'Certified Sports Coach Specialist';

  try {
    // 1. Fetch connected student athletes
    const studentsData = await safeFetchJson('/api/coach/students');
    const students = Array.isArray(studentsData) ? studentsData : [];

    // 2. Fetch pending requests
    const reqsData = await safeFetchJson('/api/coach/requests');
    const pendingReqs = Array.isArray(reqsData.pending_requests) ? reqsData.pending_requests : [];

    // 3. Fetch feedback items for drill count
    const feedbackData = await safeFetchJson('/api/coach/feedback');
    const feedbacks = Array.isArray(feedbackData) ? feedbackData : [];

    // Update Executive Stat Cards
    const cardStudents = document.getElementById('coach-card-students');
    const cardPending = document.getElementById('coach-card-pending');
    const cardDrills = document.getElementById('coach-card-drills-given');
    const bannerBadge = document.getElementById('coach-banner-request-badge');

    if (cardStudents) cardStudents.textContent = students.length;
    if (cardPending) cardPending.textContent = pendingReqs.length;
    if (cardDrills) cardDrills.textContent = feedbacks.length;
    if (bannerBadge) {
      if (pendingReqs.length > 0) {
        bannerBadge.textContent = pendingReqs.length;
        bannerBadge.classList.remove('hidden');
      } else {
        bannerBadge.classList.add('hidden');
      }
    }

    // Render Athletes Grid
    const emptyBox = document.getElementById('coach-dash-empty');
    const gridContainer = document.getElementById('coach-students-grid');

    if (students.length === 0) {
      if (emptyBox) emptyBox.classList.remove('hidden');
      if (gridContainer) gridContainer.innerHTML = '';
    } else {
      if (emptyBox) emptyBox.classList.add('hidden');
      if (gridContainer) {
        gridContainer.innerHTML = '';
        students.forEach(st => {
          const stName = st.name || st.student_name || 'Student Athlete';
          const stEmail = st.email || st.student_email || '';
          const stId = st.user_id || st.student_id;
          const stHours = (st.total_practice_hours !== undefined) ? st.total_practice_hours : (st.total_hours || 0);

          gridContainer.innerHTML += `
            <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-black flex items-center justify-center text-lg shadow-sm">
                    ${stName ? stName.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div>
                    <h3 class="font-extrabold text-sm text-slate-900 dark:text-white">${stName}</h3>
                    <p class="text-xs text-slate-500 font-medium">${stEmail}</p>
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] uppercase tracking-wider">
                  ${st.preferred_sport || 'Student Athlete'}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Total Workouts</span>
                  <span class="font-extrabold text-slate-800 dark:text-slate-200">${st.total_sessions || 0} sessions</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase font-bold">Total Practice</span>
                  <span class="font-extrabold text-slate-800 dark:text-slate-200">${stHours} hrs</span>
                </div>
              </div>

              <button onclick="openCoachStudentDetailModal(${stId})" class="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center space-x-1.5">
                <i data-lucide="eye" class="w-4 h-4"></i>
                <span>Inspect Athlete & AI Insights</span>
              </button>
            </div>
          `;
        });
      }
    }

    // 4. Load recent student sessions feed
    loadCoachRecentSessionsFeed(students);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load coach dashboard:', err);
  }
}

// RECENT STUDENT PRACTICE SESSIONS FEED FOR COACH DASHBOARD
async function loadCoachRecentSessionsFeed(students) {
  const container = document.getElementById('coach-recent-sessions-container');
  const cardRecentSessions = document.getElementById('coach-card-recent-sessions');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = `
      <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
        No recent student workouts logged yet. Workouts recorded by your connected athletes will appear here in real-time.
      </div>
    `;
    if (cardRecentSessions) cardRecentSessions.textContent = '0';
    return;
  }

  try {
    let allSessions = [];
    await Promise.all(students.map(async st => {
      try {
        const detail = await safeFetchJson(`/api/coach/students/${st.user_id}`);
        if (detail && Array.isArray(detail.sessions)) {
          detail.sessions.forEach(sess => {
            allSessions.push({ ...sess, student_name: st.name, student_id: st.user_id });
          });
        }
      } catch (e) {}
    }));

    // Sort by date DESC
    allSessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (cardRecentSessions) cardRecentSessions.textContent = allSessions.length;

    if (allSessions.length === 0) {
      container.innerHTML = `
        <div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
          No workouts logged yet by your connected athletes.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    allSessions.slice(0, 5).forEach(s => {
      const ratingBadge = s.coach_rating ? 
        `<span class="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-lg">Rated: ${s.coach_rating}/10</span>` :
        `<button onclick="openCoachRatingWidget(${s.session_id})" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-sm transition">Rate Session</button>`;

      container.innerHTML += `
        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2 text-xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                ${s.student_name ? s.student_name.charAt(0).toUpperCase() : 'S'}
              </span>
              <div>
                <span class="font-extrabold text-slate-900 dark:text-white text-sm">${s.student_name}</span>
                <span class="text-slate-400 block text-[10px]">${s.sport_name} • ${s.training_type.replace('_',' ')}</span>
              </div>
            </div>
            ${ratingBadge}
          </div>

          <div class="flex items-center space-x-3 text-slate-500 font-medium flex-wrap gap-y-1">
            <span class="flex items-center space-x-1"><i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i><span>${s.date}</span></span>
            <span class="flex items-center space-x-1"><i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i><span>${s.duration_minutes} mins</span></span>
            <span class="flex items-center space-x-1"><i data-lucide="flame" class="w-3.5 h-3.5 text-amber-500"></i><span>${s.intensity} Intensity</span></span>
            ${s.training_area ? `<span class="flex items-center space-x-1"><i data-lucide="target" class="w-3.5 h-3.5 text-brand-600"></i><span>Focus: ${s.training_area}</span></span>` : ''}
          </div>

          ${s.notes ? `<div class="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-slate-700 dark:text-slate-200 italic">"${s.notes}"</div>` : ''}
        </div>
      `;
    });

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load recent sessions feed:', err);
  }
}

// QUICK RATE SESSION FOR COACH
async function openCoachRatingWidget(sessionId) {
  const ratingStr = prompt('Enter Coach Performance Rating (1 to 10):', '8');
  if (!ratingStr) return;
  const rating = parseInt(ratingStr);
  if (isNaN(rating) || rating < 1 || rating > 10) {
    showToast('Please enter a valid rating between 1 and 10', 'error');
    return;
  }

  try {
    await safeFetchJson(`/api/coach/sessions/${sessionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ coach_rating: rating })
    });
    showToast(`Session successfully rated ${rating}/10!`, 'success');
    loadCoachDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// PROFILE MANAGEMENT & CROSS-PROFILE VIEWING
// ==========================================

function calculateAgeFromDob(dobString) {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// 1. FULL-PAGE LOGGED-IN USER PROFILE (navTo('profile'))
async function loadUserProfilePage() {
  if (!currentUser) return;
  const role = (currentUser.role || 'STUDENT').toUpperCase();
  const isCoach = role === 'COACH';

  switchPageProfileTab('overview');

  // Update Header Banner
  const avatarEl = document.getElementById('page-profile-avatar');
  const nameEl = document.getElementById('page-profile-name');
  const roleBadgeEl = document.getElementById('page-profile-role-badge');
  const emailEl = document.getElementById('page-profile-email');

  if (avatarEl) {
    avatarEl.textContent = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : (isCoach ? 'C' : 'S');
    avatarEl.className = isCoach
      ? 'w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0'
      : 'w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-blue-500 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0';
  }
  if (nameEl) nameEl.textContent = currentUser.name || 'User Profile';
  if (roleBadgeEl) {
    roleBadgeEl.textContent = role;
    roleBadgeEl.className = isCoach
      ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
      : 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300';
  }
  if (emailEl) emailEl.textContent = currentUser.email || '';

  // Populate Edit Fields
  const editName = document.getElementById('page-edit-name');
  const editBio = document.getElementById('page-edit-bio');
  const editDob = document.getElementById('page-edit-dob');
  const editPrefSport = document.getElementById('page-edit-pref-sport');
  const editSpec = document.getElementById('page-edit-spec');
  const editExp = document.getElementById('page-edit-exp');
  const editCert = document.getElementById('page-edit-cert');

  if (editName) editName.value = currentUser.name || '';
  if (editBio) editBio.value = currentUser.bio || '';
  if (editDob) editDob.value = currentUser.date_of_birth || '';
  if (editPrefSport) editPrefSport.value = currentUser.preferred_sport || '';
  if (editSpec) editSpec.value = currentUser.coaching_specialization || '';
  if (editExp) editExp.value = currentUser.experience_years !== undefined ? currentUser.experience_years : 0;
  if (editCert) editCert.value = currentUser.certification || '';

  const studentFields = document.getElementById('page-edit-student-fields');
  const coachFields = document.getElementById('page-edit-coach-fields');
  if (isCoach) {
    if (studentFields) studentFields.classList.add('hidden');
    if (coachFields) coachFields.classList.remove('hidden');
  } else {
    if (studentFields) studentFields.classList.remove('hidden');
    if (coachFields) coachFields.classList.add('hidden');
  }

  // Load and render Profile Overview
  await renderPageProfileOverview();

  if (window.lucide) lucide.createIcons();
}

function switchPageProfileTab(tab) {
  const overviewBtn = document.getElementById('page-profile-tab-btn-overview');
  const editBtn = document.getElementById('page-profile-tab-btn-edit');
  const overviewPanel = document.getElementById('page-profile-panel-overview');
  const editPanel = document.getElementById('page-profile-panel-edit');

  if (tab === 'overview') {
    if (overviewBtn) {
      overviewBtn.className = 'px-4 py-2 rounded-lg text-xs font-extrabold transition flex items-center space-x-1.5 bg-brand-600 text-white shadow-sm';
    }
    if (editBtn) {
      editBtn.className = 'px-4 py-2 rounded-lg text-xs font-extrabold transition flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
    }
    if (overviewPanel) overviewPanel.classList.remove('hidden');
    if (editPanel) editPanel.classList.add('hidden');
  } else {
    if (overviewBtn) {
      overviewBtn.className = 'px-4 py-2 rounded-lg text-xs font-extrabold transition flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
    }
    if (editBtn) {
      editBtn.className = 'px-4 py-2 rounded-lg text-xs font-extrabold transition flex items-center space-x-1.5 bg-brand-600 text-white shadow-sm';
    }
    if (overviewPanel) overviewPanel.classList.add('hidden');
    if (editPanel) editPanel.classList.remove('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

async function renderPageProfileOverview() {
  const container = document.getElementById('page-profile-details-container');
  if (!container || !currentUser) return;
  container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">Loading your profile details...</div>';

  try {
    const data = await safeFetchJson(`/api/auth/profile/${currentUser.user_id}`);
    const user = data || currentUser;
    const role = (user.role || 'STUDENT').toUpperCase();

    if (role === 'COACH') {
      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              ${getSportIcon(user.coaching_specialization, 'w-5 h-5')}
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Coaching Specialization</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-base">${user.coaching_specialization || 'Sports Specialist'}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex-shrink-0">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Professional Experience</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-base">${user.experience_years || 0} Years Active</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5 sm:col-span-2">
            <div class="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex-shrink-0">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Official Certifications</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${user.certification || 'Certified Professional Coach'}</span>
            </div>
          </div>
        </div>

        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2 text-xs">
          <div class="flex items-center space-x-2 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
            <i data-lucide="quote" class="w-4 h-4 text-brand-600"></i>
            <span>Coaching Philosophy & Biography</span>
          </div>
          <p class="text-slate-700 dark:text-slate-300 italic text-sm leading-relaxed">
            ${user.bio ? `"${user.bio}"` : 'No biography provided yet. Switch to Edit Profile to add one.'}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm flex items-center space-x-4">
            <div class="p-3 rounded-2xl bg-emerald-600 text-white flex-shrink-0">
              <i data-lucide="users" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-emerald-700 dark:text-emerald-300 block text-xs uppercase font-bold">Active Student Athletes</span>
              <span class="font-black text-slate-900 dark:text-white text-2xl">${user.total_students || 0}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm flex items-center space-x-4">
            <div class="p-3 rounded-2xl bg-brand-600 text-white flex-shrink-0">
              <i data-lucide="message-square" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-brand-700 dark:text-brand-300 block text-xs uppercase font-bold">Feedback & Drills Provided</span>
              <span class="font-black text-slate-900 dark:text-white text-2xl">${user.total_feedback || 0}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Student Profile Overview
      const age = calculateAgeFromDob(user.date_of_birth);
      const dobDisplay = user.date_of_birth 
        ? `${user.date_of_birth} ${age !== null ? `(${age} years old)` : ''}`
        : 'Not specified';

      const sportsListHtml = (user.sports && user.sports.length > 0)
        ? user.sports.map(sp => `
            <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between text-xs">
              <div class="flex items-center space-x-3">
                <div class="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center">
                  ${getSportIcon(sp.sport_name, 'w-5 h-5')}
                </div>
                <div>
                  <span class="font-extrabold text-sm text-slate-900 dark:text-white">${sp.sport_name}</span>
                  <span class="text-slate-400 block text-xs mt-0.5">${sp.experience_years || 0} yrs experience • ${sp.training_goal || 'Goal-driven practice'}</span>
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                ${sp.skill_level || 'ACTIVE'}
              </span>
            </div>
          `).join('')
        : '<div class="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 italic">No sports registered in profile yet. Go to My Sports to add one.</div>';

      container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex-shrink-0">
              <i data-lucide="calendar" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Date of Birth & Age</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${dobDisplay}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex-shrink-0 flex items-center justify-center">
              ${getSportIcon(user.preferred_sport, 'w-5 h-5')}
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Primary Preferred Sport</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${user.preferred_sport || 'Not specified'}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5 sm:col-span-2">
            <div class="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
              <i data-lucide="user" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Personal Bio & Athletic Ambition</span>
              <span class="font-medium text-slate-700 dark:text-slate-300 text-sm italic">${user.bio ? `"${user.bio}"` : 'No bio provided yet. Switch to Edit Profile to add one.'}</span>
            </div>
          </div>
        </div>

        <!-- Lifetime Athletic Activity Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-brand-200 dark:border-brand-900/50 shadow-sm text-center">
            <div class="text-brand-600 dark:text-brand-400 font-black text-3xl">${user.total_hours || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="clock" class="w-4 h-4 text-brand-600"></i>
              <span>Total Practice Hours</span>
            </div>
          </div>
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm text-center">
            <div class="text-emerald-600 dark:text-emerald-400 font-black text-3xl">${user.total_sessions || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="activity" class="w-4 h-4 text-emerald-600"></i>
              <span>Workouts Recorded</span>
            </div>
          </div>
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm text-center">
            <div class="text-purple-600 dark:text-purple-400 font-black text-3xl">${user.active_goals_count || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="target" class="w-4 h-4 text-purple-600"></i>
              <span>Active Goals</span>
            </div>
          </div>
        </div>

        <!-- Enrolled Sports Breakdown -->
        <div class="space-y-3">
          <div class="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <i data-lucide="award" class="w-4 h-4 text-brand-600"></i>
            <span>Enrolled Sports & Skill Ratings</span>
          </div>
          <div class="space-y-3">
            ${sportsListHtml}
          </div>
        </div>
      `;
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="text-center py-4 text-xs text-rose-500">Failed to load profile: ${err.message}</div>`;
  }
}

async function submitPageUpdateProfile(event) {
  event.preventDefault();
  if (!currentUser) return;

  const role = (currentUser.role || 'STUDENT').toUpperCase();
  const name = document.getElementById('page-edit-name').value.trim();
  const bio = document.getElementById('page-edit-bio').value.trim();

  const payload = { name, bio };

  if (role === 'STUDENT') {
    const dob = document.getElementById('page-edit-dob').value;
    const prefSport = document.getElementById('page-edit-pref-sport').value.trim();
    if (dob) payload.date_of_birth = dob;
    if (prefSport) payload.preferred_sport = prefSport;
  } else if (role === 'COACH') {
    const spec = document.getElementById('page-edit-spec').value.trim();
    const exp = parseFloat(document.getElementById('page-edit-exp').value) || 0;
    const cert = document.getElementById('page-edit-cert').value.trim();
    if (spec) payload.coaching_specialization = spec;
    payload.experience_years = exp;
    if (cert) payload.certification = cert;
  }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || 'Failed to update profile');

    showToast('Profile updated successfully!', 'success');

    // Update in-memory user and storage
    Object.assign(currentUser, payload);
    const storage = localStorage.getItem('athletiq_token') ? localStorage : sessionStorage;
    storage.setItem('athletiq_user', JSON.stringify(currentUser));

    // Update header & sidebar UI badges
    const nameBadge = document.getElementById('user-display-name');
    const avatarBadge = document.getElementById('user-avatar-badge');
    const pageName = document.getElementById('page-profile-name');
    if (nameBadge) nameBadge.textContent = currentUser.name;
    if (avatarBadge) avatarBadge.textContent = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
    if (pageName) pageName.textContent = currentUser.name;

    // Switch back to overview tab
    switchPageProfileTab('overview');
    await renderPageProfileOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 2. FULL-PAGE PUBLIC PROFILE VIEW (navTo('public-profile'))
async function viewPublicProfile(targetUserId, targetRole) {
  if (!targetUserId) return;
  navTo('public-profile');

  const content = document.getElementById('view-pub-content');
  const topActions = document.getElementById('view-pub-top-actions');
  const avatarEl = document.getElementById('view-pub-avatar');
  const nameEl = document.getElementById('view-pub-name');
  const roleBadgeEl = document.getElementById('view-pub-role-badge');
  const emailEl = document.getElementById('view-pub-email');

  if (content) content.innerHTML = '<div class="text-center py-10 text-xs text-slate-400">Loading athlete / coach profile...</div>';
  if (topActions) topActions.innerHTML = '';

  try {
    const target = await safeFetchJson(`/api/auth/profile/${targetUserId}`);
    if (!target) throw new Error('Profile not found');

    const role = (target.role || targetRole || 'STUDENT').toUpperCase();
    const isCoach = role === 'COACH';

    if (avatarEl) {
      avatarEl.textContent = target.name ? target.name.charAt(0).toUpperCase() : (isCoach ? 'C' : 'S');
      avatarEl.className = isCoach 
        ? 'w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0'
        : 'w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md flex-shrink-0';
    }
    if (nameEl) nameEl.textContent = (isCoach ? 'Coach ' : '') + (target.name || 'Profile');
    if (roleBadgeEl) {
      roleBadgeEl.textContent = role;
      roleBadgeEl.className = isCoach
        ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
        : 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300';
    }
    if (emailEl) emailEl.textContent = target.email || '';

    if (isCoach) {
      // Render Coach Profile for Student viewing
      content.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex-shrink-0 flex items-center justify-center">
              ${getSportIcon(target.coaching_specialization, 'w-5 h-5')}
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Coaching Specialization</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-base">${target.coaching_specialization || 'Sports Specialist'}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex-shrink-0">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Coaching Experience</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-base">${target.experience_years || 0} Years</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5 sm:col-span-2">
            <div class="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex-shrink-0">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Official Certifications</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${target.certification || 'Certified Professional Coach'}</span>
            </div>
          </div>
        </div>

        <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2 text-xs">
          <div class="flex items-center space-x-2 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
            <i data-lucide="quote" class="w-4 h-4 text-brand-600"></i>
            <span>Coaching Philosophy & Biography</span>
          </div>
          <p class="text-slate-700 dark:text-slate-300 italic text-sm leading-relaxed">
            ${target.bio ? `"${target.bio}"` : 'Dedicated to developing athletic performance, technical mastery, and disciplined practice.'}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm flex items-center space-x-4">
            <div class="p-3 rounded-2xl bg-emerald-600 text-white flex-shrink-0">
              <i data-lucide="users" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-emerald-700 dark:text-emerald-300 block text-xs uppercase font-bold">Athletes Coached</span>
              <span class="font-black text-slate-900 dark:text-white text-2xl">${target.total_students || 0} Students</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm flex items-center space-x-4">
            <div class="p-3 rounded-2xl bg-brand-600 text-white flex-shrink-0">
              <i data-lucide="message-square" class="w-6 h-6"></i>
            </div>
            <div>
              <span class="text-brand-700 dark:text-brand-300 block text-xs uppercase font-bold">Feedback & Drills Provided</span>
              <span class="font-black text-slate-900 dark:text-white text-2xl">${target.total_feedback || 0}</span>
            </div>
          </div>
        </div>
      `;

      if (currentUser && currentUser.role === 'STUDENT' && topActions) {
        if (target.connection_status === 'ACCEPTED') {
          topActions.innerHTML = `<span class="px-4 py-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-extrabold rounded-xl text-xs flex items-center space-x-1.5"><i data-lucide="check" class="w-4 h-4"></i><span>Connected Coach</span></span>`;
        } else if (target.connection_status === 'PENDING') {
          topActions.innerHTML = `<span class="px-4 py-2 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-extrabold rounded-xl text-xs flex items-center space-x-1.5"><i data-lucide="clock" class="w-4 h-4"></i><span>Request Pending</span></span>`;
        } else {
          topActions.innerHTML = `
            <button onclick="connectCoach(${target.user_id})" class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center space-x-1.5">
              <i data-lucide="user-plus" class="w-4 h-4"></i>
              <span>Connect with Coach</span>
            </button>
          `;
        }
      }
    } else {
      // Render Student Profile for Coach viewing
      const age = calculateAgeFromDob(target.date_of_birth);
      const dobDisplay = target.date_of_birth 
        ? `${target.date_of_birth} ${age !== null ? `(${age} years old)` : ''}`
        : 'Not specified';

      const sportsListHtml = (target.sports && target.sports.length > 0)
        ? target.sports.map(sp => `
            <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between text-xs">
              <div class="flex items-center space-x-3">
                <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center">
                  ${getSportIcon(sp.sport_name, 'w-5 h-5')}
                </div>
                <div>
                  <span class="font-extrabold text-sm text-slate-900 dark:text-white">${sp.sport_name}</span>
                  <span class="text-slate-400 block text-xs mt-0.5">${sp.experience_years || 0} yrs experience • ${sp.training_goal || 'Goal-driven practice'}</span>
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                ${sp.skill_level || 'ACTIVE'}
              </span>
            </div>
          `).join('')
        : '<div class="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 italic">No sports registered in profile yet.</div>';

      content.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex-shrink-0">
              <i data-lucide="calendar" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Date of Birth & Age</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${dobDisplay}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex-shrink-0 flex items-center justify-center">
              ${getSportIcon(target.preferred_sport, 'w-5 h-5')}
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Primary Preferred Sport</span>
              <span class="font-extrabold text-slate-900 dark:text-white text-sm">${target.preferred_sport || 'Not specified'}</span>
            </div>
          </div>

          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-start space-x-3.5 sm:col-span-2">
            <div class="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
              <i data-lucide="user" class="w-5 h-5"></i>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Athlete Bio / Ambition</span>
              <span class="font-medium text-slate-700 dark:text-slate-300 text-sm italic">${target.bio ? `"${target.bio}"` : 'Disciplined student athlete working towards athletic excellence.'}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-brand-200 dark:border-brand-900/50 shadow-sm text-center">
            <div class="text-brand-600 dark:text-brand-400 font-black text-3xl">${target.total_hours || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="clock" class="w-4 h-4 text-brand-600"></i>
              <span>Total Practice Hours</span>
            </div>
          </div>
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm text-center">
            <div class="text-emerald-600 dark:text-emerald-400 font-black text-3xl">${target.total_sessions || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="activity" class="w-4 h-4 text-emerald-600"></i>
              <span>Workouts Recorded</span>
            </div>
          </div>
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm text-center">
            <div class="text-purple-600 dark:text-purple-400 font-black text-3xl">${target.active_goals_count || 0}</div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 mt-1">
              <i data-lucide="target" class="w-4 h-4 text-purple-600"></i>
              <span>Active Goals</span>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <i data-lucide="award" class="w-4 h-4 text-emerald-600"></i>
            <span>Enrolled Sports Profile</span>
          </div>
          <div class="space-y-3">
            ${sportsListHtml}
          </div>
        </div>
      `;

      if (currentUser && currentUser.role === 'COACH' && topActions) {
        const studentNameEsc = (target.name || 'Student').replace(/'/g, "\\'");
        topActions.innerHTML = `
          <button onclick="openCoachStudentDetailModal(${target.user_id});" class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center space-x-1.5">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Inspect Sessions & AI</span>
          </button>
          <button onclick="openCoachFeedbackModal(${target.user_id}, '${studentNameEsc}');" class="px-4 py-2 bg-sportsgreen-600 hover:bg-sportsgreen-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center space-x-1.5">
            <i data-lucide="message-square" class="w-4 h-4"></i>
            <span>+ Feedback</span>
          </button>
        `;
      }
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    content.innerHTML = `<div class="text-center py-6 text-xs text-rose-500">Failed to load profile: ${err.message}</div>`;
  }
}

function returnFromPublicProfile() {
  const fallback = (currentUser && currentUser.role === 'COACH') ? 'coach-students' : 'coach-link';
  navTo(previousActiveView && previousActiveView !== 'public-profile' ? previousActiveView : fallback);
}

// Modal fallback functions
function openMyProfileModal() {
  navTo('profile');
}
function closeMyProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) modal.classList.add('hidden');
}
function openPublicProfileModal(targetUserId, targetRole) {
  viewPublicProfile(targetUserId, targetRole);
}
function closePublicProfileModal() {
  const modal = document.getElementById('public-profile-modal');
  if (modal) modal.classList.add('hidden');
}

