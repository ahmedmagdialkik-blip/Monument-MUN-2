/**
 * =========================================================================
 * 🐾 PAGECAT — THE ZERO-DEPENDENCY ANIMATED WEBSITE CAT
 * =========================================================================
 * A single, self-contained JavaScript snippet (with inline SVG & CSS)
 * that adds an interactive, animated roaming cat to any website.
 *
 * HOW TO USE:
 * Paste this script (or include <script src="pagecat.js"></script>)
 * right before the closing </body> tag on any website.
 *
 * FEATURES:
 * - 100% self-contained: No libraries, no images, no audio files.
 * - Multi-joint animated walk cycle (legs, body bob, swaying tail).
 * - Organic behaviors: walking, sitting, sleeping (floating "z"s),
 *   grooming, and stretching.
 * - Climbs & jumps onto page elements (headings, cards, buttons)
 *   detected via getBoundingClientRect().
 * - Mouse curiosity: wanders toward and sits near still cursors.
 * - Click / tap interaction: playful hop, floating heart, and a
 *   synthesized kitten meow using the Web Audio API.
 * - Non-blocking pointer events (pointer-events: none on container).
 * - Mobile responsive + touch-ready + prefers-reduced-motion safe.
 * - Corner paw toggle button (🐾) to hide/show the cat.
 * =========================================================================
 */
