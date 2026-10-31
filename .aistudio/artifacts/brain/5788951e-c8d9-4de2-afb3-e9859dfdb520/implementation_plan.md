# Implementation Plan: Razor-Sharp Skyline & Radiant Shining Sun

Enhance the Stop 0 Statue of Liberty & New York Harbor vector artwork in `/index.html` to eliminate washed-out/blurry buildings with razor-sharp silhouettes and vibrant window cutouts, and transform the flat sun circle into a radiant golden sunburst with glowing corona rings and animated sunbeams.

## Proposed Changes

### 1. Razor-Sharp Skyline Silhouettes & Illuminated Window Grids
- **Remove Low-Opacity Washes**: Replace the faded `0.35` and `0.65` opacity layers with solid, full-contrast vector silhouettes (`opacity: 1` and `0.92`), using crisp vector geometry.
- **Architectural Edge Definition**: Render crisp setbacks, vertical ribbing, and sharp pinnacles for Manhattan landmarks (Empire State, Chrysler spire, One World Trade, and midtown towers) using `shape-rendering="crispEdges"`.
- **Illuminated Window Cutouts**: Add glowing warm golden and champagne window cutouts (`fill="var(--gold)"` and `fill="var(--gold-light)"`) across building facades to simulate an active, gleaming metropolis with crisp contrast.

### 2. Radiant Golden Sunburst & Corona Glow
- **Luminous Sun Gradients**: Define SVG radial gradients (`#sun-core-glow`, `#sun-corona-outer`) in `<defs>` for a luminous specular core that blends into an ambient golden aura.
- **Radiant Sunbeams & Corona Rings**: Add radiating geometric sunbeams projecting across the upper sky, paired with concentric corona light rings that give the sun genuine volumetric brilliance.
- **Atmospheric Shimmer Animation**: Add subtle keyframe radiance/shimmer (`@keyframes sunRayGlow` / `@keyframes sunCoronaPulse`) in the stylesheet so the light breathes and actively shines over the harbor.

### 3. Visual Verification
- Compile and lint the applet (`lint_applet` and `compile_applet`).
- Verify visual sharpness across mobile and desktop viewport widths, ensuring crisp rendering with no blurry or muddy edges.

## User Action Required
Click **Proceed** to apply these enhancements to the live applet.
