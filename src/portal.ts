import {
  getCachedUser,
  subscribeAuth,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  refreshCurrentUserProfile,
  type CurrentUser
} from './auth';
import { supabase } from './lib/supabase';
import {
  COMMITTEES,
  getUserRegistration,
  createRegistration
} from './registration';
import {
  fetchAllRegistrations,
  updateRegistrationStatus,
  fetchStaffProfiles,
  fetchEbProfiles,
  setUserRoleRpc,
  computeAdminStats,
  computeEbStats,
  fetchAllTeams,
  fetchTeamById,
  createTeam,
  assignHeadRpc,
  removeHeadRpc,
  requestTeamRpc,
  reviewTeamMemberRpc,
  fetchTeamMembers,
  isEmailAllowedRpc,
  fetchStaffAllowlist,
  addStaffAllowlistEntry,
  removeStaffAllowlistEntry,
  type AdminStats,
  type EbStats
} from './admin';
import type {
  Registration,
  Profile,
  UserRole,
  Team,
  TeamKind,
  StaffAllowlistEntry
} from './types/database';

export function isAdminRoute(): boolean {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  return path.endsWith('/admin') || path.endsWith('/admin/') || hash === 'admin';
}

export function isTeamHeadRoute(): boolean {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  return (
    path.endsWith('/team-head') ||
    path.endsWith('/team-head/') ||
    hash === 'team-head' ||
    hash === 'my-team'
  );
}

/**
 * Escapes unsafe characters for safe innerHTML insertion
 */
function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format timestamp safely
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'TBA';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// Global cached state for the admin board
let adminRegistrations: Registration[] = [];
let adminStaff: Profile[] = [];
let adminEbProfiles: Profile[] = [];
let adminTeams: Team[] = [];
let adminStaffAllowlist: StaffAllowlistEntry[] = [];
let adminActiveTab: 'delegates' | 'eb' | 'teams' | 'allowlist' = 'delegates';
let adminFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all';
let adminSearchQuery = '';
let adminEbFilter: 'all' | 'pending' | 'eb' | 'head' | 'admin' | 'security' = 'all';
let adminEbSearchQuery = '';
let adminAllowlistSearchQuery = '';
let adminAllowlistFilter: 'all' | 'claimed' | 'unclaimed' = 'all';

let currentRegistration: Registration | null = null;

// Global cached state for member side teams
let cachedTeamsList: Team[] = [];
let cachedHeadTeamName = '';

/**
 * Initialize all auth, apply portal, join team panel, head dashboard, and admin board listeners
 */
export function initPortal(): void {
  // Subscribe to auth state updates
  subscribeAuth(async (user, loading) => {
    updateHeaderAuthUI(user, loading);
    await renderApplyPortal(user, loading);
    await renderJoinTeamPanel(user);

    if (isAdminRoute()) {
      renderAdminRoute(user, loading);
    } else if (isTeamHeadRoute()) {
      renderTeamHeadRoute(user, loading);
    }
  });

  // Listen to hash changes and popstate
  window.addEventListener('hashchange', () => {
    const user = getCachedUser();
    if (isAdminRoute()) {
      renderAdminRoute(user, false);
    } else if (isTeamHeadRoute()) {
      renderTeamHeadRoute(user, false);
    } else {
      document.body.classList.remove('admin-mode-active');
    }
  });

  window.addEventListener('popstate', () => {
    const user = getCachedUser();
    if (isAdminRoute()) {
      renderAdminRoute(user, false);
    } else if (isTeamHeadRoute()) {
      renderTeamHeadRoute(user, false);
    } else {
      document.body.classList.remove('admin-mode-active');
    }
  });
}

/**
 * Update Header with dynamic user status, My Team pill (if Head), or Sign In trigger
 */
function updateHeaderAuthUI(user: CurrentUser | null, loading: boolean): void {
  const container = document.getElementById('header-auth-container');
  if (!container) return;

  if (loading) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.5); white-space: nowrap; overflow-wrap: normal;">Connecting...</span>`;
    return;
  }

  if (!user) {
    container.innerHTML = `
      <a href="#/apply" class="apply-pill-btn btn-interactive header-auth-btn" style="padding: 0.45rem 1.1rem; font-size: 0.75rem; white-space: nowrap; overflow-wrap: normal;">
        Sign In / Apply
      </a>
    `;
    return;
  }

  // Head leadership pill if user role is 'head'
  let headPill = '';
  if (user.role === 'head') {
    const teamLabel = cachedHeadTeamName || 'My Team';
    headPill = `
      <a href="#team-head" class="header-head-pill btn-interactive" title="Access My Team Dashboard" style="display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(217, 180, 90, 0.22); border: 1.5px solid var(--gold); color: #ffffff; padding: 0.32rem 0.75rem; border-radius: 9999px; text-decoration: none; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; box-shadow: 0 0 10px rgba(217, 180, 90, 0.3); flex-shrink: 0;">
        <span style="color: var(--gold);">★</span>
        <span>${escapeHtml(teamLabel)}</span>
      </a>
    `;

    if (user.teamId && !cachedHeadTeamName) {
      fetchTeamById(user.teamId).then((res) => {
        if (res.data?.name && res.data.name !== cachedHeadTeamName) {
          cachedHeadTeamName = res.data.name;
          const labelSpan = document.querySelector('.header-head-pill span:last-child');
          if (labelSpan) {
            labelSpan.textContent = res.data.name;
          }
        }
      });
    }
  }

  const roleColor = user.role === 'head' ? 'var(--gold)' : (user.role === 'admin' ? '#38bdf8' : 'rgba(217, 180, 90, 0.8)');
  const roleBadge = user.role !== 'user'
    ? `<span class="header-user-role" style="background: rgba(217, 180, 90, 0.2); border: 1px solid ${roleColor}; color: ${roleColor}; padding: 0.12rem 0.45rem; border-radius: 9999px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; overflow-wrap: normal; flex-shrink: 0;">${escapeHtml(user.role)}</span>`
    : '';

  container.innerHTML = `
    <div style="display: inline-flex; align-items: center; gap: 0.45rem; white-space: nowrap; flex-wrap: nowrap; flex-shrink: 0;">
      ${headPill}
      <a href="#/apply" class="header-user-pill" title="${escapeHtml(user.fullName)}" style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.35); padding: 0.32rem 0.75rem; border-radius: 9999px; text-decoration: none; color: #f2f4ff; font-family: var(--font-display); font-size: 0.78rem; font-weight: 700; white-space: nowrap; overflow-wrap: normal;">
        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; flex-shrink: 0;"></span>
        <span class="header-user-name" style="white-space: nowrap; overflow-wrap: normal; max-width: 130px; overflow: hidden; text-overflow: ellipsis; display: inline-block;">${escapeHtml(user.fullName)}</span>
        ${roleBadge}
      </a>
      <button type="button" id="header-logout-btn" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.85); font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; padding: 0.35rem 0.65rem; border-radius: 9999px; cursor: pointer; white-space: nowrap; flex-shrink: 0; overflow-wrap: normal;">
        Log Out
      </button>
    </div>
  `;

  const logoutBtn = document.getElementById('header-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut();
      document.body.classList.remove('admin-mode-active');
    });
  }
}

/**
 * Render the Apply Page Portal (#view-apply)
 */
