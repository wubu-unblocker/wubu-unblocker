const fs = require('fs');
let css = fs.readFileSync('views/assets/css/wubu.css', 'utf8');

const updatedRoot = `:root {
    --bg: #ffffff;
    --bg-secondary: rgba(0, 0, 0, 0.03);
    --accent: #8a2be2;
    --accent-hover: #9d4edd;
    --accent-light: rgba(138, 43, 226, 0.15);
    --text: #111827;
    --text-secondary: #4b5563;
    --border: rgba(0, 0, 0, 0.08);
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 12px 48px rgba(138, 43, 226, 0.15);
    --radius: 14px;
    --radius-lg: 20px;
    
    --nav-bg: rgba(255, 255, 255, 0.85);
    --modal-overlay: rgba(255, 255, 255, 0.7);
    --card-bg: rgba(0, 0, 0, 0.02);
    --glass-grad: linear-gradient(135deg, rgba(0,0,0,0.03) 0%, transparent 100%);
}

:root[data-theme="dark"] {
    --bg: #0f1115;
    --bg-secondary: rgba(255, 255, 255, 0.03);
    --text: #ffffff;
    --text-secondary: #9ca3af;
    --border: rgba(255, 255, 255, 0.08);
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 12px 48px rgba(138, 43, 226, 0.2);
    
    --nav-bg: rgba(15, 17, 21, 0.7);
    --modal-overlay: rgba(0, 0, 0, 0.7);
    --card-bg: rgba(255, 255, 255, 0.02);
    --glass-grad: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
}`;

css = css.replace(/:root\s*\{[\s\S]*?--radius-lg:[^;\n]+;\n\}/m, updatedRoot);

// Replacements in the rest of the file
css = css.replace(/background: rgba\(15, 17, 21, 0\.7\);/g, 'background: var(--nav-bg);');
css = css.replace(/background: rgba\(255, 255, 255, 0\.03\);/g, 'background: var(--bg-secondary);');
css = css.replace(/background: rgba\(255, 255, 255, 0\.02\);/g, 'background: var(--card-bg);');
css = css.replace(/background: rgba\(255, 255, 255, 0\.01\);/g, 'background: var(--card-bg);');
css = css.replace(/background: linear-gradient\(135deg, rgba\(255, 255, 255, 0\.05\) 0%, transparent 100%\);/g, 'background: var(--glass-grad);');
css = css.replace(/background: rgba\(0, 0, 0, 0\.7\);/g, 'background: var(--modal-overlay);');
css = css.replace(/background: rgba\(255, 255, 255, 0\.05\);/g, 'background: var(--bg-secondary);');
css = css.replace(/background: rgba\(255, 255, 255, 0\.1\);/g, 'background: var(--border);');
css = css.replace(/background: rgba\(0, 0, 0, 0\.2\);/g, 'background: var(--bg);');
css = css.replace(/background: rgba\(15, 17, 21, 0\.8\);/g, 'background: var(--nav-bg);');
css = css.replace(/border: 1px solid rgba\(255, 255, 255, 0\.2\);/g, 'border: 1px solid var(--border);');
css = css.replace(/border-color: rgba\(255, 255, 255, 0\.2\);/g, 'border-color: var(--border);');

// Handle the setting-select background that was rgba(0,0,0,0.2)
css = css.replace(/background: rgba\(0, 0, 0, 0\.2\);/g, 'background: var(--bg);');

fs.writeFileSync('views/assets/css/wubu.css', css);
fs.writeFileSync('views/dist/assets/css/wubu.css', css);
console.log('Fixed wubu.css');
