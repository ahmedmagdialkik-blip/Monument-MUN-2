import { supabase } from './lib/supabase';
import { getCachedUser } from './auth';

let isSuperAdminStatus: boolean = false;
let hasCheckedSuperAdmin: boolean = false;

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
 * On startup or auth change, verify with the database whether the signed-in
 * account is the super admin. Only trust the database RPC result.
 */
export async function checkIsSuperAdmin(force = false): Promise<boolean> {
  const user = getCachedUser();
  if (!user) {
    isSuperAdminStatus = false;
    hasCheckedSuperAdmin = true;
    return false;
  }

  if (hasCheckedSuperAdmin && !force) {
    return isSuperAdminStatus;
  }

  try {
    const { data, error } = await supabase.rpc('is_super_admin');
    if (error) {
      isSuperAdminStatus = false;
    } else {
      isSuperAdminStatus = data === true;
    }
  } catch {
    isSuperAdminStatus = false;
  }

  hasCheckedSuperAdmin = true;
  return isSuperAdminStatus;
}

export function isSuperAdminUser(): boolean {
  return isSuperAdminStatus;
}

export function resetSuperAdminCache(): void {
  isSuperAdminStatus = false;
  hasCheckedSuperAdmin = false;
}

/**
 * Render "Log in as" button markup next to an account.
 * CRITICAL REQUIREMENT: If is_super_admin is false or errors, render NOTHING (no hidden buttons).
 */
export function renderLoginAsButtonMarkup(targetUserId?: string | null, targetName?: string | null): string {
  if (!isSuperAdminStatus || !targetUserId) {
    return '';
  }

  const currentUser = getCachedUser();
  if (currentUser && currentUser.id === targetUserId) {
    return '';
  }

  const safeName = targetName || 'User';

  return `
    <button type="button" class="btn-interactive super-admin-login-as-btn" data-userid="${escapeHtml(targetUserId)}" data-name="${escapeHtml(safeName)}" title="Log in as ${escapeHtml(safeName)}" style="background: rgba(217, 180, 90, 0.16); border: 1px solid var(--gold); color: var(--gold); padding: 0.32rem 0.75rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.35rem; transition: background var(--fast) var(--ease), transform var(--fast) var(--ease);">
      <span>⇄</span>
      <span>Log in as</span>
    </button>
  `;
}

/**
 * Attach click listeners to all .super-admin-login-as-btn in the container
 */
export function bindSuperAdminLoginAsButtons(container: HTMLElement): void {
  if (!isSuperAdminStatus) return;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.super-admin-login-as-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const targetUserId = btn.getAttribute('data-userid');
      const targetName = btn.getAttribute('data-name') || 'this user';
      if (!targetUserId) return;

      const confirmed = window.confirm(`Log in as ${targetName}?`);
      if (!confirmed) return;

      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span>Connecting...</span>`;

      try {
        // 1. Save current session in sessionStorage under "superAdminReturn"
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (sessionErr || !session?.access_token || !session?.refresh_token) {
          alert('Could not capture current session to switch account.');
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        sessionStorage.setItem(
          'superAdminReturn',
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            viewing_name: targetName
          })
        );

        // 2. Call supabase.functions.invoke('super-admin-login-as', { body: { target_user_id } })
        const { data: funcData, error: funcErr } = await supabase.functions.invoke('super-admin-login-as', {
          body: { target_user_id: targetUserId }
        });

        if (funcErr) {
          sessionStorage.removeItem('superAdminReturn');
          alert(`Login as failed: ${funcErr.message || 'Server error'}`);
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        const token_hash = funcData?.token_hash;
        if (!token_hash) {
          sessionStorage.removeItem('superAdminReturn');
          alert(`Failed to retrieve token hash: ${funcData?.error || 'Invalid server response'}`);
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        // 3. With returned token_hash, call supabase.auth.verifyOtp
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash,
          type: 'magiclink'
        });

        if (otpErr) {
          // Revert back to original session
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          });
          sessionStorage.removeItem('superAdminReturn');
          alert(`Authentication verification failed: ${otpErr.message}`);
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        // Reload app state
        window.location.hash = '#/staff';
        window.location.reload();
      } catch (err: unknown) {
        sessionStorage.removeItem('superAdminReturn');
        const msg = err instanceof Error ? err.message : 'Unknown error';
        alert(`Failed to complete switch: ${msg}`);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  });
}

/**
 * While viewing as someone else, render a thin gold banner fixed at the top:
 * "Viewing as <name> · Return to my account"
 */
export function initSuperAdminReturnBanner(): void {
  const existing = document.getElementById('super-admin-return-banner');
  const raw = sessionStorage.getItem('superAdminReturn');

  if (!raw) {
    if (existing) existing.remove();
    document.body.classList.remove('has-superadmin-banner');
    return;
  }

  let viewingName = 'User';
  try {
    const parsed = JSON.parse(raw);
    viewingName = parsed.viewing_name || 'User';
  } catch {}

  if (!existing) {
    const banner = document.createElement('div');
    banner.id = 'super-admin-return-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000000;
      background: #d9b45a;
      color: #080a1e;
      font-family: var(--font-display);
      font-size: 0.8rem;
      font-weight: 700;
      padding: 0.35rem 1rem;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(8, 10, 30, 0.2);
    `;
    banner.innerHTML = `
      <span>Viewing as <strong>${escapeHtml(viewingName)}</strong></span>
      <span style="opacity: 0.5;">·</span>
      <button type="button" id="super-admin-return-btn" style="background: #080a1e; color: #d9b45a; border: 1px solid #080a1e; border-radius: 9999px; padding: 0.22rem 0.85rem; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer; letter-spacing: 0.05em;">
        Return to my account
      </button>
    `;
    document.body.prepend(banner);
    document.body.classList.add('has-superadmin-banner');

    document.getElementById('super-admin-return-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('super-admin-return-btn') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Returning...';
      }
      try {
        const stored = sessionStorage.getItem('superAdminReturn');
        if (!stored) {
          window.location.reload();
          return;
        }
        const parsed = JSON.parse(stored);
        sessionStorage.removeItem('superAdminReturn');

        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token
        });

        if (error) {
          alert(`Error restoring original account: ${error.message}`);
          return;
        }

        window.location.hash = '#/staff';
        window.location.reload();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        alert(`Failed to return to original account: ${msg}`);
      }
    });
  }
}