export async function renderApplyPortal(user: CurrentUser | null, loading: boolean): Promise<void> {
  const mount = document.getElementById('apply-portal-mount');
  if (!mount) return;

  if (loading) {
    mount.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--gold); font-family: var(--font-display);">
        <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
        <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Checking authorization status...</p>
      </div>
    `;
    return;
  }

  // CASE 1: Visitor is not logged in -> Show Instant Sign Up & Sign In Tabs
  if (!user) {
    renderApplyAuthForms(mount);
    return;
  }

  // CASE 2: User is logged in -> Fetch registration
  mount.innerHTML = `
    <div style="text-align: center; padding: 3rem 1rem; color: var(--gold); font-family: var(--font-display);">
      <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
      <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Retrieving registration matrix record...</p>
    </div>
  `;

  currentRegistration = await getUserRegistration(user.id);

  // CASE 3: User is registered -> Show Status Screen (Pending, Approved, Rejected)
  if (currentRegistration) {
    renderRegistrationStatusView(mount, user, currentRegistration);
  } else {
    // CASE 4: Logged in but not registered -> Show Registration Form
    renderRegistrationFormView(mount, user);
  }
}

/**
 * Form for unauthenticated visitors to sign up instantly or sign in
 */
function renderApplyAuthForms(mount: HTMLElement): void {
  mount.innerHTML = `
    <div class="tilt-card" style="max-width: 620px; margin: 0 auto; background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: var(--card-radius); padding: clamp(1.5rem, 5vw, 2.5rem); box-shadow: 0 16px 40px rgba(0,0,0,0.5);">
      <div style="text-align: center; margin-bottom: 2rem;">
        <span class="eyebrow">Delegate & EB Portal</span>
        <h2 style="font-family: var(--font-display); font-size: clamp(1.5rem, 4vw, 2rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.6rem;">
          ACCESS <em>MONUMENT MUN.</em>
        </h2>
        <p style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.75); line-height: 1.55;">
          Sign up with your email and password for immediate entry. No email verification code required.
        </p>
      </div>

      <!-- Auth Tabs -->
      <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; margin-bottom: 1.75rem; border: 1px solid rgba(217, 180, 90, 0.2);">
        <button type="button" id="auth-tab-signup" style="flex: 1; padding: 0.65rem 1rem; border: none; border-radius: 9999px; background: var(--gold); color: #080a1e; font-family: var(--font-display); font-weight: 800; font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease;">
          Instant Sign Up
        </button>
        <button type="button" id="auth-tab-signin" style="flex: 1; padding: 0.65rem 1rem; border: none; border-radius: 9999px; background: transparent; color: #f2f4ff; font-family: var(--font-display); font-weight: 800; font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease;">
          Log In
        </button>
      </div>

      <div id="auth-form-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <!-- Sign Up Form -->
      <form id="apply-signup-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="signup-name">Full Name *</label>
          <input type="text" id="signup-name" class="form-input" placeholder="e.g. Maya Lin" required autocomplete="name" />
        </div>

        <div class="form-group">
          <label class="form-label" for="signup-email">Real Email Address *</label>
          <input type="email" id="signup-email" class="form-input" placeholder="your-email@domain.com" required autocomplete="email" />
        </div>

        <div class="form-group">
          <label class="form-label" for="signup-password">Password *</label>
          <input type="password" id="signup-password" class="form-input" placeholder="At least 6 characters" required autocomplete="new-password" />
        </div>

        <button type="submit" id="signup-btn" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
          Create Account & Log In Instantly
        </button>
      </form>

      <!-- Sign In Form -->
      <form id="apply-signin-form" style="display: none;" novalidate>
        <div class="form-group">
          <label class="form-label" for="signin-email">Email Address *</label>
          <input type="email" id="signin-email" class="form-input" placeholder="your-email@domain.com" required autocomplete="email" />
        </div>

        <div class="form-group">
          <label class="form-label" for="signin-password">Password *</label>
          <input type="password" id="signin-password" class="form-input" placeholder="Enter your password" required autocomplete="current-password" />
        </div>

        <button type="submit" id="signin-btn" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
          Log In to Portal
        </button>
      </form>
    </div>
  `;

  const tabSignup = document.getElementById('auth-tab-signup');
  const tabSignin = document.getElementById('auth-tab-signin');
  const formSignup = document.getElementById('apply-signup-form') as HTMLFormElement | null;
  const formSignin = document.getElementById('apply-signin-form') as HTMLFormElement | null;
  const feedback = document.getElementById('auth-form-feedback');

  function showFeedback(type: 'error' | 'success' | 'info', msg: string) {
    if (!feedback) return;
    feedback.className = `status-banner status-${type}`;
    feedback.innerHTML = msg;
    feedback.style.display = 'block';
  }

  function hideFeedback() {
    if (feedback) feedback.style.display = 'none';
  }

  tabSignup?.addEventListener('click', () => {
    hideFeedback();
    tabSignup.style.background = 'var(--gold)';
    tabSignup.style.color = '#080a1e';
    if (tabSignin) {
      tabSignin.style.background = 'transparent';
      tabSignin.style.color = '#f2f4ff';
    }
    if (formSignup) formSignup.style.display = 'block';
    if (formSignin) formSignin.style.display = 'none';
  });

  tabSignin?.addEventListener('click', () => {
    hideFeedback();
    tabSignin.style.background = 'var(--gold)';
    tabSignin.style.color = '#080a1e';
    if (tabSignup) {
      tabSignup.style.background = 'transparent';
      tabSignup.style.color = '#f2f4ff';
    }
    if (formSignin) formSignin.style.display = 'block';
    if (formSignup) formSignup.style.display = 'none';
  });

  // Handle instant sign up
  formSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback();

    const nameInput = document.getElementById('signup-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('signup-email') as HTMLInputElement | null;
    const passInput = document.getElementById('signup-password') as HTMLInputElement | null;
    const submitBtn = document.getElementById('signup-btn') as HTMLButtonElement | null;

    const fullName = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = passInput?.value || '';

    if (!fullName) {
      showFeedback('error', 'Please provide your full legal name.');
      nameInput?.focus();
      return;
    }

    if (!email || !email.includes('@') || !email.includes('.')) {
      showFeedback('error', 'Please enter a valid real email address.');
      emailInput?.focus();
      return;
    }

    if (!password || password.length < 6) {
      showFeedback('error', 'Password must be at least 6 characters.');
      passInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account & Logging In...';
    }
    showFeedback('info', 'Processing instant registration...');

    const result = await signUpWithEmail(fullName, email, password);

    if (result.error) {
      showFeedback('error', result.error);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account & Log In Instantly';
      }
      return;
    }

    showFeedback('success', `Welcome, ${escapeHtml(fullName)}! You are now logged in.`);
  });

  // Handle sign in
  formSignin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFeedback();

    const emailInput = document.getElementById('signin-email') as HTMLInputElement | null;
    const passInput = document.getElementById('signin-password') as HTMLInputElement | null;
    const submitBtn = document.getElementById('signin-btn') as HTMLButtonElement | null;

    const email = emailInput?.value.trim() || '';
    const password = passInput?.value || '';

    if (!email || !email.includes('@')) {
      showFeedback('error', 'Please enter your registered email.');
      emailInput?.focus();
      return;
    }

    if (!password) {
      showFeedback('error', 'Please enter your password.');
      passInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }
    showFeedback('info', 'Authenticating credentials...');

    const result = await signInWithEmail(email, password);

    if (result.error) {
      showFeedback('error', result.error);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In to Portal';
      }
      return;
    }

    showFeedback('success', 'Logged in successfully!');
  });
}

/**
 * Form for logged-in user to submit delegate registration
 */
function renderRegistrationFormView(mount: HTMLElement, user: CurrentUser): void {
  const committeeOptions = COMMITTEES.map((comm) => `<option value="${escapeHtml(comm)}">${escapeHtml(comm)}</option>`).join('');

  mount.innerHTML = `
    <div class="tilt-card" style="max-width: 680px; margin: 0 auto; background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: var(--card-radius); padding: clamp(1.5rem, 5vw, 2.75rem); box-shadow: 0 16px 40px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span class="eyebrow">Delegate Registration Form</span>
          <h2 style="font-family: var(--font-display); font-size: clamp(1.5rem, 4vw, 2.2rem); font-weight: 800; text-transform: uppercase; color: #ffffff; line-height: 1.1;">
            SUBMIT <em>CREDENTIALS.</em>
          </h2>
        </div>
        <div style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 9999px; padding: 0.35rem 0.85rem; font-family: var(--font-display); font-size: 0.78rem; color: #f2f4ff; white-space: nowrap;">
          Logged in as <strong>${escapeHtml(user.email)}</strong>
        </div>
      </div>

      <p style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.78); margin-bottom: 1.75rem; line-height: 1.55;">
        Please complete your delegate registration for the Monument MUN 2027 assembly. Upon submission, your application will be dispatched to the Secretariat for administrative review.
      </p>

      <div id="reg-form-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <form id="delegate-registration-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="reg-fullname">Full Name *</label>
          <input type="text" id="reg-fullname" class="form-input" value="${escapeHtml(user.fullName)}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="reg-email">Email Address (Prefilled)</label>
          <input type="email" id="reg-email" class="form-input" value="${escapeHtml(user.email)}" disabled style="opacity: 0.8; background: rgba(0,0,0,0.3); cursor: not-allowed;" />
          <span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.5); margin-top: 0.3rem; display: block;">Locked to your authenticated account email.</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="reg-phone">Phone Number *</label>
          <input type="tel" id="reg-phone" class="form-input" placeholder="+1 (555) 000-0000" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="reg-school">School / University / Institution *</label>
          <input type="text" id="reg-school" class="form-input" placeholder="e.g. Cairo American College / Harvard University" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="reg-committee">Committee Preference *</label>
          <select id="reg-committee" class="form-select" required>
            ${committeeOptions}
          </select>
        </div>

        <div style="background: rgba(217, 180, 90, 0.08); border-left: 3px solid var(--gold); padding: 0.85rem 1.15rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem;">
          <p style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.85); line-height: 1.45;">
            ✦ <strong>Administrative Notice:</strong> New registrations are subject to Secretariat review. Your seat is confirmed once approved by an administrator.
          </p>
        </div>

        <button type="submit" id="reg-submit-btn" class="form-submit-btn btn-interactive" style="width: 100%;">
          Submit Delegate Application
        </button>
      </form>
    </div>
  `;

  const form = document.getElementById('delegate-registration-form') as HTMLFormElement | null;
  const feedback = document.getElementById('reg-form-feedback');
  const submitBtn = document.getElementById('reg-submit-btn') as HTMLButtonElement | null;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const nameInput = document.getElementById('reg-fullname') as HTMLInputElement | null;
    const phoneInput = document.getElementById('reg-phone') as HTMLInputElement | null;
    const schoolInput = document.getElementById('reg-school') as HTMLInputElement | null;
    const commInput = document.getElementById('reg-committee') as HTMLSelectElement | null;

    const full_name = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';
    const school = schoolInput?.value.trim() || '';
    const committee = commInput?.value || COMMITTEES[0];

    if (!full_name) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please provide your full name.';
      feedback.style.display = 'block';
      nameInput?.focus();
      return;
    }

    if (!phone) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please enter your phone number.';
      feedback.style.display = 'block';
      phoneInput?.focus();
      return;
    }

    if (!school) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please provide your school or university name.';
      feedback.style.display = 'block';
      schoolInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Application...';
    }

    const res = await createRegistration(user.id, {
      full_name,
      email: user.email,
      phone,
      school,
      committee
    });

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Delegate Application';
      }
      return;
    }

    currentRegistration = res.registration;
    renderRegistrationStatusView(mount, user, res.registration!);
  });
}

/**
 * Display registration status (Pending, Approved, Rejected)
 */
function renderRegistrationStatusView(mount: HTMLElement, user: CurrentUser, reg: Registration): void {
  let badgeHtml = '';
  let headingHtml = '';
  let messageHtml = '';
  let statusBorderColor = 'var(--gold)';

  if (reg.status === 'pending') {
    statusBorderColor = 'rgba(217, 180, 90, 0.6)';
    badgeHtml = `
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--gold); animation: pulse 1.8s infinite;"></span>
        Waiting for Admin Approval
      </span>
    `;
    headingHtml = `APPLICATION <em>UNDER REVIEW.</em>`;
    messageHtml = `
      Your registration application has been received and logged in the Monument MUN 2027 database. New registrations are held in review until an administrator approves your participation. Please check back here for confirmation updates.
    `;
  } else if (reg.status === 'approved') {
    statusBorderColor = 'rgba(16, 185, 129, 0.6)';
    badgeHtml = `
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap;">
        ✓ You're Confirmed
      </span>
    `;
    headingHtml = `REGISTRATION <em>OFFICIALLY CONFIRMED!</em>`;
    messageHtml = `
      Congratulations! Your registration for Monument MUN 2027 has been reviewed and officially approved by the Secretariat. Your credentials are recognized and secured for the conference.
    `;
  } else if (reg.status === 'rejected') {
    statusBorderColor = 'rgba(239, 68, 68, 0.6)';
    badgeHtml = `
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; white-space: nowrap;">
        Application Not Accepted
      </span>
    `;
    headingHtml = `APPLICATION <em>STATUS UPDATE.</em>`;
    messageHtml = `
      Thank you for your interest in Monument MUN 2027. We regret to inform you that your application could not be approved for this session due to capacity constraints. If you have inquiries, please contact the Secretariat.
    `;
  }

  mount.innerHTML = `
    <div class="tilt-card" style="max-width: 680px; margin: 0 auto; background: rgba(8, 10, 30, 0.95); border: 1px solid ${statusBorderColor}; border-radius: var(--card-radius); padding: clamp(1.75rem, 5vw, 3rem); box-shadow: 0 16px 45px rgba(0,0,0,0.6);">
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="margin-bottom: 1.25rem;">
          ${badgeHtml}
        </div>
        <h2 style="font-family: var(--font-display); font-size: clamp(1.6rem, 4.5vw, 2.3rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.8rem; line-height: 1.15;">
          ${headingHtml}
        </h2>
        <p style="font-size: 1rem; color: rgba(242, 244, 255, 0.85); line-height: 1.6; max-width: 580px; margin: 0 auto;">
          ${messageHtml}
        </p>
      </div>

      <!-- Registration Record Summary -->
      <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(217, 180, 90, 0.2); border-radius: 16px; padding: 1.5rem; margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.75rem; margin-bottom: 1rem;">
          <span style="font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: var(--gold);">Application Record</span>
          <span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.6); white-space: nowrap;">Submitted: ${formatDate(reg.created_at)}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Delegate Name</div>
            <div style="font-size: 1rem; font-weight: 700; color: #ffffff;">${escapeHtml(reg.full_name)}</div>
          </div>

          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Email Address</div>
            <div style="font-size: 0.95rem; color: #ffffff;">${escapeHtml(reg.email)}</div>
          </div>

          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">School / University</div>
            <div style="font-size: 0.95rem; color: #ffffff;">${escapeHtml(reg.school)}</div>
          </div>

          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Phone Number</div>
            <div style="font-size: 0.95rem; color: #ffffff;">${escapeHtml(reg.phone)}</div>
          </div>

          <div style="grid-column: 1 / -1;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Committee Preference</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--gold);">${escapeHtml(reg.committee)}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
        <button type="button" id="refresh-status-btn" class="btn-interactive" style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: #ffffff; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          ↺ Refresh Status
        </button>
        <button type="button" id="portal-signout-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.8); padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          Log Out
        </button>
      </div>
    </div>
  `;

  document.getElementById('refresh-status-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-status-btn') as HTMLButtonElement | null;
    if (btn) btn.textContent = 'Checking...';
    currentRegistration = await getUserRegistration(user.id);
    renderRegistrationStatusView(mount, user, currentRegistration || reg);
  });

  document.getElementById('portal-signout-btn')?.addEventListener('click', async () => {
    await signOut();
  });
}

/**
 * MEMBER SIDE: Render "Join a Team" panel
 * Shown in the "Meet the Team" section (#team-join-mount) and in Apply Page (#apply-team-join-mount)
 */
export async function renderJoinTeamPanel(user: CurrentUser | null): Promise<void> {
  const mounts = [
    document.getElementById('team-join-mount'),
    document.getElementById('apply-team-join-mount')
  ].filter(Boolean) as HTMLElement[];

  if (mounts.length === 0) return;

  // If user is not logged in
  if (!user) {
    for (const mount of mounts) {
      mount.innerHTML = `
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.94); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 18px; padding: clamp(1.4rem, 4vw, 2.2rem); text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.45);">
          <span class="eyebrow" style="margin-bottom: 0.35rem;">Team Application</span>
          <h3 style="font-family: var(--font-display); font-size: clamp(1.2rem, 3.5vw, 1.6rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem;">
            JOIN A <em>CONFERENCE TEAM.</em>
          </h3>
          <p style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.75); max-width: 520px; margin: 0 auto 1.5rem; line-height: 1.55;">
            Ready to shape Monument MUN 2027? Please sign in or create an account to submit your department or committee team assignment request.
          </p>
          <a href="#/apply" class="apply-pill-btn btn-interactive" style="padding: 0.65rem 1.6rem; font-size: 0.85rem; display: inline-flex;">
            Sign In to Join a Team
          </a>
        </div>
      `;
    }
    return;
  }

  // If user is ADMIN
  if (user.role === 'admin') {
    for (const mount of mounts) {
      mount.innerHTML = `
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.92); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 16px; padding: 1.25rem 1.6rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-family: var(--font-display); font-size: 1rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
              Secretariat <em>Administration Active</em>
            </div>
            <div style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
              You have full administrative privileges to manage teams, assign heads, and review memberships.
            </div>
          </div>
          <a href="#/admin" class="btn-interactive" style="background: rgba(217, 180, 90, 0.2); border: 1px solid var(--gold); color: #ffffff; padding: 0.5rem 1.2rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; text-decoration: none;">
            Open Admin Board →
          </a>
        </div>
      `;
    }
    return;
  }

  // If user is HEAD
  if (user.role === 'head') {
    for (const mount of mounts) {
      mount.innerHTML = `
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.92); border: 1px solid rgba(217, 180, 90, 0.45); border-radius: 16px; padding: 1.25rem 1.6rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-family: var(--font-display); font-size: 1rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
              ★ Team Head <em>Leadership Active</em>
            </div>
            <div style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
              You are the designated Head of your team. Access your leadership board to review applications.
            </div>
          </div>
          <a href="#team-head" class="btn-interactive" style="background: var(--gold); color: #080a1e; padding: 0.5rem 1.2rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; text-decoration: none; box-shadow: 0 4px 15px var(--gold-glow);">
            Open My Team Dashboard →
          </a>
        </div>
      `;
    }
    return;
  }

  // Standard signed-in member (role is 'user', 'eb', or 'security')
  if (cachedTeamsList.length === 0) {
    const teamsRes = await fetchAllTeams();
    cachedTeamsList = teamsRes.data || [];
  }

  const currentTeamId = user.profile?.team_id || user.teamId || null;
  const currentTeamStatus = user.profile?.team_status || user.teamStatus || null;
  const currentTeam = cachedTeamsList.find((t) => t.id === currentTeamId);
  const teamName = currentTeam?.name || 'Assigned Team';

  // Group teams for dropdown
  const deptTeams = cachedTeamsList.filter((t) => t.kind === 'department');
  const commTeams = cachedTeamsList.filter((t) => t.kind === 'committee');

  const deptOptions = deptTeams
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join('');
  const commOptions = commTeams
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join('');

  const dropdownMarkup = `
    <select class="form-select join-team-select" required style="margin-bottom: 1rem; background: rgba(8, 10, 30, 0.95);">
      <option value="">Select a Department or Committee...</option>
      <optgroup label="Departments (Logistics, Media, Finance, etc.)">
        ${deptOptions}
      </optgroup>
      <optgroup label="Committees (UNSC, UNESCO, ECOSOC, etc.)">
        ${commOptions}
      </optgroup>
    </select>
  `;

  for (let i = 0; i < mounts.length; i++) {
    const mount = mounts[i];
    const mountId = `join-team-card-${i}`;

    let statusHtml = '';

    if (currentTeamStatus === 'pending') {
      statusHtml = `
        <div style="background: rgba(217, 180, 90, 0.1); border: 1.5px solid var(--gold); border-radius: 14px; padding: 1.4rem; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--gold); animation: pulse 1.8s infinite;"></span>
            <span style="font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--gold);">
              Application In Review
            </span>
          </div>
          <h4 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: #ffffff; text-transform: uppercase; margin-bottom: 0.4rem;">
            PENDING APPROVAL BY <em>${escapeHtml(teamName)} HEAD</em>
          </h4>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.8); line-height: 1.55;">
            Your request to join <strong>${escapeHtml(teamName)}</strong> has been registered. The department head will review your submission shortly.
          </p>
        </div>

        <details style="cursor: pointer; font-size: 0.85rem; color: var(--gold); margin-top: 0.75rem;">
          <summary style="font-family: var(--font-display); font-weight: 700; text-transform: uppercase;">Request a different team ▾</summary>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="form-group">
              <label class="form-label">Select Alternate Team:</label>
              ${dropdownMarkup}
            </div>
            <button type="button" class="form-submit-btn btn-interactive submit-team-request-btn" style="width: 100%;">
              Switch Team Request
            </button>
          </div>
        </details>
      `;
    } else if (currentTeamStatus === 'approved') {
      statusHtml = `
        <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid #10b981; border-radius: 14px; padding: 1.4rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="color: #34d399; font-size: 1.1rem;">✓</span>
            <span style="font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #34d399;">
              Confirmed Member
            </span>
          </div>
          <h4 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: #ffffff; text-transform: uppercase; margin-bottom: 0.4rem;">
            ACCEPTED INTO <em>${escapeHtml(teamName)}</em>
          </h4>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.85); line-height: 1.55;">
            Congratulations! You are officially recognized as an active member of the <strong>${escapeHtml(teamName)}</strong> organizing body for Monument MUN 2027.
          </p>
        </div>
      `;
    } else if (currentTeamStatus === 'rejected') {
      statusHtml = `
        <div style="background: rgba(239, 68, 68, 0.12); border: 1.5px solid #ef4444; border-radius: 14px; padding: 1.4rem; margin-bottom: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="color: #f87171;">✕</span>
            <span style="font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #f87171;">
              Status Update
            </span>
          </div>
          <h4 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: #ffffff; text-transform: uppercase; margin-bottom: 0.4rem;">
            NOT ACCEPTED THIS TIME
          </h4>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.8); line-height: 1.55;">
            Your request for <strong>${escapeHtml(teamName)}</strong> could not be accommodated for this round. You are welcome to submit a request for an alternate department or committee below.
          </p>
        </div>

        <div style="margin-top: 1rem;">
          <label class="form-label">Request Another Team:</label>
          ${dropdownMarkup}
          <button type="button" class="form-submit-btn btn-interactive submit-team-request-btn" style="width: 100%;">
            Submit New Team Request
          </button>
        </div>
      `;
    } else {
      // No team requested yet
      statusHtml = `
        <p style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.78); margin-bottom: 1.25rem; line-height: 1.55;">
          Select the organizing department or committee you wish to join for Monument MUN 2027. Your request will be transmitted directly to the department head.
        </p>
        <div class="form-group">
          <label class="form-label">Choose Department or Committee *</label>
          ${dropdownMarkup}
        </div>
        <button type="button" class="form-submit-btn btn-interactive submit-team-request-btn" style="width: 100%;">
          Request Team Assignment
        </button>
      `;
    }

    mount.innerHTML = `
      <div id="${mountId}" class="tilt-card" style="background: rgba(8, 10, 30, 0.94); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 18px; padding: clamp(1.4rem, 4vw, 2.2rem); box-shadow: 0 10px 30px rgba(0,0,0,0.45);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <span class="eyebrow" style="margin-bottom: 0.25rem;">Conference Participation</span>
            <h3 style="font-family: var(--font-display); font-size: clamp(1.2rem, 3.5vw, 1.55rem); font-weight: 800; text-transform: uppercase; color: #ffffff;">
              JOIN A <em>CONFERENCE TEAM.</em>
            </h3>
          </div>
          <div style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 9999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; color: rgba(242, 244, 255, 0.75);">
            Account: <strong>${escapeHtml(user.email)}</strong>
          </div>
        </div>

        <div class="team-feedback-banner status-banner" style="display: none; margin-bottom: 1rem;"></div>

        ${statusHtml}
      </div>
    `;

    // Wire submit button
    const card = document.getElementById(mountId);
    if (!card) continue;

    const feedbackBanner = card.querySelector('.team-feedback-banner') as HTMLElement | null;
    const submitBtn = card.querySelector('.submit-team-request-btn') as HTMLButtonElement | null;
    const selectElem = card.querySelector('.join-team-select') as HTMLSelectElement | null;

    submitBtn?.addEventListener('click', async () => {
      const selectedTeamId = selectElem?.value || '';
      if (!selectedTeamId) {
        if (feedbackBanner) {
          feedbackBanner.className = 'status-banner status-error';
          feedbackBanner.textContent = 'Please choose a department or committee from the list.';
          feedbackBanner.style.display = 'block';
        }
        selectElem?.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Request...';

      const res = await requestTeamRpc(selectedTeamId);

      if (!res.success) {
        if (feedbackBanner) {
          feedbackBanner.className = 'status-banner status-error';
          feedbackBanner.textContent = res.error || 'Failed to submit request.';
          feedbackBanner.style.display = 'block';
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Team Assignment';
        return;
      }

      if (feedbackBanner) {
        feedbackBanner.className = 'status-banner status-success';
        feedbackBanner.textContent = '✓ Your team request was dispatched to the head for review!';
        feedbackBanner.style.display = 'block';
      }

      // Refresh profile to reflect pending state
      await refreshCurrentUserProfile();
      await renderJoinTeamPanel(getCachedUser());
    });
  }
}

/**
 * Plain 404 screen that does NOT leak that an admin/head page exists
 */
function renderPlain404(container: HTMLElement): void {
  container.innerHTML = `
    <div style="min-height: 75vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem 1.5rem; color: #f2f4ff; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="font-size: clamp(3rem, 8vw, 5rem); font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.04em; color: #94a3b8;">404</h1>
      <h2 style="font-size: clamp(1.2rem, 3vw, 1.6rem); font-weight: 600; margin-bottom: 1rem; color: #f8fafc;">Page not found</h2>
      <p style="font-size: 1rem; color: #94a3b8; max-width: 440px; margin-bottom: 2rem; line-height: 1.5;">
        The requested URL was not found on this server. Please check the address or return to the homepage.
      </p>
      <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; text-decoration: none; padding: 0.65rem 1.5rem; border-radius: 9999px; font-size: 0.9rem; font-weight: 500; white-space: nowrap;">
        Return to Home
      </a>
    </div>
  `;
}

// ====================================================
// HEAD DASHBOARD (#team-head)
// Only for role 'head' (and admins)
// ====================================================

export async function renderTeamHeadRoute(user: CurrentUser | null, loading: boolean): Promise<void> {
  document.body.classList.add('admin-mode-active');

  const viewHome = document.getElementById('view-home');
  const viewCommittees = document.getElementById('view-committees');
  const viewApply = document.getElementById('view-apply');
  const viewAdmin = document.getElementById('view-admin');
  const viewTeamHead = document.getElementById('view-team-head');
  const dotNav = document.getElementById('dot-nav');
  const mobileCounter = document.getElementById('mobile-stop-counter');

  if (viewHome) viewHome.classList.remove('active-view');
  if (viewCommittees) viewCommittees.classList.remove('active-view');
  if (viewApply) viewApply.classList.remove('active-view');
  if (viewAdmin) viewAdmin.classList.remove('active-view');
  if (dotNav) dotNav.classList.add('nav-hidden');
  if (mobileCounter) mobileCounter.classList.remove('visible');

  if (!viewTeamHead) return;
  viewTeamHead.classList.add('active-view');
  window.scrollTo(0, 0);

  if (loading) {
    viewTeamHead.innerHTML = `
      <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center; color: var(--gold); font-family: var(--font-display);">
        <div style="text-align: center;">
          <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
          <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Authorizing leadership portal...</p>
        </div>
      </div>
    `;
    return;
  }

  // Not logged in -> 404
  if (!user) {
    renderPlain404(viewTeamHead);
    return;
  }

  // Only role 'head' or 'admin'
  if (user.role !== 'head' && user.role !== 'admin') {
    renderPlain404(viewTeamHead);
    return;
  }

  // Determine teamId
  let targetTeamId = user.profile?.team_id || user.teamId || null;

  // If admin has no team_id, load teams and default to first team or provide selector
  let teamsForAdmin: Team[] = [];
  if (user.role === 'admin' && !targetTeamId) {
    const teamsRes = await fetchAllTeams();
    teamsForAdmin = teamsRes.data;
    if (teamsForAdmin.length > 0) {
      targetTeamId = teamsForAdmin[0].id;
    }
  }

  if (!targetTeamId) {
    viewTeamHead.innerHTML = `
      <div style="max-width: 720px; margin: 4rem auto; padding: 2rem; background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; text-align: center;">
        <h2 style="font-family: var(--font-display); font-size: 1.5rem; color: #ffffff; text-transform: uppercase; margin-bottom: 0.75rem;">
          No Team Assigned Yet
        </h2>
        <p style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.75); line-height: 1.55; margin-bottom: 1.5rem;">
          Your account has role 'head', but no team has been linked to your profile in the database. Please contact an administrator to assign your team.
        </p>
        <a href="#/" class="btn-interactive" style="background: var(--gold); color: #080a1e; padding: 0.5rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; text-decoration: none;">
          Return to Site
        </a>
      </div>
    `;
    return;
  }

  await renderTeamHeadContent(viewTeamHead, user, targetTeamId, teamsForAdmin);
}

async function renderTeamHeadContent(
  container: HTMLElement,
  user: CurrentUser,
  teamId: string,
  adminAvailableTeams: Team[] = []
): Promise<void> {
  container.innerHTML = `
    <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center; color: var(--gold); font-family: var(--font-display);">
      <div style="text-align: center;">
        <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
        <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Loading team roster & member requests...</p>
      </div>
    </div>
  `;

  const [teamRes, membersRes] = await Promise.all([
    fetchTeamById(teamId),
    fetchTeamMembers(teamId)
  ]);

  const team = teamRes.data;
  const members = membersRes.data;

  if (!team) {
    container.innerHTML = `
      <div style="max-width: 600px; margin: 4rem auto; text-align: center; color: #f2f4ff; padding: 2rem;">
        <h3 style="font-family: var(--font-display); font-size: 1.4rem; margin-bottom: 0.5rem;">Team Not Found</h3>
        <p style="color: rgba(242, 244, 255, 0.7); margin-bottom: 1.5rem;">The designated team (ID: ${escapeHtml(teamId)}) could not be located.</p>
        <a href="#/" style="color: var(--gold); text-decoration: underline;">Return to Home</a>
      </div>
    `;
    return;
  }

  // Filter members by status
  const pending = members.filter((m) => m.team_status === 'pending');
  const approved = members.filter((m) => m.team_status === 'approved' && m.role !== 'head');
  const rejected = members.filter((m) => m.team_status === 'rejected');

  let adminTeamSwitcher = '';
  if (user.role === 'admin' && adminAvailableTeams.length > 1) {
    const options = adminAvailableTeams
      .map((t) => `<option value="${t.id}" ${t.id === teamId ? 'selected' : ''}>${escapeHtml(t.name)} (${t.kind})</option>`)
      .join('');
    adminTeamSwitcher = `
      <div style="margin-bottom: 1.5rem; background: rgba(217, 180, 90, 0.08); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 12px; padding: 0.85rem 1.25rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
        <span style="font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--gold); white-space: nowrap;">
          Admin View Team:
        </span>
        <select id="head-admin-team-select" class="form-select" style="max-width: 300px; padding: 0.35rem 0.75rem; font-size: 0.85rem; height: auto;">
          ${options}
        </select>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; padding: 2rem 0 5rem;">
      <!-- Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(217, 180, 90, 0.25); padding-bottom: 1.5rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
            <span class="eyebrow" style="margin-bottom: 0;">Department Head Portal</span>
            <span style="background: rgba(217, 180, 90, 0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.15rem 0.65rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">
              ${escapeHtml(team.kind)}
            </span>
          </div>
          <h1 style="font-family: var(--font-display); font-size: clamp(1.8rem, 4.5vw, 2.75rem); font-weight: 800; text-transform: uppercase; color: #ffffff; line-height: 1.1;">
            MY TEAM · <em>${escapeHtml(team.name)}</em>
          </h1>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.85); padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; white-space: nowrap;">
            ← Return to Site
          </a>
          <button type="button" id="head-refresh-btn" class="btn-interactive" style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            ↺ Refresh Roster
          </button>
        </div>
      </div>

      ${adminTeamSwitcher}

      <!-- Counts Bar -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.35rem; white-space: nowrap;">Pending Requests</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: var(--gold);">${pending.length}</div>
        </div>

        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #34d399; margin-bottom: 0.35rem; white-space: nowrap;">Approved Members</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #34d399;">${approved.length}</div>
        </div>

        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #f87171; margin-bottom: 0.35rem; white-space: nowrap;">Rejected</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #f87171;">${rejected.length}</div>
        </div>
      </div>

      <div id="head-action-feedback" class="status-banner" style="display: none; margin-bottom: 1.5rem;"></div>

      <!-- SECTION 1: PENDING REQUESTS -->
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem); margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
              PENDING REQUESTS <em>(${pending.length})</em>
            </h2>
            <p style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
              Review delegates and staff members requesting to join ${escapeHtml(team.name)}.
            </p>
          </div>
        </div>

        <div>
          ${renderPendingRequestsList(pending)}
        </div>
      </div>

      <!-- SECTION 2: APPROVED MEMBERS -->
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem); margin-bottom: 2rem;">
        <div style="margin-bottom: 1.25rem;">
          <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            APPROVED TEAM MEMBERS <em>(${approved.length})</em>
          </h2>
          <p style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
            Active organizers and coordinators currently assigned to ${escapeHtml(team.name)}.
          </p>
        </div>

        <div>
          ${renderApprovedMembersList(approved, team.name)}
        </div>
      </div>

      <!-- SECTION 3: REJECTED APPLICANTS -->
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem);">
        <div style="margin-bottom: 1.25rem;">
          <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            REJECTED <em>(${rejected.length})</em>
          </h2>
          <p style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
            Declined applications. You can reconsider and approve them at any time.
          </p>
        </div>

        <div>
          ${renderRejectedMembersList(rejected)}
        </div>
      </div>
    </div>
  `;

  attachHeadDashboardHandlers(container, user, teamId, adminAvailableTeams);
}

function renderPendingRequestsList(pending: Profile[]): string {
  if (pending.length === 0) {
    return `
      <div style="text-align: center; padding: 2.5rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.12); color: rgba(242, 244, 255, 0.6);">
        <p style="font-size: 0.95rem; margin-bottom: 0.25rem;">No pending member requests for your team at this moment.</p>
        <span style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.4);">New applications will appear here in real time.</span>
      </div>
    `;
  }

  return pending
    .map((member) => {
      const name = member.full_name || 'Candidate';
      const email = member.email || 'No email';
      const positionBadge = member.eb_position
        ? `<span style="background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.15rem 0.55rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">✦ EB: ${escapeHtml(member.eb_position)}</span>`
        : '';

      return `
        <div class="head-member-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 12px; padding: 1.15rem; margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
              <span style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: #ffffff;">${escapeHtml(name)}</span>
              ${positionBadge}
            </div>
            <div style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.7); margin-bottom: 0.2rem;">
              ✉ ${escapeHtml(email)}
            </div>
            <div style="font-size: 0.72rem; color: rgba(242, 244, 255, 0.45);">
              Requested: ${formatDate(member.created_at)}
            </div>
          </div>

          <div style="display: flex; gap: 0.65rem; align-items: center;">
            <button type="button" class="btn-interactive head-decision-btn" data-user-id="${escapeHtml(member.id)}" data-decision="approved" data-name="${escapeHtml(name)}" style="background: rgba(16, 185, 129, 0.22); border: 1px solid #10b981; color: #34d399; padding: 0.45rem 1.1rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              ✓ Accept
            </button>
            <button type="button" class="btn-interactive head-decision-btn" data-user-id="${escapeHtml(member.id)}" data-decision="rejected" data-name="${escapeHtml(name)}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.45rem 1rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              ✕ Reject
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderApprovedMembersList(approved: Profile[], teamName: string): string {
  if (approved.length === 0) {
    return `
      <div style="text-align: center; padding: 2.5rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.12); color: rgba(242, 244, 255, 0.6);">
        <p style="font-size: 0.95rem; margin-bottom: 0.25rem;">No active approved members yet.</p>
        <span style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.4);">Accept candidate requests above to build your team roster.</span>
      </div>
    `;
  }

  return approved
    .map((member) => {
      const name = member.full_name || 'Member';
      const email = member.email || 'No email';
      const positionBadge = member.eb_position
        ? `<span style="background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.15rem 0.55rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">✦ EB: ${escapeHtml(member.eb_position)}</span>`
        : '';

      return `
        <div class="head-member-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 1.15rem; margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
              <span style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: #ffffff;">${escapeHtml(name)}</span>
              ${positionBadge}
            </div>
            <div style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.7); margin-bottom: 0.2rem;">
              ✉ ${escapeHtml(email)}
            </div>
            <div style="font-size: 0.72rem; color: rgba(242, 244, 255, 0.45);">
              Member since: ${formatDate(member.created_at)}
            </div>
          </div>

          <div>
            <button type="button" class="btn-interactive head-remove-btn" data-user-id="${escapeHtml(member.id)}" data-name="${escapeHtml(name)}" data-team="${escapeHtml(teamName)}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 0.95rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              Remove Member
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderRejectedMembersList(rejected: Profile[]): string {
  if (rejected.length === 0) {
    return `
      <div style="text-align: center; padding: 2rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; color: rgba(242, 244, 255, 0.5); font-size: 0.88rem;">
        No rejected applicants on record.
      </div>
    `;
  }

  return rejected
    .map((member) => {
      const name = member.full_name || 'Applicant';
      const email = member.email || 'No email';

      return `
        <div class="head-member-card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 0.9rem 1.15rem; margin-bottom: 0.65rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div style="font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; color: #f2f4ff; margin-bottom: 0.15rem;">${escapeHtml(name)}</div>
            <div style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.6);">${escapeHtml(email)}</div>
          </div>

          <div>
            <button type="button" class="btn-interactive head-decision-btn" data-user-id="${escapeHtml(member.id)}" data-decision="approved" data-name="${escapeHtml(name)}" style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: #ffffff; padding: 0.35rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              Reconsider & Accept
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function attachHeadDashboardHandlers(
  container: HTMLElement,
  user: CurrentUser,
  teamId: string,
  adminAvailableTeams: Team[]
): void {
  const feedback = document.getElementById('head-action-feedback');
  const refreshBtn = document.getElementById('head-refresh-btn');
  const adminSwitcher = document.getElementById('head-admin-team-select') as HTMLSelectElement | null;

  refreshBtn?.addEventListener('click', async () => {
    await renderTeamHeadContent(container, user, teamId, adminAvailableTeams);
  });

  adminSwitcher?.addEventListener('change', async () => {
    const nextTeamId = adminSwitcher.value;
    if (nextTeamId) {
      await renderTeamHeadContent(container, user, nextTeamId, adminAvailableTeams);
    }
  });

  // Decision buttons (Accept / Reject / Reconsider)
  const decisionBtns = container.querySelectorAll('.head-decision-btn');
  decisionBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetUserId = btn.getAttribute('data-user-id') || '';
      const decision = btn.getAttribute('data-decision') as 'approved' | 'rejected';
      const memberName = btn.getAttribute('data-name') || 'Member';

      if (!targetUserId || !decision) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = decision === 'approved' ? 'Accepting...' : 'Rejecting...';

      const res = await reviewTeamMemberRpc(targetUserId, decision);

      if (res.success) {
        if (feedback) {
          feedback.className = `status-banner status-${decision === 'approved' ? 'success' : 'info'}`;
          feedback.textContent = `✓ ${memberName} was marked as ${decision}.`;
          feedback.style.display = 'block';
        }
        await renderTeamHeadContent(container, user, teamId, adminAvailableTeams);
      } else {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to process decision.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = decision === 'approved' ? '✓ Accept' : '✕ Reject';
      }
    });
  });

  // Remove button
  const removeBtns = container.querySelectorAll('.head-remove-btn');
  removeBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetUserId = btn.getAttribute('data-user-id') || '';
      const memberName = btn.getAttribute('data-name') || 'Member';
      const teamName = btn.getAttribute('data-team') || 'team';

      if (!targetUserId) return;

      const ok = window.confirm(`Are you sure you want to remove ${memberName} from ${teamName}?`);
      if (!ok) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Removing...';

      const res = await reviewTeamMemberRpc(targetUserId, 'removed');

      if (res.success) {
        if (feedback) {
          feedback.className = 'status-banner status-info';
          feedback.textContent = `✓ ${memberName} was removed from ${teamName}.`;
          feedback.style.display = 'block';
        }
        await renderTeamHeadContent(container, user, teamId, adminAvailableTeams);
      } else {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to remove member.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = 'Remove Member';
      }
    });
  });
}

