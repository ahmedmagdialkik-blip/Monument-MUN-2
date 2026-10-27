import {
  getCachedUser,
  subscribeAuth,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  CurrentUser
} from './auth';
import {
  COMMITTEES,
  getUserRegistration,
  createRegistration
} from './registration';
import {
  fetchAllRegistrations,
  updateRegistrationStatus,
  fetchStaffProfiles,
  setUserRoleRpc,
  computeAdminStats,
  AdminStats
} from './admin';
import type { Registration, Profile, UserRole, RegistrationStatus } from './types/database';

export function isAdminRoute(): boolean {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  return path.endsWith('/admin') || path.endsWith('/admin/') || hash === 'admin';
}

/**
 * Escapes unsafe characters for safe innerHTML insertion
 */
function escapeHtml(str: string): string {
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
let adminFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all';
let adminSearchQuery = '';
let currentRegistration: Registration | null = null;
let isLoadingRegistration = false;

/**
 * Initialize all auth, apply portal, and hidden admin board listeners
 */
export function initPortal() {
  // Subscribe to auth state updates
  subscribeAuth(async (user, loading) => {
    updateHeaderAuthUI(user, loading);
    await renderApplyPortal(user, loading);
    if (isAdminRoute()) {
      renderAdminRoute(user, loading);
    }
  });

  // Listen to hash changes and popstate for admin route handling
  window.addEventListener('hashchange', () => {
    const user = getCachedUser();
    if (isAdminRoute()) {
      renderAdminRoute(user, false);
    }
  });

  window.addEventListener('popstate', () => {
    const user = getCachedUser();
    if (isAdminRoute()) {
      renderAdminRoute(user, false);
    }
  });
}

/**
 * Update Header with dynamic user status or Sign In trigger
 */
function updateHeaderAuthUI(user: CurrentUser | null, loading: boolean) {
  const container = document.getElementById('header-auth-container');
  if (!container) return;

  if (loading) {
    container.innerHTML = `<span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.5);">Connecting...</span>`;
    return;
  }

  if (!user) {
    container.innerHTML = `
      <a href="#/apply" class="apply-pill-btn btn-interactive" style="padding: 0.45rem 1rem; font-size: 0.75rem;">
        Sign In / Apply
      </a>
    `;
    return;
  }

  const roleBadge = user.role !== 'user'
    ? `<span style="background: rgba(217, 180, 90, 0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">${escapeHtml(user.role)}</span>`
    : '';

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <a href="#/apply" style="display: flex; align-items: center; gap: 0.4rem; text-decoration: none; color: #f2f4ff; font-family: var(--font-display); font-size: 0.82rem; font-weight: 700;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
        <span>${escapeHtml(user.fullName)}</span>
        ${roleBadge}
      </a>
      <button type="button" id="header-logout-btn" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.8); font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; padding: 0.35rem 0.7rem; border-radius: 9999px; cursor: pointer;">
        Log Out
      </button>
    </div>
  `;

  const logoutBtn = document.getElementById('header-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut();
    });
  }
}

/**
 * Render the Apply Page Portal (#view-apply)
 */
export async function renderApplyPortal(user: CurrentUser | null, loading: boolean) {
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
  isLoadingRegistration = true;
  mount.innerHTML = `
    <div style="text-align: center; padding: 3rem 1rem; color: var(--gold); font-family: var(--font-display);">
      <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
      <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Retrieving registration matrix record...</p>
    </div>
  `;

  currentRegistration = await getUserRegistration(user.id);
  isLoadingRegistration = false;

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
function renderApplyAuthForms(mount: HTMLElement) {
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
  const formSignup = document.getElementById('apply-signup-form') as HTMLFormElement;
  const formSignin = document.getElementById('apply-signin-form') as HTMLFormElement;
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

    const nameInput = document.getElementById('signup-name') as HTMLInputElement;
    const emailInput = document.getElementById('signup-email') as HTMLInputElement;
    const passInput = document.getElementById('signup-password') as HTMLInputElement;
    const submitBtn = document.getElementById('signup-btn') as HTMLButtonElement;

    const fullName = nameInput?.value.trim();
    const email = emailInput?.value.trim();
    const password = passInput?.value;

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

    const emailInput = document.getElementById('signin-email') as HTMLInputElement;
    const passInput = document.getElementById('signin-password') as HTMLInputElement;
    const submitBtn = document.getElementById('signin-btn') as HTMLButtonElement;

    const email = emailInput?.value.trim();
    const password = passInput?.value;

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
function renderRegistrationFormView(mount: HTMLElement, user: CurrentUser) {
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
        <div style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 9999px; padding: 0.35rem 0.85rem; font-family: var(--font-display); font-size: 0.78rem; color: #f2f4ff;">
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

  const form = document.getElementById('delegate-registration-form') as HTMLFormElement;
  const feedback = document.getElementById('reg-form-feedback');
  const submitBtn = document.getElementById('reg-submit-btn') as HTMLButtonElement;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const nameInput = document.getElementById('reg-fullname') as HTMLInputElement;
    const phoneInput = document.getElementById('reg-phone') as HTMLInputElement;
    const schoolInput = document.getElementById('reg-school') as HTMLInputElement;
    const commInput = document.getElementById('reg-committee') as HTMLSelectElement;

    const full_name = nameInput?.value.trim();
    const phone = phoneInput?.value.trim();
    const school = schoolInput?.value.trim();
    const committee = commInput?.value;

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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Application...';

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
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Delegate Application';
      return;
    }

    currentRegistration = res.registration;
    renderRegistrationStatusView(mount, user, res.registration!);
  });
}

/**
 * Display registration status (Pending, Approved, Rejected)
 */
function renderRegistrationStatusView(mount: HTMLElement, user: CurrentUser, reg: Registration) {
  let badgeHtml = '';
  let headingHtml = '';
  let messageHtml = '';
  let statusBorderColor = 'var(--gold)';

  if (reg.status === 'pending') {
    statusBorderColor = 'rgba(217, 180, 90, 0.6)';
    badgeHtml = `
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">
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
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">
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
      <span style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 1.15rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;">
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
          <span style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.6);">Submitted: ${formatDate(reg.created_at)}</span>
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
        <button type="button" id="refresh-status-btn" class="btn-interactive" style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: #ffffff; padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; cursor: pointer;">
          ↺ Refresh Status
        </button>
        <button type="button" id="portal-signout-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.8); padding: 0.65rem 1.4rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; cursor: pointer;">
          Log Out
        </button>
      </div>
    </div>
  `;

  document.getElementById('refresh-status-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-status-btn') as HTMLButtonElement;
    if (btn) btn.textContent = 'Checking...';
    currentRegistration = await getUserRegistration(user.id);
    renderRegistrationStatusView(mount, user, currentRegistration || reg);
  });

  document.getElementById('portal-signout-btn')?.addEventListener('click', async () => {
    await signOut();
  });
}

/**
 * Handle Admin Route (/admin or #/admin or #admin)
 * Rules:
 * - NO link to it anywhere on the site or in the navigation.
 * - If someone opens /admin while logged out: show the login form.
 * - If they are logged in but role is NOT 'admin': show a plain "Page not found" screen without revealing an admin page exists.
 * - If role IS 'admin': show the admin board:
 *   - table of all registrations with search, status filter, Approve/Reject buttons, counts.
 *   - "Manage access": enter email and choose role (calls supabase.rpc('set_user_role')), list all staff (role != 'user').
 */
export async function renderAdminRoute(user: CurrentUser | null, loading: boolean) {
  // Hide standard views and show dedicated admin container
  const viewHome = document.getElementById('view-home');
  const viewCommittees = document.getElementById('view-committees');
  const viewApply = document.getElementById('view-apply');
  const viewAdmin = document.getElementById('view-admin');
  const dotNav = document.getElementById('dot-nav');
  const mobileCounter = document.getElementById('mobile-stop-counter');

  if (viewHome) viewHome.classList.remove('active-view');
  if (viewCommittees) viewCommittees.classList.remove('active-view');
  if (viewApply) viewApply.classList.remove('active-view');
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

  // 1. Logged out visitor on /admin -> show Login form
  if (!user) {
    renderAdminLoginForm(viewAdmin);
    return;
  }

  // 2. Logged in, but NOT an admin -> show a PLAIN 404 Page Not Found (no hints an admin page exists)
  if (user.role !== 'admin') {
    renderPlain404(viewAdmin);
    return;
  }

  // 3. User is verified ADMIN -> Load registrations and staff, then render Admin Board
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
 * Fetch registrations and staff profiles for the admin board
 */
async function refreshAdminData() {
  const [regRes, staffRes] = await Promise.all([
    fetchAllRegistrations(),
    fetchStaffProfiles()
  ]);

  if (regRes.data) {
    adminRegistrations = regRes.data;
  }
  if (staffRes.data) {
    adminStaff = staffRes.data;
  }
}

/**
 * Plain 404 screen that does NOT leak that an admin page exists
 */
function renderPlain404(container: HTMLElement) {
  container.innerHTML = `
    <div style="min-height: 75vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem 1.5rem; color: #f2f4ff; font-family: system-ui, -apple-system, sans-serif;">
      <h1 style="font-size: clamp(3rem, 8vw, 5rem); font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.04em; color: #94a3b8;">404</h1>
      <h2 style="font-size: clamp(1.2rem, 3vw, 1.6rem); font-weight: 600; margin-bottom: 1rem; color: #f8fafc;">Page not found</h2>
      <p style="font-size: 1rem; color: #94a3b8; max-width: 440px; margin-bottom: 2rem; line-height: 1.5;">
        The requested URL was not found on this server. Please check the address or return to the homepage.
      </p>
      <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; text-decoration: none; padding: 0.65rem 1.5rem; border-radius: 9999px; font-size: 0.9rem; font-weight: 500;">
        Return to Home
      </a>
    </div>
  `;
}

/**
 * Admin Login Form for unauthenticated visitors on /admin
 */
function renderAdminLoginForm(container: HTMLElement) {
  container.innerHTML = `
    <div style="min-height: 75vh; display: flex; align-items: center; justify-content: center; padding: 2rem 1rem;">
      <div class="tilt-card" style="width: 100%; max-width: 460px; background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: var(--card-radius); padding: clamp(1.75rem, 5vw, 2.5rem); box-shadow: 0 16px 45px rgba(0,0,0,0.6);">
        <div style="text-align: center; margin-bottom: 2rem;">
          <span class="eyebrow">Administrative Authentication</span>
          <h2 style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem;">
            SIGN <em>IN.</em>
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.7);">
            Sign in with your authorized credentials to proceed.
          </p>
        </div>

        <div id="admin-login-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

        <form id="admin-login-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="admin-email">Email Address *</label>
            <input type="email" id="admin-email" class="form-input" placeholder="admin@domain.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label" for="admin-password">Password *</label>
            <input type="password" id="admin-password" class="form-input" placeholder="Your password" required autocomplete="current-password" />
          </div>

          <button type="submit" id="admin-login-submit" class="form-submit-btn btn-interactive" style="width: 100%; margin-top: 0.5rem;">
            Authenticate & Proceed
          </button>
        </form>

        <div style="text-align: center; margin-top: 1.5rem;">
          <a href="#/" style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.6); text-decoration: none;">← Return to site</a>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('admin-login-form') as HTMLFormElement;
  const feedback = document.getElementById('admin-login-feedback');
  const submitBtn = document.getElementById('admin-login-submit') as HTMLButtonElement;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;
    feedback.style.display = 'none';

    const email = (document.getElementById('admin-email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('admin-password') as HTMLInputElement)?.value;

    if (!email || !password) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please enter both email and password.';
      feedback.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    const res = await signInWithEmail(email, password);

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Authenticate & Proceed';
      return;
    }

    // Refresh route check
    const user = getCachedUser();
    renderAdminRoute(user, false);
  });
}

