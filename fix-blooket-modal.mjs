import fs from 'fs';

// 1. Add modal styles to wubu.css
let cssPath = 'views/assets/css/wubu.css';
let css = fs.readFileSync(cssPath, 'utf8');

const modalCSS = `
/* Global Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: var(--modal-overlay);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.modal-overlay.active {
    opacity: 1;
    pointer-events: all;
}

.modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 500px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    transform: translateY(20px) scale(0.95);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

.modal-overlay.active .modal {
    transform: translateY(0) scale(1);
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
}

.modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
}

.modal-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
}

.modal-close:hover {
    background: var(--bg-secondary);
    color: var(--text-main);
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
    color: var(--text-main);
}

.radio-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}

.radio-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.95rem;
}

.radio-group label:hover {
    border-color: var(--accent);
}

.radio-group input[type="radio"],
.radio-group input[type="checkbox"] {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    cursor: pointer;
}
`;

if (!css.includes('.modal-overlay')) {
    fs.writeFileSync(cssPath, css + '\n' + modalCSS);
}

// 2. Fix Blooket.html styling
let bPath = 'views/pages/blooket.html';
let bHtml = fs.readFileSync(bPath, 'utf8');

const navHtml = `    <nav class="nav">
        <a href="/home" class="nav-brand">
            <i class="fas fa-ghost" style="margin-right: 8px;"></i>Wubu
        </a>
        <div class="nav-links">
            <a href="/home">Home</a>
            <a href="/games">Games</a>
            <a href="/browsing">Proxies</a>
        </div>
        
        <!-- Blooket Specific Actions -->
        <div style="display: flex; gap: 8px; align-items: center;">
            <div class="url-bar" style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; display: flex; align-items: center; width: 200px;">
                <input type="text" id="urlInput" value="https://play.blooket.com/" placeholder="Enter URL..." style="border: none; background: transparent; outline: none; color: var(--text-main); font-family: inherit; width: 100%; font-size:14px;">
            </div>
            <button class="nav-icon" onclick="navigate()" title="Go" style="width: 36px; height: 36px;"><i class="fas fa-play" style="font-size: 13px;"></i></button>
            <button class="nav-icon" onclick="showPasteModal()" title="Paste" style="width: 36px; height: 36px;"><i class="fas fa-paste" style="font-size: 14px;"></i></button>
            <button class="nav-icon" onclick="injectCheats()" title="Cheats" style="width: 36px; height: 36px; background: var(--accent); color: white;"><i class="fas fa-magic" style="font-size: 14px;"></i></button>
            <button class="nav-icon" onclick="toggleGUI()" title="GUI" style="width: 36px; height: 36px;"><i class="fas fa-eye" style="font-size: 14px;"></i></button>
            <button class="nav-icon" onclick="toggleFullscreen()" title="Fullscreen" style="width: 36px; height: 36px;"><i class="fas fa-expand" style="font-size: 14px;"></i></button>
        </div>

        <div class="nav-actions">
            <button class="nav-icon" id="themeToggle" title="Toggle Theme"><i class="fas fa-moon"></i></button>
            <div class="dropdown" style="position: relative; display: inline-block;">
                <button class="nav-icon" id="moreDocsBtn" title="More">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div id="moreDropdown" class="dropdown-content" style="display: none; position: absolute; right: 0; background: var(--nav-bg); min-width: 160px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border-radius: 12px; border: 1px solid var(--border); padding: 8px; z-index: 100;">
                    <a href="/blooket" class="active" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; margin-bottom: 4px; transition: background 0.2s;"><i class="fas fa-bolt" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Blooket</a>
                    <a href="/docs" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; margin-bottom: 4px; transition: background 0.2s;"><i class="fas fa-book" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Docs</a>
                    <a href="/issues" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; transition: background 0.2s;"><i class="fas fa-bug" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Issues</a>
                </div>
            </div>
            <button class="nav-icon" id="settingsBtn" title="Settings">
              <i class="fas fa-cog"></i>
            </button>
        </div>
    </nav>`;

bHtml = bHtml.replace(/<div class="header">[\s\S]*?<\/div>\s*<div class="stream-container"/, navHtml + '\n    <div class="stream-container"');

// Fix Blooket body CSS styling mapping
bHtml = bHtml.replace(/body\s*\{[\s\S]*?\}/, `body { flex-direction: column; overflow: hidden; display: flex; height: 100vh; margin: 0; background: var(--bg); color: var(--text-main); }`);
bHtml = bHtml.replace(/<div class="stream-container" id="streamContainer" tabindex="0">/, '<div class="stream-container" id="streamContainer" tabindex="0" style="background:var(--bg)">');
fs.writeFileSync(bPath, bHtml);