// ====================================================
// ADMIN BOARD ROUTE & DASHBOARD
// ====================================================

export async function renderAdminRoute(user: CurrentUser | null, loading: boolean): Promise<void> {
  document.body.classList.add('admin-mode-active');

  const viewHome = document.getElementById('view-home');
  const viewCommittees = document.getElementById('view-committees');
  const viewApply = document.getElementById('view-apply');
  const viewAdmin = document.getElementById('view-admin');
  const viewTeamHead = document.getElementById('view-team-head');
  const dotNav = document.getElementById('dot-nav');
  const mobileCounter = document.getElementById('mobile-stop-counter');

  if (viewHome) viewHome.classList.remove('active-view');
  if (viewCommittees) viewCommittees.classList.remove('active-view');
  if (viewApply) viewApply.classList.remove('active-view');
  if (viewTeamHead) viewTeamHead.classList.remove('active-view');
  if (dotNav) dotNav.classList.add('nav-hidden');
  if (mobileCounter) mobileCounter.classList.remove('visible');

  if (!viewAdmin) return;
  viewAdmin.classList.add('active-view');
  window.scrollTo(0, 0);

  if (loading) {
    viewAdmin.innerHTML = `
      <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center; color: var(--gold); font-family: var(--font-display);">
        <div style="text-align: center;">
          <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
          <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Authorizing access...</p>
        </div>
      </div>
    `;
    return;
  }

  // 1. Logged out visitor on /admin -> show Staff Portal Auth (Sign up, Sign in, Reset password)
  if (!user) {
    renderStaffPortalAuth(viewAdmin);
    return;
  }

  // 2. Logged in, but NOT an admin -> show "Your Executive Board profile" card
  if (user.role !== 'admin') {
    renderEbProfileCard(viewAdmin, user);
    return;
  }

  // 3. User is verified ADMIN -> Load registrations, staff, EB profiles, teams, and allowlist
  viewAdmin.innerHTML = `
    <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center; color: var(--gold); font-family: var(--font-display);">
      <div style="text-align: center;">
        <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
        <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Loading Secretariat Control Board...</p>
      </div>
    </div>
  `;

  await refreshAdminData();
  renderAdminDashboard(viewAdmin, user);
}