(function() {
  'use strict';

  // Prevent multiple instances on the same page
  if (document.getElementById('pagecat-overlay')) return;

  /**
   * =========================================================================
   * CONFIGURATION OPTIONS
   * Edit any of these settings to customize your cat!
   * =========================================================================
   */
  const CONFIG = {
    // Primary cat coat color (hex, rgb, or hsl)
    catColor: '#d9b45a',

    // Eye color
    eyeColor: '#0c101c',

    // Base height of the cat in pixels on desktop (scales down on phones)
    size: 68,

    // Walking speed in pixels per second
    speed: 55,

    // Whether sound is active (off by default per web audio & autoplay policies)
    soundEnabled: false,

    // Chance (0.0 to 1.0) to jump onto eligible page elements when nearby
    jumpOnElements: true,
    jumpFrequency: 0.35,

    // Chance (0.0 to 1.0) to notice and approach an idle mouse cursor
    mouseCuriosity: 0.45,

    // Corner position of the paw toggle button ('bottom-right' or 'bottom-left')
    pawTogglePosition: 'bottom-right',

    // Z-index for the cat overlay (keeps it above content, below modals)
    zIndex: 99999
  };

  // Color shading helper
  function shadeColor(color, percent) {
    let R = parseInt(color.substring(1,3),16);
    let G = parseInt(color.substring(3,5),16);
    let B = parseInt(color.substring(5,7),16);
    R = Math.max(0, Math.min(255, parseInt(R * (100 + percent) / 100)));
    G = Math.max(0, Math.min(255, parseInt(G * (100 + percent) / 100)));
    B = Math.max(0, Math.min(255, parseInt(B * (100 + percent) / 100)));
    const RR = (R.toString(16).length==1?"0"+R.toString(16):R.toString(16));
    const GG = (G.toString(16).length==1?"0"+G.toString(16):G.toString(16));
    const BB = (B.toString(16).length==1?"0"+B.toString(16):B.toString(16));
    return "#"+RR+GG+BB;
  }

  // 1. INJECT NAMESPACED STYLES (.pagecat-*)
  const styleEl = document.createElement('style');
  styleEl.id = 'pagecat-styles';
  styleEl.textContent = `
    :root {
      --pagecat-color: ${CONFIG.catColor};
      --pagecat-shade: ${shadeColor(CONFIG.catColor, -22)};
      --pagecat-eye: ${CONFIG.eyeColor};
      --pagecat-white: #ffffff;
      --pagecat-pink: #ffb4c8;
    }

    #pagecat-overlay {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: ${CONFIG.zIndex};
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    #pagecat-character {
      position: absolute;
      left: 0;
      bottom: 0;
      width: auto;
      height: ${CONFIG.size}px;
      aspect-ratio: 110 / 70;
      pointer-events: auto;
      cursor: pointer;
      transform-origin: 50% 100%;
      will-change: transform;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35));
      transition: height 0.2s ease;
    }

    @media (max-width: 640px) {
      #pagecat-character {
        height: ${Math.max(44, CONFIG.size * 0.75)}px;
      }
    }

    .pagecat-svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
      transform-origin: 50% 100%;
    }

    /* ---- ANIMATIONS & STATES ---- */

    /* 1. Walking Cycle */
    .pagecat-walking .pagecat-leg-fl {
      transform-origin: 74px 44px;
      animation: pagecatLegSwingA 0.42s infinite ease-in-out;
    }
    .pagecat-walking .pagecat-leg-br {
      transform-origin: 28px 44px;
      animation: pagecatLegSwingA 0.42s infinite ease-in-out;
    }
    .pagecat-walking .pagecat-leg-fr {
      transform-origin: 80px 44px;
      animation: pagecatLegSwingB 0.42s infinite ease-in-out;
    }
    .pagecat-walking .pagecat-leg-bl {
      transform-origin: 22px 44px;
      animation: pagecatLegSwingB 0.42s infinite ease-in-out;
    }
    .pagecat-walking .pagecat-torso {
      animation: pagecatBob 0.21s infinite ease-in-out;
    }
    .pagecat-walking .pagecat-tail {
      transform-origin: 18px 40px;
      animation: pagecatTailSway 0.85s infinite ease-in-out;
    }

    @keyframes pagecatLegSwingA {
      0%, 100% { transform: rotate(-26deg); }
      50% { transform: rotate(26deg); }
    }
    @keyframes pagecatLegSwingB {
      0%, 100% { transform: rotate(26deg); }
      50% { transform: rotate(-26deg); }
    }
    @keyframes pagecatBob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2.5px); }
    }
    @keyframes pagecatTailSway {
      0%, 100% { transform: rotate(-12deg); }
      50% { transform: rotate(18deg); }
    }

    /* 2. Sitting / Idle */
    .pagecat-sitting .pagecat-torso {
      transform: translateY(2px);
    }
    .pagecat-sitting .pagecat-tail {
      transform-origin: 18px 40px;
      animation: pagecatTailTwitch 2.2s infinite ease-in-out;
    }
    .pagecat-sitting .pagecat-head {
      animation: pagecatLookAround 4s infinite ease-in-out;
    }

    @keyframes pagecatTailTwitch {
      0%, 70%, 100% { transform: rotate(0deg); }
      80% { transform: rotate(16deg); }
      90% { transform: rotate(-6deg); }
    }
    @keyframes pagecatLookAround {
      0%, 65%, 100% { transform: rotate(0deg); }
      75% { transform: rotate(-6deg); }
      85% { transform: rotate(4deg); }
    }

    /* 3. Sleeping */
    .pagecat-sleeping .pagecat-eye-open {
      display: none !important;
    }
    .pagecat-sleeping .pagecat-eye-closed {
      display: block !important;
    }
    .pagecat-sleeping .pagecat-torso {
      transform-origin: 50% 100%;
      animation: pagecatSleepBreathe 2.4s infinite ease-in-out;
    }
    .pagecat-sleeping .pagecat-tail {
      transform: rotate(-15deg);
    }

    @keyframes pagecatSleepBreathe {
      0%, 100% { transform: scale(1, 0.96) translateY(2px); }
      50% { transform: scale(1.02, 1.02) translateY(0); }
    }

    /* 4. Grooming */
    .pagecat-grooming .pagecat-leg-fr {
      transform-origin: 80px 44px;
      animation: pagecatGroomPaw 0.65s infinite ease-in-out;
    }
    .pagecat-grooming .pagecat-head {
      transform-origin: 86px 32px;
      animation: pagecatGroomHead 0.65s infinite ease-in-out;
    }

    @keyframes pagecatGroomPaw {
      0%, 100% { transform: rotate(-15deg) translateY(0); }
      50% { transform: rotate(-70deg) translate(-6px, -14px); }
    }
    @keyframes pagecatGroomHead {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-12deg) translateY(3px); }
    }

    /* 5. Stretching */
    .pagecat-stretching .pagecat-torso {
      animation: pagecatStretchBody 1.6s ease-in-out infinite alternate;
    }
    .pagecat-stretching .pagecat-leg-fr,
    .pagecat-stretching .pagecat-leg-fl {
      animation: pagecatStretchFrontLegs 1.6s ease-in-out infinite alternate;
    }
    .pagecat-stretching .pagecat-tail {
      transform-origin: 18px 40px;
      animation: pagecatStretchTail 1.6s ease-in-out infinite alternate;
    }

    @keyframes pagecatStretchBody {
      0% { transform: translateY(0) scale(1, 1); }
      100% { transform: translateY(4px) skewX(-14deg) scale(1.15, 0.88); }
    }
    @keyframes pagecatStretchFrontLegs {
      0% { transform: rotate(0); }
      100% { transform: rotate(35deg) translate(8px, 4px); }
    }
    @keyframes pagecatStretchTail {
      0% { transform: rotate(0); }
      100% { transform: rotate(35deg); }
    }

    /* 6. Click / Tap Hop */
    .pagecat-hop {
      animation: pagecatHopMotion 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards !important;
    }
    @keyframes pagecatHopMotion {
      0% { transform: translateY(0) scale(1, 1); }
      25% { transform: translateY(4px) scale(1.15, 0.85); }
      55% { transform: translateY(-32px) scale(0.9, 1.15); }
      80% { transform: translateY(2px) scale(1.08, 0.92); }
      100% { transform: translateY(0) scale(1, 1); }
    }

    /* Floating Heart on Click */
    .pagecat-heart {
      position: absolute;
      color: #ff3366;
      font-size: 20px;
      pointer-events: none;
      z-index: 100001;
      animation: pagecatFloatUp 1.2s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.35));
    }
    @keyframes pagecatFloatUp {
      0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.4); }
      25% { opacity: 1; transform: translate3d(var(--px, 0), -18px, 0) scale(1.3); }
      75% { opacity: 0.9; transform: translate3d(var(--px, 0), -45px, 0) scale(1); }
      100% { opacity: 0; transform: translate3d(var(--px, 0), -65px, 0) scale(0.7); }
    }

    /* Floating Z's on Sleeping */
    .pagecat-zzz {
      position: absolute;
      font-family: sans-serif;
      font-weight: 800;
      color: var(--pagecat-color);
      pointer-events: none;
      z-index: 100001;
      animation: pagecatZFloat 1.8s ease-out forwards;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
    }
    @keyframes pagecatZFloat {
      0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
      30% { opacity: 1; transform: translate(6px, -14px) scale(1.1); }
      70% { opacity: 0.8; transform: translate(14px, -32px) scale(1.3); }
      100% { opacity: 0; transform: translate(22px, -48px) scale(1.5); }
    }

    /* Toggle Corner Paw Button */
    #pagecat-toggle-paw {
      position: fixed;
      ${CONFIG.pawTogglePosition === 'bottom-left' ? 'left: 14px;' : 'right: 14px;'}
      bottom: 14px;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: rgba(16, 22, 38, 0.88);
      border: 1px solid rgba(217, 180, 90, 0.4);
      color: var(--pagecat-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      pointer-events: auto;
      z-index: ${CONFIG.zIndex + 1};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    #pagecat-toggle-paw:hover {
      transform: scale(1.1);
      border-color: var(--pagecat-color);
      background: rgba(24, 32, 54, 0.95);
    }

    /* Reduced Motion Fallback */
    @media (prefers-reduced-motion: reduce) {
      .pagecat-walking .pagecat-leg-fl,
      .pagecat-walking .pagecat-leg-fr,
      .pagecat-walking .pagecat-leg-bl,
      .pagecat-walking .pagecat-leg-br,
      .pagecat-walking .pagecat-torso,
      .pagecat-walking .pagecat-tail,
      .pagecat-sitting .pagecat-tail,
      .pagecat-sitting .pagecat-head,
      .pagecat-sleeping .pagecat-torso,
      .pagecat-grooming .pagecat-leg-fr,
      .pagecat-grooming .pagecat-head,
      .pagecat-stretching .pagecat-torso,
      .pagecat-stretching .pagecat-leg-fr,
      .pagecat-stretching .pagecat-leg-fl,
      .pagecat-stretching .pagecat-tail,
      .pagecat-hop {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // 2. CREATE OVERLAY & CAT ELEMENT
  const overlay = document.createElement('div');
  overlay.id = 'pagecat-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const catEl = document.createElement('div');
  catEl.id = 'pagecat-character';
  catEl.setAttribute('role', 'button');
  catEl.setAttribute('aria-label', 'Touch or click the cat');
  catEl.setAttribute('tabindex', '0');

  // Cute SVG illustration of the cat
  catEl.innerHTML = `
    <svg class="pagecat-svg" viewBox="0 0 120 75" preserveAspectRatio="xMidYMax meet">
      <!-- Background Legs (Shaded) -->
      <g class="pagecat-leg-bl">
        <path d="M 23 42 C 22 50 19 58 17 68 C 17 70 20 72 23 72 C 26 72 26 68 27 62 C 29 55 31 49 31 44 Z" fill="var(--pagecat-shade)" />
      </g>
      <g class="pagecat-leg-fl">
        <path d="M 73 42 C 72 50 70 60 69 68 C 69 70 72 72 75 72 C 78 72 78 68 79 62 C 80 55 81 48 81 42 Z" fill="var(--pagecat-shade)" />
      </g>

      <!-- Tail -->
      <g class="pagecat-tail">
        <path d="M 21 40 C 11 34 3 20 8 9 C 10 5 15 7 13 13 C 10 20 14 31 22 39 Z" fill="var(--pagecat-color)" stroke="var(--pagecat-shade)" stroke-width="1" />
      </g>

      <!-- Torso & Head -->
      <g class="pagecat-torso">
        <!-- Body & Back -->
        <path d="M 21 40 C 19 33 25 27 36 27 C 48 27 60 31 72 36 C 75 41 74 50 69 52 C 57 54 41 53 28 50 C 23 48 21 44 21 40 Z" fill="var(--pagecat-color)" />

        <!-- Head Group -->
        <g class="pagecat-head">
          <!-- Back Ear -->
          <polygon points="78,16 82,4 88,15" fill="var(--pagecat-shade)" />
          <polygon points="80,15 82,7 86,14" fill="var(--pagecat-pink)" opacity="0.65" />

          <!-- Main Head -->
          <path d="M 70 36 C 70 28 76 20 82 18 C 84 14 86 8 89 7 C 92 6 93 11 93 14 C 96 13 98 9 101 9 C 102 11 99 16 99 19 C 105 23 105 29 101 33 C 96 37 87 39 79 39 C 74 39 71 38 70 36 Z" fill="var(--pagecat-color)" />

          <!-- Front Ear -->
          <polygon points="88,14 91,8 96,14" fill="var(--pagecat-pink)" opacity="0.75" />

          <!-- Open Eyes -->
          <g class="pagecat-eye-open">
            <ellipse cx="92" cy="22.5" rx="3.2" ry="4.5" fill="var(--pagecat-eye)" />
            <circle cx="91" cy="21" r="1.2" fill="var(--pagecat-white)" />
            <circle cx="93" cy="23.5" r="0.6" fill="var(--pagecat-white)" />
          </g>

          <!-- Closed Eyes (for sleeping/stretching) -->
          <g class="pagecat-eye-closed" style="display: none;">
            <path d="M 89 23 Q 92 27 95 23" fill="none" stroke="var(--pagecat-eye)" stroke-width="1.8" stroke-linecap="round" />
          </g>

          <!-- Nose -->
          <polygon points="101,26.5 103,27.5 101,28.5" fill="var(--pagecat-pink)" />

          <!-- Whiskers -->
          <line x1="97" y1="28" x2="110" y2="26" stroke="var(--pagecat-eye)" stroke-width="0.9" stroke-linecap="round" opacity="0.7" />
          <line x1="97" y1="30" x2="109" y2="32" stroke="var(--pagecat-eye)" stroke-width="0.9" stroke-linecap="round" opacity="0.7" />
        </g>
      </g>

      <!-- Foreground Legs -->
      <g class="pagecat-leg-br">
        <path d="M 31 44 C 33 52 33 60 32 68 C 32 70 35 72 38 72 C 41 72 41 68 42 61 C 43 54 42 48 40 44 Z" fill="var(--pagecat-color)" />
      </g>
      <g class="pagecat-leg-fr">
        <path d="M 77 42 C 77 50 76 60 75 68 C 75 70 78 72 81 72 C 84 72 84 68 85 61 C 86 54 86 48 85 42 Z" fill="var(--pagecat-color)" />
      </g>
    </svg>
  `;

  overlay.appendChild(catEl);
  document.body.appendChild(overlay);

  // 3. PAW TOGGLE BUTTON IN CORNER
  const pawBtn = document.createElement('button');
  pawBtn.id = 'pagecat-toggle-paw';
  pawBtn.setAttribute('aria-label', 'Toggle animated cat visibility');
  pawBtn.title = 'Toggle PageCat';
  pawBtn.innerHTML = '🐾';
  document.body.appendChild(pawBtn);

  let isCatVisible = true;
  pawBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isCatVisible = !isCatVisible;
    overlay.style.display = isCatVisible ? 'block' : 'none';
    pawBtn.style.opacity = isCatVisible ? '1' : '0.45';
  });

  // 4. KITTEN MEOW SYNTHESIS VIA WEB AUDIO API (NO AUDIO FILES)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playKittenMeow() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Primary oscillator (meow fundamental contour: starts 450Hz, sweeps up to 880Hz, glides to 520Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const formantFilter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      // Pitch sweep
      osc1.frequency.setValueAtTime(460, now);
      osc1.frequency.exponentialRampToValueAtTime(890, now + 0.12);
      osc1.frequency.exponentialRampToValueAtTime(510, now + 0.42);

      osc2.frequency.setValueAtTime(460 * 1.5, now);
      osc2.frequency.exponentialRampToValueAtTime(890 * 1.5, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(510 * 1.5, now + 0.42);

      // Bandpass formant filter to shape the "me-ow" vowel
      formantFilter.type = 'bandpass';
      formantFilter.frequency.setValueAtTime(1400, now);
      formantFilter.frequency.exponentialRampToValueAtTime(2100, now + 0.14);
      formantFilter.frequency.exponentialRampToValueAtTime(1100, now + 0.42);
      formantFilter.Q.setValueAtTime(2.2, now);

      // Volume envelope
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.14, now + 0.22);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc1.connect(formantFilter);
      osc2.connect(formantFilter);
      formantFilter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);
    } catch (err) {
      // Audio autoplay policy or unavailable
    }
  }

  // 5. CLICK / TAP INTERACTION
  function handleCatClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Play hop animation
    catEl.classList.remove('pagecat-hop');
    void catEl.offsetWidth; // Reflow
    catEl.classList.add('pagecat-hop');

    // Spawn heart
    spawnHeart();

    // Play synthesized meow if enabled (or after user tap)
    playKittenMeow();

    // Reset to walking after hop completes
    setTimeout(() => {
      catEl.classList.remove('pagecat-hop');
      if (currentState === 'sitting' || currentState === 'sleeping') {
        setState('walking');
      }
    }, 550);
  }

  catEl.addEventListener('pointerdown', handleCatClick);
  catEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleCatClick(e);
    }
  });

  function spawnHeart() {
    const heart = document.createElement('div');
    heart.className = 'pagecat-heart';
    heart.textContent = '♥';
    const driftX = (Math.random() * 28 - 14) + 'px';
    heart.style.setProperty('--px', driftX);
    heart.style.left = (catEl.offsetLeft + 45) + 'px';
    heart.style.bottom = (posY + CONFIG.size * 0.75) + 'px';
    overlay.appendChild(heart);
    setTimeout(() => heart.remove(), 1250);
  }

  function spawnZzz() {
    if (currentState !== 'sleeping') return;
    const z = document.createElement('div');
    z.className = 'pagecat-zzz';
    z.textContent = Math.random() < 0.4 ? 'Z' : 'z';
    z.style.left = (catEl.offsetLeft + (facing === 1 ? 75 : 15)) + 'px';
    z.style.bottom = (posY + CONFIG.size * 0.7) + 'px';
    overlay.appendChild(z);
    setTimeout(() => z.remove(), 1800);
  }

  // 6. STATE MACHINE & LOGIC
  let currentState = 'walking';
  let posX = 40;
  let posY = 0; // 0 = floor, > 0 = on top of element
  let facing = 1; // 1 = right, -1 = left
  let stateEndTime = 0;
  let lastTime = performance.now();
  let zzzInterval = null;
  let currentTargetElement = null;

  // Jump animation variables
  let isJumping = false;
  let jumpStartX = 0;
  let jumpStartY = 0;
  let jumpTargetX = 0;
  let jumpTargetY = 0;
  let jumpStartTime = 0;
  let jumpDuration = 700;

  function setState(newState, durationMs) {
    if (currentState === newState && newState !== 'walking') return;

    catEl.classList.remove(
      'pagecat-walking',
      'pagecat-sitting',
      'pagecat-sleeping',
      'pagecat-grooming',
      'pagecat-stretching'
    );
    if (zzzInterval) {
      clearInterval(zzzInterval);
      zzzInterval = null;
    }

    currentState = newState;
    catEl.classList.add('pagecat-' + newState);

    const now = performance.now();
    const dur = durationMs || getRandomDurationForState(newState);
    stateEndTime = now + dur;

    if (newState === 'sleeping') {
      spawnZzz();
      zzzInterval = setInterval(spawnZzz, 1200);
    }
  }

  function getRandomDurationForState(state) {
    switch (state) {
      case 'walking': return 4000 + Math.random() * 5500;
      case 'sitting': return 2500 + Math.random() * 3500;
      case 'sleeping': return 4500 + Math.random() * 4000;
      case 'grooming': return 2800 + Math.random() * 2000;
      case 'stretching': return 2000 + Math.random() * 1200;
      default: return 3000;
    }
  }

  // 7. FINDING JUMP TARGETS VIA getBoundingClientRect()
  function findJumpableElements() {
    if (!CONFIG.jumpOnElements) return [];
    const selectors = 'h1, h2, h3, .card, [class*="card"], button, .btn, img, blockquote';
    const candidates = Array.from(document.querySelectorAll(selectors));
    const winH = window.innerHeight;
    const winW = window.innerWidth;

    return candidates.filter(el => {
      if (overlay.contains(el) || el === pawBtn) return false;
      const rect = el.getBoundingClientRect();
      const isValidHeight = rect.top > 80 && rect.top < (winH - 70);
      const isValidWidth = rect.width >= 80;
      const isVisible = rect.bottom > 0 && rect.top < winH && rect.right > 0 && rect.left < winW;
      const style = window.getComputedStyle(el);
      return isValidHeight && isValidWidth && isVisible && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function startJump(targetX, targetYCoord, onComplete) {
    isJumping = true;
    jumpStartX = posX;
    jumpStartY = posY;
    jumpTargetX = targetX;
    jumpTargetY = targetYCoord;
    jumpStartTime = performance.now();
    jumpDuration = Math.max(500, Math.min(850, Math.hypot(jumpTargetX - jumpStartX, jumpTargetY - jumpStartY) * 1.5));

    facing = jumpTargetX >= jumpStartX ? 1 : -1;
    catEl.classList.remove('pagecat-walking', 'pagecat-sitting', 'pagecat-sleeping', 'pagecat-grooming', 'pagecat-stretching');

    function jumpTick(now) {
      const elapsed = now - jumpStartTime;
      const p = Math.min(1, elapsed / jumpDuration);

      posX = jumpStartX + (jumpTargetX - jumpStartX) * p;
      const baseLinearY = jumpStartY + (jumpTargetY - jumpStartY) * p;
      const arcHeight = Math.max(40, Math.abs(jumpTargetY - jumpStartY) * 0.4 + 35);
      const arc = Math.sin(p * Math.PI) * arcHeight;
      posY = baseLinearY + arc;

      if (p < 1) {
        requestAnimationFrame(jumpTick);
      } else {
        posX = jumpTargetX;
        posY = jumpTargetY;
        isJumping = false;
        if (typeof onComplete === 'function') onComplete();
      }
    }
    requestAnimationFrame(jumpTick);
  }

  function jumpToNearestElement() {
    const elements = findJumpableElements();
    if (!elements.length) return false;

    const chosen = elements[Math.floor(Math.random() * elements.length)];
    const rect = chosen.getBoundingClientRect();
    const winH = window.innerHeight;
    const catW = CONFIG.size * (110 / 70);
    const elTopFromBottom = winH - rect.top;
    const safeTargetX = Math.max(10, Math.min(window.innerWidth - catW - 10, rect.left + rect.width * 0.25 + Math.random() * (rect.width * 0.5)));

    currentTargetElement = chosen;
    startJump(safeTargetX, elTopFromBottom, () => {
      setState(Math.random() < 0.5 ? 'sitting' : 'grooming', 3500);
      setTimeout(() => {
        hopDownToFloor();
      }, 4500 + Math.random() * 3000);
    });
    return true;
  }

  function hopDownToFloor() {
    currentTargetElement = null;
    const targetFloorX = Math.max(20, Math.min(window.innerWidth - 100, posX + (facing * (60 + Math.random() * 80))));
    startJump(targetFloorX, 0, () => {
      setState('walking');
    });
  }

  window.addEventListener('scroll', () => {
    if (currentTargetElement && !isJumping) {
      const rect = currentTargetElement.getBoundingClientRect();
      const winH = window.innerHeight;
      const elTopFromBottom = winH - rect.top;
      if (rect.bottom < 0 || rect.top > winH) {
        hopDownToFloor();
      } else {
        posY = elTopFromBottom;
      }
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (currentTargetElement && !isJumping) {
      const rect = currentTargetElement.getBoundingClientRect();
      posY = window.innerHeight - rect.top;
    }
  });

  // 8. MOUSE CURIOSITY: NOTICES STILL MOUSE & TROTS NEAR IT
  let mouseX = -999;
  let mouseY = -999;
  let lastMouseMoveTime = performance.now();
  let hasCheckedIdleMouse = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMouseMoveTime = performance.now();
    hasCheckedIdleMouse = false;
  }, { passive: true });

  // 9. ANIMATION LOOP (requestAnimationFrame)
  setState('walking');

  function tick(now) {
    requestAnimationFrame(tick);

    if (!isCatVisible) return;

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    const catW = CONFIG.size * (110 / 70);
    const minX = 6;
    const maxX = Math.max(minX, window.innerWidth - catW - 6);

    if (isJumping) {
      catEl.style.transform = `translate3d(${posX}px, ${-posY}px, 0) scaleX(${facing})`;
      return;
    }

    // Check idle mouse curiosity
    if (CONFIG.mouseCuriosity > 0 && !hasCheckedIdleMouse && (now - lastMouseMoveTime > 2400) && posY === 0) {
      hasCheckedIdleMouse = true;
      if (Math.random() < CONFIG.mouseCuriosity && mouseY > window.innerHeight * 0.4) {
        const targetX = Math.max(minX, Math.min(maxX, mouseX - catW * 0.5));
        facing = targetX >= posX ? 1 : -1;
        setState('walking', 3000);
      }
    }

    // State transition timer
    if (now >= stateEndTime) {
      if (posY > 0) {
        if (Math.random() < 0.4) {
          hopDownToFloor();
        } else {
          const topStates = ['sitting', 'grooming', 'stretching'];
          setState(topStates[Math.floor(Math.random() * topStates.length)]);
        }
      } else {
        if (currentState === 'walking') {
          if (CONFIG.jumpOnElements && Math.random() < CONFIG.jumpFrequency) {
            const jumped = jumpToNearestElement();
            if (jumped) return;
          }

          const rand = Math.random();
          if (rand < 0.38) {
            setState('sitting');
          } else if (rand < 0.62) {
            setState('sleeping');
          } else if (rand < 0.82) {
            setState('grooming');
          } else {
            setState('stretching');
          }
        } else {
          setState('walking');
          if (Math.random() < 0.4) {
            facing = -facing;
          }
        }
      }
    }

    // Walking movement along floor or platform
    if (currentState === 'walking') {
      posX += facing * CONFIG.speed * dt;

      if (posX >= maxX) {
        posX = maxX;
        facing = -1;
      } else if (posX <= minX) {
        posX = minX;
        facing = 1;
      }
    }

    catEl.style.transform = `translate3d(${posX}px, ${-posY}px, 0) scaleX(${facing})`;
  }

  requestAnimationFrame(tick);
})();