// 3. Fix Settings.html
let sPath = 'views/pages/misc/deobf/settings.html';
let sHtml = fs.readFileSync(sPath, 'utf8');

sHtml = sHtml.replace(/<p class="cseltitle">.*?Theme.*?<\/p>[\s\S]*?<\/div>\s*<div class="radio-group"/i, '<div class="radio-group"'); // Regex magic to remove broken old theme config 
sHtml = sHtml.replace(/<p class="cseltitle">Theme<\/p>[\s\S]*?<\/div>/, '');

sHtml = sHtml.replace(/<p class="cseltitle">/g, '<p class="cseltitle" style="font-weight: 700; color: var(--text-main); margin-bottom: 8px; margin-top: 16px; font-size: 1.05rem;">');

// Custom fancy modal forms
sHtml = sHtml.replace(/<form id=\"titleform\" class=\"cloakform\">/g, '<form id="titleform" class="cloakform" style="display:flex; gap:10px;">');
sHtml = sHtml.replace(/<form id=\"iconform\" class=\"cloakform\">/g, '<form id="iconform" class="cloakform" style="display:flex; gap:10px;">');

const fancyInput = `style="flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text-main); font-family: inherit; font-size: 0.95rem; outline: none; transition: border 0.3s;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"`;
const fancySubmit = `style="padding: 10px 18px; border-radius: 10px; background: var(--accent); color: white; border: none; font-weight: 600; cursor: pointer; transition: background 0.2s;"`;
const fancyButton = `style="padding: 10px 18px; border-radius: 10px; background: var(--surface); color: var(--text-main); border: 1px solid var(--border); font-weight: 600; cursor: pointer; transition: all 0.2s;"`;
const fancySelect = `style="width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text-main); font-family: inherit; font-size: 0.95rem; outline: none; margin-bottom: 12px; cursor: pointer;"`;

sHtml = sHtml.replace(/<input type=\"text\" placeholder=\"Enter a tab title...\" spellcheck=\"false\" \/>/g, `<input type="text" placeholder="Enter a tab title..." spellcheck="false" ${fancyInput} />`);
sHtml = sHtml.replace(/<input type=\"text\" placeholder=\"Enter an icon URL...\" spellcheck=\"false\" \/>/g, `<input type="text" placeholder="Enter an icon URL..." spellcheck="false" ${fancyInput} />`);

sHtml = sHtml.replace(/<input type=\"submit\" value=\"Apply\" \/>/g, `<input type="submit" value="Apply" ${fancySubmit} onmouseover="this.style.background='var(--accent-hover)'" onmouseout="this.style.background='var(--accent)'" />`);
sHtml = sHtml.replace(/<input type=\"button\" id=\"cloak-clever\" value=\"Set To Clever\" \/>/g, `<input type="button" id="cloak-clever" value="Set To Clever" ${fancyButton} onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"/>`);
sHtml = sHtml.replace(/<input type=\"button\" id=\"cloak-reset\" value=\"Reset\" \/>/g, `<input type="button" id="cloak-reset" value="Reset" ${fancyButton} onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"/>`);

sHtml = sHtml.replace(/<select id=\"icon-list\">/, `<select id="icon-list" ${fancySelect}>`);
sHtml = sHtml.replace(/<select class=\"search-engine-list\">/, `<select class="search-engine-list" ${fancySelect}>`);

sHtml = sHtml.replace(/<a href=\"\{\{route\}\}\{\/questions\}\">/g, '<a href="{{route}}{{/questions}}" style="color: var(--accent); text-decoration: none; font-weight: 500; font-size: 0.95rem;">');

// Remove `<p>` tags around inputs in the radio group cause we set up flex properly
sHtml = sHtml.replace(/<p>{{mask}}{{Libcurl}}<\/p>/g, '{{mask}}{{Libcurl}}');
sHtml = sHtml.replace(/<p>{{mask}}{{Epoxy}}<\/p>/g, '{{mask}}{{Epoxy}}');
sHtml = sHtml.replace(/<p>Hide Ads<\/p>/g, 'Hide Ads');
sHtml = sHtml.replace(/<p>{{mask}}{{Enable Tor}}<\/p>/g, '{{mask}}{{Enable Tor}}');
sHtml = sHtml.replace(/<p>Enable Autocomplete<\/p>/g, 'Enable Autocomplete');
sHtml = sHtml.replace(/<p>Public Wisp Fallback<\/p>/g, 'Public Wisp Fallback');

fs.writeFileSync(sPath, sHtml);
console.log('Fixed styles.');