/**
 * Fetch registrations, staff profiles, EB profiles, teams, and allowlist for the admin board
 */
async function refreshAdminData(): Promise<void> {
  const [regRes, staffRes, ebRes, teamsRes, allowlistRes] = await Promise.all([
    fetchAllRegistrations(),
    fetchStaffProfiles(),
    fetchEbProfiles(),
    fetchAllTeams(),
    fetchStaffAllowlist()
  ]);

  if (regRes.data) {
    adminRegistrations = regRes.data;
  }
  if (staffRes.data) {
    adminStaff = staffRes.data;
  }
  if (ebRes.data) {
    adminEbProfiles = ebRes.data;
  }
  if (teamsRes.data) {
    adminTeams = teamsRes.data;
  }
  if (allowlistRes.data) {
    adminStaffAllowlist = allowlistRes.data;
  }
}

let staffPortalAuthTab: 'signup' | 'signin' | 'reset' = 'signup';

/**
 * Staff Portal Authentication for /admin and #admin (Logged-out visitors)
 * Offers: Sign Up, Sign In, Reset Password
 */
function renderStaffPortalAuth(container: HTMLElement): void {
  const isSignUp = staffPortalAuthTab === 'signup';
  const isSignIn = staffPortalAuthTab === 'signin';
  const isReset = staffPortalAuthTab === 'reset';

  container.innerHTML = `
    <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 2.5rem 1rem;">
      <div class="tilt-card" style="width: 100%; max-width: 500px; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: var(--card-radius); padding: clamp(1.75rem, 5vw, 2.5rem); box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
        <div style="text-align: center; margin-bottom: 1.75rem;">
          <span class="eyebrow">Monument MUN 2027</span>
          <h2 style="font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.4rem; letter-spacing: 0.02em;">
            STAFF <em>PORTAL.</em>
          </h2>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.72); line-height: 1.5;">
            Exclusive portal for Executive Board, Secretariat, and Staff members.
          </p>
        </div>

        <!-- Auth Tabs: Sign Up, Sign In, Reset Password -->
        <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; margin-bottom: 1.5rem; border: 1px solid rgba(217, 180, 90, 0.25);">
          <button type="button" id="staff-tab-signup-btn" class="btn-interactive" style="flex: 1; padding: 0.6rem 0.5rem; border: none; border-radius: 9999px; background: ${isSignUp ? 'var(--gold)' : 'transparent'}; color: ${isSignUp ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease;">
            Sign Up
          </button>
          <button type="button" id="staff-tab-signin-btn" class="btn-interactive" style="flex: 1; padding: 0.6rem 0.5rem; border: none; border-radius: 9999px; background: ${isSignIn ? 'var(--gold)' : 'transparent'}; color: ${isSignIn ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease;">
            Sign In
          </button>
          <button type="button" id="staff-tab-reset-btn" class="btn-interactive" style="flex: 1; padding: 0.6rem 0.5rem; border: none; border-radius: 9999px; background: ${isReset ? 'var(--gold)' : 'transparent'}; color: ${isReset ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.2s ease;">
            Reset Password
          </button>
        </div>

        <div id="staff-portal-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

        <!-- 1. SIGN UP FORM -->
        <form id="staff-signup-form" style="${isSignUp ? 'display: block;' : 'display: none;'}" novalidate>
          <div class="form-group">
            <label class="form-label" for="staff-signup-name">Full Name *</label>
            <input type="text" id="staff-signup-name" class="form-input" placeholder="e.g. Maya Lin" required autocomplete="name" />
          </div>

          <div class="form-group">
            <label class="form-label" for="staff-signup-email">Authorized Email Address *</label>
            <input type="email" id="staff-signup-email" class="form-input" placeholder="name@domain.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label" for="staff-signup-password">Password *</label>
            <input type="password" id="staff-signup-password" class="form-input" placeholder="At least 6 characters" required autocomplete="new-password" />
          </div>

          <div class="form-group">
            <label class="form-label" for="staff-signup-confirm">Confirm Password *</label>
            <input type="password" id="staff-signup-confirm" class="form-input" placeholder="Re-enter your password" required autocomplete="new-password" />
          </div>

          <button type="submit" id="staff-signup-submit-btn" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
            Create Staff Account
          </button>
        </form>

        <!-- 2. SIGN IN FORM -->
        <form id="staff-signin-form" style="${isSignIn ? 'display: block;' : 'display: none;'}" novalidate>
          <div class="form-group">
            <label class="form-label" for="staff-signin-email">Email Address *</label>
            <input type="email" id="staff-signin-email" class="form-input" placeholder="staff@domain.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label" for="staff-signin-password">Password *</label>
            <input type="password" id="staff-signin-password" class="form-input" placeholder="Your password" required autocomplete="current-password" />
          </div>

          <button type="submit" id="staff-signin-submit-btn" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
            Authenticate & Proceed
          </button>
        </form>

        <!-- 3. RESET PASSWORD FORM -->
        <form id="staff-reset-form" style="${isReset ? 'display: block;' : 'display: none;'}" novalidate>
          <p style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.75); line-height: 1.5; margin-bottom: 1.25rem;">
            Enter your authorized email address. We will send a secure password reset link to regain access.
          </p>

          <div class="form-group">
            <label class="form-label" for="staff-reset-email">Account Email *</label>
            <input type="email" id="staff-reset-email" class="form-input" placeholder="name@domain.com" required autocomplete="email" />
          </div>

          <button type="submit" id="staff-reset-submit-btn" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
            Send Reset Instructions
          </button>
        </form>

        <div style="text-align: center; margin-top: 1.5rem;">
          <a href="#/" style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.6); text-decoration: none;">← Return to site</a>
        </div>
      </div>
    </div>
  `;

  // Attach tab switch handlers
  const tabSignupBtn = document.getElementById('staff-tab-signup-btn');
  const tabSigninBtn = document.getElementById('staff-tab-signin-btn');
  const tabResetBtn = document.getElementById('staff-tab-reset-btn');
  const feedback = document.getElementById('staff-portal-feedback');

  tabSignupBtn?.addEventListener('click', () => {
    staffPortalAuthTab = 'signup';
    renderStaffPortalAuth(container);
  });

  tabSigninBtn?.addEventListener('click', () => {
    staffPortalAuthTab = 'signin';
    renderStaffPortalAuth(container);
  });

  tabResetBtn?.addEventListener('click', () => {
    staffPortalAuthTab = 'reset';
    renderStaffPortalAuth(container);
  });

  // Attach Sign Up submit handler
  const signupForm = document.getElementById('staff-signup-form') as HTMLFormElement | null;
  const signupSubmitBtn = document.getElementById('staff-signup-submit-btn') as HTMLButtonElement | null;

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const name = (document.getElementById('staff-signup-name') as HTMLInputElement | null)?.value.trim() || '';
    const email = (document.getElementById('staff-signup-email') as HTMLInputElement | null)?.value.trim().toLowerCase() || '';
    const password = (document.getElementById('staff-signup-password') as HTMLInputElement | null)?.value || '';
    const confirm = (document.getElementById('staff-signup-confirm') as HTMLInputElement | null)?.value || '';

    if (!name || !email || !password || !confirm) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please fill out all fields.';
      feedback.style.display = 'block';
      return;
    }

    if (password.length < 6) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Password must be at least 6 characters.';
      feedback.style.display = 'block';
      return;
    }

    if (password !== confirm) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Passwords do not match.';
      feedback.style.display = 'block';
      return;
    }

    if (signupSubmitBtn) {
      signupSubmitBtn.disabled = true;
      signupSubmitBtn.textContent = 'Verifying Authorization...';
    }

    // Step 1: Pre-check is_email_allowed RPC
    const isAllowed = await isEmailAllowedRpc(email);
    if (!isAllowed) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = "You can't sign up because your email wasn't found in the Monument MUN team list. Use the exact email you gave the Secretariat, or contact an admin.";
      feedback.style.display = 'block';
      if (signupSubmitBtn) {
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.textContent = 'Create Staff Account';
      }
      return;
    }

    if (signupSubmitBtn) {
      signupSubmitBtn.textContent = 'Creating Account...';
    }

    // Step 2: Call signUpWithEmail
    const res = await signUpWithEmail(name, email, password);

    if (res.error) {
      feedback.className = 'status-banner status-error';
      if (
        res.error.includes('Database error saving new user') ||
        res.error.includes("wasn't found in the Monument MUN team list")
      ) {
        feedback.textContent = "You can't sign up because your email wasn't found in the Monument MUN team list. Use the exact email you gave the Secretariat, or contact an admin.";
      } else {
        feedback.textContent = res.error;
      }
      feedback.style.display = 'block';
      if (signupSubmitBtn) {
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.textContent = 'Create Staff Account';
      }
      return;
    }

    // Step 3: Immediate sign-in upon sign-up
    await refreshCurrentUserProfile();
    const currentUser = getCachedUser();
    renderAdminRoute(currentUser, false);
  });

  // Attach Sign In submit handler
  const signinForm = document.getElementById('staff-signin-form') as HTMLFormElement | null;
  const signinSubmitBtn = document.getElementById('staff-signin-submit-btn') as HTMLButtonElement | null;

  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const email = (document.getElementById('staff-signin-email') as HTMLInputElement | null)?.value.trim() || '';
    const password = (document.getElementById('staff-signin-password') as HTMLInputElement | null)?.value || '';

    if (!email || !password) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please enter both email and password.';
      feedback.style.display = 'block';
      return;
    }

    if (signinSubmitBtn) {
      signinSubmitBtn.disabled = true;
      signinSubmitBtn.textContent = 'Authenticating...';
    }

    const res = await signInWithEmail(email, password);

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      if (signinSubmitBtn) {
        signinSubmitBtn.disabled = false;
        signinSubmitBtn.textContent = 'Authenticate & Proceed';
      }
      return;
    }

    const cached = getCachedUser();
    renderAdminRoute(cached, false);
  });

  // Attach Reset Password submit handler
  const resetForm = document.getElementById('staff-reset-form') as HTMLFormElement | null;
  const resetSubmitBtn = document.getElementById('staff-reset-submit-btn') as HTMLButtonElement | null;

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const email = (document.getElementById('staff-reset-email') as HTMLInputElement | null)?.value.trim() || '';

    if (!email) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please enter your email address.';
      feedback.style.display = 'block';
      return;
    }

    if (resetSubmitBtn) {
      resetSubmitBtn.disabled = true;
      resetSubmitBtn.textContent = 'Sending Link...';
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/admin'
      });

      if (error) {
        feedback.className = 'status-banner status-error';
        feedback.textContent = error.message;
        feedback.style.display = 'block';
      } else {
        feedback.className = 'status-banner status-success';
        feedback.textContent = '✓ Password reset instructions have been dispatched to your email.';
        feedback.style.display = 'block';
      }
    } catch (err: unknown) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = err instanceof Error ? err.message : 'Failed to send reset link.';
      feedback.style.display = 'block';
    } finally {
      if (resetSubmitBtn) {
        resetSubmitBtn.disabled = false;
        resetSubmitBtn.textContent = 'Send Reset Instructions';
      }
    }
  });
}

