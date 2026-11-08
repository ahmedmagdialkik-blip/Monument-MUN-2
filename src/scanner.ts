import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './lib/supabase';
import type { CurrentUser } from './auth';

export interface RecentScanItem {
  id: string;
  time: string;
  mode: 'in' | 'out';
  resultType: string;
  name?: string;
  detail?: string;
  status: 'ok' | 'checked_out' | 'warning' | 'error';
  message: string;
}

let activeScanner: Html5Qrcode | null = null;
let currentScannerMode: 'in' | 'out' = 'in';
let isScannerMounted = false;

// Scan throttling & cooldown
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let lastScannedToken: string | null = null;
let lastScannedTime = 0;
let isScanLocked = false;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;

// Session-level metrics
let sessionCheckedInCount = 0;
const recentScans: RecentScanItem[] = [];

export function isScannerRoute(): boolean {
  const hash = window.location.hash || '';
  const path = window.location.pathname.toLowerCase();
  const clean = hash.replace(/^#\/?/, '').toLowerCase();
  return clean === 'scanner' || path.endsWith('/scanner') || path.endsWith('/scanner/');
}

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
 * Web Audio API synthesizer for instant feedback without external audio files
 */
function playAudioFeedback(type: 'ok' | 'checked_out' | 'warning' | 'error'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'ok') {
      // Pleasant rising high chord (D5 -> A5 -> D6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } else if (type === 'checked_out') {
      // Warm golden tone (C5 -> G5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'warning') {
      // Amber two-tone alert
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(370, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      // Deep reject buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(130, now + 0.35);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch {
    // Audio synthesis is non-blocking enhancement
  }
}

/**
 * Trigger mobile vibration where supported
 */
function triggerVibration(pattern: number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

/**
 * Stop and clean up any active camera scanner instance
 */
export async function cleanupScanner(): Promise<void> {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }
  isScannerMounted = false;
  if (activeScanner) {
    try {
      if (activeScanner.isScanning) {
        await activeScanner.stop();
      }
      activeScanner.clear();
    } catch {
      // Ignore stop errors on unmount
    }
    activeScanner = null;
  }
}

/**
 * Render the full-screen dark navy and gold scanner page (#/scanner)
 */
export async function renderScannerRoute(user: CurrentUser | null, loading: boolean): Promise<void> {
  const viewHome = document.getElementById('view-home');
  const viewCommittees = document.getElementById('view-committees');
  const viewApply = document.getElementById('view-apply');
  const viewAdmin = document.getElementById('view-admin');
  const viewStaff = document.getElementById('view-staff');
  const viewTeamHead = document.getElementById('view-team-head');
  const viewScanner = document.getElementById('view-scanner');
  const dotNav = document.getElementById('dot-nav');
  const mobileCounter = document.getElementById('mobile-stop-counter');

  document.body.classList.add('admin-mode-active');
  if (viewHome) viewHome.classList.remove('active-view');
  if (viewCommittees) viewCommittees.classList.remove('active-view');
  if (viewApply) viewApply.classList.remove('active-view');
  if (viewAdmin) viewAdmin.classList.remove('active-view');
  if (viewStaff) viewStaff.classList.remove('active-view');
  if (viewTeamHead) viewTeamHead.classList.remove('active-view');
  if (dotNav) dotNav.classList.add('nav-hidden');
  if (mobileCounter) mobileCounter.classList.remove('visible');

  if (!viewScanner) return;
  viewScanner.classList.add('active-view');
  window.scrollTo(0, 0);

  // 1. Loading state
  if (loading) {
    viewScanner.innerHTML = `
      <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center; color: var(--gold); font-family: var(--font-display);">
        <div style="text-align: center;">
          <div style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
          <p style="font-size: 0.95rem; letter-spacing: 0.1em; text-transform: uppercase;">Checking Scanner Authorization...</p>
        </div>
      </div>
    `;
    return;
  }

  // 2. Authorization check: ONLY role 'security' or 'admin'
  if (!user || (user.role !== 'security' && user.role !== 'admin')) {
    await cleanupScanner();
    viewScanner.innerHTML = `
      <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 2.5rem 1rem;">
        <div class="tilt-card" style="width: 100%; max-width: 480px; background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 2.5rem 1.75rem; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.7);">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 1.5px solid #ef4444; color: #f87171; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; margin-bottom: 1.25rem;">
            ✕
          </div>
          <span class="eyebrow" style="color: #f87171;">Access Denied</span>
          <h2 style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.5rem;">
            Not Authorised
          </h2>
          <p style="font-size: 0.9rem; color: rgba(242, 244, 255, 0.75); line-height: 1.55; margin-bottom: 1.75rem;">
            The Monument MUN Entry Scanner is restricted exclusively to Security Corps personnel and Conference Administrators. Your current role does not have scanning clearance.
          </p>
          <a href="#/staff" class="btn-interactive" style="background: var(--gold); color: #080a1e; padding: 0.65rem 1.6rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; text-decoration: none; display: inline-block;">
            Return to Portal
          </a>
        </div>
      </div>
    `;
    return;
  }

  // 3. Authorized -> Render Scanner Interface
  viewScanner.innerHTML = `
    <!-- Top Scanner Navigation Bar -->
    <div style="max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 4rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.75rem; border-bottom: 1px solid rgba(217, 180, 90, 0.2); padding-bottom: 1.25rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399;"></span>
            <span class="eyebrow" style="margin-bottom: 0; color: var(--gold);">Live Gate Control</span>
          </div>
          <h1 style="font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 800; text-transform: uppercase; color: #ffffff; line-height: 1.1;">
            VENUE <em>ENTRY SCANNER.</em>
          </h1>
          <p style="font-size: 0.85rem; color: rgba(242, 244, 255, 0.65);">
            Officer: <strong style="color: #ffffff;">${escapeHtml(user.fullName)}</strong> · <span style="color: var(--gold);">${escapeHtml(user.role.toUpperCase())}</span>
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <a href="${user.role === 'admin' ? '#/admin' : '#/staff'}" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(217, 180, 90, 0.35); color: #ffffff; padding: 0.5rem 1.25rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem;">
            ← Exit Scanner
          </a>
        </div>
      </div>

      <!-- Two-option Switch: Check IN vs Check OUT -->
      <div style="display: flex; justify-content: center; margin-bottom: 2rem;">
        <div style="display: inline-flex; background: rgba(8, 10, 30, 0.95); border: 1.5px solid rgba(217, 180, 90, 0.4); border-radius: 9999px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
          <button type="button" id="scanner-mode-in-btn" class="btn-interactive" style="padding: 0.65rem 2.25rem; border-radius: 9999px; border: none; font-family: var(--font-display); font-size: 0.88rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: all 0.2s ease; ${currentScannerMode === 'in' ? 'background: var(--gold); color: #080a1e; box-shadow: 0 0 16px rgba(217, 180, 90, 0.5);' : 'background: transparent; color: #f2f4ff;'}">
            Check IN
          </button>
          <button type="button" id="scanner-mode-out-btn" class="btn-interactive" style="padding: 0.65rem 2.25rem; border-radius: 9999px; border: none; font-family: var(--font-display); font-size: 0.88rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: all 0.2s ease; ${currentScannerMode === 'out' ? 'background: #38bdf8; color: #080a1e; box-shadow: 0 0 16px rgba(56, 189, 248, 0.5);' : 'background: transparent; color: #f2f4ff;'}">
            Check OUT
          </button>
        </div>
      </div>

      <!-- Main Scanner Grid: Viewfinder on Left, Session Panel on Right -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; align-items: start;">
        
        <!-- Viewfinder Card with Gold Scanning Frame -->
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 24px; padding: clamp(1rem, 3vw, 1.75rem); box-shadow: 0 20px 50px rgba(0,0,0,0.65); text-align: center;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span style="font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; color: var(--gold); letter-spacing: 0.08em;">
              Camera Viewfinder
            </span>
            <span id="scanner-status-indicator" style="font-size: 0.72rem; color: #34d399; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;">
              <span>●</span> Active
            </span>
          </div>

          <!-- Camera Screen with Gold Framing -->
          <div style="position: relative; width: 100%; max-width: 440px; margin: 0 auto; aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: #040614; border: 2px solid rgba(217, 180, 90, 0.5); box-shadow: inset 0 0 30px rgba(0,0,0,0.8);">
            
            <!-- html5-qrcode video viewport container -->
            <div id="qr-camera-stream" style="width: 100%; height: 100%;"></div>

            <!-- Gold Corner Brackets Overlay -->
            <div style="position: absolute; inset: 16px; pointer-events: none; border-radius: 12px; border: 1px solid rgba(217, 180, 90, 0.25);">
              <!-- Top Left Corner -->
              <div style="position: absolute; top: -2px; left: -2px; width: 28px; height: 28px; border-top: 3.5px solid var(--gold); border-left: 3.5px solid var(--gold); border-top-left-radius: 8px;"></div>
              <!-- Top Right Corner -->
              <div style="position: absolute; top: -2px; right: -2px; width: 28px; height: 28px; border-top: 3.5px solid var(--gold); border-right: 3.5px solid var(--gold); border-top-right-radius: 8px;"></div>
              <!-- Bottom Left Corner -->
              <div style="position: absolute; bottom: -2px; left: -2px; width: 28px; height: 28px; border-bottom: 3.5px solid var(--gold); border-left: 3.5px solid var(--gold); border-bottom-left-radius: 8px;"></div>
              <!-- Bottom Right Corner -->
              <div style="position: absolute; bottom: -2px; right: -2px; width: 28px; height: 28px; border-bottom: 3.5px solid var(--gold); border-right: 3.5px solid var(--gold); border-bottom-right-radius: 8px;"></div>
              
              <!-- Gold Animated Scanning Laser Beam -->
              <div class="scanner-laser-line"></div>
            </div>

            <!-- Camera Feedback Placeholder if camera is requesting permissions -->
            <div id="camera-loading-overlay" style="position: absolute; inset: 0; background: rgba(8, 10, 30, 0.88); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gold); padding: 1.5rem; text-align: center;">
              <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(217, 180, 90, 0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 0.85rem;"></div>
              <p style="font-family: var(--font-display); font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">
                Connecting Rear Camera...
              </p>
              <p style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.6); margin-top: 0.35rem;">
                Please allow camera access when prompted.
              </p>
            </div>
          </div>

          <!-- Fallback Manual Entry Field -->
          <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1.25rem;">
            <p style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(242, 244, 255, 0.55); margin-bottom: 0.65rem;">
              Or Enter Ticket Code Manually
            </p>
            <form id="scanner-manual-form" style="display: flex; gap: 0.5rem; max-width: 440px; margin: 0 auto;">
              <input type="text" id="scanner-manual-input" placeholder="Type or paste UUID ticket token..." class="form-input" style="flex: 1; padding: 0.55rem 0.85rem; font-size: 0.82rem; font-family: monospace;" />
              <button type="submit" id="scanner-manual-submit-btn" class="btn-interactive" style="background: var(--gold); color: #080a1e; border: none; padding: 0.55rem 1.25rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; cursor: pointer; white-space: nowrap;">
                Scan
              </button>
            </form>
            <div id="scanner-manual-feedback" style="display: none; font-size: 0.75rem; margin-top: 0.5rem;"></div>
          </div>
        </div>

        <!-- Session Activity & Recent Scans Panel -->
        <div class="tilt-card" style="background: rgba(8, 10, 30, 0.96); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: clamp(1rem, 3vw, 1.75rem); box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
          
          <!-- Session Metrics Banner -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 1rem; margin-bottom: 1.25rem;">
            <div>
              <span class="eyebrow" style="color: var(--gold);">Live Gate Session</span>
              <h2 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
                RECENT SCANS
              </h2>
            </div>

            <div style="background: rgba(52, 211, 153, 0.12); border: 1px solid rgba(52, 211, 153, 0.35); border-radius: 12px; padding: 0.45rem 0.9rem; text-align: right;">
              <div style="font-size: 0.68rem; text-transform: uppercase; color: #a7f3d0; font-weight: 700;">Checked In Today</div>
              <div id="session-checkin-count" style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; color: #34d399; line-height: 1;">
                ${sessionCheckedInCount}
              </div>
            </div>
          </div>

          <!-- 10 Most Recent Scans List -->
          <div id="recent-scans-list" style="display: flex; flex-direction: column; gap: 0.65rem; min-height: 280px; max-height: 480px; overflow-y: auto;">
            ${renderRecentScansListMarkup()}
          </div>
        </div>

      </div>
    </div>

    <!-- Full-Screen Result Overlay (Shown for 2.5 seconds on each scan) -->
    <div id="scanner-result-overlay" style="display: none; position: fixed; inset: 0; z-index: 9999999; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); align-items: center; justify-content: center; padding: 1.5rem; transition: opacity 0.25s ease;">
      <div id="scanner-result-card" style="width: 100%; max-width: 520px; border-radius: 28px; padding: 3rem 2rem; text-align: center; box-shadow: 0 25px 70px rgba(0,0,0,0.85); transform: scale(0.95); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        <!-- Icon -->
        <div id="scanner-result-icon" style="width: 88px; height: 88px; border-radius: 50%; margin: 0 auto 1.5rem; display: flex; align-items: center; justify-content: center; font-size: 2.8rem; font-weight: 800;"></div>
        
        <!-- Status Title -->
        <h2 id="scanner-result-title" style="font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 800; text-transform: uppercase; line-height: 1.1; margin-bottom: 0.5rem;"></h2>
        
        <!-- Person's Name -->
        <div id="scanner-result-name" style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: #ffffff; margin-bottom: 0.35rem;"></div>
        
        <!-- Position / Committee -->
        <div id="scanner-result-detail" style="font-size: 0.95rem; color: rgba(242, 244, 255, 0.85); margin-bottom: 1.5rem;"></div>

        <!-- Mode Indicator -->
        <div id="scanner-result-mode-badge" style="display: inline-block; padding: 0.25rem 0.85rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;"></div>

        <!-- Tap to dismiss hint -->
        <div style="font-size: 0.72rem; color: rgba(242, 244, 255, 0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 1.75rem;">
          Tap anywhere to continue
        </div>
      </div>
    </div>
  `;

  // Inject scanner-specific laser scan animation CSS if not present
  ensureScannerStyles();

  // Attach Check IN / Check OUT toggle listeners
  const inBtn = document.getElementById('scanner-mode-in-btn');
  const outBtn = document.getElementById('scanner-mode-out-btn');

  inBtn?.addEventListener('click', () => {
    currentScannerMode = 'in';
    inBtn.style.background = 'var(--gold)';
    inBtn.style.color = '#080a1e';
    inBtn.style.boxShadow = '0 0 16px rgba(217, 180, 90, 0.5)';
    if (outBtn) {
      outBtn.style.background = 'transparent';
      outBtn.style.color = '#f2f4ff';
      outBtn.style.boxShadow = 'none';
    }
  });

  outBtn?.addEventListener('click', () => {
    currentScannerMode = 'out';
    outBtn.style.background = '#38bdf8';
    outBtn.style.color = '#080a1e';
    outBtn.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.5)';
    if (inBtn) {
      inBtn.style.background = 'transparent';
      inBtn.style.color = '#f2f4ff';
      inBtn.style.boxShadow = 'none';
    }
  });

  // Manual fallback form listener
  const manualForm = document.getElementById('scanner-manual-form') as HTMLFormElement | null;
  manualForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('scanner-manual-input') as HTMLInputElement | null;
    const token = (input?.value || '').trim();
    const feedback = document.getElementById('scanner-manual-feedback');

    if (!token) return;

    if (!UUID_REGEX.test(token)) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#f87171';
        feedback.textContent = 'Please enter a valid UUID ticket code.';
      }
      return;
    }

    if (feedback) feedback.style.display = 'none';
    if (input) input.value = '';

    await processTicketScan(token);
  });

  // Tap-to-dismiss on result overlay
  const overlay = document.getElementById('scanner-result-overlay');
  overlay?.addEventListener('click', () => {
    dismissResultOverlay();
  });

  // Initialize camera scanner
  await initCameraScanner();
}

