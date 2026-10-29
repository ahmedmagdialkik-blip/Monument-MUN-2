// ====================================================
// WELCOME ANIMATION (STAFF & ADMIN PORTALS)
// Full-screen overlay triggered after sign-up & sign-in
// - SVG initial circle with drawing gold stroke & soft fill
// - Popping gold checkmark badge
// - Word-by-word rising greeting & first name in Bricolage Grotesque 800
// - Position gold pill badge
// - 70 confetti particles on sign-up; gold ring pulse on sign-in
// - Skips on click/tap or Escape
// - Respects prefers-reduced-motion
// ====================================================

export interface WelcomeAnimationOptions {
  type: 'signup' | 'signin';
  fullName: string;
  role: string;
  ebPosition?: string | null;
  onComplete?: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  decay: number;
}

function getInitials(name?: string | null): string {
  if (!name) return 'EB';
  const clean = name.trim();
  if (!clean) return 'EB';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
 * Display full-screen welcome overlay lasting ~3s, then fade into the panel
 */
export function playWelcomeAnimation(options: WelcomeAnimationOptions): Promise<void> {
  return new Promise((resolve) => {
    // Prevent duplicate overlays
    const existing = document.getElementById('welcome-overlay');
    if (existing) existing.remove();

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanName = options.fullName?.trim() || 'Team Member';
    const firstName = cleanName.split(/\s+/)[0] || 'Team Member';
    const initials = getInitials(cleanName);

    // Position text: "Administrator" for admins, or ebPosition / role fallback
    let positionText = 'Executive Board Member';
    if (options.role === 'admin') {
      positionText = 'Administrator';
    } else if (options.ebPosition && options.ebPosition.trim()) {
      positionText = options.ebPosition.trim();
    } else if (options.role === 'head') {
      positionText = 'Department Head';
    } else if (options.role === 'security') {
      positionText = 'Security Team';
    }

    const words = options.type === 'signup'
      ? ['Welcome', 'to', 'the', 'team,']
      : ['Welcome', 'back,'];

    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', `Welcome ${firstName}`);

    // Inject Welcome Overlay CSS styles dynamically
    const styleEl = document.createElement('style');
    styleEl.id = 'welcome-overlay-styles';
    styleEl.textContent = `
      #welcome-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: #080a1e;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        opacity: 0;
        animation: welcomeFadeIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      }

      #welcome-overlay.welcome-closing {
        opacity: 0 !important;
        transition: opacity 0.4s ease !important;
      }

      .welcome-glow {
        position: absolute;
        width: min(650px, 90vw);
        height: min(650px, 90vw);
        border-radius: 50%;
        background: radial-gradient(circle, rgba(217, 180, 90, 0.3) 0%, rgba(217, 180, 90, 0.08) 45%, transparent 70%);
        pointer-events: none;
        animation: welcomeGlowPulse 3s ease-in-out infinite alternate;
      }

      .welcome-confetti-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .welcome-content-box {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 1.5rem;
        max-width: 90vw;
      }

      .welcome-avatar-wrap {
        position: relative;
        width: 108px;
        height: 108px;
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .welcome-ring-pulse {
        position: absolute;
        inset: -14px;
        border-radius: 50%;
        border: 2px solid rgba(217, 180, 90, 0.65);
        opacity: 0;
        animation: welcomeRingPulseAnim 1.6s cubic-bezier(0.2, 0.8, 0.4, 1) 0.3s forwards;
        pointer-events: none;
      }

      .welcome-circle-svg {
        width: 108px;
        height: 108px;
        transform: rotate(-90deg);
      }

      .welcome-circle-bg {
        fill: rgba(217, 180, 90, 0.08);
        transition: fill 0.6s ease;
      }

      .welcome-circle-stroke {
        stroke-dasharray: 295;
        stroke-dashoffset: 295;
        animation: welcomeDrawStroke 0.85s cubic-bezier(0.34, 1.3, 0.64, 1) 0.15s forwards;
      }

      .welcome-initials {
        position: absolute;
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 2.1rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #d9b45a;
        opacity: 0;
        transform: scale(0.85);
        animation: welcomeInitialsIn 0.4s ease 0.45s forwards;
      }

      .welcome-check-badge {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #d9b45a;
        color: #080a1e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 16px;
        box-shadow: 0 4px 14px rgba(217, 180, 90, 0.5);
        transform: scale(0);
        animation: welcomePopCheck 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.75s forwards;
      }

      .welcome-words-row {
        display: flex;
        gap: 0.4rem;
        align-items: baseline;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 0.4rem;
      }

      .welcome-word {
        display: inline-block;
        font-family: 'Newsreader', Georgia, serif;
        font-style: italic;
        font-size: clamp(1.15rem, 3.2vw, 1.65rem);
        color: rgba(242, 244, 255, 0.82);
        opacity: 0;
        transform: translateY(18px);
        animation: welcomeRiseWord 0.5s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
      }

      .welcome-firstname {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-weight: 800;
        font-size: clamp(2.4rem, 7vw, 4.2rem);
        color: #ffffff;
        letter-spacing: -0.03em;
        line-height: 1;
        margin-bottom: 1.15rem;
        opacity: 0;
        transform: translateY(22px);
        animation: welcomeRiseWord 0.6s cubic-bezier(0.2, 0.8, 0.4, 1) 0.65s forwards;
      }

      .welcome-position-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 1.25rem;
        border-radius: 9999px;
        background: rgba(217, 180, 90, 0.16);
        border: 1.5px solid #d9b45a;
        color: #d9b45a;
        font-family: 'Bricolage Grotesque', sans-serif;
        font-size: 0.85rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: 0 4px 18px rgba(217, 180, 90, 0.25);
        opacity: 0;
        transform: translateY(16px);
        animation: welcomeRiseWord 0.55s cubic-bezier(0.2, 0.8, 0.4, 1) 0.9s forwards;
      }

      .welcome-skip-hint {
        position: absolute;
        bottom: 2rem;
        font-size: 0.75rem;
        color: rgba(242, 244, 255, 0.4);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: var(--font-display, sans-serif);
      }

      @keyframes welcomeFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes welcomeGlowPulse {
        from { transform: scale(0.95); opacity: 0.7; }
        to { transform: scale(1.1); opacity: 1; }
      }

      @keyframes welcomeRingPulseAnim {
        0% { transform: scale(0.7); opacity: 0.9; }
        100% { transform: scale(2.4); opacity: 0; }
      }

      @keyframes welcomeDrawStroke {
        to { stroke-dashoffset: 0; }
      }

      @keyframes welcomeInitialsIn {
        to { opacity: 1; transform: scale(1); }
      }

      @keyframes welcomePopCheck {
        0% { transform: scale(0); }
        70% { transform: scale(1.25); }
        100% { transform: scale(1); }
      }

      @keyframes welcomeRiseWord {
        to { opacity: 1; transform: translateY(0); }
      }

      /* Reduced motion fallback */
      @media (prefers-reduced-motion: reduce) {
        #welcome-overlay {
          animation: welcomeFadeIn 0.4s ease forwards !important;
        }
        .welcome-initials,
        .welcome-check-badge,
        .welcome-word,
        .welcome-firstname,
        .welcome-position-badge {
          opacity: 1 !important;
          transform: none !important;
          animation: none !important;
        }
        .welcome-circle-stroke {
          stroke-dashoffset: 0 !important;
          animation: none !important;
        }
        .welcome-ring-pulse,
        .welcome-confetti-canvas {
          display: none !important;
        }
      }
    `;

    document.head.appendChild(styleEl);

    // Build markup
    const wordsHtml = words
      .map(
        (w, i) =>
          `<span class="welcome-word" style="animation-delay: ${(0.3 + i * 0.1).toFixed(2)}s;">${escapeHtml(w)}</span>`
      )
      .join(' ');

    const pulseHtml =
      options.type === 'signin' && !prefersReduced
        ? `<div class="welcome-ring-pulse"></div>`
        : '';

    const canvasHtml =
      options.type === 'signup' && !prefersReduced
        ? `<canvas id="welcome-confetti-canvas" class="welcome-confetti-canvas"></canvas>`
        : '';

    overlay.innerHTML = `
      <div class="welcome-glow" aria-hidden="true"></div>
      ${canvasHtml}
      <div class="welcome-content-box">
        <div class="welcome-avatar-wrap">
          ${pulseHtml}
          <svg class="welcome-circle-svg" viewBox="0 0 108 108" aria-hidden="true">
            <circle class="welcome-circle-bg" cx="54" cy="54" r="47" />
            <circle class="welcome-circle-stroke" cx="54" cy="54" r="47" fill="none" stroke="#d9b45a" stroke-width="3.5" />
          </svg>
          <div class="welcome-initials">${escapeHtml(initials)}</div>
          <div class="welcome-check-badge">✓</div>
        </div>

        <div class="welcome-words-row">
          ${wordsHtml}
        </div>

        <div class="welcome-firstname">
          ${escapeHtml(firstName)}
        </div>

        <div class="welcome-position-badge">
          <span>✦</span>
          <span>${escapeHtml(positionText)}</span>
        </div>
      </div>
      <div class="welcome-skip-hint">Click anywhere or press Esc to continue</div>
    `;

    document.body.appendChild(overlay);

    let dismissed = false;
    let animFrameId: number | null = null;

    function cleanup() {
      if (dismissed) return;
      dismissed = true;

      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }

      window.removeEventListener('keydown', onKeyDown);
      overlay.removeEventListener('click', dismiss);

      overlay.classList.add('welcome-closing');
      setTimeout(() => {
        overlay.remove();
        styleEl.remove();
        if (options.onComplete) {
          options.onComplete();
        }
        resolve();
      }, 350);
    }

    function dismiss(e?: Event) {
      if (e) e.stopPropagation();
      cleanup();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss();
      }
    }

    overlay.addEventListener('click', dismiss);
    window.addEventListener('keydown', onKeyDown);

    // Run Confetti if sign-up
    if (options.type === 'signup' && !prefersReduced) {
      const canvas = overlay.querySelector('#welcome-confetti-canvas') as HTMLCanvasElement | null;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = (canvas.width = window.innerWidth);
          const height = (canvas.height = window.innerHeight);
          const centerX = width / 2;
          const centerY = height / 2 - 30;

          const colors = ['#d9b45a', '#f5ecd0', '#e5c06e', '#ffffff', '#fae8b2', '#c9a44a'];
          const particles: ConfettiParticle[] = [];

          // Exactly 70 confetti particles as specified
          for (let i = 0; i < 70; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 9 + 4;
            particles.push({
              x: centerX,
              y: centerY,
              vx: Math.cos(angle) * speed * (Math.random() * 0.8 + 0.6),
              vy: Math.sin(angle) * speed * 0.9 - 3.5, // Slight upward bias
              size: Math.random() * 7 + 4,
              color: colors[Math.floor(Math.random() * colors.length)],
              rotation: Math.random() * 360,
              rotationSpeed: (Math.random() - 0.5) * 8,
              opacity: 1,
              decay: Math.random() * 0.012 + 0.008
            });
          }

          function loopConfetti() {
            if (dismissed || !ctx) return;
            ctx.clearRect(0, 0, width, height);

            let activeCount = 0;
            for (let i = 0; i < particles.length; i++) {
              const p = particles[i];
              if (p.opacity <= 0.02) continue;
              activeCount++;

              p.x += p.vx;
              p.y += p.vy;
              p.vy += 0.22; // Gentle gravity
              p.vx *= 0.985; // Slight air drag
              p.rotation += p.rotationSpeed;
              p.opacity -= p.decay;

              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.rotate((p.rotation * Math.PI) / 180);
              ctx.globalAlpha = Math.max(0, p.opacity);
              ctx.fillStyle = p.color;
              ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
              ctx.restore();
            }

            if (activeCount > 0) {
              animFrameId = requestAnimationFrame(loopConfetti);
            }
          }

          loopConfetti();
        }
      }
    }

    // Auto-dismiss after 3.1 seconds (or 1.2s for reduced motion)
    const displayDuration = prefersReduced ? 1200 : 3100;
    setTimeout(() => {
      cleanup();
    }, displayDuration);
  });
}