/**
 * Render "Your Executive Board profile" card for authenticated non-admin users visiting /admin or #admin.
 * They must NEVER see the admin board or any admin controls.
 */
function renderEbProfileCard(container: HTMLElement, user: CurrentUser): void {
  const position = user.profile?.eb_position || 'Executive Board Member';
  const roleDisplay = user.role.toUpperCase();

  container.innerHTML = `
    <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 2.5rem 1rem;">
      <div class="tilt-card" style="width: 100%; max-width: 540px; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: var(--card-radius); padding: clamp(1.75rem, 5vw, 2.75rem); box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
        <div style="text-align: center; margin-bottom: 2rem;">
          <span class="eyebrow">Monument MUN 2027 · Staff Portal</span>
          <h2 style="font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.1rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem; letter-spacing: 0.02em;">
            YOUR EXECUTIVE BOARD <em>PROFILE.</em>
          </h2>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.72); line-height: 1.5;">
            Verified conference credentials and active staff standing.
          </p>
        </div>

        <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 14px; padding: 1.5rem; margin-bottom: 2rem; display: flex; flex-direction: column; gap: 1.15rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 1rem;">
            <div>
              <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.25rem;">Full Name</div>
              <div style="font-family: var(--font-display); font-size: 1.3rem; font-weight: 800; color: #ffffff;">${escapeHtml(user.fullName)}</div>
            </div>
            <span style="background: rgba(217, 180, 90, 0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.25rem 0.75rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;">
              ${escapeHtml(roleDisplay)}
            </span>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.25rem;">Declared Position</div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--gold);">
              ${escapeHtml(position)}
            </div>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.25rem;">Authorized Email</div>
            <div style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.85); font-family: monospace;">
              ${escapeHtml(user.email)}
            </div>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.25rem;">Access Level</div>
            <div style="font-size: 0.9rem; color: #ffffff; text-transform: capitalize;">
              ${escapeHtml(user.role)} Staff Privileges
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap;">
          <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; text-decoration: none;">
            ← Return to Site
          </a>

          <button type="button" id="eb-profile-signout-btn" class="btn-interactive" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.65rem 1.5rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  `;

  const signoutBtn = document.getElementById('eb-profile-signout-btn');
  signoutBtn?.addEventListener('click', async () => {
    await signOut();
    renderAdminRoute(null, false);
  });
}

/**
 * Render the full Admin Board with 3 Tabs:
 * 1. Delegate Applications
 * 2. Executive Board Members
 * 3. Teams (Committees & Departments)
 */