/**
 * Initialize html5-qrcode camera instance with rear-facing camera default
 */
async function initCameraScanner(): Promise<void> {
  await cleanupScanner();
  isScannerMounted = true;

  const streamElement = document.getElementById('qr-camera-stream');
  if (!streamElement) return;

  try {
    const scanner = new Html5Qrcode('qr-camera-stream');
    activeScanner = scanner;

    const config = {
      fps: 12,
      qrbox: (viewWidth: number, viewHeight: number) => {
        const edge = Math.floor(Math.min(viewWidth, viewHeight) * 0.72);
        return { width: edge, height: edge };
      },
      aspectRatio: 1.0
    };

    const onScanSuccess = async (decodedText: string) => {
      const clean = decodedText.trim();
      // Ignore non-UUID scans
      if (!UUID_REGEX.test(clean)) {
        return;
      }

      // Check cooldown (approx 2.5 seconds)
      const now = Date.now();
      if (isScanLocked) return;
      if (lastScannedToken === clean && now - lastScannedTime < 2500) {
        return;
      }

      await processTicketScan(clean);
    };

    const onScanFailure = () => {
      // Periodic frame scan misses are normal; no-op
    };

    // Attempt start with rear camera
    try {
      await scanner.start({ facingMode: 'environment' }, config, onScanSuccess, onScanFailure);
    } catch {
      // Fallback: try user camera or default device if environment constraint fails
      await scanner.start({ facingMode: 'user' }, config, onScanSuccess, onScanFailure);
    }

    // Hide camera loading overlay once camera stream starts
    const loader = document.getElementById('camera-loading-overlay');
    if (loader) loader.style.display = 'none';
  } catch (err: unknown) {
    const loader = document.getElementById('camera-loading-overlay');
    if (loader) {
      loader.innerHTML = `
        <div style="font-size: 1.75rem; margin-bottom: 0.5rem; color: #fbbf24;">📷</div>
        <p style="font-family: var(--font-display); font-size: 0.85rem; font-weight: 700; color: #ffffff; text-transform: uppercase;">
          Camera Inactive or Denied
        </p>
        <p style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.65); max-width: 280px; margin: 0.35rem auto 1rem;">
          Ensure camera permissions are enabled in your browser settings, or use manual code entry below.
        </p>
        <button type="button" id="scanner-retry-camera-btn" style="background: rgba(217, 180, 90, 0.2); border: 1px solid var(--gold); color: var(--gold); padding: 0.35rem 0.95rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; cursor: pointer;">
          Retry Camera
        </button>
      `;

      document.getElementById('scanner-retry-camera-btn')?.addEventListener('click', () => {
        initCameraScanner();
      });
    }
  }
}

