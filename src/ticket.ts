// ====================================================
// STAFF ENTRY PASS & QR CODE CREDENTIAL
// Powered by qrcode.react & Supabase staff_tickets
// ====================================================

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './lib/supabase';
import type { CurrentUser } from './auth';

let cachedTicketToken: string | null = null;
let hasTriggeredPassRevealAnimation = false;
let activeWakeLock: WakeLockSentinel | null = null;

// Track active React roots to prevent memory leaks
let cardQrRoot: Root | null = null;
let modalQrRoot: Root | null = null;

/**
 * Configure whether the upcoming pass render should play the reveal animation
 */
export function setTriggerPassRevealAnimation(value: boolean): void {
  hasTriggeredPassRevealAnimation = value;
}

/**
 * Clear in-memory token cache on sign-out (Never store in localStorage)
 */
export function clearStaffTicketCache(): void {
  cachedTicketToken = null;
  hasTriggeredPassRevealAnimation = false;
  if (activeWakeLock) {
    activeWakeLock.release().catch(() => {});
    activeWakeLock = null;
  }
}

/**
 * Escape HTML safely
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
 * Request Screen Wake Lock so screen does not sleep while showing pass
 */
async function requestScreenWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !activeWakeLock) {
      activeWakeLock = await navigator.wakeLock.request('screen');
      activeWakeLock.addEventListener('release', () => {
        activeWakeLock = null;
      });
    }
  } catch {
    // Wake Lock is optional progressive enhancement
  }
}

/**
 * Release active Screen Wake Lock
 */
function releaseScreenWakeLock(): void {
  if (activeWakeLock) {
    activeWakeLock.release().catch(() => {});
    activeWakeLock = null;
  }
}

/**
 * Fetch staff entry ticket token from database.
 * Table: staff_tickets (user_id, token)
 * Row-level security restricts read to current user row only.
 */
export async function fetchStaffTicketToken(
  userRole: string
): Promise<{ token?: string; error?: string; noPass?: boolean }> {
  // Only roles 'eb', 'head', 'security', and 'admin' are eligible
  if (!['eb', 'head', 'security', 'admin'].includes(userRole)) {
    return { noPass: true };
  }

  if (cachedTicketToken) {
    return { token: cachedTicketToken };
  }

  try {
    const { data, error } = await supabase
      .from('staff_tickets')
      .select('token')
      .single();

    if (error) {
      // PGRST116 means zero rows found
      if (error.code === 'PGRST116' || error.message?.toLowerCase().includes('0 rows')) {
        return { noPass: true };
      }
      return { error: error.message };
    }

    if (!data?.token) {
      return { noPass: true };
    }

    cachedTicketToken = data.token;
    return { token: data.token };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve ticket';
    return { error: msg };
  }
}

/**
 * Inject required CSS animations once
 */