function renderAdminDashboard(container: HTMLElement, user: CurrentUser): void {
  const regStats: AdminStats = computeAdminStats(adminRegistrations);
  const ebStats: EbStats = computeEbStats(adminEbProfiles);

  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; padding: 2rem 0 5rem;">
      <!-- Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(217, 180, 90, 0.25); padding-bottom: 1.5rem;">
        <div>
          <span class="eyebrow">Monument MUN 2027 · Internal Administration</span>
          <h1 style="font-family: var(--font-display); font-size: clamp(1.8rem, 4.5vw, 2.75rem); font-weight: 800; text-transform: uppercase; color: #ffffff; line-height: 1.1;">
            SECRETARIAT <em>ADMIN BOARD.</em>
          </h1>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: nowrap; white-space: nowrap;">
          <div style="text-align: right;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #ffffff; white-space: nowrap;">${escapeHtml(user.fullName)}</div>
            <div style="font-size: 0.72rem; color: var(--gold); text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap;">Administrator</div>
          </div>
          <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; padding: 0.45rem 0.9rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; white-space: nowrap;">
            Site
          </a>
          <button type="button" id="admin-signout-btn" class="btn-interactive" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Log Out
          </button>
        </div>
      </div>

      <!-- Main Navigation Tabs: Delegate Applications vs EB Members vs Teams -->
      <div style="display: flex; gap: 0.75rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 0.75rem; overflow-x: auto;">
        <button type="button" id="admin-tab-delegates" class="btn-interactive" style="background: ${adminActiveTab === 'delegates' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.05)'}; color: ${adminActiveTab === 'delegates' ? '#080a1e' : '#f2f4ff'}; border: 1px solid ${adminActiveTab === 'delegates' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.12)'}; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>Delegate Applications</span>
          <span style="background: ${adminActiveTab === 'delegates' ? '#080a1e' : 'rgba(217, 180, 90, 0.25)'}; color: ${adminActiveTab === 'delegates' ? 'var(--gold)' : '#ffffff'}; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.72rem;">${regStats.total}</span>
        </button>

        <button type="button" id="admin-tab-eb" class="btn-interactive" style="background: ${adminActiveTab === 'eb' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.05)'}; color: ${adminActiveTab === 'eb' ? '#080a1e' : '#f2f4ff'}; border: 1px solid ${adminActiveTab === 'eb' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.12)'}; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>EB Members & Heads</span>
          <span style="background: ${adminActiveTab === 'eb' ? '#080a1e' : 'rgba(217, 180, 90, 0.25)'}; color: ${adminActiveTab === 'eb' ? 'var(--gold)' : '#ffffff'}; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.72rem;">${ebStats.total}</span>
        </button>

        <button type="button" id="admin-tab-teams" class="btn-interactive" style="background: ${adminActiveTab === 'teams' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.05)'}; color: ${adminActiveTab === 'teams' ? '#080a1e' : '#f2f4ff'}; border: 1px solid ${adminActiveTab === 'teams' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.12)'}; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>Teams (${adminTeams.length})</span>
        </button>

        <button type="button" id="admin-tab-allowlist" class="btn-interactive" style="background: ${adminActiveTab === 'allowlist' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.05)'}; color: ${adminActiveTab === 'allowlist' ? '#080a1e' : '#f2f4ff'}; border: 1px solid ${adminActiveTab === 'allowlist' ? 'var(--gold)' : 'rgba(255, 255, 255, 0.12)'}; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>Team Email List</span>
          <span style="background: ${adminActiveTab === 'allowlist' ? '#080a1e' : 'rgba(217, 180, 90, 0.25)'}; color: ${adminActiveTab === 'allowlist' ? 'var(--gold)' : '#ffffff'}; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.72rem;">${adminStaffAllowlist.length}</span>
        </button>
      </div>

      <!-- TAB CONTENT CONTAINER -->
      <div id="admin-tab-content">
        ${
          adminActiveTab === 'delegates'
            ? renderDelegatesSectionMarkup(regStats)
            : adminActiveTab === 'eb'
              ? renderEbSectionMarkup(ebStats, user)
              : adminActiveTab === 'teams'
                ? renderTeamsSectionMarkup()
                : renderAllowlistSectionMarkup()
        }
      </div>
    </div>
  `;

  attachAdminDashboardHandlers(container, user);
}

/**
 * Render the Delegate Applications Section Markup
 */
function renderDelegatesSectionMarkup(stats: AdminStats): string {
  const filteredRegs = adminRegistrations.filter((reg) => {
    if (adminFilter !== 'all' && reg.status !== adminFilter) return false;
    if (!adminSearchQuery) return true;
    const q = adminSearchQuery.toLowerCase();
    return (
      reg.full_name.toLowerCase().includes(q) ||
      reg.email.toLowerCase().includes(q) ||
      reg.school.toLowerCase().includes(q) ||
      reg.committee.toLowerCase().includes(q) ||
      reg.phone.toLowerCase().includes(q)
    );
  });

  return `
    <!-- Stats Bar -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.35rem; white-space: nowrap;">Total Applications</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #ffffff;">${stats.total}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.35rem; white-space: nowrap;">Pending Review</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: var(--gold);">${stats.pending}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #34d399; margin-bottom: 0.35rem; white-space: nowrap;">Approved Delegates</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #34d399;">${stats.approved}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #f87171; margin-bottom: 0.35rem; white-space: nowrap;">Rejected</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #f87171;">${stats.rejected}</div>
      </div>
    </div>

    <!-- Registrations Table Card -->
    <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem); margin-bottom: 2.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            DELEGATE <em>APPLICATIONS.</em>
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.75); margin-top: 0.25rem;">
            Review delegate applications and confirm committee seating status.
          </p>
        </div>

        <button type="button" id="admin-refresh-regs-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.3); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          ↺ Refresh List
        </button>
      </div>

      <!-- Search & Filter Controls -->
      <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
        <div style="flex: 1; min-width: 240px; position: relative;">
          <input type="text" id="admin-search-input" class="form-input" placeholder="Search by name, email, school, or committee..." value="${escapeHtml(adminSearchQuery)}" style="padding-left: 2.25rem;" />
          <span style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: rgba(242, 244, 255, 0.4); font-size: 0.9rem;">🔍</span>
        </div>

        <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.1); flex-wrap: wrap; gap: 2px;">
          <button type="button" class="admin-filter-btn ${adminFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'all' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'all' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            All (${stats.total})
          </button>
          <button type="button" class="admin-filter-btn ${adminFilter === 'pending' ? 'active' : ''}" data-filter="pending" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'pending' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'pending' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Pending (${stats.pending})
          </button>
          <button type="button" class="admin-filter-btn ${adminFilter === 'approved' ? 'active' : ''}" data-filter="approved" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'approved' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'approved' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Approved (${stats.approved})
          </button>
          <button type="button" class="admin-filter-btn ${adminFilter === 'rejected' ? 'active' : ''}" data-filter="rejected" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'rejected' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'rejected' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Rejected (${stats.rejected})
          </button>
        </div>
      </div>

      <div id="admin-action-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <div id="admin-registrations-container">
        ${renderRegistrationsTableMarkup(filteredRegs)}
      </div>
    </div>
  `;
}

/**
 * Render the Executive Board Members Section Markup with Team Dropdown and Accept as Head
 */
function renderEbSectionMarkup(stats: EbStats, currentUser: CurrentUser): string {
  const filteredEb = adminEbProfiles.filter((p) => {
    if (adminEbFilter === 'pending' && p.role !== 'user') return false;
    if (adminEbFilter === 'eb' && p.role !== 'eb') return false;
    if (adminEbFilter === 'head' && p.role !== 'head') return false;
    if (adminEbFilter === 'admin' && p.role !== 'admin') return false;
    if (adminEbFilter === 'security' && p.role !== 'security') return false;

    if (!adminEbSearchQuery) return true;
    const q = adminEbSearchQuery.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.eb_position || '').toLowerCase().includes(q)
    );
  });

  return `
    <!-- EB Stats Bar -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.35rem; white-space: nowrap;">Total EB Declarations</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #ffffff;">${stats.total}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.35rem; white-space: nowrap;">Department Heads</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: var(--gold);">${stats.heads}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #34d399; margin-bottom: 0.35rem; white-space: nowrap;">Approved Officers</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #34d399;">${stats.approved}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #fbbf24; margin-bottom: 0.35rem; white-space: nowrap;">Pending Approval (User)</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #fbbf24;">${stats.pending}</div>
      </div>
    </div>

    <!-- EB Management Card -->
    <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem); margin-bottom: 2.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span class="eyebrow">Secretariat & Department Heads</span>
          <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            EXECUTIVE BOARD <em>MEMBERS & HEADS.</em>
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.75); margin-top: 0.25rem;">
            Assign team leadership via the team dropdown and "Accept as Head" button, approve EB officers, or manage credentials.
          </p>
        </div>

        <button type="button" id="admin-refresh-eb-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.3); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          ↺ Refresh EB List
        </button>
      </div>

      <!-- Search & Filters -->
      <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
        <div style="flex: 1; min-width: 240px; position: relative;">
          <input type="text" id="admin-eb-search-input" class="form-input" placeholder="Search by name, email, or EB position..." value="${escapeHtml(adminEbSearchQuery)}" style="padding-left: 2.25rem;" />
          <span style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: rgba(242, 244, 255, 0.4); font-size: 0.9rem;">🔍</span>
        </div>

        <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.1); flex-wrap: wrap; gap: 2px;">
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'all' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'all' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            All (${stats.total})
          </button>
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'pending' ? 'active' : ''}" data-filter="pending" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'pending' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'pending' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Pending (${stats.pending})
          </button>
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'head' ? 'active' : ''}" data-filter="head" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'head' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'head' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Heads (${stats.heads})
          </button>
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'eb' ? 'active' : ''}" data-filter="eb" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'eb' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'eb' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            EB
          </button>
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'admin' ? 'active' : ''}" data-filter="admin" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'admin' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'admin' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Admin
          </button>
          <button type="button" class="admin-eb-filter-btn ${adminEbFilter === 'security' ? 'active' : ''}" data-filter="security" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminEbFilter === 'security' ? 'var(--gold)' : 'transparent'}; color: ${adminEbFilter === 'security' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Security
          </button>
        </div>
      </div>

      <div id="admin-eb-action-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <div id="admin-eb-container">
        ${renderEbTableMarkup(filteredEb, currentUser, adminTeams)}
      </div>
    </div>

    <!-- Manage Access by Direct Email Entry -->
    <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem);">
      <div style="margin-bottom: 1.5rem;">
        <span class="eyebrow">Direct Role Assignment</span>
        <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.4rem;">
          MANAGE <em>ACCESS BY EMAIL.</em>
        </h2>
        <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.75);">
          Assign administrative and officer roles by email. (Note: role 'head' is set above through 'Accept as Head' with a designated team).
        </p>
      </div>

      <div id="manage-access-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <form id="manage-access-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)) auto; gap: 1rem; align-items: flex-end; margin-bottom: 2rem; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(217, 180, 90, 0.2); border-radius: 14px; padding: 1.25rem;" novalidate>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="access-email">User Email Address *</label>
          <input type="email" id="access-email" class="form-input" placeholder="colleague@domain.com" required />
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="access-role">Assign Role *</label>
          <select id="access-role" class="form-select" required>
            <option value="admin">admin (Full Secretariat Admin)</option>
            <option value="eb">eb (Executive Board Member)</option>
            <option value="security">security (Conference Security)</option>
            <option value="user">user (Standard Delegate / General)</option>
          </select>
        </div>

        <button type="submit" id="access-submit-btn" class="form-submit-btn btn-interactive" style="white-space: nowrap; padding: 0.85rem 1.4rem;">
          Update Role
        </button>
      </form>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            ALL <em>ASSIGNED STAFF (${adminStaff.length})</em>
          </h3>
          <button type="button" id="admin-refresh-staff-btn" class="btn-interactive" style="background: transparent; border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.8); padding: 0.3rem 0.8rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            ↺ Refresh Staff
          </button>
        </div>

        <div id="admin-staff-container">
          ${renderStaffTableMarkup(adminStaff)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the Admin "Teams" panel: list all teams with head names and member counts,
 * plus a form to add a new team (name and kind).
 */
function renderTeamsSectionMarkup(): string {
  const departments = adminTeams.filter((t) => t.kind === 'department');
  const committees = adminTeams.filter((t) => t.kind === 'committee');

  return `
    <!-- Top Stats -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.35rem; white-space: nowrap;">Total Teams</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #ffffff;">${adminTeams.length}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.35rem; white-space: nowrap;">Departments</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: var(--gold);">${departments.length}</div>
      </div>

      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 16px; padding: 1.25rem;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #38bdf8; margin-bottom: 0.35rem; white-space: nowrap;">Committees</div>
        <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #38bdf8;">${committees.length}</div>
      </div>
    </div>

    <!-- Form to Add a New Team -->
    <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem); margin-bottom: 2.5rem;">
      <div style="margin-bottom: 1.25rem;">
        <span class="eyebrow">Secretariat Architecture</span>
        <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
          CREATE A <em>NEW TEAM.</em>
        </h2>
        <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.75); margin-top: 0.25rem;">
          Add a conference organizing department or civilizational committee to the active roster.
        </p>
      </div>

      <div id="add-team-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

      <form id="add-team-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)) auto; gap: 1rem; align-items: flex-end;" novalidate>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="new-team-name">Team Name *</label>
          <input type="text" id="new-team-name" class="form-input" placeholder="e.g. Media & Photography or UNEP" required />
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="new-team-kind">Team Kind *</label>
          <select id="new-team-kind" class="form-select" required>
            <option value="department">department (Organizing Secretariat)</option>
            <option value="committee">committee (Diplomatic Committee)</option>
          </select>
        </div>

        <button type="submit" id="new-team-submit-btn" class="form-submit-btn btn-interactive" style="white-space: nowrap; padding: 0.85rem 1.5rem;">
          + Create Team
        </button>
      </form>
    </div>

    <!-- Teams Roster List -->
    <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            ALL <em>TEAMS & ROSTERS (${adminTeams.length})</em>
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.7); margin-top: 0.2rem;">
            Overview of department heads and confirmed member headcounts.
          </p>
        </div>

        <button type="button" id="admin-refresh-teams-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.3); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          ↺ Refresh Teams
        </button>
      </div>

      <div class="admin-teams-list">
        ${renderTeamsCardsList(adminTeams, adminEbProfiles)}
      </div>
    </div>
  `;
}

function renderTeamsCardsList(teams: Team[], ebProfiles: Profile[]): string {
  if (teams.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.15); color: rgba(242, 244, 255, 0.6);">
        No teams registered yet. Use the form above to add your first department or committee.
      </div>
    `;
  }

  return teams
    .map((team) => {
      // Find head of this team
      const head = ebProfiles.find((p) => p.role === 'head' && p.team_id === team.id);

      // Approved members and pending counts
      const approvedMembers = ebProfiles.filter((p) => p.team_id === team.id && p.team_status === 'approved' && p.role !== 'head');
      const pendingMembers = ebProfiles.filter((p) => p.team_id === team.id && p.team_status === 'pending');

      const headMarkup = head
        ? `<span style="color: var(--gold); font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;">
            <span>★</span>
            <span>${escapeHtml(head.full_name || head.email || 'Assigned Head')}</span>
            <span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.5); font-weight: 400;">(${escapeHtml(head.email || '')})</span>
          </span>`
        : `<span style="color: rgba(242, 244, 255, 0.45); font-style: italic;">No head assigned</span>`;

      const kindColor = team.kind === 'department' ? 'var(--gold)' : '#38bdf8';

      return `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.15rem 1.4rem; margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div style="min-width: 240px;">
            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
              <span style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: #ffffff;">${escapeHtml(team.name)}</span>
              <span style="background: rgba(255, 255, 255, 0.06); border: 1px solid ${kindColor}; color: ${kindColor}; padding: 0.15rem 0.55rem; border-radius: 9999px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase;">
                ${escapeHtml(team.kind)}
              </span>
            </div>
            <div style="font-size: 0.85rem;">
              <span style="color: rgba(242, 244, 255, 0.55); text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.1em; margin-right: 0.35rem;">Head:</span>
              ${headMarkup}
            </div>
          </div>

          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <div style="text-align: right;">
              <div style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; color: #34d399;">
                ${approvedMembers.length} <span style="font-size: 0.75rem; font-weight: 600; color: rgba(242, 244, 255, 0.6); text-transform: uppercase;">Members</span>
              </div>
              <div style="font-size: 0.75rem; color: ${pendingMembers.length > 0 ? 'var(--gold)' : 'rgba(242, 244, 255, 0.4)'};">
                ${pendingMembers.length} pending requests
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Generate markup for registrations list/table
 */
function renderRegistrationsTableMarkup(registrations: Registration[]): string {
  if (registrations.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.15); color: rgba(242, 244, 255, 0.6);">
        <p style="font-size: 1rem; margin-bottom: 0.35rem;">No registrations matching your current filter.</p>
        <span style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.4);">New applications will appear here as delegates register.</span>
      </div>
    `;
  }

  const rows = registrations
    .map((reg) => {
      let statusBadge = '';
      if (reg.status === 'pending') {
        statusBadge = `<span style="background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Pending</span>`;
      } else if (reg.status === 'approved') {
        statusBadge = `<span style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Approved</span>`;
      } else {
        statusBadge = `<span style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Rejected</span>`;
      }

      return `
        <div class="admin-reg-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.15rem; margin-bottom: 0.85rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) auto; gap: 1rem; align-items: center;">
          <div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: #ffffff; margin-bottom: 0.2rem;">
              ${escapeHtml(reg.full_name)}
            </div>
            <div style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.7);">
              ✉ ${escapeHtml(reg.email)} · ☎ ${escapeHtml(reg.phone)}
            </div>
          </div>

          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Committee</div>
            <div style="font-size: 0.92rem; font-weight: 700; color: var(--gold);">
              ${escapeHtml(reg.committee)}
            </div>
            <div style="font-size: 0.78rem; color: rgba(242, 244, 255, 0.6);">${escapeHtml(reg.school)}</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <div>${statusBadge}</div>
            <span style="font-size: 0.7rem; color: rgba(242, 244, 255, 0.45); white-space: nowrap;">Applied: ${formatDate(reg.created_at)}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            ${
              reg.status !== 'approved'
                ? `<button type="button" class="btn-interactive admin-approve-btn" data-id="${reg.id}" style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.4rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">Approve</button>`
                : ''
            }
            ${
              reg.status !== 'rejected'
                ? `<button type="button" class="btn-interactive admin-reject-btn" data-id="${reg.id}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">Reject</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="admin-regs-list">${rows}</div>`;
}

/**
 * Generate markup for EB table
 * For each EB sign-up row (eb_position not null):
 * - Add a team dropdown (loaded from teams) and an "Accept as Head" button that calls assign_head(email, team_id).
 * - Require choosing a team first.
 * - Show heads with a gold "HEAD" badge and their team name, plus a "Remove head" button (confirm first) that calls remove_head.
 * - Heads must NOT show an "Approve as EB" button.
 */