/**
 * Execute the ticket scan RPC call and display the full-screen result
 */
async function processTicketScan(token: string): Promise<void> {
  if (isScanLocked) return;

  isScanLocked = true;
  lastScannedToken = token;
  lastScannedTime = Date.now();

  const mode = currentScannerMode;

  try {
    let rpcData: any = null;
    let rpcError: any = null;

    if (mode === 'in') {
      const res = await supabase.rpc('scan_ticket', { p_token: token });
      rpcData = res.data;
      rpcError = res.error;
    } else {
      const res = await supabase.rpc('check_out', { p_token: token });
      rpcData = res.data;
      rpcError = res.error;
    }

    if (rpcError) {
      showScanResultOverlay({
        status: 'error',
        title: 'SCAN FAILED',
        name: 'Database Error',
        detail: rpcError.message || 'Not authorized to scan',
        mode,
        soundType: 'error'
      });
      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'error',
        name: 'Error',
        detail: rpcError.message || 'Unauthorized',
        status: 'error',
        message: rpcError.message || 'Scan rejected'
      });
      return;
    }

    // Parse returned object
    const resultRaw = typeof rpcData === 'string' ? rpcData : (rpcData?.result || rpcData?.status || 'invalid');
    const resType = String(resultRaw).toLowerCase().trim();
    const personName = rpcData?.name || rpcData?.full_name || rpcData?.person_name || '';
    const detail = rpcData?.position || rpcData?.committee || rpcData?.role || rpcData?.team || '';
    const isReentry = rpcData?.reentry === true;

    if (resType === 'ok') {
      // 1. "ok": green with a check mark and the person's name, position or committee.
      // If "reentry" is true, show "Welcome back".
      const title = isReentry ? 'WELCOME BACK' : 'ACCESS GRANTED';
      showScanResultOverlay({
        status: 'ok',
        title,
        name: personName || 'Delegate / Staff Member',
        detail: detail || 'Credentials Verified',
        mode,
        soundType: 'ok',
        badge: isReentry ? 'Re-entry Approved' : 'First Entry'
      });

      sessionCheckedInCount++;
      const counterEl = document.getElementById('session-checkin-count');
      if (counterEl) counterEl.textContent = String(sessionCheckedInCount);

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'ok',
        name: personName || 'Verified Delegate',
        detail: detail || 'Access Granted',
        status: 'ok',
        message: isReentry ? 'Welcome back (Re-entry)' : 'Access Granted'
      });

    } else if (resType === 'checked_out') {
      // 2. "checked_out": gold with the text "Checked out", the name.
      showScanResultOverlay({
        status: 'checked_out',
        title: 'CHECKED OUT',
        name: personName || 'Staff / Delegate',
        detail: detail || 'Exit Gate Recorded',
        mode,
        soundType: 'checked_out'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'checked_out',
        name: personName || 'Staff Member',
        detail: detail || 'Checked out',
        status: 'checked_out',
        message: 'Checked out successfully'
      });

    } else if (resType === 'already_inside') {
      // 3. "already_inside": red, "Already inside. Check them out first", with the name.
      showScanResultOverlay({
        status: 'error',
        title: 'ALREADY INSIDE',
        name: personName || 'Attendee',
        detail: 'Already inside. Check them out first',
        mode,
        soundType: 'error'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'already_inside',
        name: personName || 'Attendee',
        detail: 'Already inside',
        status: 'error',
        message: 'Already inside. Check them out first'
      });

    } else if (resType === 'not_inside') {
      // 4. "not_inside": amber, "Not inside", with the name.
      showScanResultOverlay({
        status: 'warning',
        title: 'NOT INSIDE',
        name: personName || 'Attendee',
        detail: 'Not currently marked inside the venue',
        mode,
        soundType: 'warning'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'not_inside',
        name: personName || 'Attendee',
        detail: 'Not inside',
        status: 'warning',
        message: 'Attendee is not inside'
      });

    } else if (resType === 'no_access') {
      // 5. "no_access": red, "No access"
      showScanResultOverlay({
        status: 'error',
        title: 'NO ACCESS',
        name: personName || 'Attendee',
        detail: 'No credential access for this venue',
        mode,
        soundType: 'error'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'no_access',
        name: personName || 'Attendee',
        detail: 'No access',
        status: 'error',
        message: 'No access'
      });

    } else if (resType === 'not_approved') {
      // 6. "not_approved": red, "Not approved"
      showScanResultOverlay({
        status: 'error',
        title: 'NOT APPROVED',
        name: personName || 'Applicant',
        detail: 'Registration status is not approved',
        mode,
        soundType: 'error'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'not_approved',
        name: personName || 'Applicant',
        detail: 'Not approved',
        status: 'error',
        message: 'Not approved'
      });

    } else {
      // 7. "invalid" or any other unrecognized result: red with "Invalid QR code"
      showScanResultOverlay({
        status: 'error',
        title: 'INVALID QR CODE',
        name: 'Unrecognized Token',
        detail: 'Invalid QR code or credential expired',
        mode,
        soundType: 'error'
      });

      addRecentScanRecord({
        id: token,
        time: formatCurrentTime(),
        mode,
        resultType: 'invalid',
        name: 'Invalid Token',
        detail: 'Invalid QR code',
        status: 'error',
        message: 'Invalid QR code'
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Scan error occurred';
    showScanResultOverlay({
      status: 'error',
      title: 'ERROR',
      name: 'Scan Exception',
      detail: msg,
      mode,
      soundType: 'error'
    });
  }
}

interface OverlayConfig {
  status: 'ok' | 'checked_out' | 'warning' | 'error';
  title: string;
  name: string;
  detail: string;
  mode: 'in' | 'out';
  soundType: 'ok' | 'checked_out' | 'warning' | 'error';
  badge?: string;
}

/**
 * Display full-screen result overlay for ~2.5 seconds with sound and vibration
 */
function showScanResultOverlay(cfg: OverlayConfig): void {
  const overlay = document.getElementById('scanner-result-overlay');
  const card = document.getElementById('scanner-result-card');
  const icon = document.getElementById('scanner-result-icon');
  const title = document.getElementById('scanner-result-title');
  const name = document.getElementById('scanner-result-name');
  const detail = document.getElementById('scanner-result-detail');
  const modeBadge = document.getElementById('scanner-result-mode-badge');

  if (!overlay || !card || !icon || !title || !name || !detail || !modeBadge) return;

  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }

  // Play auditory tone
  playAudioFeedback(cfg.soundType);

  // Trigger tactile vibration
  if (cfg.soundType === 'ok' || cfg.soundType === 'checked_out') {
    triggerVibration([80, 40, 80]);
  } else if (cfg.soundType === 'warning') {
    triggerVibration([140, 60, 140]);
  } else {
    triggerVibration([250, 100, 250]);
  }

  // Visual Theme Setup
  if (cfg.status === 'ok') {
    overlay.style.background = 'rgba(6, 78, 59, 0.94)';
    card.style.background = 'rgba(4, 30, 24, 0.96)';
    card.style.border = '2px solid #10b981';
    icon.style.background = 'rgba(16, 185, 129, 0.2)';
    icon.style.border = '2px solid #10b981';
    icon.style.color = '#34d399';
    icon.innerHTML = '✓';
    title.style.color = '#34d399';
  } else if (cfg.status === 'checked_out') {
    overlay.style.background = 'rgba(60, 48, 12, 0.94)';
    card.style.background = 'rgba(25, 20, 8, 0.96)';
    card.style.border = '2px solid var(--gold)';
    icon.style.background = 'rgba(217, 180, 90, 0.2)';
    icon.style.border = '2px solid var(--gold)';
    icon.style.color = 'var(--gold)';
    icon.innerHTML = '↩';
    title.style.color = 'var(--gold)';
  } else if (cfg.status === 'warning') {
    overlay.style.background = 'rgba(75, 45, 10, 0.94)';
    card.style.background = 'rgba(30, 18, 6, 0.96)';
    card.style.border = '2px solid #f59e0b';
    icon.style.background = 'rgba(245, 158, 11, 0.2)';
    icon.style.border = '2px solid #f59e0b';
    icon.style.color = '#fbbf24';
    icon.innerHTML = '⚠';
    title.style.color = '#fbbf24';
  } else {
    overlay.style.background = 'rgba(79, 14, 14, 0.94)';
    card.style.background = 'rgba(30, 8, 8, 0.96)';
    card.style.border = '2px solid #ef4444';
    icon.style.background = 'rgba(239, 68, 68, 0.2)';
    icon.style.border = '2px solid #ef4444';
    icon.style.color = '#f87171';
    icon.innerHTML = '✕';
    title.style.color = '#f87171';
  }

  title.textContent = cfg.title;
  name.textContent = cfg.name;
  detail.textContent = cfg.detail;

  const modeText = cfg.mode === 'in' ? 'Check IN Mode' : 'Check OUT Mode';
  modeBadge.textContent = cfg.badge ? `${modeText} · ${cfg.badge}` : modeText;
  modeBadge.style.background = 'rgba(255, 255, 255, 0.08)';
  modeBadge.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  modeBadge.style.color = '#ffffff';

  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  card.style.transform = 'scale(1)';

  // Auto-dismiss after 2.5 seconds
  overlayTimer = setTimeout(() => {
    dismissResultOverlay();
  }, 2500);
}