function ensurePassStyles(): void {
  if (document.getElementById('monument-pass-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'monument-pass-styles';
  styleEl.textContent = `
    @keyframes passCardSlideUp {
      0% {
        opacity: 0;
        transform: translateY(28px) scale(0.97);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      }
      50% {
        box-shadow: 0 0 50px rgba(217, 180, 90, 0.55), 0 20px 40px rgba(0,0,0,0.7);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
      }
    }

    @keyframes passCardFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }

    @keyframes qrLaserScan {
      0% {
        top: 0%;
        opacity: 0;
      }
      20% {
        opacity: 1;
      }
      85% {
        opacity: 1;
      }
      100% {
        top: 100%;
        opacity: 0;
      }
    }

    .pass-card-animated {
      animation: passCardSlideUp 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .pass-card-fade {
      animation: passCardFadeIn 0.5s ease forwards;
    }

    .qr-scan-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #d9b45a, #fff, #d9b45a, transparent);
      box-shadow: 0 0 12px #d9b45a;
      pointer-events: none;
      z-index: 5;
      animation: qrLaserScan 1.1s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards;
    }

    @media (prefers-reduced-motion: reduce) {
      .pass-card-animated {
        animation: passCardFadeIn 0.3s ease forwards !important;
      }
      .qr-scan-line {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

/**
 * Download SVG element as high-resolution PNG
 */
export function downloadQrAsPng(svgElement: SVGSVGElement, attendeeName = 'staff'): void {
  try {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // High-resolution for scanning in sunlight or printing
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Pure white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw QR centered with generous border
      const padding = 60;
      ctx.drawImage(img, padding, padding, canvas.width - padding * 2, canvas.height - padding * 2);
      URL.revokeObjectURL(blobURL);

      const pngUrl = canvas.toDataURL('image/png');
      const cleanName = attendeeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `monument-mun-pass-${cleanName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = blobURL;
  } catch (err) {
    console.error('Failed to export QR PNG:', err);
  }
}

/**
 * Open Full-Screen Entry Pass Modal with Maximum Contrast and Screen Wake Lock
 */
export function openFullScreenPassModal(token: string, user: CurrentUser): void {
  requestScreenWakeLock();

  const existing = document.getElementById('pass-fullscreen-modal');
  if (existing) existing.remove();

  const position = user.profile?.eb_position || (user.role === 'admin' ? 'Administrator' : 'Executive Board Member');
  const roleDisplay = user.role.toUpperCase();

  const modal = document.createElement('div');
  modal.id = 'pass-fullscreen-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: #ffffff;
    color: #080a1e;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow-y: auto;
    animation: passCardFadeIn 0.25s ease forwards;
  `;

  modal.innerHTML = `
    <div style="width: 100%; max-width: 480px; text-align: center; display: flex; flex-direction: column; align-items: center;">
      <!-- Close Button Top -->
      <button type="button" id="pass-fullscreen-close-btn" class="btn-interactive" style="align-self: flex-end; background: #080a1e; color: #ffffff; border: none; padding: 0.6rem 1.25rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; margin-bottom: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
        ✕ Close
      </button>

      <!-- Pass Badge -->
      <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(8, 10, 30, 0.08); padding: 0.35rem 0.85rem; border-radius: 9999px; margin-bottom: 1.25rem;">
        <span style="color: #d9b45a; font-size: 0.85rem;">★</span>
        <span style="font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #080a1e;">
          VENUE ENTRANCE PASS · ${escapeHtml(roleDisplay)}
        </span>
      </div>

      <!-- High-Contrast Large QR Container -->
      <div style="background: #ffffff; padding: 1.25rem; border: 4px solid #080a1e; border-radius: 24px; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12); margin-bottom: 1.5rem; display: flex; justify-content: center; align-items: center;">
        <div id="fullscreen-qr-mount"></div>
      </div>

      <!-- Attendee Identity -->
      <h2 style="font-family: var(--font-display); font-size: clamp(1.6rem, 5vw, 2.2rem); font-weight: 800; text-transform: uppercase; color: #080a1e; margin-bottom: 0.25rem; line-height: 1.15;">
        ${escapeHtml(user.fullName)}
      </h2>
      <div style="font-size: 1.1rem; font-weight: 700; color: #b48c28; margin-bottom: 0.75rem;">
        ${escapeHtml(position)}
      </div>

      <p style="font-size: 0.88rem; color: rgba(8, 10, 30, 0.7); max-width: 360px; line-height: 1.5; margin-bottom: 2rem;">
        Tilt screen toward scanner. Screen Wake Lock is active to keep display bright at the checkpoint.
      </p>

      <button type="button" id="pass-fullscreen-done-btn" class="btn-interactive" style="width: 100%; max-width: 320px; background: #080a1e; color: #ffffff; border: none; padding: 0.85rem 1.5rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer;">
        Back to Dashboard
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  // Mount Large QR
  const mountEl = document.getElementById('fullscreen-qr-mount');
  if (mountEl) {
    if (modalQrRoot) {
      modalQrRoot.unmount();
      modalQrRoot = null;
    }
    modalQrRoot = createRoot(mountEl);
    modalQrRoot.render(
      React.createElement(QRCodeSVG, {
        value: token,
        size: Math.min(window.innerWidth - 80, 280),
        level: 'M',
        fgColor: '#080a1e',
        bgColor: '#ffffff',
        marginSize: 4,
        title: 'Monument MUN Entry Pass'
      })
    );
  }

  function closeModal(): void {
    releaseScreenWakeLock();
    if (modalQrRoot) {
      modalQrRoot.unmount();
      modalQrRoot = null;
    }
    window.removeEventListener('keydown', handleEsc);
    modal.remove();
  }

  function handleEsc(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeModal();
  }

  window.addEventListener('keydown', handleEsc);
  document.getElementById('pass-fullscreen-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('pass-fullscreen-done-btn')?.addEventListener('click', closeModal);
}

/**
 * Render the complete "Your entry pass" card into container.
 * Mobile-first responsive card with QR code, identity, save, and fullscreen controls.
 */
export async function renderEntryPassCard(
  container: HTMLElement,
  user: CurrentUser,
  onRefresh?: () => void
): Promise<void> {
  ensurePassStyles();

  // If user role is 'user', they get no pass
  if (user.role === 'user') {
    container.innerHTML = '';
    return;
  }

  // Initial loading state
  container.innerHTML = `
    <div class="tilt-card" style="width: 100%; max-width: 440px; margin: 0 auto 2.5rem; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 24px; padding: 2.25rem 1.5rem; text-align: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6);">
      <div style="display: inline-block; width: 34px; height: 34px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
      <p style="font-family: var(--font-display); font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold);">
        Retrieving Entry Pass...
      </p>
    </div>
  `;

  const ticketRes = await fetchStaffTicketToken(user.role);

  // 1. Error state
  if (ticketRes.error) {
    container.innerHTML = `
      <div class="tilt-card" style="width: 100%; max-width: 440px; margin: 0 auto 2.5rem; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 2rem 1.5rem; text-align: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6);">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; display: inline-flex; align-items: center; justify-content: center; font-size: 1.25rem; margin-bottom: 1rem;">
          !
        </div>
        <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem;">
          Unable to Load Entry Pass
        </h3>
        <p style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.7); line-height: 1.5; margin-bottom: 1.25rem;">
          ${escapeHtml(ticketRes.error)}
        </p>
        <button type="button" id="retry-pass-load-btn" class="btn-interactive" style="background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.5rem 1.25rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
          Retry Loading
        </button>
      </div>
    `;

    document.getElementById('retry-pass-load-btn')?.addEventListener('click', () => {
      renderEntryPassCard(container, user, onRefresh);
    });
    return;
  }

  // 2. No pass state
  if (ticketRes.noPass || !ticketRes.token) {
    container.innerHTML = `
      <div class="tilt-card" style="width: 100%; max-width: 440px; margin: 0 auto 2.5rem; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 24px; padding: 2rem 1.5rem; text-align: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6);">
        <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.4); color: #fbbf24; display: inline-flex; align-items: center; justify-content: center; font-size: 1.35rem; margin-bottom: 1rem;">
          ★
        </div>
        <span class="eyebrow" style="color: #fbbf24;">Entry Pass Status</span>
        <h3 style="font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem;">
          No Pass Generated Yet
        </h3>
        <p style="font-size: 0.88rem; color: rgba(242, 244, 255, 0.7); line-height: 1.5; margin-bottom: 0.5rem;">
          No entry credential is currently associated with this account.
        </p>
        <p style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.5); line-height: 1.4;">
          If you are an active staff member, please contact the Secretariat to have your venue credential assigned.
        </p>
      </div>
    `;
    return;
  }

  // 3. Verified pass state
  const token = ticketRes.token;
  const position = user.profile?.eb_position || (user.role === 'admin' ? 'Administrator' : 'Executive Board Member');
  const roleDisplay = user.role.toUpperCase();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = hasTriggeredPassRevealAnimation;
  // Reset once per sign-in
  if (shouldAnimate) {
    hasTriggeredPassRevealAnimation = false;
  }

  const animationClass = shouldAnimate ? (prefersReduced ? 'pass-card-fade' : 'pass-card-animated') : '';

  container.innerHTML = `
    <div class="tilt-card ${animationClass}" style="width: 100%; max-width: 440px; margin: 0 auto 2.5rem; background: rgba(8, 10, 30, 0.96); border: 1.5px solid rgba(217, 180, 90, 0.5); border-radius: 28px; padding: clamp(1.75rem, 5vw, 2.25rem) clamp(1.25rem, 4vw, 1.75rem); text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.65); position: relative; overflow: hidden;">
      
      <!-- Top Eyebrow & Status Badge -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.45rem; margin-bottom: 0.5rem;">
        <span style="color: var(--gold); font-size: 0.85rem;">★</span>
        <span class="eyebrow" style="margin-bottom: 0; color: var(--gold); letter-spacing: 0.14em;">YOUR OFFICIAL ENTRY PASS</span>
      </div>

      <h2 style="font-family: var(--font-display); font-size: clamp(1.4rem, 4vw, 1.85rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 1.25rem; letter-spacing: 0.02em;">
        VENUE <em>CREDENTIAL.</em>
      </h2>

      <!-- QR Code Container (White rounded square with generous margin for sunlight scanning) -->
      <div style="display: inline-block; position: relative; background: #ffffff; border-radius: 22px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.55); margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.9);">
        ${shouldAnimate && !prefersReduced ? '<div class="qr-scan-line"></div>' : ''}
        <div id="entry-pass-qr-mount" style="display: flex; align-items: center; justify-content: center; line-height: 0;"></div>
      </div>

      <!-- Attendee Information -->
      <div style="margin-bottom: 1.25rem;">
        <div style="font-family: var(--font-display); font-size: clamp(1.35rem, 4.5vw, 1.65rem); font-weight: 800; color: #ffffff; margin-bottom: 0.25rem;">
          ${escapeHtml(user.fullName)}
        </div>
        <div style="font-size: 1rem; font-weight: 700; color: var(--gold); margin-bottom: 0.65rem;">
          ${escapeHtml(position)}
        </div>
        <div>
          <span style="display: inline-block; background: rgba(217, 180, 90, 0.18); border: 1px solid var(--gold); color: var(--gold); padding: 0.25rem 0.8rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;">
            ${escapeHtml(roleDisplay)} CLEARANCE
          </span>
        </div>
      </div>

      <!-- Instructions Note -->
      <p style="font-size: 0.84rem; color: rgba(242, 244, 255, 0.72); line-height: 1.55; max-width: 350px; margin: 0 auto 1.6rem;">
        Show this at the venue entrance. Security will scan it to check you in. Your pass is personal; don't share it.
      </p>

      <!-- Action Buttons: Save as Image & Full Screen -->
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <button type="button" id="pass-save-img-btn" class="btn-interactive" style="flex: 1; min-width: 140px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.4); color: #ffffff; padding: 0.65rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
          <span>↓</span>
          <span>Save as Image</span>
        </button>

        <button type="button" id="pass-fullscreen-btn" class="btn-interactive" style="flex: 1; min-width: 140px; background: var(--gold); border: 1px solid var(--gold); color: #080a1e; padding: 0.65rem 1rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; box-shadow: 0 4px 14px rgba(217, 180, 90, 0.35);">
          <span>⛶</span>
          <span>Full Screen</span>
        </button>
      </div>
    </div>
  `;

  // Mount QRCodeSVG
  const qrMount = document.getElementById('entry-pass-qr-mount');
  if (qrMount) {
    if (cardQrRoot) {
      cardQrRoot.unmount();
      cardQrRoot = null;
    }
    cardQrRoot = createRoot(qrMount);
    cardQrRoot.render(
      React.createElement(QRCodeSVG, {
        value: token,
        size: 240,
        level: 'M',
        fgColor: '#080a1e',
        bgColor: '#ffffff',
        marginSize: 4,
        title: 'Monument MUN Entry Pass'
      })
    );
  }

  // Attach Save Image Handler
  document.getElementById('pass-save-img-btn')?.addEventListener('click', () => {
    const svg = document.querySelector('#entry-pass-qr-mount svg') as SVGSVGElement | null;
    if (svg) {
      downloadQrAsPng(svg, user.fullName || 'staff-pass');
    }
  });

  // Attach Full Screen Handler
  document.getElementById('pass-fullscreen-btn')?.addEventListener('click', () => {
    openFullScreenPassModal(token, user);
  });
}