function renderEbTableMarkup(ebMembers: Profile[], currentUser: CurrentUser, teams: Team[]): string {
  if (ebMembers.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.15); color: rgba(242, 244, 255, 0.6);">
        <p style="font-size: 1rem; margin-bottom: 0.35rem;">No EB sign-up declarations matching your current filter.</p>
        <span style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.4);">EB members will appear here as they register on the site.</span>
      </div>
    `;
  }

  // Pre-generate team options for dropdown
  const deptTeams = teams.filter((t) => t.kind === 'department');
  const commTeams = teams.filter((t) => t.kind === 'committee');

  const deptOptions = deptTeams.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
  const commOptions = commTeams.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');

  const rows = ebMembers
    .map((member) => {
      const email = member.email || '';
      const name = member.full_name || 'Member';
      const position = member.eb_position || 'Executive Board';
      const role = member.role;
      const isSelf = email.toLowerCase() === currentUser.email.toLowerCase();

      // Look up team name if head
      const assignedTeam = teams.find((t) => t.id === member.team_id);
      const teamName = assignedTeam ? assignedTeam.name : 'Team';

      // Role badge
      let roleBadge = '';
      if (role === 'head') {
        roleBadge = `<span style="background: rgba(217, 180, 90, 0.28); border: 1.5px solid var(--gold); color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; box-shadow: 0 0 12px rgba(217, 180, 90, 0.35);">★ HEAD · ${escapeHtml(teamName)}</span>`;
      } else if (role === 'admin') {
        roleBadge = `<span style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #7dd3fc; padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Admin</span>`;
      } else if (role === 'eb') {
        roleBadge = `<span style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Executive Board (Approved)</span>`;
      } else if (role === 'security') {
        roleBadge = `<span style="background: rgba(99, 102, 241, 0.18); border: 1px solid #6366f1; color: #a5b4fc; padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Security Scanner</span>`;
      } else {
        roleBadge = `<span style="background: rgba(245, 158, 11, 0.18); border: 1px solid #f59e0b; color: #fbbf24; padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">Pending (User)</span>`;
      }

      // Actions markup
      let actionsMarkup = '';

      if (isSelf) {
        actionsMarkup = `
          <div style="font-size: 0.75rem; color: var(--gold); background: rgba(217, 180, 90, 0.12); border: 1px dashed rgba(217, 180, 90, 0.4); padding: 0.35rem 0.8rem; border-radius: 9999px; white-space: nowrap;">
            Current Account (Protected)
          </div>
        `;
      } else if (role === 'head') {
        // HEAD: Show "Remove head" button (confirm first), Heads must NOT show "Approve as EB" button
        actionsMarkup = `
          <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
            <button type="button" class="btn-interactive admin-remove-head-btn" data-email="${escapeHtml(email)}" data-name="${escapeHtml(name)}" data-team="${escapeHtml(teamName)}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              Remove Head
            </button>
            <button type="button" class="btn-interactive admin-eb-action-btn" data-email="${escapeHtml(email)}" data-role="admin" data-name="${escapeHtml(name)}" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #7dd3fc; padding: 0.4rem 0.75rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
              Make Admin
            </button>
          </div>
        `;
      } else {
        // NOT A HEAD: team dropdown + "Accept as Head" button, plus "Approve as EB" if not yet EB
        const teamSelectMarkup = `
          <select class="form-select admin-assign-team-select" data-email="${escapeHtml(email)}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; width: auto; max-width: 175px; height: auto; min-height: 34px; background: rgba(8, 10, 30, 0.95);">
            <option value="">Select Team...</option>
            <optgroup label="Departments">
              ${deptOptions}
            </optgroup>
            <optgroup label="Committees">
              ${commOptions}
            </optgroup>
          </select>
        `;

        actionsMarkup = `
          <div style="display: flex; gap: 0.45rem; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
            <div style="display: flex; gap: 0.35rem; align-items: center; background: rgba(217, 180, 90, 0.08); padding: 3px; border-radius: 10px; border: 1px solid rgba(217, 180, 90, 0.25);">
              ${teamSelectMarkup}
              <button type="button" class="btn-interactive admin-accept-head-btn" data-email="${escapeHtml(email)}" data-name="${escapeHtml(name)}" style="background: var(--gold); color: #080a1e; border: none; padding: 0.4rem 0.8rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
                ★ Accept as Head
              </button>
            </div>

            ${
              role !== 'eb'
                ? `<button type="button" class="btn-interactive admin-eb-action-btn" data-email="${escapeHtml(email)}" data-role="eb" data-name="${escapeHtml(name)}" style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.4rem 0.75rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">Approve as EB</button>`
                : ''
            }
            ${
              role !== 'admin'
                ? `<button type="button" class="btn-interactive admin-eb-action-btn" data-email="${escapeHtml(email)}" data-role="admin" data-name="${escapeHtml(name)}" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #7dd3fc; padding: 0.4rem 0.75rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">Make Admin</button>`
                : ''
            }
            ${
              role !== 'user'
                ? `<button type="button" class="btn-interactive admin-eb-action-btn" data-email="${escapeHtml(email)}" data-role="user" data-name="${escapeHtml(name)}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 0.75rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">Remove</button>`
                : ''
            }
          </div>
        `;
      }

      return `
        <div class="admin-reg-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.15rem; margin-bottom: 0.85rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) auto; gap: 1rem; align-items: center;">
          <div>
            <div style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: #ffffff; margin-bottom: 0.2rem;">
              ${escapeHtml(name)}
            </div>
            <div style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.7);">
              ✉ ${escapeHtml(email)}
            </div>
          </div>

          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.5); margin-bottom: 0.2rem;">Declared Position</div>
            <div style="font-size: 0.92rem; font-weight: 700; color: var(--gold);">
              ${escapeHtml(position)}
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <div>${roleBadge}</div>
            <span style="font-size: 0.7rem; color: rgba(242, 244, 255, 0.45); white-space: nowrap;">Joined: ${formatDate(member.created_at)}</span>
          </div>

          <div>
            ${actionsMarkup}
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="admin-eb-list">${rows}</div>`;
}

/**
 * Generate markup for general staff members table
 */
function renderStaffTableMarkup(staff: Profile[]): string {
  if (staff.length === 0) {
    return `
      <div style="text-align: center; padding: 2rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 12px; color: rgba(242, 244, 255, 0.6); font-size: 0.9rem;">
        No designated staff members configured yet. Assign a role above.
      </div>
    `;
  }

  const rows = staff
    .map((s) => {
      const email = s.email || 'No email recorded';
      const name = s.full_name || 'Staff Member';

      return `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 10px; padding: 0.9rem 1.15rem; margin-bottom: 0.65rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${escapeHtml(name)}</div>
            <div style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.65);">${escapeHtml(email)}</div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; white-space: nowrap;">
              ${escapeHtml(s.role)}
            </span>

            <select class="form-select staff-role-changer" data-email="${escapeHtml(email)}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; width: auto; background: rgba(8, 10, 30, 0.9);">
              <option value="admin" ${s.role === 'admin' ? 'selected' : ''}>admin</option>
              <option value="eb" ${s.role === 'eb' ? 'selected' : ''}>eb</option>
              <option value="security" ${s.role === 'security' ? 'selected' : ''}>security</option>
              <option value="user">Remove (set user)</option>
            </select>
          </div>
        </div>
      `;
    })
    .join('');

  return rows;
}

/**
 * Attach interactive events to the admin dashboard
 */
function attachAdminDashboardHandlers(container: HTMLElement, user: CurrentUser): void {
  // Main Navigation Tabs
  const tabDelegates = document.getElementById('admin-tab-delegates');
  const tabEb = document.getElementById('admin-tab-eb');
  const tabTeams = document.getElementById('admin-tab-teams');
  const tabAllowlist = document.getElementById('admin-tab-allowlist');
  const signoutBtn = document.getElementById('admin-signout-btn');

  signoutBtn?.addEventListener('click', async () => {
    await signOut();
    document.body.classList.remove('admin-mode-active');
  });

  tabDelegates?.addEventListener('click', () => {
    adminActiveTab = 'delegates';
    renderAdminDashboard(container, user);
  });

  tabEb?.addEventListener('click', () => {
    adminActiveTab = 'eb';
    renderAdminDashboard(container, user);
  });

  tabTeams?.addEventListener('click', () => {
    adminActiveTab = 'teams';
    renderAdminDashboard(container, user);
  });

  tabAllowlist?.addEventListener('click', () => {
    adminActiveTab = 'allowlist';
    renderAdminDashboard(container, user);
  });

  if (adminActiveTab === 'delegates') {
    attachDelegatesTabHandlers(container, user);
  } else if (adminActiveTab === 'eb') {
    attachEbTabHandlers(container, user);
  } else if (adminActiveTab === 'teams') {
    attachTeamsTabHandlers(container, user);
  } else if (adminActiveTab === 'allowlist') {
    attachAllowlistTabHandlers(container, user);
  }
}

function attachDelegatesTabHandlers(container: HTMLElement, user: CurrentUser): void {
  const refreshRegsBtn = document.getElementById('admin-refresh-regs-btn');
  const searchInput = document.getElementById('admin-search-input') as HTMLInputElement | null;
  const filterBtns = container.querySelectorAll('.admin-filter-btn');

  refreshRegsBtn?.addEventListener('click', async () => {
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  searchInput?.addEventListener('input', () => {
    adminSearchQuery = searchInput.value.trim();
    const regContainer = document.getElementById('admin-registrations-container');
    if (!regContainer) return;

    const filtered = adminRegistrations.filter((reg) => {
      if (adminFilter !== 'all' && reg.status !== adminFilter) return false;
      if (!adminSearchQuery) return true;
      const q = adminSearchQuery.toLowerCase();
      return (
        reg.full_name.toLowerCase().includes(q) ||
        reg.email.toLowerCase().includes(q) ||
        reg.school.toLowerCase().includes(q) ||
        reg.committee.toLowerCase().includes(q) ||
        reg.phone.toLowerCase().includes(q)
      );
    });
    regContainer.innerHTML = renderRegistrationsTableMarkup(filtered);
    attachRegistrationActionButtons(container, user);
  });

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter') as 'all' | 'pending' | 'approved' | 'rejected';
      if (!f) return;
      adminFilter = f;
      renderAdminDashboard(container, user);
    });
  });

  attachRegistrationActionButtons(container, user);
}

function attachRegistrationActionButtons(container: HTMLElement, user: CurrentUser): void {
  const feedback = document.getElementById('admin-action-feedback');

  const approveBtns = container.querySelectorAll('.admin-approve-btn');
  approveBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Approving...';

      const res = await updateRegistrationStatus(id, 'approved');
      if (res.success) {
        if (feedback) {
          feedback.className = 'status-banner status-success';
          feedback.textContent = '✓ Delegate registration approved successfully.';
          feedback.style.display = 'block';
        }
        await refreshAdminData();
        renderAdminDashboard(container, user);
      } else {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to approve.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = 'Approve';
      }
    });
  });

  const rejectBtns = container.querySelectorAll('.admin-reject-btn');
  rejectBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Rejecting...';

      const res = await updateRegistrationStatus(id, 'rejected');
      if (res.success) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = 'Delegate registration updated to Rejected.';
          feedback.style.display = 'block';
        }
        await refreshAdminData();
        renderAdminDashboard(container, user);
      } else {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to reject.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = 'Reject';
      }
    });
  });
}

function attachEbTabHandlers(container: HTMLElement, user: CurrentUser): void {
  const refreshEbBtn = document.getElementById('admin-refresh-eb-btn');
  const searchInput = document.getElementById('admin-eb-search-input') as HTMLInputElement | null;
  const filterBtns = container.querySelectorAll('.admin-eb-filter-btn');
  const manageAccessForm = document.getElementById('manage-access-form') as HTMLFormElement | null;
  const refreshStaffBtn = document.getElementById('admin-refresh-staff-btn');

  refreshEbBtn?.addEventListener('click', async () => {
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  refreshStaffBtn?.addEventListener('click', async () => {
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  searchInput?.addEventListener('input', () => {
    adminEbSearchQuery = searchInput.value.trim();
    const ebContainer = document.getElementById('admin-eb-container');
    if (!ebContainer) return;

    const filtered = adminEbProfiles.filter((p) => {
      if (adminEbFilter === 'pending' && p.role !== 'user') return false;
      if (adminEbFilter === 'eb' && p.role !== 'eb') return false;
      if (adminEbFilter === 'head' && p.role !== 'head') return false;
      if (adminEbFilter === 'admin' && p.role !== 'admin') return false;
      if (adminEbFilter === 'security' && p.role !== 'security') return false;

      if (!adminEbSearchQuery) return true;
      const q = adminEbSearchQuery.toLowerCase();
      return (
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.eb_position || '').toLowerCase().includes(q)
      );
    });
    ebContainer.innerHTML = renderEbTableMarkup(filtered, user, adminTeams);
    attachEbActionButtons(container, user);
  });

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter') as 'all' | 'pending' | 'eb' | 'head' | 'admin' | 'security';
      if (!f) return;
      adminEbFilter = f;
      renderAdminDashboard(container, user);
    });
  });

  // Direct access form
  manageAccessForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('access-email') as HTMLInputElement | null;
    const roleSelect = document.getElementById('access-role') as HTMLSelectElement | null;
    const feedback = document.getElementById('manage-access-feedback');
    const submitBtn = document.getElementById('access-submit-btn') as HTMLButtonElement | null;

    const email = emailInput?.value.trim() || '';
    const role = (roleSelect?.value as UserRole) || 'user';

    if (!email) {
      if (feedback) {
        feedback.className = 'status-banner status-error';
        feedback.textContent = 'Please enter an email address.';
        feedback.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';
    }

    const res = await setUserRoleRpc(email, role);

    if (res.isError) {
      if (feedback) {
        feedback.className = 'status-banner status-error';
        feedback.textContent = res.message;
        feedback.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Role';
      }
    } else {
      if (feedback) {
        feedback.className = 'status-banner status-success';
        feedback.textContent = `✓ ${res.message}`;
        feedback.style.display = 'block';
      }
      if (emailInput) emailInput.value = '';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Role';
      }
      await refreshAdminData();
      renderAdminDashboard(container, user);
    }
  });

  attachEbActionButtons(container, user);
}

function attachEbActionButtons(container: HTMLElement, user: CurrentUser): void {
  const feedback = document.getElementById('admin-eb-action-feedback');

  // Accept as Head buttons
  const acceptHeadBtns = container.querySelectorAll('.admin-accept-head-btn');
  acceptHeadBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email') || '';
      const memberName = btn.getAttribute('data-name') || email;
      if (!email) return;

      // Find matching select
      const select = container.querySelector(`.admin-assign-team-select[data-email="${email}"]`) as HTMLSelectElement | null;
      const teamId = select?.value || '';

      if (!teamId) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = `Please choose a team from the dropdown before accepting ${memberName} as Head.`;
          feedback.style.display = 'block';
        }
        select?.focus();
        return;
      }

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Assigning...';

      const res = await assignHeadRpc(email, teamId);

      if (!res.success) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to assign head.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = '★ Accept as Head';
        return;
      }

      if (feedback) {
        feedback.className = 'status-banner status-success';
        feedback.textContent = `✓ Successfully assigned ${memberName} as Head!`;
        feedback.style.display = 'block';
      }

      await refreshAdminData();
      renderAdminDashboard(container, user);
    });
  });

  // Remove Head buttons
  const removeHeadBtns = container.querySelectorAll('.admin-remove-head-btn');
  removeHeadBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email') || '';
      const memberName = btn.getAttribute('data-name') || email;
      const teamName = btn.getAttribute('data-team') || 'team';
      if (!email) return;

      const ok = window.confirm(`Are you sure you want to remove ${memberName} as Head of ${teamName}?`);
      if (!ok) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Removing...';

      const res = await removeHeadRpc(email);

      if (!res.success) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error || 'Failed to remove head.';
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = 'Remove Head';
        return;
      }

      if (feedback) {
        feedback.className = 'status-banner status-info';
        feedback.textContent = `✓ Removed head assignment for ${memberName}.`;
        feedback.style.display = 'block';
      }

      await refreshAdminData();
      renderAdminDashboard(container, user);
    });
  });

  // Other EB Action buttons (Approve as EB, Make admin, Remove access)
  const actionBtns = container.querySelectorAll('.admin-eb-action-btn');
  actionBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email');
      const targetRole = btn.getAttribute('data-role') as UserRole;
      const memberName = btn.getAttribute('data-name') || email || 'Member';

      if (!email || !targetRole) return;

      // Confirmation for sensitive role changes
      if (targetRole === 'admin') {
        const ok = window.confirm(`Are you sure you want to promote ${memberName} (${email}) to Administrator? Administrators have full Secretariat control.`);
        if (!ok) return;
      } else if (targetRole === 'user') {
        const ok = window.confirm(`Are you sure you want to remove staff privileges for ${memberName} (${email})? Their role will be reset to standard user.`);
        if (!ok) return;
      }

      const button = btn as HTMLButtonElement;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Updating...';

      const res = await setUserRoleRpc(email, targetRole);

      if (res.isError) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.message;
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = originalText;
      } else {
        if (feedback) {
          feedback.className = 'status-banner status-success';
          feedback.textContent = `✓ ${res.message}`;
          feedback.style.display = 'block';
        }
        await refreshAdminData();
        renderAdminDashboard(container, user);
      }
    });
  });

  // Staff table inline changer
  const staffChangers = container.querySelectorAll('.staff-role-changer');
  staffChangers.forEach((sel) => {
    sel.addEventListener('change', async () => {
      const select = sel as HTMLSelectElement;
      const email = select.getAttribute('data-email') || '';
      const newRole = select.value as UserRole;
      if (!email) return;

      select.disabled = true;
      const res = await setUserRoleRpc(email, newRole);

      if (res.isError) {
        alert(res.message);
      }
      await refreshAdminData();
      renderAdminDashboard(container, user);
    });
  });
}

function attachTeamsTabHandlers(container: HTMLElement, user: CurrentUser): void {
  const refreshTeamsBtn = document.getElementById('admin-refresh-teams-btn');
  const addTeamForm = document.getElementById('add-team-form') as HTMLFormElement | null;
  const feedback = document.getElementById('add-team-feedback');

  refreshTeamsBtn?.addEventListener('click', async () => {
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  addTeamForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const nameInput = document.getElementById('new-team-name') as HTMLInputElement | null;
    const kindSelect = document.getElementById('new-team-kind') as HTMLSelectElement | null;
    const submitBtn = document.getElementById('new-team-submit-btn') as HTMLButtonElement | null;

    const name = nameInput?.value.trim() || '';
    const kind = (kindSelect?.value as TeamKind) || 'department';

    if (!name) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please enter a team name.';
      feedback.style.display = 'block';
      nameInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Team...';
    }

    const res = await createTeam(name, kind);

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '+ Create Team';
      }
      return;
    }

    feedback.className = 'status-banner status-success';
    feedback.textContent = `✓ Team "${name}" created successfully!`;
    feedback.style.display = 'block';

    if (nameInput) nameInput.value = '';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '+ Create Team';
    }

    await refreshAdminData();
    renderAdminDashboard(container, user);
  });
}

/**
 * Render the Team Email List (Allowlist) Section Markup
 */
function renderAllowlistSectionMarkup(): string {
  const claimedCount = adminStaffAllowlist.filter((e) => e.claimed_by !== null).length;
  const unclaimedCount = adminStaffAllowlist.filter((e) => e.claimed_by === null).length;

  const filteredEntries = adminStaffAllowlist.filter((entry) => {
    if (adminAllowlistFilter === 'claimed' && entry.claimed_by === null) return false;
    if (adminAllowlistFilter === 'unclaimed' && entry.claimed_by !== null) return false;
    if (!adminAllowlistSearchQuery) return true;
    const q = adminAllowlistSearchQuery.toLowerCase();
    return (
      (entry.full_name || '').toLowerCase().includes(q) ||
      (entry.email || '').toLowerCase().includes(q) ||
      (entry.position || '').toLowerCase().includes(q)
    );
  });

  return `
    <div>
      <!-- Section Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <span class="eyebrow" style="margin-bottom: 0.25rem;">Pre-Approved Team Registry</span>
          <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            TEAM EMAIL <em>LIST.</em>
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.75); margin-top: 0.25rem; max-width: 65ch;">
            Only pre-authorized email addresses can create an Executive Board account. The database matches their email on sign-up and auto-assigns their declared role and position.
          </p>
        </div>

        <button type="button" id="admin-refresh-allowlist-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.3); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
          ↺ Refresh List
        </button>
      </div>

      <!-- Form to Add Person to Allowlist -->
      <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 16px; padding: clamp(1.25rem, 3vw, 1.75rem); margin-bottom: 2rem;">
        <h3 style="font-family: var(--font-display); font-size: 1.05rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.3rem;">
          + Pre-Authorize Team Member
        </h3>
        <p style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.7); margin-bottom: 1.25rem;">
          Add a team member before they sign up. Email will be saved in lowercase and matched on registration.
        </p>

        <div id="add-allowlist-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

        <form id="add-allowlist-form" novalidate>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="new-allowlist-name">Full Name *</label>
              <input type="text" id="new-allowlist-name" class="form-input" placeholder="e.g. Julia Fadel" required />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="new-allowlist-email">Email Address (saved lowercase) *</label>
              <input type="email" id="new-allowlist-email" class="form-input" placeholder="e.g. julia@monumentmun.org" required />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="new-allowlist-position">Position / Assignment *</label>
              <input type="text" id="new-allowlist-position" class="form-input" placeholder="e.g. Head of Design" required />
            </div>
          </div>

          <button type="submit" id="new-allowlist-submit-btn" class="form-submit-btn btn-interactive" style="width: auto; padding: 0.65rem 1.6rem;">
            + Pre-Authorize Member
          </button>
        </form>
      </div>

      <!-- Search & Filter Controls -->
      <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
        <div style="flex: 1; min-width: 240px; position: relative;">
          <input type="text" id="allowlist-search-input" class="form-input" placeholder="Search by name, email, or position..." value="${escapeHtml(adminAllowlistSearchQuery)}" style="padding-left: 2.25rem;" />
          <span style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: rgba(242, 244, 255, 0.4); font-size: 0.9rem;">🔍</span>
        </div>

        <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.1); flex-wrap: wrap; gap: 2px;">
          <button type="button" class="allowlist-filter-btn ${adminAllowlistFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminAllowlistFilter === 'all' ? 'var(--gold)' : 'transparent'}; color: ${adminAllowlistFilter === 'all' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            All (${adminStaffAllowlist.length})
          </button>
          <button type="button" class="allowlist-filter-btn ${adminAllowlistFilter === 'claimed' ? 'active' : ''}" data-filter="claimed" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminAllowlistFilter === 'claimed' ? 'var(--gold)' : 'transparent'}; color: ${adminAllowlistFilter === 'claimed' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Signed up (${claimedCount})
          </button>
          <button type="button" class="allowlist-filter-btn ${adminAllowlistFilter === 'unclaimed' ? 'active' : ''}" data-filter="unclaimed" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminAllowlistFilter === 'unclaimed' ? 'var(--gold)' : 'transparent'}; color: ${adminAllowlistFilter === 'unclaimed' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
            Not yet (${unclaimedCount})
          </button>
        </div>
      </div>

      <!-- Allowlist Table Container -->
      <div id="admin-allowlist-container">
        ${renderAllowlistTableMarkup(filteredEntries)}
      </div>
    </div>
  `;
}

/**
 * Generate markup for the allowlist table
 */
function renderAllowlistTableMarkup(entries: StaffAllowlistEntry[]): string {
  if (entries.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem 1rem; background: rgba(255, 255, 255, 0.02); border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.12); color: rgba(242, 244, 255, 0.6);">
        <p style="font-size: 0.95rem; margin-bottom: 0.25rem;">No authorized team emails found matching your filter.</p>
        <span style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.4);">Pre-authorize a team member using the form above.</span>
      </div>
    `;
  }

  const rows = entries
    .map((entry) => {
      const isSignedUp = entry.claimed_by !== null;
      const statusBadge = isSignedUp
        ? `<span style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">Signed up</span>`
        : `<span style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">Not yet</span>`;

      const actionButton = !isSignedUp
        ? `<button type="button" class="btn-interactive allowlist-remove-btn" data-email="${escapeHtml(entry.email)}" data-name="${escapeHtml(entry.full_name)}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.35rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">Remove</button>`
        : `<span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.4); font-style: italic;">Account Active</span>`;

      return `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.1rem 1.25rem; margin-bottom: 0.75rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) auto; gap: 1rem; align-items: center;">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.45); margin-bottom: 0.2rem;">Full Name</div>
            <div style="font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: #ffffff;">${escapeHtml(entry.full_name)}</div>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.45); margin-bottom: 0.2rem;">Authorized Email</div>
            <div style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.85); font-family: monospace;">${escapeHtml(entry.email)}</div>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.45); margin-bottom: 0.2rem;">Position</div>
            <div style="font-size: 0.92rem; font-weight: 700; color: var(--gold);">${escapeHtml(entry.position)}</div>
          </div>

          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(242, 244, 255, 0.45); margin-bottom: 0.2rem;">Status</div>
            <div>${statusBadge}</div>
          </div>

          <div style="text-align: right;">
            ${actionButton}
          </div>
        </div>
      `;
    })
    .join('');

  return `<div>${rows}</div>`;
}

