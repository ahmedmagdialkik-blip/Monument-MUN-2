/**
 * =======================================================================
 * MONUMENT MUN 2027 — BACKGROUND CAT COMPONENT
 * =======================================================================
 * A persistent silhouette cat moving along the bottom ground strip across
 * all public pages (Home, Committees, Apply).
 * =======================================================================
 */

// =======================================================================
// CAT CONFIGURATION BLOCK — Customize colors, sizes, and speeds here
// =======================================================================
export const CAT_CONFIG = {
  // Colors
  colorSky: '#3b4a58',       // Monument ink color while sky is showing
  colorDark: '#f2f4ff',      // Paper color over dark sections or footer
  
  // Dimensions
  desktopHeight: 64,         // Height on desktop (px)
  desktopWidth: 85,          // Width on desktop (px)
  mobileHeight: 44,          // Height on mobile <= 768px (px)
  mobileWidth: 58,           // Width on mobile <= 768px (px)
  groundOffset: 6,           // Ground strip elevation (px)
  zIndex: 45,                // Layer z-index
  
  // Movement & Animation Timing
  walkSpeed: 44,             // Wandering speed (px/s)
  trotSpeed: 82,             // Trotting speed toward touch/cursor (px/s)
  sitIntervalMin: 15000,     // Minimum wander interval before sitting (ms)
  sitIntervalMax: 25000,     // Maximum wander interval before sitting (ms)
  sitDuration: 4000,         // Sitting duration with tail flick (ms)
  
  // Proximity & Interaction
  pointerProximity: 210,     // Radius to detect pointer / touch (px)
  idleReturnTime: 6000,      // Return to wandering after idle (ms)
};
// =======================================================================

