import fs from 'fs';

// 1. SURF.HTML Fixes (Proxy Page glow, lines, hover scale, search button)
let surfPath = 'views/pages/surf.html';
if (fs.existsSync(surfPath)) {
    let surf = fs.readFileSync(surfPath, 'utf8');

    // Make glow less intense
    surf = surf.replace(/opacity: 0\.15;/g, 'opacity: 0.05;');
    surf = surf.replace(/0% \{ transform: translate\(-50%, -50%\) scale\(0\.8\); opacity: 0\.1; \}/g, '0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.03; }');
    surf = surf.replace(/100% \{ transform: translate\(-50%, -50%\) scale\(1\.2\); opacity: 0\.2; \}/g, '100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.08; }');

    // Make background canvas lines brighter
    surf = surf.replace(/const opacity = \(1 - Math\.sqrt\(distSq\) \/ maxDistance\) \* 0\.5 \* p1\.scale;/g, 'const opacity = (1 - Math.sqrt(distSq) / maxDistance) * 0.9 * p1.scale;');
    surf = surf.replace(/const opacity = 0\.5 \* p\.scale;/g, 'const opacity = 0.8 * p.scale;');

    // Change .search-box CSS
    const searchHoverCss = `
        .search-box {
            position: relative;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 100px; /* Make sure shadow follows round shape */
        }
        .search-box:hover {
            transform: scale(1.05);
            box-shadow: 0 0 25px 5px rgba(239, 71, 111, 0.4);
        }
        .search-box:focus-within, .search-box:hover:focus-within {
            transform: scale(1);
            box-shadow: 0 0 15px 2px rgba(239, 71, 111, 0.7);
        }
    `;
    surf = surf.replace(/\.search-box \{[^]*?\.search-box:focus-within \{[^]*?\}/, searchHoverCss.trim());

    // Fix the Search Button with SVG
    const searchSvg = `<div id="uv-search-btn" style="width: 280px; height: 120px; margin: 20px auto 0; cursor: pointer;">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" width="100%" height="100%">
  <defs>
    <!-- Requested Button Gradient -->
    <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9d4edd" />
      <stop offset="100%" stop-color="#7b2cbf" />
    </linearGradient>

    <!-- Glassy Inner Reflection -->
    <linearGradient id="glassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
    </linearGradient>

    <!-- Premium Soft Drop Shadow -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#4a1575" flood-opacity="0.3" />
    </filter>

    <!-- Card Shadow -->
    <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.15" />
    </filter>

    <!-- Card Clipping Masks -->
    <clipPath id="cardClip">
      <rect x="-16" y="-16" width="32" height="32" rx="6" />
    </clipPath>

    <style>
      .btn-interactive {
        cursor: pointer;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .btn-interactive:hover {
        transform: scale(1.03);
      }
    </style>
  </defs>

  <!-- ENTIRE INTERACTIVE BUTTON -->
  <g id="mainBtn" class="btn-interactive" style="transform-origin: 160px 70px;">
    
    <!-- 1. Click Squish Animation -->
    <animateTransform 
      attributeName="transform" 
      type="scale" 
      values="1 1; 0.92 0.92; 1 1" 
      keyTimes="0; 0.3; 1" 
      dur="0.6s" 
      calcMode="spline" 
      keySplines="0.25 0.1 0.25 1; 0.34 1.56 0.64 1" 
      begin="click" 
      fill="freeze" />

    <!-- 2. Flip Animation (Simulates 3D rotation) -->
    <g style="transform-origin: 160px 70px;">
      <animateTransform 
        attributeName="transform" 
        type="scale" 
        values="1 1; 0 1; 1 1" 
        keyTimes="0; 0.5; 1" 
        dur="0.6s" 
        calcMode="spline" 
        keySplines="0.4 0.0 0.6 1.0; 0.4 0.0 0.2 1.0" 
        begin="mainBtn.click" 
        fill="freeze" />

      <!-- BUTTON BASE -->
      <rect x="30" y="38" width="260" height="64" rx="32" fill="url(#btnGrad)" filter="url(#shadow)" />
      <!-- Glass Highlight -->
      <rect x="34" y="40" width="252" height="28" rx="14" fill="url(#glassGrad)" />
      <!-- Inner Border -->
      <rect x="30" y="38" width="260" height="64" rx="32" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.3" />

      <!-- ========================================== -->
      <!-- FRONT STATE (Disappears during flip)         -->
      <!-- ========================================== -->
      <g>
        <animate attributeName="opacity" values="1; 1; 0; 0" keyTimes="0; 0.49; 0.5; 1" begin="mainBtn.click" dur="0.6s" fill="freeze" />
        
        <text x="160" y="76" font-family="'Segoe UI', -apple-system, sans-serif" font-weight="800" font-size="18" fill="#ffffff" text-anchor="middle" letter-spacing="3" style="pointer-events: none;">
          BROWSE
        </text>
      </g>

      <!-- ========================================== -->
      <!-- BACK STATE (The playful internal animation)  -->
      <!-- ========================================== -->
      <g opacity="0">
        <animate attributeName="opacity" values="0; 0; 1; 1" keyTimes="0; 0.49; 0.5; 1" begin="mainBtn.click" dur="0.6s" fill="freeze" />

        <!-- Inner Dark Search Track -->
        <rect x="42" y="46" width="236" height="48" rx="24" fill="#000000" opacity="0.15" />

        <!-- Playful Particle Burst (Fires when glass appears) -->
        <g opacity="0">
          <animate attributeName="opacity" values="0; 1; 0" keyTimes="0; 0.2; 1" begin="mainBtn.click + 0.5s" dur="0.6s" fill="freeze" />
          
          <!-- Yellow Dot -->
          <circle cx="70" cy="70" r="3" fill="#FFD166">
            <animate attributeName="cx" values="70; 45" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
            <animate attributeName="cy" values="70; 40" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
          </circle>
          
          <!-- Pink Dot -->
          <circle cx="70" cy="70" r="2.5" fill="#EF476F">
            <animate attributeName="cx" values="70; 105" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
            <animate attributeName="cy" values="70; 35" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
          </circle>

          <!-- Teal Dot -->
          <circle cx="70" cy="70" r="2" fill="#06D6A0">
            <animate attributeName="cx" values="70; 50" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
            <animate attributeName="cy" values="70; 95" begin="mainBtn.click + 0.5s" dur="0.6s" calcMode="spline" keySplines="0.175 0.885 0.32 1.275" fill="freeze" />
          </circle>
        </g>

        <!-- 1. The Magnifying Glass -->
        <!-- Float looping animation -->
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="2s" repeatCount="indefinite" begin="mainBtn.click + 1s" />
          
          <!-- Pop-in animation -->
          <g transform="translate(70, 70)">
            <animateTransform 
              attributeName="transform" 
              type="scale" 
              values="0; 1.2; 1" 
              keyTimes="0; 0.6; 1" 
              dur="0.4s" 
              calcMode="spline" 
              keySplines="0.25 0.1 0.25 1; 0.34 1.56 0.64 1" 
              begin="mainBtn.click + 0.5s" 
              fill="freeze" />
            
            <circle cx="-2" cy="-2" r="10" fill="none" stroke="#ffffff" stroke-width="3.5" />
            <line x1="5" y1="5" x2="13" y2="13" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
            <!-- Glass shine -->
            <path d="M -8 -4 A 6 6 0 0 1 -2 -8" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.6" />
          </g>
        </g>

        <!-- 2. The Web Cards (They shoot out from the glass) -->
        
        <!-- CARD 1: Image View -->
        <g>
          <!-- Hover loop -->
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,-4; 0,0" dur="2.1s" repeatCount="indefinite" begin="mainBtn.click + 1.2s" />
          
          <g transform="translate(130, 70)">
            <!-- Slide out -->
            <animateTransform attributeName="transform" type="translate" values="-60,0; 0,0" begin="mainBtn.click + 0.65s" dur="0.45s" calcMode="spline" keySplines="0.34 1.56 0.64 1" fill="freeze" />
            <!-- Pop scale -->
            <g>
              <animateTransform attributeName="transform" type="scale" values="0; 1.1; 1" keyTimes="0; 0.7; 1" begin="mainBtn.click + 0.65s" dur="0.45s" calcMode="spline" keySplines="0.25 0.1 0.25 1; 0.34 1.56 0.64 1" fill="freeze" />
              <g opacity="0">
                <animate attributeName="opacity" values="0; 1" begin="mainBtn.click + 0.65s" dur="0.1s" fill="freeze" />
                <rect x="-16" y="-16" width="32" height="32" rx="6" fill="#ffffff" filter="url(#cardShadow)" />
                <g clip-path="url(#cardClip)">
                  <circle cx="-4" cy="-5" r="5" fill="#FFD166" />
                  <path d="M -20 16 L -8 -2 L 0 10 L 8 0 L 20 16 Z" fill="#118AB2" />
                  <path d="M 0 16 L 8 0 L 20 16 Z" fill="#06D6A0" opacity="0.8" />
                </g>
              </g>
            </g>
          </g>
        </g>

        <!-- CARD 2: Text / Article View -->
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,4; 0,0" dur="2.4s" repeatCount="indefinite" begin="mainBtn.click + 1.3s" />
          
          <g transform="translate(185, 70)">
            <animateTransform attributeName="transform" type="translate" values="-115,0; 0,0" begin="mainBtn.click + 0.75s" dur="0.45s" calcMode="spline" keySplines="0.34 1.56 0.64 1" fill="freeze" />
            <g>
              <animateTransform attributeName="transform" type="scale" values="0; 1.1; 1" keyTimes="0; 0.7; 1" begin="mainBtn.click + 0.75s" dur="0.45s" calcMode="spline" keySplines="0.25 0.1 0.25 1; 0.34 1.56 0.64 1" fill="freeze" />
              <g opacity="0">
                <animate attributeName="opacity" values="0; 1" begin="mainBtn.click + 0.75s" dur="0.1s" fill="freeze" />
                <rect x="-16" y="-16" width="32" height="32" rx="6" fill="#ffffff" filter="url(#cardShadow)" />
                <rect x="-10" y="-8" width="20" height="4" rx="2" fill="#EF476F" />
                <rect x="-10" y="0" width="16" height="3" rx="1.5" fill="#e0e0e0" />
                <rect x="-10" y="7" width="12" height="3" rx="1.5" fill="#e0e0e0" />
              </g>
            </g>
          </g>
        </g>

        <!-- CARD 3: Video / Media View -->
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="1.9s" repeatCount="indefinite" begin="mainBtn.click + 1.4s" />
          
          <g transform="translate(240, 70)">
            <animateTransform attributeName="transform" type="translate" values="-170,0; 0,0" begin="mainBtn.click + 0.85s" dur="0.45s" calcMode="spline" keySplines="0.34 1.56 0.64 1" fill="freeze" />
            <g>
              <animateTransform attributeName="transform" type="scale" values="0; 1.1; 1" keyTimes="0; 0.7; 1" begin="mainBtn.click + 0.85s" dur="0.45s" calcMode="spline" keySplines="0.25 0.1 0.25 1; 0.34 1.56 0.64 1" fill="freeze" />
              <g opacity="0">
                <animate attributeName="opacity" values="0; 1" begin="mainBtn.click + 0.85s" dur="0.1s" fill="freeze" />
                <rect x="-16" y="-16" width="32" height="32" rx="6" fill="#ffffff" filter="url(#cardShadow)" />
                <circle cx="0" cy="0" r="10" fill="#9d4edd" />
                <polygon points="-2,-4 -2,4 4,0" fill="#ffffff" />
              </g>
            </g>
          </g>
        </g>

      </g>
    </g>
  </g>
</svg></div>`;

    surf = surf.replace(/<button class="search-btn" id="uv-search-btn">Browse<\/button>/, searchSvg);
    fs.writeFileSync(surfPath, surf);
}

// 2. Add New Theme SVG Switcher
const themeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="48" height="24" id="themeToggle" style="cursor: pointer;">
  <defs>
    <!-- The Requested Magenta Gradient -->
    <linearGradient id="wubu-grad" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9d4edd" />
      <stop offset="100%" stop-color="#7b2cbf" />
    </linearGradient>

    <!-- Proxy Node Ray (Used for the Sun) -->
    <g id="proxy-node">
      <line x1="40" y1="23" x2="40" y2="13" stroke="url(#wubu-grad)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="40" cy="11" r="3.5" fill="url(#wubu-grad)"/>
    </g>

    <!-- 4-Point Sparkle Star -->
    <path id="sparkle-star" d="M 0 -6 Q 0 0 6 0 Q 0 0 0 6 Q 0 0 -6 0 Q 0 0 0 -6 Z" fill="#ffffff" />

    <!-- Mask to morph Sun Core into Moon -->
    <mask id="moon-mask">
      <circle cx="40" cy="40" r="16" fill="white" />
      <circle id="moon-cutout" cx="40" cy="40" r="16" fill="black" />
    </mask>
  </defs>

  <style>
    /* Base Styles */
    .track {
      fill: #e4e6eb;
      transition: fill 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .light-bg {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.4s ease, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .light-bg path, .light-bg line {
      stroke: #c2c7d0;
      stroke-width: 2;
      stroke-linecap: round;
    }

    .dark-bg {
      opacity: 0;
      transform: translateY(15px) scale(0.9);
      transition: opacity 0.4s ease, transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .knob-group {
      transform: translateX(0);
      transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .knob-base {
      fill: #ffffff;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15));
    }

    .icon-rotator {
      transform-origin: 40px 40px;
      transform: rotate(0deg);
      transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .node-rays {
      opacity: 1;
      transition: opacity 0.4s ease 0.1s;
    }

    .core-icon {
      fill: url(#wubu-grad);
      transition: fill 0.6s ease;
    }

    #moon-cutout {
      transform: translate(0, -40px);
      transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* --- TOGGLED STATE (DARK MODE) --- */
    .dark-mode .track {
      fill: url(#wubu-grad);
    }

    .dark-mode .light-bg {
      opacity: 0;
      transform: translateY(-15px) scale(0.9);
    }

    .dark-mode .dark-bg {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .dark-mode .knob-group {
      transform: translateX(80px);
    }

    .dark-mode .icon-rotator {
      transform: rotate(180deg);
    }

    .dark-mode .node-rays {
      opacity: 0;
      transition-delay: 0s;
    }

    .dark-mode .core-icon {
      fill: #0f0f13; /* Inner moon matches dark background */
    }

    .dark-mode #moon-cutout {
      transform: translate(-8px, -8px);
    }
  </style>

  <!-- 1. Background Track -->
  <rect class="track" width="160" height="80" rx="40" />

  <!-- 2. Light Mode Proxy Web Background -->
  <g class="light-bg">
    <path d="M 85 20 Q 115 40 145 20" fill="none" />
    <path d="M 85 60 Q 115 40 145 60" fill="none" />
    <line x1="115" y1="25" x2="115" y2="55" />
    <circle cx="85" cy="20" r="2.5" fill="#c2c7d0"/>
    <circle cx="145" cy="20" r="2.5" fill="#c2c7d0"/>
    <circle cx="115" cy="40" r="3.5" fill="#c2c7d0"/>
    <circle cx="85" cy="60" r="2.5" fill="#c2c7d0"/>
    <circle cx="145" cy="60" r="2.5" fill="#c2c7d0"/>
  </g>

  <!-- 3. Dark Mode "Wubu" Constellation Background -->
  <g class="dark-bg">
    <path d="M 20 30 L 35 55 L 50 35 L 65 55 L 80 30" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="3 3" />
    <use href="#sparkle-star" x="20" y="30" transform="scale(0.8) translate(5, 7.5)" />
    <use href="#sparkle-star" x="35" y="55" />
    <use href="#sparkle-star" x="50" y="35" transform="scale(0.6) translate(33, 23)" />
    <use href="#sparkle-star" x="65" y="55" />
    <use href="#sparkle-star" x="80" y="30" transform="scale(1.2) translate(-13, -5)" />
  </g>

  <!-- 4. Sliding Knob -->
  <g class="knob-group">
    <circle class="knob-base" cx="40" cy="40" r="34" />
    
    <g class="icon-rotator">
      <g class="node-rays">
        <use href="#proxy-node" />
        <use href="#proxy-node" transform="rotate(45 40 40)" />
        <use href="#proxy-node" transform="rotate(90 40 40)" />
        <use href="#proxy-node" transform="rotate(135 40 40)" />
        <use href="#proxy-node" transform="rotate(180 40 40)" />
        <use href="#proxy-node" transform="rotate(225 40 40)" />
        <use href="#proxy-node" transform="rotate(270 40 40)" />
        <use href="#proxy-node" transform="rotate(315 40 40)" />
      </g>
      <circle class="core-icon" cx="40" cy="40" r="16" mask="url(#moon-mask)" />
    </g>
  </g>
</svg>`;

const filesToUpdate = [
    'views/pages/misc/deobf/header.html',
    'views/pages/blooket.html',
    'views/pages/docs.html',
    'views/pages/issues.html',
    'views/pages/games.html',
    'views/home.html',
    'views/pages/surf.html'
];

filesToUpdate.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');

        // Replace old theme toggle
        const oldToggleRegex = /<button class="nav-icon" id="themeToggle" title="Toggle Theme"><i class="fas fa-moon"><\/i><\/button>/g;
        const oldToggleRegex2 = /<button class="nav-icon" id="themeToggle" title="Toggle Theme"><i class="fas fa-sun"><\/i><\/button>/g;

        content = content.replace(oldToggleRegex, themeSvg);
        content = content.replace(oldToggleRegex2, themeSvg);

        // Update the global JS applyTheme function to add/remove 'dark-mode' class on the SVGs instead of innerHTML
        content = content.replace(/btn\.innerHTML = theme === 'dark' \? '<i class="fas fa-sun"><\\\/i>' : '<i class="fas fa-moon"><\\\/i>';/g,
            "if(theme === 'dark') btn.classList.add('dark-mode'); else btn.classList.remove('dark-mode');");

        fs.writeFileSync(file, content);
    }
});

console.log('UI Fixes applied');

