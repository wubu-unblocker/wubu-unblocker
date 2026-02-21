import fs from 'fs';

const navReplacement = `  <nav class="nav">
    <a href="/home" class="nav-brand">
      <i class="fas fa-ghost" style="margin-right: 8px;"></i>Wubu
    </a>
    <div class="nav-links">
      <a href="/home">Home</a>
      <a href="/games" class="active">Games</a>
      <a href="/browsing">Proxies</a>
    </div>
    <div class="nav-actions">
      <button class="nav-icon" id="themeToggle" title="Toggle Theme"><i class="fas fa-moon"></i></button>
      <div class="dropdown" style="position: relative; display: inline-block;">
        <button class="nav-icon" id="moreDocsBtn" title="More">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        <div id="moreDropdown" class="dropdown-content" style="display: none; position: absolute; right: 0; background: var(--nav-bg); min-width: 160px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border-radius: 12px; border: 1px solid var(--border); padding: 8px; z-index: 100;">
          <a href="/blooket" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; margin-bottom: 4px; transition: background 0.2s;"><i class="fas fa-bolt" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Blooket</a>
          <a href="/docs" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; margin-bottom: 4px; transition: background 0.2s;"><i class="fas fa-book" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Docs</a>
          <a href="/issues" style="display: block; padding: 12px 15px; text-decoration: none; color: var(--text-main); border-radius: 8px; transition: background 0.2s;"><i class="fas fa-bug" style="width: 20px; text-align: center; margin-right: 8px; color: var(--text-secondary);"></i>Issues</a>
        </div>
      </div>
    </div>
  </nav>`;

['views/pages/games.html', 'views/pages/blooket.html', 'views/pages/docs.html', 'views/pages/issues.html'].forEach(path => {
    if (!fs.existsSync(path)) return;
    let text = fs.readFileSync(path, 'utf8');

    // Replace old nav logic
    text = text.replace(/<nav>[\s\S]*?<\/nav>/, navReplacement);

    // Inject wubu.css
    if (!text.includes('/assets/css/wubu.css')) {
        text = text.replace('</head>', '    <link rel="stylesheet" href="/assets/css/wubu.css?v=2">\n</head>');
    }

    // Clean up local CSS root defaults to rely on wubu.css
    text = text.replace(/:root\s*{[^}]*}/, '');

    // Add script logic for dropdown and theme
    const scriptLogic = `
    <script>
    (function(){
      const themeToggle = document.getElementById('themeToggle');
      const root = document.documentElement;
      function applyTheme(theme) {
        if (theme === 'dark') {
          root.setAttribute('data-theme', 'dark');
          if(themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
          root.removeAttribute('data-theme');
          if(themeToggle) themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
        localStorage.setItem('wubu-theme', theme);
      }
      const currentTheme = localStorage.getItem('wubu-theme') || 'light';
      applyTheme(currentTheme);
      if(themeToggle) {
        themeToggle.addEventListener('click', () => {
          const isDark = root.hasAttribute('data-theme');
          applyTheme(isDark ? 'light' : 'dark');
        });
      }

      const moreBtn = document.getElementById('moreDocsBtn');
      const moreDropdown = document.getElementById('moreDropdown');
      if(moreBtn && moreDropdown) {
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          moreDropdown.style.display = moreDropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', () => {
          moreDropdown.style.display = 'none';
        });
      }
    })();
    </script>
    `;

    if (!text.includes('moreDocsBtn')) {
        text = text.replace('</body>', scriptLogic + '\n</body>');
    }

    fs.writeFileSync(path, text, 'utf8');
});

console.log('Fixed pages nav and styles');