export function initBackgroundCat(): void {
  // Prevent duplicate initialization
  if (document.getElementById('bg-cat-layer')) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Create fixed background layer container
  const layer = document.createElement('div');
  layer.id = 'bg-cat-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `
    position: fixed;
    bottom: ${CAT_CONFIG.groundOffset}px;
    left: 0;
    width: 100%;
    height: ${CAT_CONFIG.desktopHeight}px;
    z-index: ${CAT_CONFIG.zIndex};
    pointer-events: none;
    overflow: visible;
  `;

  // Inject styles for cat walking, trotting, sitting, pouncing, and responsive sizing
  const styleEl = document.createElement('style');
  styleEl.id = 'bg-cat-styles';
  styleEl.textContent = `
    #bg-cat-layer {
      position: fixed;
      bottom: ${CAT_CONFIG.groundOffset}px;
      left: 0;
      width: 100%;
      height: ${CAT_CONFIG.desktopHeight}px;
      z-index: ${CAT_CONFIG.zIndex};
      pointer-events: none;
      overflow: visible;
      transition: opacity 0.3s ease;
    }

    body.admin-mode-active #bg-cat-layer,
    body.intro-active #bg-cat-layer {
      display: none !important;
      opacity: 0 !important;
    }

    #bg-cat {
      position: absolute;
      bottom: 0;
      left: 0;
      width: ${CAT_CONFIG.desktopWidth}px;
      height: ${CAT_CONFIG.desktopHeight}px;
      transform-origin: 50% 100%;
      will-change: transform;
      pointer-events: none;
    }

    @media (max-width: 768px) {
      #bg-cat-layer {
        height: ${CAT_CONFIG.mobileHeight}px;
      }
      #bg-cat {
        width: ${CAT_CONFIG.mobileWidth}px;
        height: ${CAT_CONFIG.mobileHeight}px;
      }
    }

    #bg-cat-svg {
      width: 100%;
      height: 100%;
      display: block;
      color: ${CAT_CONFIG.colorSky};
      fill: ${CAT_CONFIG.colorSky};
      transition: color 0.35s ease, fill 0.35s ease;
    }

    #bg-cat-layer.cat-on-dark #bg-cat-svg {
      color: ${CAT_CONFIG.colorDark};
      fill: ${CAT_CONFIG.colorDark};
    }

    /* Poses */
    .cat-walking-pose {
      display: block;
    }
    .cat-sitting-pose {
      display: none;
    }

    /* Walking Cycle */
    .cat-state-walk .cat-leg-fl {
      transform-origin: 72px 46px;
      animation: catWalkLegA 0.5s infinite ease-in-out;
    }
    .cat-state-walk .cat-leg-br {
      transform-origin: 32px 46px;
      animation: catWalkLegA 0.5s infinite ease-in-out;
    }
    .cat-state-walk .cat-leg-fr {
      transform-origin: 78px 46px;
      animation: catWalkLegB 0.5s infinite ease-in-out;
    }
    .cat-state-walk .cat-leg-bl {
      transform-origin: 26px 46px;
      animation: catWalkLegB 0.5s infinite ease-in-out;
    }
    .cat-state-walk .cat-body-group {
      animation: catBodyBob 0.25s infinite ease-in-out;
    }
    .cat-state-walk .cat-tail-walk {
      transform-origin: 22px 42px;
      animation: catTailSway 1s infinite ease-in-out;
    }

    /* Trotting Cycle (faster) */
    .cat-state-trot .cat-leg-fl {
      transform-origin: 72px 46px;
      animation: catWalkLegA 0.3s infinite ease-in-out;
    }
    .cat-state-trot .cat-leg-br {
      transform-origin: 32px 46px;
      animation: catWalkLegA 0.3s infinite ease-in-out;
    }
    .cat-state-trot .cat-leg-fr {
      transform-origin: 78px 46px;
      animation: catWalkLegB 0.3s infinite ease-in-out;
    }
    .cat-state-trot .cat-leg-bl {
      transform-origin: 26px 46px;
      animation: catWalkLegB 0.3s infinite ease-in-out;
    }
    .cat-state-trot .cat-body-group {
      animation: catBodyBob 0.15s infinite ease-in-out;
    }
    .cat-state-trot .cat-tail-walk {
      transform-origin: 22px 42px;
      animation: catTailSway 0.6s infinite ease-in-out;
    }

    /* Sitting Pose & Tail Flick */
    .cat-state-sit .cat-walking-pose {
      display: none;
    }
    .cat-state-sit .cat-sitting-pose {
      display: block;
    }
    .cat-state-sit .cat-sitting-tail {
      transform-origin: 22px 68px;
      animation: catTailFlick 2.8s infinite ease-in-out;
    }

    /* Curious / Alert Pose */
    .cat-state-alert .cat-leg-fl,
    .cat-state-alert .cat-leg-fr,
    .cat-state-alert .cat-leg-bl,
    .cat-state-alert .cat-leg-br,
    .cat-state-alert .cat-body-group {
      animation: none !important;
    }
    .cat-state-alert .cat-tail-walk {
      transform-origin: 22px 42px;
      animation: catTailTwitch 1.4s infinite ease-in-out;
    }

    /* Pounce Animation */
    .cat-pouncing {
      animation: catPounceJump 0.55s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
    }

    @keyframes catWalkLegA {
      0%, 100% { transform: rotate(-22deg); }
      50% { transform: rotate(22deg); }
    }
    @keyframes catWalkLegB {
      0%, 100% { transform: rotate(22deg); }
      50% { transform: rotate(-22deg); }
    }
    @keyframes catBodyBob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2.5px); }
    }
    @keyframes catTailSway {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(14deg); }
    }
    @keyframes catTailFlick {
      0%, 100% { transform: rotate(0deg); }
      20% { transform: rotate(-10deg); }
      40% { transform: rotate(24deg); }
      55% { transform: rotate(6deg); }
      70% { transform: rotate(20deg); }
    }
    @keyframes catTailTwitch {
      0%, 100% { transform: rotate(0deg); }
      30% { transform: rotate(12deg); }
      60% { transform: rotate(-6deg); }
    }
    @keyframes catPounceJump {
      0% { transform: translateY(0) scaleY(1); }
      18% { transform: translateY(5px) scaleY(0.78); }
      45% { transform: translateY(-28px) scaleY(1.08) rotate(-5deg); }
      75% { transform: translateY(-8px) scaleY(0.95); }
      100% { transform: translateY(0) scaleY(1); }
    }
  `;
  document.head.appendChild(styleEl);

  // SVG Markup containing both Walking and Sitting poses
  const catSvgHtml = `
    <svg id="bg-cat-svg" viewBox="0 0 110 80" preserveAspectRatio="xMidYMax meet">
      <!-- WALKING POSE GROUP -->
      <g class="cat-walking-pose">
        <!-- Back Left Leg (background) -->
        <g class="cat-leg-bl">
          <path d="M 28 44 C 27 52 23 60 21 72 C 21 74 24 76 27 76 C 30 76 30 72 31 66 C 33 58 35 52 35 46 Z" />
        </g>
        <!-- Front Left Leg (background) -->
        <g class="cat-leg-fl">
          <path d="M 72 44 C 71 52 69 62 68 72 C 68 74 71 76 74 76 C 77 76 77 72 78 66 C 79 58 80 50 80 44 Z" />
        </g>

        <!-- Tail -->
        <g class="cat-tail-walk">
          <path d="M 24 42 C 14 36 6 22 11 10 C 13 6 18 8 16 14 C 13 22 17 33 25 41 Z" />
        </g>

        <!-- Main Body Bobbing Group -->
        <g class="cat-body-group">
          <!-- Torso & Flank -->
          <path d="M 24 42 C 22 35 28 29 38 29 C 50 29 62 33 74 38 C 76 43 75 52 70 54 C 58 56 42 55 30 52 C 25 50 24 46 24 42 Z" />
          
          <!-- Head & Neck -->
          <g class="cat-head">
            <path d="M 72 38 C 72 30 78 22 84 20 C 85 16 82 10 86 8 C 88 7 90 12 91 16 C 94 15 96 11 99 11 C 100 13 97 19 97 22 C 103 26 104 31 100 35 C 96 39 88 41 80 41 C 75 41 73 40 72 38 Z" />
          </g>
        </g>

        <!-- Back Right Leg (foreground) -->
        <g class="cat-leg-br">
          <path d="M 33 46 C 35 54 35 62 34 72 C 34 74 37 76 40 76 C 43 76 43 72 44 64 C 45 56 44 50 42 46 Z" />
        </g>
        <!-- Front Right Leg (foreground) -->
        <g class="cat-leg-fr">
          <path d="M 78 44 C 78 52 77 62 76 72 C 76 74 79 76 82 76 C 85 76 85 72 86 64 C 87 56 87 50 86 44 Z" />
        </g>
      </g>

      <!-- SITTING POSE GROUP -->
      <g class="cat-sitting-pose">
        <!-- Sitting Tail with graceful curl -->
        <g class="cat-sitting-tail">
          <path d="M 22 68 C 12 68 5 62 4 48 C 3 42 9 42 9 47 C 10 56 16 62 24 64 Z" />
        </g>
        <!-- Folded Sitting Body & Hindquarters -->
        <path d="M 20 72 C 18 60 22 48 34 42 C 44 38 56 34 66 32 C 68 28 72 24 76 22 C 77 16 74 9 78 8 C 80 7 82 12 83 17 C 86 16 88 12 91 12 C 92 14 89 20 89 23 C 95 27 96 33 91 38 C 86 42 78 44 76 52 C 74 60 74 68 76 76 C 72 76 68 76 66 70 C 64 62 63 56 56 56 C 48 56 42 62 38 72 C 32 76 24 76 20 72 Z" />
        <!-- Front Paws standing upright together -->
        <path d="M 72 52 C 72 60 70 68 70 76 C 73 76 76 76 77 74 C 78 68 79 60 79 52 Z" />
      </g>
    </svg>
  `;

  // REDUCED MOTION: render one static sitting cat in the bottom right corner
  if (prefersReduced) {
    layer.innerHTML = `
      <div id="bg-cat" class="cat-state-sit" style="position: absolute; right: 28px; bottom: 0; transform: scaleX(-1);">
        ${catSvgHtml}
      </div>
    `;
    document.body.appendChild(layer);

    // Update color on scroll
    const updateReducedColor = () => {
      const isDark = checkDarkBackground();
      layer.classList.toggle('cat-on-dark', isDark);
    };
    window.addEventListener('scroll', updateReducedColor, { passive: true });
    window.addEventListener('hashchange', updateReducedColor, { passive: true });
    updateReducedColor();
    return;
  }

  // STANDARD ACTIVE CAT
  const catEl = document.createElement('div');
  catEl.id = 'bg-cat';
  catEl.className = 'cat-state-walk';
  catEl.innerHTML = catSvgHtml;
  layer.appendChild(catEl);
  document.body.appendChild(layer);

  // State machine variables
  let posX = 40; // current horizontal pixel position
  let dir = 1; // 1 = moving right, -1 = moving left
  const walkSpeed = CAT_CONFIG.walkSpeed;
  const trotSpeed = CAT_CONFIG.trotSpeed;
  const catWidth = CAT_CONFIG.desktopWidth;

  type CatState = 'walk' | 'sit' | 'trot' | 'alert' | 'pounce';
  let currentState: CatState = 'walk';

  let sitTimer = scheduleNextSit();
  let sitEndTime = 0;

  // Reactivity variables
  let lastPointerX = -9999;
  let lastPointerY = -9999;
  let lastInteractionTime = 0;
  let isPointerNearby = false;

  let isPouncing = false;
  let isTabVisible = !document.hidden;
  let lastFrameTime = performance.now();

  function scheduleNextSit(): number {
    return performance.now() + CAT_CONFIG.sitIntervalMin + Math.random() * (CAT_CONFIG.sitIntervalMax - CAT_CONFIG.sitIntervalMin);
  }

  function setCatState(newState: CatState) {
    if (currentState === newState && newState !== 'pounce') return;
    currentState = newState;
    catEl.classList.remove('cat-state-walk', 'cat-state-sit', 'cat-state-trot', 'cat-state-alert');
    catEl.classList.add(`cat-state-${newState}`);
  }

  // Pointer Proximity (mouse and touch within ~200px)
  function handlePointerMove(clientX: number, clientY: number) {
    lastPointerX = clientX;
    lastPointerY = clientY;

    // Check if intro is active or admin mode is active
    if (document.body.classList.contains('admin-mode-active') || document.body.classList.contains('intro-active')) {
      return;
    }

    const catCenterPx = posX + catWidth / 2;
    const catCenterPy = window.innerHeight - 34;
    const dist = Math.hypot(clientX - catCenterPx, clientY - catCenterPy);

    if (dist <= CAT_CONFIG.pointerProximity) {
      isPointerNearby = true;
      lastInteractionTime = performance.now();

      // If sitting, stand up
      if (currentState === 'sit') {
        sitTimer = scheduleNextSit();
      }

      // Turn toward the pointer
      if (clientX > catCenterPx + 10) {
        dir = 1;
      } else if (clientX < catCenterPx - 10) {
        dir = -1;
      }

      // If already at the pointer x, stay alert; otherwise trot toward it
      if (Math.abs(clientX - catCenterPx) > 18) {
        setCatState('trot');
      } else {
        setCatState('alert');
      }
    }
  }

  window.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  // Click or Tap Anywhere triggers a small pounce toward that spot
  function triggerPounce(targetClientX: number) {
    if (isPouncing) return;
    if (document.body.classList.contains('admin-mode-active') || document.body.classList.contains('intro-active')) {
      return;
    }

    isPouncing = true;
    lastInteractionTime = performance.now();

    // Face the target
    const catCenterPx = posX + catWidth / 2;
    dir = targetClientX >= catCenterPx ? 1 : -1;

    setCatState('walk');
    catEl.classList.add('cat-pouncing');

    // Horizontal shift during pounce
    const maxBound = Math.max(10, window.innerWidth - catWidth - 10);
    const pounceDistance = Math.min(60, Math.abs(targetClientX - catCenterPx)) * dir;
    posX = Math.max(10, Math.min(maxBound, posX + pounceDistance));

    setTimeout(() => {
      catEl.classList.remove('cat-pouncing');
      isPouncing = false;
      setCatState('alert');
    }, 550);
  }

  window.addEventListener('click', (e) => {
    triggerPounce(e.clientX);
  });
  window.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      triggerPounce(e.touches[0].clientX);
    }
  }, { passive: true });

  // Tab visibility handling: pause movement when backgrounded
  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if (isTabVisible) {
      lastFrameTime = performance.now();
      sitTimer = scheduleNextSit();
    }
  });

  // Check if dark sections or footer are currently at the bottom of the screen
  function checkDarkBackground(): boolean {
    const viewCommittees = document.getElementById('view-committees');
    const viewApply = document.getElementById('view-apply');
    if (viewCommittees?.classList.contains('active-view') || viewApply?.classList.contains('active-view')) {
      return true;
    }

    const darkPanel = document.querySelector('.dark-section-panel');
    if (darkPanel) {
      const rect = darkPanel.getBoundingClientRect();
      if (rect.top <= window.innerHeight - 15 && rect.bottom >= window.innerHeight - 90) {
        return true;
      }
    }

    const footer = document.getElementById('site-footer') || document.querySelector('footer');
    if (footer) {
      const rect = footer.getBoundingClientRect();
      if (rect.top <= window.innerHeight - 15) {
        return true;
      }
    }

    return false;
  }

  // Animation Loop (Transforms only)
  let lastColorCheck = 0;
  function tick(now: number) {
    requestAnimationFrame(tick);

    if (!isTabVisible) return;

    // Check if intro is active or admin board is active
    const isIntro = !document.getElementById('intro-overlay')?.classList.contains('hidden') &&
                    document.getElementById('intro-overlay')?.style.display !== 'none';
    const isAdmin = document.body.classList.contains('admin-mode-active');

    if (isIntro || isAdmin) {
      layer.style.opacity = '0';
      return;
    } else {
      layer.style.opacity = '1';
    }

    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    // Periodic color contrast update (every 100ms)
    if (now - lastColorCheck > 100) {
      lastColorCheck = now;
      const isDark = checkDarkBackground();
      layer.classList.toggle('cat-on-dark', isDark);
    }

    // Check interaction timeout (after idle return to wandering)
    if (isPointerNearby && now - lastInteractionTime > CAT_CONFIG.idleReturnTime) {
      isPointerNearby = false;
      setCatState('walk');
      sitTimer = scheduleNextSit();
    }

    const maxRight = Math.max(10, window.innerWidth - catWidth - 12);
    const minLeft = 12;

    // If pouncing, let CSS pounce animation handle the jump
    if (isPouncing) {
      catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
      return;
    }

    // Proximity Reactive Trotting
    if (isPointerNearby && (currentState === 'trot' || currentState === 'alert')) {
      const catCenterPx = posX + catWidth / 2;
      const diffX = lastPointerX - catCenterPx;

      if (Math.abs(diffX) > 16) {
        setCatState('trot');
        dir = diffX > 0 ? 1 : -1;
        posX += dir * trotSpeed * dt;
        posX = Math.max(minLeft, Math.min(maxRight, posX));
      } else {
        setCatState('alert');
      }

      catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
      return;
    }

    // Sitting schedule (every 15 to 25 seconds, sit for ~4 seconds)
    if (currentState === 'sit') {
      if (now >= sitEndTime) {
        setCatState('walk');
        sitTimer = scheduleNextSit();
      }
      catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
      return;
    } else if (currentState === 'walk') {
      if (now >= sitTimer) {
        setCatState('sit');
        sitEndTime = now + CAT_CONFIG.sitDuration;
        catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
        return;
      }
    }

    // Normal wandering walk
    setCatState('walk');
    posX += dir * walkSpeed * dt;

    // Turn around at screen edges
    if (posX >= maxRight) {
      posX = maxRight;
      dir = -1;
    } else if (posX <= minLeft) {
      posX = minLeft;
      dir = 1;
    }

    catEl.style.transform = `translate3d(${posX}px, 0, 0) scaleX(${dir})`;
  }

  requestAnimationFrame(tick);
}