/**
 * Attach event listeners to the Team Email List (Allowlist) tab
 */
function attachAllowlistTabHandlers(container: HTMLElement, user: CurrentUser): void {
  const refreshBtn = document.getElementById('admin-refresh-allowlist-btn');
  const addForm = document.getElementById('add-allowlist-form') as HTMLFormElement | null;
  const feedback = document.getElementById('add-allowlist-feedback');
  const searchInput = document.getElementById('allowlist-search-input') as HTMLInputElement | null;
  const filterBtns = container.querySelectorAll('.allowlist-filter-btn');

  refreshBtn?.addEventListener('click', async () => {
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  // Add person form submit
  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const nameInput = document.getElementById('new-allowlist-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('new-allowlist-email') as HTMLInputElement | null;
    const positionInput = document.getElementById('new-allowlist-position') as HTMLInputElement | null;
    const submitBtn = document.getElementById('new-allowlist-submit-btn') as HTMLButtonElement | null;

    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim().toLowerCase() || '';
    const position = positionInput?.value.trim() || '';

    if (!name || !email || !position) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please fill out all fields (name, email, and position).';
      feedback.style.display = 'block';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Pre-Authorizing...';
    }

    const res = await addStaffAllowlistEntry(name, email, position);

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '+ Pre-Authorize Member';
      }
      return;
    }

    feedback.className = 'status-banner status-success';
    feedback.textContent = `✓ ${name} (${email}) pre-authorized as ${position}!`;
    feedback.style.display = 'block';

    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (positionInput) positionInput.value = '';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '+ Pre-Authorize Member';
    }

    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  // Search input
  searchInput?.addEventListener('input', () => {
    adminAllowlistSearchQuery = searchInput.value.trim();
    const allowlistContainer = document.getElementById('admin-allowlist-container');
    if (!allowlistContainer) return;

    const filtered = adminStaffAllowlist.filter((entry) => {
      if (adminAllowlistFilter === 'claimed' && entry.claimed_by === null) return false;
      if (adminAllowlistFilter === 'unclaimed' && entry.claimed_by !== null) return false;
      if (!adminAllowlistSearchQuery) return true;
      const q = adminAllowlistSearchQuery.toLowerCase();
      return (
        (entry.full_name || '').toLowerCase().includes(q) ||
        (entry.email || '').toLowerCase().includes(q) ||
        (entry.position || '').toLowerCase().includes(q)
      );
    });

    allowlistContainer.innerHTML = renderAllowlistTableMarkup(filtered);
    attachAllowlistRowActions(container, user);
  });

  // Filter buttons
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter') as 'all' | 'claimed' | 'unclaimed';
      if (!f) return;
      adminAllowlistFilter = f;
      renderAdminDashboard(container, user);
    });
  });

  attachAllowlistRowActions(container, user);
}

/**
 * Attach action handlers to remove buttons on allowlist entries (only where claimed_by is null)
 */
function attachAllowlistRowActions(container: HTMLElement, user: CurrentUser): void {
  const feedback = document.getElementById('add-allowlist-feedback');
  const removeBtns = container.querySelectorAll('.allowlist-remove-btn');

  removeBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-email') || '';
      const name = btn.getAttribute('data-name') || email || 'Member';

      if (!email) return;

      const ok = window.confirm(
        `Are you sure you want to remove ${name} (${email}) from the authorized team list? This person will no longer be permitted to create an account.`
      );
      if (!ok) return;

      const button = btn as HTMLButtonElement;
      button.disabled = true;
      button.textContent = 'Removing...';

      const res = await removeStaffAllowlistEntry(email);

      if (res.error) {
        if (feedback) {
          feedback.className = 'status-banner status-error';
          feedback.textContent = res.error;
          feedback.style.display = 'block';
        }
        button.disabled = false;
        button.textContent = 'Remove';
        return;
      }

      if (feedback) {
        feedback.className = 'status-banner status-info';
        feedback.textContent = `✓ Removed ${name} (${email}) from authorized team list.`;
        feedback.style.display = 'block';
      }

      await refreshAdminData();
      renderAdminDashboard(container, user);
    });
  });
}

