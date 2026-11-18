// ====================================================
// ACCEPTED TEAM MEMBER WELCOME & ACCOUNT ACTIVATION
// Handles ?welcome=<TOKEN> query links independently of hash routes.
// Calls public Supabase Edge Function 'activate-account'.
// ====================================================

import { supabase } from './lib/supabase';

export interface ActivateAccountInfoResponse {
  ok: boolean;
  name: string;
  role: string;
  email: string;
  has_account: boolean;
  error?: string;
  message?: string;
}

export interface ActivateAccountClaimResponse {
  ok: boolean;
  email: string;
  name: string;
  role: string;
  error?: string;
  message?: string;
}

export interface TeamWelcomeCallbacks {
  onGoToMainSite: () => void;
  onGoToSignIn: (email: string) => void;
  onAccountActivated: (email: string) => Promise<void> | void;
}

interface ParsedFunctionError {
  code?: string;
  message: string;
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Read ?welcome=<TOKEN> from URL query string
 */
export function getWelcomeTokenFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('welcome');
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Remove ?welcome=... from URL via history.replaceState without reloading
 */
export function clearWelcomeQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    const cleanSearch = url.searchParams.toString();
    const cleanUrl = `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${url.hash}`;
    window.history.replaceState(null, '', cleanUrl || '/');
  } catch {
    // Fallback if URL constructor unavailable
    window.history.replaceState(null, '', `/${window.location.hash || ''}`);
  }
}

/**
 * Extract real JSON error message & code from FunctionsHttpError or response body
 */
async function extractEdgeFunctionError(
  error: unknown,
  fallbackData?: { error?: string; message?: string } | null
): Promise<ParsedFunctionError> {
  if (fallbackData && (fallbackData.message || fallbackData.error)) {
    return {
      code: fallbackData.error,
      message: fallbackData.message || fallbackData.error || 'Request failed.'
    };
  }

  if (error && typeof error === 'object') {
    const errObj = error as { context?: { json?: () => Promise<unknown> }; message?: string };
    if (errObj.context && typeof errObj.context.json === 'function') {
      try {
        const body = (await errObj.context.json()) as { error?: string; message?: string } | null;
        if (body && (body.message || body.error)) {
          return {
            code: body.error,
            message: body.message || body.error || 'Request failed.'
          };
        }
      } catch {
        // Response body may already be consumed or non-JSON; fall through to message
      }
    }
    if (errObj.message) {
      return { message: errObj.message };
    }
  }

  return { message: 'Unable to reach the activation service. Please try again.' };
}