/**
 * Render the full Admin Board
 */
function renderAdminDashboard(container: HTMLElement, user: CurrentUser) {
  const stats: AdminStats = computeAdminStats(adminRegistrations);

  // Filter registrations
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

  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; padding: 2rem 0 5rem;">
      <!-- Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2.5rem; border-bottom: 1px solid rgba(217, 180, 90, 0.25); padding-bottom: 1.5rem;">
        <div>
          <span class="eyebrow">Monument MUN 2027 · Internal Administration</span>
          <h1 style="font-family: var(--font-display); font-size: clamp(1.8rem, 4.5vw, 2.75rem); font-weight: 800; text-transform: uppercase; color: #ffffff; line-height: 1.1;">
            SECRETARIAT <em>ADMIN BOARD.</em>
          </h1>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="text-align: right;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #ffffff;">${escapeHtml(user.fullName)}</div>
            <div style="font-size: 0.72rem; color: var(--gold); text-transform: uppercase; letter-spacing: 0.1em;">Administrator</div>
          </div>
          <button type="button" id="admin-signout-btn" class="btn-interactive" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer;">
            Log Out
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2.5rem;">
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.35rem;">Total Applications</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #ffffff;">${stats.total}</div>
        </div>

        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.35rem;">Pending Review</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: var(--gold);">${stats.pending}</div>
        </div>

        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #34d399; margin-bottom: 0.35rem;">Approved Delegates</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #34d399;">${stats.approved}</div>
        </div>

        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.85); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 1.25rem;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: #f87171; margin-bottom: 0.35rem;">Rejected</div>
          <div style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #f87171;">${stats.rejected}</div>
        </div>
      </div>

      <!-- Main Admin Content Grid -->
      <div style="display: grid; grid-template-columns: 1fr; gap: 2.5rem;">
        
        <!-- SECTION 1: REGISTRATIONS MANAGEMENT -->
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
            <div>
              <span class="eyebrow">Delegate Roster</span>
              <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
                REGISTRATION <em>APPLICATIONS.</em>
              </h2>
            </div>

            <button type="button" id="admin-refresh-regs-btn" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.3); color: #ffffff; padding: 0.45rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer;">
              ↺ Refresh List
            </button>
          </div>

          <!-- Search & Filter Controls -->
          <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
            <!-- Search -->
            <div style="flex: 1; min-width: 240px; position: relative;">
              <input type="text" id="admin-search-input" class="form-input" placeholder="Search by name, email, school, or committee..." value="${escapeHtml(adminSearchQuery)}" style="padding-left: 2.25rem;" />
              <span style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: rgba(242, 244, 255, 0.4); font-size: 0.9rem;">🔍</span>
            </div>

            <!-- Filter Buttons -->
            <div style="display: flex; background: rgba(255, 255, 255, 0.05); border-radius: 9999px; padding: 4px; border: 1px solid rgba(255, 255, 255, 0.1); flex-wrap: wrap;">
              <button type="button" class="admin-filter-btn ${adminFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'all' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'all' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
                All (${stats.total})
              </button>
              <button type="button" class="admin-filter-btn ${adminFilter === 'pending' ? 'active' : ''}" data-filter="pending" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'pending' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'pending' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
                Pending (${stats.pending})
              </button>
              <button type="button" class="admin-filter-btn ${adminFilter === 'approved' ? 'active' : ''}" data-filter="approved" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'approved' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'approved' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
                Approved (${stats.approved})
              </button>
              <button type="button" class="admin-filter-btn ${adminFilter === 'rejected' ? 'active' : ''}" data-filter="rejected" style="padding: 0.4rem 0.9rem; border: none; border-radius: 9999px; background: ${adminFilter === 'rejected' ? 'var(--gold)' : 'transparent'}; color: ${adminFilter === 'rejected' ? '#080a1e' : '#f2f4ff'}; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
                Rejected (${stats.rejected})
              </button>
            </div>
          </div>

          <div id="admin-action-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

          <!-- Registrations Table / Card Container -->
          <div id="admin-registrations-container">
            ${renderRegistrationsTableMarkup(filteredRegs)}
          </div>
        </div>

        <!-- SECTION 2: MANAGE ACCESS (STAFF ROLES) -->
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.95); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 20px; padding: clamp(1.25rem, 3vw, 2rem);">
          <div style="margin-bottom: 1.5rem;">
            <span class="eyebrow">Access Control</span>
            <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.4rem;">
              MANAGE <em>ACCESS.</em>
            </h2>
            <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.75);">
              Assign administrative and executive roles. Note: the target user must sign up first before assigning their role.
            </p>
          </div>

          <div id="manage-access-feedback" class="status-banner" style="display: none; margin-bottom: 1.25rem;"></div>

          <!-- Role Assignment Form -->
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

          <!-- Current Staff Members List -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
                CURRENT <em>STAFF MEMBERS (${adminStaff.length})</em>
              </h3>
              <button type="button" id="admin-refresh-staff-btn" class="btn-interactive" style="background: transparent; border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(242, 244, 255, 0.8); padding: 0.3rem 0.8rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; cursor: pointer;">
                ↺ Refresh Staff
              </button>
            </div>

            <div id="admin-staff-container">
              ${renderStaffTableMarkup(adminStaff)}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach event handlers
  attachAdminDashboardHandlers(container, user);
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
        statusBadge = `<span style="background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">Pending</span>`;
      } else if (reg.status === 'approved') {
        statusBadge = `<span style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">Approved</span>`;
      } else {
        statusBadge = `<span style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">Rejected</span>`;
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
            <div style="font-size: 0.82rem; color: #ffffff; font-weight: 600;">
              ${escapeHtml(reg.school)}
            </div>
            <div style="font-size: 0.75rem; color: var(--gold); margin-top: 0.2rem;">
              ${escapeHtml(reg.committee)}
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            <div>${statusBadge}</div>
            <span style="font-size: 0.7rem; color: rgba(242, 244, 255, 0.45);">${formatDate(reg.created_at)}</span>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end;">
            <button type="button" class="btn-interactive admin-approve-btn" data-id="${reg.id}" style="background: rgba(16, 185, 129, 0.18); border: 1px solid #10b981; color: #34d399; padding: 0.4rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
              Approve
            </button>
            <button type="button" class="btn-interactive admin-reject-btn" data-id="${reg.id}" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; padding: 0.4rem 0.85rem; border-radius: 8px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
              Reject
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="admin-reg-list">${rows}</div>`;
}

/**
 * Generate markup for staff members table
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
            <span style="background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.2rem 0.7rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
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
function attachAdminDashboardHandlers(container: HTMLElement, user: CurrentUser) {
  // Sign out button
  document.getElementById('admin-signout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.hash = '#/';
  });

  // Refresh registrations
  document.getElementById('admin-refresh-regs-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('admin-refresh-regs-btn') as HTMLButtonElement;
    if (btn) btn.textContent = 'Updating...';
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  // Refresh staff
  document.getElementById('admin-refresh-staff-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('admin-refresh-staff-btn') as HTMLButtonElement;
    if (btn) btn.textContent = 'Updating...';
    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  // Search input
  const searchInput = document.getElementById('admin-search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', () => {
    adminSearchQuery = searchInput.value.trim();
    const stats = computeAdminStats(adminRegistrations);
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
    const regContainer = document.getElementById('admin-registrations-container');
    if (regContainer) {
      regContainer.innerHTML = renderRegistrationsTableMarkup(filtered);
      attachRegistrationActionButtons(container, user);
    }
  });

  // Filter tabs
  const filterBtns = container.querySelectorAll('.admin-filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter') as 'all' | 'pending' | 'approved' | 'rejected';
      if (f) {
        adminFilter = f;
        renderAdminDashboard(container, user);
      }
    });
  });

  // Attach registration action buttons (Approve / Reject)
  attachRegistrationActionButtons(container, user);

  // Manage access form
  const accessForm = document.getElementById('manage-access-form') as HTMLFormElement;
  const accessFeedback = document.getElementById('manage-access-feedback');
  const accessSubmitBtn = document.getElementById('access-submit-btn') as HTMLButtonElement;

  accessForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!accessFeedback) return;
    accessFeedback.style.display = 'none';

    const emailInput = document.getElementById('access-email') as HTMLInputElement;
    const roleInput = document.getElementById('access-role') as HTMLSelectElement;

    const email = emailInput?.value.trim().toLowerCase();
    const role = (roleInput?.value as UserRole) || 'user';

    if (!email || !email.includes('@')) {
      accessFeedback.className = 'status-banner status-error';
      accessFeedback.textContent = 'Please enter a valid email address.';
      accessFeedback.style.display = 'block';
      emailInput?.focus();
      return;
    }

    accessSubmitBtn.disabled = true;
    accessSubmitBtn.textContent = 'Assigning Role...';

    const res = await setUserRoleRpc(email, role);

    if (res.isError) {
      accessFeedback.className = 'status-banner status-error';
      accessFeedback.textContent = res.message;
      accessFeedback.style.display = 'block';
      accessSubmitBtn.disabled = false;
      accessSubmitBtn.textContent = 'Update Role';
      return;
    }

    accessFeedback.className = 'status-banner status-success';
    accessFeedback.textContent = `✓ ${res.message}`;
    accessFeedback.style.display = 'block';
    if (emailInput) emailInput.value = '';

    await refreshAdminData();
    renderAdminDashboard(container, user);
  });

  // Staff role quick-changer dropdowns
  const staffChangers = container.querySelectorAll('.staff-role-changer');
  staffChangers.forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const email = target.getAttribute('data-email');
      const newRole = target.value as UserRole;
      if (!email || !newRole) return;

      target.disabled = true;
      const res = await setUserRoleRpc(email, newRole);
      if (res.isError) {
        alert(res.message);
      }
      await refreshAdminData();
      renderAdminDashboard(container, user);
    });
  });
}

function attachRegistrationActionButtons(container: HTMLElement, user: CurrentUser) {
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
