/**
 * =======================================================================
 * MONUMENT MUN 2027 — TOUCHABLE WALKING BACKGROUND CAT
 * =======================================================================
 * A cute gold cat (#d9b45a) with navy (#080a1e) eyes that walks slowly
 * along the bottom of every page.
 *
 * Features:
 * - Inline SVG in gold (#d9b45a) with expressive navy (#080a1e) eyes.
 * - Animated legs and a swaying tail while walking.
 * - Flips to face the other way when reaching the screen edge.
 * - Randomly stops and rests every few seconds.
 * - Interactive: Tapping/clicking makes it hop and emit floating gold hearts,
 *   resting for ~1.5s before resuming and sometimes turning around.
 * - Works with both mouse and touch via pointer events.
 * - Never blocks page buttons, menus, or text.
 * - requestAnimationFrame loop with tab visibility pause.
 * - Respects prefers-reduced-motion.
 * =======================================================================
 */

export function initBackgroundCat(): void {
  // Prevent duplicate mounts
  if (document.getElementById('bg-cat-layer')) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Inject dedicated styles
  const styleEl = document.createElement('style');
  styleEl.id = 'bg-cat-styles';
  styleEl.textContent = `
    #bg-cat-layer {
      position: fixed;
      bottom: 6px;
      left: 0;
      width: 100%;
      height: 64px;
      z-index: 47;
      pointer-events: none;
      overflow: visible;
      transition: opacity 0.3s ease;
    }

    body.admin-mode-active #bg-cat-layer,
    body.intro-active #bg-cat-layer {
      display: none !important;
      opacity: 0 !important;
    }

    #cute-cat {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 90px;
      height: 60px;
      pointer-events: auto;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transform-origin: 50% 100%;
      will-change: transform;
    }

    @media (max-width: 600px) {
      #cute-cat {
        width: 78px;
        height: 52px;
      }
    }

    #cute-cat-body {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
      transform-origin: 50% 100%;
    }

    /* Leg Walk Cycles */
    .cat-walking .cat-leg-front-right {
      transform-origin: 78px 46px;
      animation: catLegWalkA 0.48s infinite ease-in-out;
    }
    .cat-walking .cat-leg-back-left {
      transform-origin: 26px 46px;
      animation: catLegWalkA 0.48s infinite ease-in-out;
    }
    .cat-walking .cat-leg-front-left {
      transform-origin: 72px 46px;
      animation: catLegWalkB 0.48s infinite ease-in-out;
    }
    .cat-walking .cat-leg-back-right {
      transform-origin: 32px 46px;
      animation: catLegWalkB 0.48s infinite ease-in-out;
    }

    /* Body Bobbing */
    .cat-walking .cat-torso-group {
      animation: catBodyBob 0.24s infinite ease-in-out;
    }

    /* Swaying Tail */
    .cat-walking .cat-tail-group {
      transform-origin: 22px 42px;
      animation: catTailSway 0.9s infinite ease-in-out;
    }

    /* Resting Pose */
    .cat-resting .cat-leg-front-right,
    .cat-resting .cat-leg-front-left,
    .cat-resting .cat-leg-back-right,
    .cat-resting .cat-leg-back-left,
    .cat-resting .cat-torso-group {
      animation: none !important;
    }
    .cat-resting .cat-tail-group {
      transform-origin: 22px 42px;
      animation: catTailTwitch 1.6s infinite ease-in-out;
    }

    /* Little Hop on Tap */
    .cat-hopping {
      animation: catHopAnim 0.55s cubic-bezier(0.25, 0.8, 0.35, 1) forwards !important;
    }

    @keyframes catLegWalkA {
      0%, 100% { transform: rotate(-24deg); }
      50% { transform: rotate(24deg); }
    }
    @keyframes catLegWalkB {
      0%, 100% { transform: rotate(24deg); }
      50% { transform: rotate(-24deg); }
    }
    @keyframes catBodyBob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2.2px); }
    }
    @keyframes catTailSway {
      0%, 100% { transform: rotate(-10deg); }
      50% { transform: rotate(16deg); }
    }
    @keyframes catTailTwitch {
      0%, 100% { transform: rotate(0deg); }
      30% { transform: rotate(14deg); }
      60% { transform: rotate(-6deg); }
    }
    @keyframes catHopAnim {
      0% { transform: translateY(0) scale(1, 1); }
      20% { transform: translateY(3px) scale(1.08, 0.88); }
      50% { transform: translateY(-24px) scale(0.94, 1.12); }
      75% { transform: translateY(-3px) scale(1.04, 0.94); }
      100% { transform: translateY(0) scale(1, 1); }
    }

    /* Floating Gold Hearts */
    .cat-floating-heart {
      position: absolute;
      color: #d9b45a;
      font-size: 16px;
      pointer-events: none;
      z-index: 50;
      animation: floatHeart 1.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
    }

    @keyframes floatHeart {
      0% {
        opacity: 0;
        transform: translate3d(0, 0, 0) scale(0.4);
      }
      20% {
        opacity: 1;
        transform: translate3d(var(--hx, 0px), -14px, 0) scale(1.2);
      }
      70% {
        opacity: 0.9;
        transform: translate3d(var(--hx, 0px), -38px, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate3d(var(--hx, 0px), -58px, 0) scale(0.8);
      }
    }
  `;
  document.head.appendChild(styleEl);

  // 2. Create the fixed bottom layer container
  const layer = document.createElement('div');
  layer.id = 'bg-cat-layer';
  layer.setAttribute('aria-hidden', 'false');

  // 3. Cute Gold Cat SVG with Navy Eyes
  const catSvgHtml = `
    <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax meet">
      <!-- Shadowed background legs -->
      <g class="cat-leg-back-left">
        <path d="M 28 44 C 27 52 23 60 21 72 C 21 74 24 76 27 76 C 30 76 30 72 31 66 C 33 58 35 52 35 46 Z" fill="#b8923b" />
      </g>
      <g class="cat-leg-front-left">
        <path d="M 72 44 C 71 52 69 62 68 72 C 68 74 71 76 74 76 C 77 76 77 72 78 66 C 79 58 80 50 80 44 Z" fill="#b8923b" />
      </g>

      <!-- Swaying Tail -->
      <g class="cat-tail-group">
        <path d="M 24 42 C 14 36 6 22 11 10 C 13 6 18 8 16 14 C 13 22 17 33 25 41 Z" fill="#d9b45a" />
      </g>

      <!-- Main Torso & Head -->
      <g class="cat-torso-group">
        <!-- Body & Back -->
        <path d="M 24 42 C 22 35 28 29 38 29 C 50 29 62 33 74 38 C 76 43 75 52 70 54 C 58 56 42 55 30 52 C 25 50 24 46 24 42 Z" fill="#d9b45a" />

        <!-- Head, Ears, and Muzzle -->
        <g class="cat-head-group">
          <!-- Back ear (shaded) -->
          <polygon points="80,18 84,6 89,17" fill="#b8923b" />
          <polygon points="82,17 84,9 87,16" fill="#080a1e" opacity="0.25" />

          <!-- Head Shape -->
          <path d="M 72 38 C 72 30 78 22 84 20 C 85 16 87 10 90 9 C 93 8 94 13 94 16 C 97 15 99 11 102 11 C 103 13 100 18 100 21 C 106 25 106 31 102 35 C 97 39 88 41 80 41 C 75 41 73 40 72 38 Z" fill="#d9b45a" />

          <!-- Front ear inner pink/gold -->
          <polygon points="90,16 93,10 97,16" fill="#080a1e" opacity="0.3" />

          <!-- Navy Cat Eye with sparkling white reflection -->
          <ellipse cx="94" cy="24" rx="3.2" ry="4.5" fill="#080a1e" />
          <circle cx="93" cy="22.5" r="1.1" fill="#ffffff" />
          <circle cx="95" cy="25" r="0.6" fill="#ffffff" />

          <!-- Cute Navy Nose -->
          <polygon points="103,28 105,29 103,30" fill="#080a1e" />

          <!-- Whiskers -->
          <line x1="99" y1="29" x2="112" y2="27" stroke="#080a1e" stroke-width="1" stroke-linecap="round" opacity="0.75" />
          <line x1="99" y1="31" x2="111" y2="33" stroke="#080a1e" stroke-width="1" stroke-linecap="round" opacity="0.75" />
        </g>
      </g>

      <!-- Foreground legs -->
      <g class="cat-leg-back-right">
        <path d="M 33 46 C 35 54 35 62 34 72 C 34 74 37 76 40 76 C 43 76 43 72 44 64 C 45 56 44 50 42 46 Z" fill="#d9b45a" />
      </g>
      <g class="cat-leg-front-right">
        <path d="M 78 44 C 78 52 77 62 76 72 C 76 74 79 76 82 76 C 85 76 85 72 86 64 C 87 56 87 50 86 44 Z" fill="#d9b45a" />
      </g>
    </svg>
  `;

  // 4. If prefers-reduced-motion: render static sitting/resting cat
  if (prefersReduced) {
    layer.innerHTML = `
      <div id="cute-cat" style="position: absolute; right: 28px; bottom: 0;">
        <div id="cute-cat-body" class="cat-resting">
          ${catSvgHtml}
        </div>
      </div>
    `;
    document.body.appendChild(layer);
    return;
  }

  // 5. Mount active animated cat
  const catEl = document.createElement('div');
  catEl.id = 'cute-cat';
  catEl.setAttribute('role', 'button');
  catEl.setAttribute('aria-label', 'Touch the cat');
  catEl.setAttribute('tabindex', '0');

  const catBody = document.createElement('div');
  catBody.id = 'cute-cat-body';
  catBody.className = 'cat-walking';
  catBody.innerHTML = catSvgHtml;
  catEl.appendChild(catBody);
  layer.appendChild(catEl);
  document.body.appendChild(layer);

  // 6. Movement & Rest State Machine
  let posX = 40;
  let dir = 1; // 1 = facing right, -1 = facing left
  const speed = 40; // slow, gentle walking speed (px/s)
  const catWidth = 90;

  let isWalking = true;
  let isHopping = false;
  let restEndTime = 0;
  let nextRestTime = scheduleNextRest();

  function scheduleNextRest(): number {
    // Walks for 4 to 8 seconds before taking a short rest
    return performance.now() + 4000 + Math.random() * 4000;
  }

  // 7. Interactive Tap / Click Handling (Pointer Events for Touch & Mouse)
  function handleCatTap(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    if (isHopping) return;

    // Trigger hop
    isHopping = true;
    isWalking = false;
    catBody.classList.remove('cat-walking', 'cat-resting');
    catBody.classList.add('cat-hopping');

    // Spawn floating gold hearts
    spawnHearts();

    // After ~1.5s, start walking again and sometimes turn around
    setTimeout(() => {
      catBody.classList.remove('cat-hopping');
      isHopping = false;
      isWalking = true;
      catBody.classList.add('cat-walking');

      // 50% chance to turn around after hopping
      if (Math.random() < 0.5) {
        dir = -dir;
      }

      nextRestTime = scheduleNextRest();
    }, 1500);
  }

  catEl.addEventListener('pointerdown', handleCatTap);
  catEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleCatTap(e);
    }
  });

  // Spawn floating gold heart symbols
  function spawnHearts() {
    const heartSymbols = ['💛', '✦', '💛', '♥'];
    const count = 3 + Math.floor(Math.random() * 2);

    for (let i = 0; i < count; i++) {
      const heart = document.createElement('div');
      heart.className = 'cat-floating-heart';
      heart.textContent = heartSymbols[i % heartSymbols.length];

      // Random horizontal drift and slight vertical start offset
      const drift = -18 + Math.random() * 36;
      const startX = 35 + (Math.random() * 30 - 15);
      const startY = 5 + Math.random() * 10;

      heart.style.left = `${startX}px`;
      heart.style.top = `${startY}px`;
      heart.style.setProperty('--hx', `${drift}px`);
      heart.style.animationDelay = `${i * 120}ms`;

      catEl.appendChild(heart);

      // Clean up after animation finishes
      setTimeout(() => {
        heart.remove();
      }, 1500);
    }
  }

  // 8. Tab Visibility Pause
  let isTabVisible = !document.hidden;
  let lastTime = performance.now();

  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if (isTabVisible) {
      lastTime = performance.now();
      nextRestTime = scheduleNextRest();
    }
  });

  // 9. Main requestAnimationFrame Loop
  function tick(now: number) {
    requestAnimationFrame(tick);

    if (!isTabVisible) return;

    // Check if intro sequence or admin panel is active
    const isIntro = !document.getElementById('intro-overlay')?.classList.contains('hidden') &&
                    document.getElementById('intro-overlay')?.style.display !== 'none';
    const isAdmin = document.body.classList.contains('admin-mode-active');

    if (isIntro || isAdmin) {
      layer.style.opacity = '0';
      return;
    } else {
      layer.style.opacity = '1';
    }

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // While hopping, keep current position and let CSS hop animation play
    if (isHopping) {
      catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
      return;
    }

    const minX = 8;
    const maxX = Math.max(minX, window.innerWidth - catWidth - 8);

    // Random Resting Logic
    if (isWalking) {
      if (now >= nextRestTime) {
        // Stop and rest for 1.8 to 3 seconds
        isWalking = false;
        restEndTime = now + 1800 + Math.random() * 1200;
        catBody.classList.remove('cat-walking');
        catBody.classList.add('cat-resting');
      }
    } else {
      // Resting
      if (now >= restEndTime) {
        // Resume walking
        isWalking = true;
        nextRestTime = scheduleNextRest();
        catBody.classList.remove('cat-resting');
        catBody.classList.add('cat-walking');
      }
    }

    // Walking translation along bottom
    if (isWalking) {
      posX += dir * speed * dt;

      // Edge turn-around (flips horizontally to face the other way)
      if (posX >= maxX) {
        posX = maxX;
        dir = -1;
      } else if (posX <= minX) {
        posX = minX;
        dir = 1;
      }
    }

    // Update cat position and facing direction using CSS transforms
    catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
  }

  requestAnimationFrame(tick);
}
