import fs from 'fs';

// 1. Update wubu.css
let cssPath = 'views/assets/css/wubu.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Revert .active style back to none-rounded but keeping color
css = css.replace(/\.nav-links a\.active \{[^]*?\}/, `.nav-links a.active {
    color: var(--accent) !important;
}`);

// Add animation to modal
if (!css.includes('@keyframes modalFadeIn')) {
    css += `
@keyframes modalFadeIn {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes dropdownFadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.modal-overlay.active .modal {
    animation: modalFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.dropdown-content {
    transform-origin: top right;
    animation: dropdownFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
`;
}
fs.writeFileSync(cssPath, css);

// 2. Update csel.js for cloak-reset
let cselPath = 'views/assets/js/csel.js';
let csel = fs.readFileSync(cselPath, 'utf8');
csel = csel.replace(/attachEventListener\('cloak-reset', 'click', \(\) => {[^]*?}\);/, `attachEventListener('cloak-reset', 'click', () => {
      removeStorage('Title');
      removeStorage('Icon');
      pageTitle(defaultTitle);
      pageIcon(defaultIconHref);
      let t = document.getElementById('titleform');
      if (t) t.firstElementChild.value = '';
      let i = document.getElementById('iconform');
      if (i) i.firstElementChild.value = '';
    });`);
fs.writeFileSync(cselPath, csel);

// 3. Update surf.html to add cool animations
let surfPath = 'views/pages/surf.html';
let surf = fs.readFileSync(surfPath, 'utf8');

if (!surf.includes('proxy-animations')) {
    const injectStyles = `
    <style class="proxy-animations">
        .proxy-bg-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 800px;
            height: 800px;
            background: radial-gradient(circle, var(--accent) 0%, transparent 60%);
            opacity: 0.15;
            transform: translate(-50%, -50%);
            z-index: -1;
            pointer-events: none;
            animation: pulseGlow 5s infinite alternate ease-in-out;
        }
        
        @keyframes pulseGlow {
            0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.1; }
            100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.2; }
        }

        .search-box {
            position: relative;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .search-box:focus-within {
            transform: scale(1.02);
            box-shadow: 0 15px 40px rgba(138, 43, 226, 0.2);
        }

        .cards-grid .card {
            animation: cardFloat 3s infinite alternate ease-in-out;
            animation-delay: calc(var(--anim-delay) * 1s);
        }

        @keyframes cardFloat {
            0% { transform: translateY(0px); }
            100% { transform: translateY(-8px); }
        }
        
        main { position: relative; }
    </style>
    <div class="proxy-bg-glow"></div>
    `;
    surf = surf.replace('<main class="container">', '<main class="container">' + injectStyles);

    // Add staggered delay to cards
    let delay = 0;
    surf = surf.replace(/<div class="card"/g, () => {
        delay += 0.2;
        return `<div class="card" style="--anim-delay: ${delay}"`;
    });

    fs.writeFileSync(surfPath, surf);
}

// 4. Update settings.html details styling
let sPath = 'views/pages/misc/deobf/settings.html';
let sHtml = fs.readFileSync(sPath, 'utf8');
sHtml = sHtml.replace(/<summary style="cursor:pointer; font-weight:700;">Advanced<\/summary>/, `<summary style="cursor:pointer; font-weight:700; background: var(--surface); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border); transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Advanced</summary>`);
sHtml = sHtml.replace(/<a href="{{route}}{{\/questions}}" style="color: var(--accent); text-decoration: none; font-weight: 500; font-size: 0.95rem;">/g, `<a href="{{route}}{{/questions}}" style="display:inline-block; padding: 10px 16px; border-radius: 10px; background: var(--surface); color: var(--text-main); text-decoration: none; font-weight: 500; font-size: 0.95rem; border: 1px solid var(--border); transition: 0.2s; margin-top: 10px;" onmouseover="this.style.borderColor='var(--accent)'; this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-main)'">`);
fs.writeFileSync(sPath, sHtml);

// 5. Ensure theme toggle works properly globally
const filesToFix = ['views/pages/games.html', 'views/pages/blooket.html', 'views/pages/docs.html', 'views/pages/issues.html', 'views/home.html', 'views/pages/surf.html', 'views/pages/misc/deobf/header.html'];
filesToFix.forEach(p => {
    if (!fs.existsSync(p)) return;
    let t = fs.readFileSync(p, 'utf8');

    // Replace buggy root theme toggle listener loop with the robust universal one.
    if (t.includes('const themeToggle = document.getElementById(\'themeToggle\')')) {
        // Strip out old script block
        t = t.replace(/<script>\s*\(function\(\)\{\s*const themeToggle[\s\S]*?\}\)\(\);\s*<\/script>/, '');
        // Clean out inline home.html one
        t = t.replace(/<script>\s*const themeToggle = document.getElementById[\s\S]*?<\/script>/, '');
    }

    // Inject robust listener at end of body if not there
    if (!t.includes('window.wubuThemeSetup')) {
        const universalScript = `
<script>
    if(!window.wubuThemeSetup) {
        window.wubuThemeSetup = true;
        const root = document.documentElement;
        
        function applyTheme(theme) {
            if (theme === 'dark') {
                root.setAttribute('data-theme', 'dark');
            } else {
                root.removeAttribute('data-theme');
            }
            localStorage.setItem('wubu-theme', theme);
            
            // Update all toggle buttons on page
            document.querySelectorAll('#themeToggle').forEach(btn => {
                btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            });
        }
        
        const currentTheme = localStorage.getItem('wubu-theme') || 'light';
        applyTheme(currentTheme);
        
        // Listeners for all theme buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#themeToggle');
            if(btn) {
                const isDark = root.hasAttribute('data-theme');
                applyTheme(isDark ? 'light' : 'dark');
            }
        });

        // Dropdown toggle globally
        document.addEventListener('click', (e) => {
            const moreBtn = e.target.closest('#moreDocsBtn');
            const dropdown = document.getElementById('moreDropdown');
            if(moreBtn && dropdown) {
                e.preventDefault();
                e.stopPropagation();
                if(dropdown.style.display === 'block') {
                    dropdown.style.opacity = '0';
                    setTimeout(() => dropdown.style.display = 'none', 200);
                } else {
                    dropdown.style.display = 'block';
                    dropdown.style.opacity = '1';
                }
            } else if(dropdown && dropdown.style.display === 'block' && !e.target.closest('#moreDropdown')) {
                dropdown.style.opacity = '0';
                setTimeout(() => dropdown.style.display = 'none', 200);
            }
        });
    }
</script>
`;
        t = t.replace('</body>', universalScript + '</body>');
    }
    fs.writeFileSync(p, t);
});

console.log('Fixed requested UI updates');