function dismissResultOverlay(): void {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }
  const overlay = document.getElementById('scanner-result-overlay');
  const card = document.getElementById('scanner-result-card');
  if (overlay) {
    overlay.style.opacity = '0';
    if (card) card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      overlay.style.display = 'none';
      isScanLocked = false;
    }, 200);
  } else {
    isScanLocked = false;
  }
}

/**
 * Add a record to recent scans and update panel
 */
function addRecentScanRecord(item: RecentScanItem): void {
  recentScans.unshift(item);
  if (recentScans.length > 10) {
    recentScans.pop();
  }
  const listEl = document.getElementById('recent-scans-list');
  if (listEl) {
    listEl.innerHTML = renderRecentScansListMarkup();
  }
}

function renderRecentScansListMarkup(): string {
  if (recentScans.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem 1rem; color: rgba(242, 244, 255, 0.4); font-size: 0.85rem;">
        No scans in this session yet. Ready for visitor credentials.
      </div>
    `;
  }

  return recentScans
    .map((scan) => {
      const isSuccess = scan.status === 'ok';
      const isCheckout = scan.status === 'checked_out';
      const isWarning = scan.status === 'warning';
      const badgeColor = isSuccess ? '#34d399' : (isCheckout ? 'var(--gold)' : (isWarning ? '#fbbf24' : '#f87171'));
      const badgeBg = isSuccess ? 'rgba(52, 211, 153, 0.15)' : (isCheckout ? 'rgba(217, 180, 90, 0.15)' : (isWarning ? 'rgba(251, 191, 36, 0.15)' : 'rgba(239, 68, 68, 0.15)'));
      const modeColor = scan.mode === 'in' ? 'var(--gold)' : '#38bdf8';

      return `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 12px; padding: 0.65rem 0.95rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.15rem; flex-wrap: wrap;">
              <span style="background: rgba(255, 255, 255, 0.06); border: 1px solid ${modeColor}; color: ${modeColor}; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 4px;">
                ${scan.mode === 'in' ? 'IN' : 'OUT'}
              </span>
              <strong style="color: #ffffff; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(scan.name)}
              </strong>
            </div>
            <div style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(scan.detail || scan.message)}
            </div>
          </div>

          <div style="text-align: right; flex-shrink: 0;">
            <span style="display: inline-block; background: ${badgeBg}; border: 1px solid ${badgeColor}; color: ${badgeColor}; padding: 0.15rem 0.55rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.68rem; font-weight: 800; text-transform: uppercase;">
              ${escapeHtml(scan.resultType)}
            </span>
            <div style="font-size: 0.7rem; color: rgba(242, 244, 255, 0.4); margin-top: 0.2rem; font-family: monospace;">
              ${scan.time}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function formatCurrentTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function ensureScannerStyles(): void {
  if (document.getElementById('monument-scanner-styles')) return;
  const style = document.createElement('style');
  style.id = 'monument-scanner-styles';
  style.textContent = `
    .scanner-laser-line {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--gold), #ffffff, var(--gold), transparent);
      box-shadow: 0 0 12px var(--gold), 0 0 24px var(--gold);
      animation: scanLaserAnim 2s ease-in-out infinite alternate;
    }

    @keyframes scanLaserAnim {
      0% {
        top: 2%;
        opacity: 0.8;
      }
      50% {
        opacity: 1;
      }
      100% {
        top: 98%;
        opacity: 0.8;
      }
    }

    /* html5-qrcode video element responsive reset */
    #qr-camera-stream video {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      border-radius: 16px;
    }
  `;
  document.head.appendChild(style);
}