function injectTeamWelcomeStyles(): HTMLStyleElement {
  const existing = document.getElementById('team-welcome-styles') as HTMLStyleElement | null;
  if (existing) existing.remove();

  const styleEl = document.createElement('style');
  styleEl.id = 'team-welcome-styles';
  styleEl.textContent = `
    #team-welcome-root {
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: #080a1e;
      color: #f2f4ff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      overflow-x: hidden;
      padding: clamp(1.25rem, 4vw, 2.5rem);
      font-family: var(--font-body, 'Plus Jakarta Sans', system-ui, sans-serif);
      opacity: 0;
      animation: twRootFadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }

    .tw-backdrop-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 50% 38%, rgba(217, 180, 90, 0.16) 0%, rgba(217, 180, 90, 0.05) 38%, transparent 70%),
        radial-gradient(circle at 50% 100%, rgba(16, 22, 62, 0.8) 0%, transparent 60%);
    }

    .tw-particles-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 1;
    }

    .tw-particle {
      position: absolute;
      bottom: -24px;
      border-radius: 9999px;
      background: radial-gradient(circle, #fff3c4 0%, #d9b45a 55%, rgba(217, 180, 90, 0) 100%);
      box-shadow: 0 0 8px rgba(217, 180, 90, 0.55);
      opacity: 0;
      animation-name: twParticleRise;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }

    .tw-particle.is-star {
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      color: #e8c975;
      text-shadow: 0 0 10px rgba(217, 180, 90, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .tw-stage-container {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 720px;
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .tw-emblem-frame {
      position: relative;
      width: 108px;
      height: 108px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(12, 16, 44, 0.9);
      border: 1.5px solid rgba(217, 180, 90, 0.65);
      box-shadow: 0 0 36px rgba(217, 180, 90, 0.24), inset 0 0 18px rgba(217, 180, 90, 0.14);
      margin-bottom: 2rem;
      opacity: 0;
      transform: scale(0.84);
      animation: twEmblemReveal 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards;
    }

    .tw-emblem-frame::after {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      border: 1px solid rgba(217, 180, 90, 0.25);
      pointer-events: none;
    }

    .tw-emblem-img {
      width: 72px;
      height: 72px;
      object-fit: contain;
      border-radius: 50%;
    }

    .tw-eyebrow-reveal {
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: clamp(0.85rem, 2.4vw, 1.15rem);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.38em;
      color: #d9b45a;
      margin: 0 0 0.7rem;
      opacity: 0;
      transform: translateY(14px);
      animation: twTextReveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.75s forwards;
    }

    .tw-main-title {
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: clamp(1.9rem, 5.6vw, 3.65rem);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      line-height: 1.12;
      margin: 0 0 1.4rem;
      background: linear-gradient(
        105deg,
        #d9b45a 0%,
        #f8ebc2 26%,
        #d9b45a 48%,
        #ffffff 54%,
        #d9b45a 64%,
        #c79e43 100%
      );
      background-size: 230% auto;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      opacity: 0;
      transform: translateY(16px);
      animation:
        twTextReveal 0.95s cubic-bezier(0.22, 1, 0.36, 1) 1.2s forwards,
        twGoldShimmer 3.8s ease-in-out 1.6s infinite;
    }

    .tw-divider {
      width: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, #d9b45a, transparent);
      margin: 0 auto 1.4rem;
      opacity: 0.85;
      animation: twLineGrow 0.85s cubic-bezier(0.22, 1, 0.36, 1) 1.9s forwards;
    }

    .tw-identity-block {
      opacity: 0;
      transform: translateY(14px);
      animation: twTextReveal 0.85s cubic-bezier(0.22, 1, 0.36, 1) 2.2s forwards;
      margin-bottom: 2.5rem;
    }

    .tw-identity-name-role {
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: clamp(1.15rem, 3.2vw, 1.65rem);
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.06em;
      line-height: 1.4;
      margin: 0;
    }

    .tw-identity-name-role span.tw-role-accent {
      color: #d9b45a;
    }

    .tw-stage1-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 52px;
      margin-bottom: 1rem;
    }

    .tw-continue-btn {
      background: #d9b45a;
      color: #080a1e;
      border: 1.5px solid #e8ca7a;
      padding: 0.9rem 2.35rem;
      border-radius: 6px;
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: 0.88rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(217, 180, 90, 0.28);
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      animation: twContinueReveal 0.65s cubic-bezier(0.22, 1, 0.36, 1) 5s forwards;
      transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }

    .tw-continue-btn:hover {
      background: #e5c36c;
      box-shadow: 0 12px 34px rgba(217, 180, 90, 0.4);
      transform: translateY(-1px);
    }

    .tw-skip-btn {
      position: fixed;
      bottom: clamp(1.25rem, 4vw, 2rem);
      right: clamp(1.25rem, 4vw, 2rem);
      z-index: 4;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(217, 180, 90, 0.38);
      color: rgba(242, 244, 255, 0.82);
      padding: 0.5rem 1.05rem;
      border-radius: 6px;
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .tw-skip-btn:hover {
      background: rgba(217, 180, 90, 0.16);
      border-color: #d9b45a;
      color: #ffffff;
    }

    /* Card used for Stage 2, Already Activated, and Invalid Link */
    .tw-card {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 460px;
      margin: auto;
      background: rgba(12, 16, 44, 0.94);
      border: 1px solid rgba(217, 180, 90, 0.34);
      border-radius: 14px;
      padding: clamp(1.6rem, 4.5vw, 2.35rem);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.68);
      opacity: 0;
      transform: translateY(14px);
      animation: twTextReveal 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }

    .tw-card-title {
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: clamp(1.35rem, 3.8vw, 1.75rem);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #ffffff;
      margin: 0 0 0.55rem;
      line-height: 1.25;
    }

    .tw-card-subtitle {
      font-size: 0.92rem;
      color: rgba(242, 244, 255, 0.74);
      line-height: 1.55;
      margin: 0 0 1.5rem;
    }

    .tw-field-group {
      margin-bottom: 1.15rem;
      text-align: left;
    }

    .tw-label {
      display: block;
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #d9b45a;
      margin-bottom: 0.42rem;
    }

    .tw-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .tw-input {
      width: 100%;
      background: rgba(8, 10, 30, 0.9);
      border: 1px solid rgba(217, 180, 90, 0.3);
      border-radius: 8px;
      padding: 0.78rem 0.95rem;
      color: #ffffff;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .tw-input:focus {
      border-color: #d9b45a;
      box-shadow: 0 0 0 2px rgba(217, 180, 90, 0.18);
    }

    .tw-input[readonly] {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.16);
      color: rgba(242, 244, 255, 0.78);
      cursor: not-allowed;
    }

    .tw-input.has-toggle {
      padding-right: 4.3rem;
    }

    .tw-pw-toggle {
      position: absolute;
      right: 0.55rem;
      background: rgba(217, 180, 90, 0.14);
      border: 1px solid rgba(217, 180, 90, 0.32);
      color: #d9b45a;
      border-radius: 5px;
      padding: 0.28rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .tw-pw-toggle:hover {
      background: rgba(217, 180, 90, 0.25);
    }

    .tw-error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.55);
      color: #fecaca;
      border-radius: 8px;
      padding: 0.85rem 1rem;
      font-size: 0.88rem;
      line-height: 1.5;
      margin-bottom: 1.25rem;
      text-align: left;
    }

    .tw-primary-btn {
      width: 100%;
      background: #d9b45a;
      color: #080a1e;
      border: none;
      border-radius: 8px;
      padding: 0.9rem 1.4rem;
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: 0.88rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      cursor: pointer;
      transition: background 0.2s ease, opacity 0.2s ease;
    }

    .tw-primary-btn:hover:not(:disabled) {
      background: #e5c36c;
    }

    .tw-primary-btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .tw-secondary-btn {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.24);
      color: #f2f4ff;
      border-radius: 8px;
      padding: 0.78rem 1.35rem;
      font-family: 'Cinzel', var(--font-display, serif);
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .tw-secondary-btn:hover {
      background: rgba(255, 255, 255, 0.13);
    }

    @keyframes twRootFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes twEmblemReveal {
      from { opacity: 0; transform: scale(0.84); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes twTextReveal {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes twLineGrow {
      from { width: 0; }
      to { width: 160px; }
    }

    @keyframes twGoldShimmer {
      0% { background-position: 180% center; }
      50% { background-position: 0% center; }
      100% { background-position: 180% center; }
    }

    @keyframes twContinueReveal {
      from { opacity: 0; pointer-events: none; transform: translateY(10px); }
      to { opacity: 1; pointer-events: auto; transform: translateY(0); }
    }

    @keyframes twParticleRise {
      0% {
        transform: translateY(0) translateX(0) scale(0.75);
        opacity: 0;
      }
      15% {
        opacity: 0.8;
      }
      80% {
        opacity: 0.55;
      }
      100% {
        transform: translateY(-108vh) translateX(16px) scale(1.1);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #team-welcome-root,
      .tw-emblem-frame,
      .tw-eyebrow-reveal,
      .tw-main-title,
      .tw-identity-block,
      .tw-card {
        opacity: 1 !important;
        transform: none !important;
        animation: none !important;
      }

      .tw-main-title {
        background: none !important;
        -webkit-background-clip: border-box !important;
        background-clip: border-box !important;
        color: #d9b45a !important;
      }

      .tw-divider {
        width: 160px !important;
        animation: none !important;
      }

      .tw-continue-btn {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: none !important;
        animation: none !important;
      }

      .tw-particles-layer {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(styleEl);
  return styleEl;
}

function buildParticlesMarkup(): string {
  const count = 26;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const leftPct = ((i * 37 + 11) % 96) + 2;
    const delaySec = ((i * 0.41) % 5.5).toFixed(2);
    const durationSec = (6.5 + (i % 6) * 1.15).toFixed(2);
    const isStar = i % 4 === 0;
    const sizePx = isStar ? 10 + (i % 3) * 3 : 3 + (i % 4) * 1.5;

    if (isStar) {
      parts.push(
        `<span class="tw-particle is-star" style="left: ${leftPct}%; font-size: ${sizePx}px; animation-delay: ${delaySec}s; animation-duration: ${durationSec}s;">✦</span>`
      );
    } else {
      parts.push(
        `<span class="tw-particle" style="left: ${leftPct}%; width: ${sizePx}px; height: ${sizePx}px; animation-delay: ${delaySec}s; animation-duration: ${durationSec}s;"></span>`
      );
    }
  }
  return parts.join('');
}

function buildEmblemMarkup(): string {
  return `
    <div class="tw-emblem-frame" aria-hidden="true">
      <img
        src="logo-mark.png"
        alt="Monument MUN emblem"
        class="tw-emblem-img"
        onerror="this.style.display='none'; var fb = this.nextElementSibling; if (fb) fb.style.display='block';"
      />
      <svg
        viewBox="0 0 64 64"
        width="54"
        height="54"
        style="display: none;"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="32" cy="30" r="15" stroke="#d9b45a" stroke-width="1.6" />
        <ellipse cx="32" cy="30" rx="7.5" ry="15" stroke="#d9b45a" stroke-width="1.2" />
        <line x1="17" y1="30" x2="47" y2="30" stroke="#d9b45a" stroke-width="1.2" />
        <path d="M16 40C10 34 10 22 17 15" stroke="#d9b45a" stroke-width="1.8" stroke-linecap="round" />
        <path d="M48 40C54 34 54 22 47 15" stroke="#d9b45a" stroke-width="1.8" stroke-linecap="round" />
        <path d="M20 46C26 51 38 51 44 46" stroke="#d9b45a" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </div>
  `;
}

/**
 * Start the full-screen ?welcome=<TOKEN> experience.
 */
export async function startTeamWelcomeFlow(
  token: string,
  callbacks: TeamWelcomeCallbacks
): Promise<void> {
  const existingRoot = document.getElementById('team-welcome-root');
  if (existingRoot) existingRoot.remove();

  const styleEl = injectTeamWelcomeStyles();
  const root = document.createElement('div');
  root.id = 'team-welcome-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Monument MUN Team Welcome');

  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  function cleanupOverlay(): void {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    root.remove();
    styleEl.remove();
  }

  // Initial loading UI while validating link
  root.innerHTML = `
    <div class="tw-backdrop-glow" aria-hidden="true"></div>
    <div class="tw-card" style="text-align: center;">
      <div style="display: inline-block; width: 34px; height: 34px; border: 3px solid rgba(217, 180, 90, 0.22); border-top-color: #d9b45a; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1.1rem;"></div>
      <h2 class="tw-card-title" style="font-size: 1.15rem; margin-bottom: 0.45rem;">Verifying Invitation</h2>
      <p class="tw-card-subtitle" style="margin-bottom: 0;">Preparing your Monument MUN team welcome...</p>
    </div>
  `;
  document.body.appendChild(root);

  function renderInvalidLinkView(detailMessage?: string): void {
    root.innerHTML = `
      <div class="tw-backdrop-glow" aria-hidden="true"></div>
      <div class="tw-card" style="text-align: center;">
        <div style="width: 52px; height: 52px; border-radius: 50%; margin: 0 auto 1.1rem; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.48); color: #fca5a5; font-size: 1.35rem; font-weight: 800;">
          !
        </div>
        <h1 class="tw-card-title">This link is not valid or has expired</h1>
        <p class="tw-card-subtitle">
          ${escapeHtml(
            detailMessage && !detailMessage.toLowerCase().includes('non-2xx')
              ? detailMessage
              : 'Please double-check the personal link from your Monument MUN acceptance email or contact the Secretariat for a new invitation.'
          )}
        </p>
        <button type="button" id="tw-invalid-home-btn" class="tw-primary-btn">
          Return to Main Site
        </button>
      </div>
    `;

    document.getElementById('tw-invalid-home-btn')?.addEventListener('click', () => {
      clearWelcomeQueryParam();
      cleanupOverlay();
      callbacks.onGoToMainSite();
    });
  }

  function renderAlreadyActivatedView(info: ActivateAccountInfoResponse): void {
    root.innerHTML = `
      <div class="tw-backdrop-glow" aria-hidden="true"></div>
      <div class="tw-card" style="text-align: center;">
        ${buildEmblemMarkup()}
        <h1 class="tw-card-title">Your account is already activated</h1>
        <p style="font-family: 'Cinzel', var(--font-display, serif); font-size: 0.92rem; font-weight: 700; color: #d9b45a; letter-spacing: 0.06em; margin: 0 0 0.75rem;">
          ${escapeHtml(info.name)}${info.role ? ` — ${escapeHtml(info.role)}` : ''}
        </p>
        <p class="tw-card-subtitle">
          An account for <strong style="color: #ffffff;">${escapeHtml(info.email)}</strong> is already set up. Sign in to view your portal and QR pass.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <button type="button" id="tw-already-signin-btn" class="tw-primary-btn">
            Go to sign in
          </button>
          <button type="button" id="tw-already-home-btn" class="tw-secondary-btn">
            Return to Main Site
          </button>
        </div>
      </div>
    `;

    document.getElementById('tw-already-signin-btn')?.addEventListener('click', () => {
      clearWelcomeQueryParam();
      cleanupOverlay();
      callbacks.onGoToSignIn(info.email);
    });

    document.getElementById('tw-already-home-btn')?.addEventListener('click', () => {
      clearWelcomeQueryParam();
      cleanupOverlay();
      callbacks.onGoToMainSite();
    });
  }

  function renderSetPasswordStage(info: ActivateAccountInfoResponse): void {
    root.innerHTML = `
      <div class="tw-backdrop-glow" aria-hidden="true"></div>
      <div class="tw-card">
        <div style="text-align: center; margin-bottom: 1.35rem;">
          <div style="font-family: 'Cinzel', var(--font-display, serif); font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: #d9b45a; margin-bottom: 0.4rem;">
            ${escapeHtml(info.name)}${info.role ? ` · ${escapeHtml(info.role)}` : ''}
          </div>
          <h1 class="tw-card-title">Activate your account</h1>
          <p class="tw-card-subtitle" style="margin-bottom: 0;">
            Set a password below to claim your team account and unlock your QR pass.
          </p>
        </div>

        <div id="tw-claim-error" class="tw-error-banner" role="alert" style="display: none;"></div>

        <form id="tw-claim-form" novalidate>
          <div class="tw-field-group">
            <label class="tw-label" for="tw-email">Email</label>
            <input
              type="email"
              id="tw-email"
              class="tw-input"
              value="${escapeHtml(info.email)}"
              readonly
              aria-readonly="true"
              autocomplete="username"
            />
          </div>

          <div class="tw-field-group">
            <label class="tw-label" for="tw-password">Password</label>
            <div class="tw-input-wrap">
              <input
                type="password"
                id="tw-password"
                class="tw-input has-toggle"
                placeholder="Minimum 8 characters"
                minlength="8"
                required
                autocomplete="new-password"
              />
              <button
                type="button"
                id="tw-toggle-pw"
                class="tw-pw-toggle"
                aria-label="Show password"
                aria-pressed="false"
              >
                Show
              </button>
            </div>
          </div>

          <div class="tw-field-group" style="margin-bottom: 1.5rem;">
            <label class="tw-label" for="tw-confirm">Confirm password</label>
            <div class="tw-input-wrap">
              <input
                type="password"
                id="tw-confirm"
                class="tw-input has-toggle"
                placeholder="Re-enter your password"
                minlength="8"
                required
                autocomplete="new-password"
              />
              <button
                type="button"
                id="tw-toggle-confirm"
                class="tw-pw-toggle"
                aria-label="Show confirm password"
                aria-pressed="false"
              >
                Show
              </button>
            </div>
          </div>

          <button type="submit" id="tw-submit-btn" class="tw-primary-btn">
            Create my account
          </button>
        </form>
      </div>
    `;

    const pwInput = document.getElementById('tw-password') as HTMLInputElement | null;
    const confirmInput = document.getElementById('tw-confirm') as HTMLInputElement | null;
    const togglePwBtn = document.getElementById('tw-toggle-pw') as HTMLButtonElement | null;
    const toggleConfirmBtn = document.getElementById('tw-toggle-confirm') as HTMLButtonElement | null;
    const form = document.getElementById('tw-claim-form') as HTMLFormElement | null;
    const errorBox = document.getElementById('tw-claim-error') as HTMLElement | null;
    const submitBtn = document.getElementById('tw-submit-btn') as HTMLButtonElement | null;

    function bindPasswordToggle(btn: HTMLButtonElement | null, input: HTMLInputElement | null, labelName: string): void {
      if (!btn || !input) return;
      btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Hide' : 'Show';
        btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        btn.setAttribute('aria-label', isHidden ? `Hide ${labelName}` : `Show ${labelName}`);
      });
    }

    bindPasswordToggle(togglePwBtn, pwInput, 'password');
    bindPasswordToggle(toggleConfirmBtn, confirmInput, 'confirm password');

    function showFormError(msg: string, showSignInAction = false): void {
      if (!errorBox) return;
      errorBox.innerHTML = `
        <div>${escapeHtml(msg)}</div>
        ${
          showSignInAction
            ? `<button type="button" id="tw-err-signin-btn" class="tw-secondary-btn" style="margin-top: 0.75rem; padding: 0.5rem 1rem; font-size: 0.75rem;">Go to sign in</button>`
            : ''
        }
      `;
      errorBox.style.display = 'block';
      if (showSignInAction) {
        document.getElementById('tw-err-signin-btn')?.addEventListener('click', () => {
          clearWelcomeQueryParam();
          cleanupOverlay();
          callbacks.onGoToSignIn(info.email);
        });
      }
    }

    function hideFormError(): void {
      if (errorBox) errorBox.style.display = 'none';
    }

    pwInput?.focus();

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideFormError();

      const password = pwInput?.value || '';
      const confirm = confirmInput?.value || '';

      if (password.length < 8) {
        showFormError('Password must be at least 8 characters long.');
        pwInput?.focus();
        return;
      }

      if (password !== confirm) {
        showFormError('Passwords do not match.');
        confirmInput?.focus();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating my account...';
      }

      try {
        const { data: claimData, error: claimError } = await supabase.functions.invoke<ActivateAccountClaimResponse>(
          'activate-account',
          { body: { action: 'claim', token, password } }
        );

        if (claimError || !claimData || claimData.ok === false) {
          const parsed = await extractEdgeFunctionError(claimError, claimData);
          showFormError(parsed.message, parsed.code === 'account_exists');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create my account';
          }
          return;
        }

        const loginEmail = claimData.email || info.email;
        if (submitBtn) {
          submitBtn.textContent = 'Signing you in...';
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password
        });

        if (signInError) {
          showFormError(
            `Your account was created, but automatic sign-in failed: ${signInError.message}`,
            true
          );
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create my account';
          }
          return;
        }

        clearWelcomeQueryParam();
        cleanupOverlay();
        await callbacks.onAccountActivated(loginEmail);
      } catch (err) {
        const parsed = await extractEdgeFunctionError(err, null);
        showFormError(parsed.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create my account';
        }
      }
    });
  }

  function renderStageOneAnimation(info: ActivateAccountInfoResponse): void {
    const rolePart = info.role ? ` - <span class="tw-role-accent">${escapeHtml(info.role)}</span>` : '';

    root.innerHTML = `
      <div class="tw-backdrop-glow" aria-hidden="true"></div>
      <div class="tw-particles-layer" aria-hidden="true">
        ${buildParticlesMarkup()}
      </div>

      <div class="tw-stage-container">
        ${buildEmblemMarkup()}
        <div class="tw-eyebrow-reveal">WELCOME TO THE</div>
        <h1 class="tw-main-title">MONUMENT MUN TEAM</h1>
        <div class="tw-divider" aria-hidden="true"></div>

        <div class="tw-identity-block">
          <p class="tw-identity-name-role">
            ${escapeHtml(info.name)}${rolePart}
          </p>
        </div>

        <div class="tw-stage1-actions">
          <button type="button" id="tw-continue-btn" class="tw-continue-btn">
            Continue →
          </button>
        </div>
      </div>

      <button type="button" id="tw-skip-btn" class="tw-skip-btn" aria-label="Skip welcome animation">
        Skip →
      </button>
    `;

    const advanceToStageTwo = () => {
      renderSetPasswordStage(info);
    };

    document.getElementById('tw-skip-btn')?.addEventListener('click', advanceToStageTwo);
    document.getElementById('tw-continue-btn')?.addEventListener('click', advanceToStageTwo);
  }

  try {
    const { data, error } = await supabase.functions.invoke<ActivateAccountInfoResponse>(
      'activate-account',
      { body: { action: 'info', token } }
    );

    if (error || !data || data.ok === false) {
      const parsed = await extractEdgeFunctionError(error, data);
      renderInvalidLinkView(parsed.message);
      return;
    }

    if (data.has_account) {
      renderAlreadyActivatedView(data);
      return;
    }

    renderStageOneAnimation(data);
  } catch (err) {
    const parsed = await extractEdgeFunctionError(err, null);
    renderInvalidLinkView(parsed.message);
  }
}
