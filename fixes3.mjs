import fs from 'fs';

// 1. SURF.HTML Fixes (Revert search button)
let surfPath = 'views/pages/surf.html';
if (fs.existsSync(surfPath)) {
    let surf = fs.readFileSync(surfPath, 'utf8');

    // Remove the giant SVG button
    const svgStartMatch = surf.indexOf('<div id="uv-search-btn"');
    if (svgStartMatch !== -1) {
        const svgEndMatch = surf.indexOf('</div>', svgStartMatch + 100);
        if (svgEndMatch !== -1) {
            const svgBlock = surf.substring(svgStartMatch, svgEndMatch + 6);
            surf = surf.replace(svgBlock, '<button class="search-btn" id="uv-search-btn">Browse</button>');
        }
    }

    fs.writeFileSync(surfPath, surf);
}

// 2. Fix the Theme Switcher SVG loading issue
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

        // Let's identify the SVG and wrap it in the proper button, or size it correctly.
        // It might not be visible because the width/height gets overridden or an error occurs.
        // The previous SVG had \`id="themeToggle"\`. Let's ensure it has \`class="nav-icon"\` but custom width to fit 2:1 aspect ratio.
        content = content.replace(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 160 80" width="48" height="24" id="themeToggle"/g, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="56" height="28" id="themeToggle" class="nav-icon" style="padding: 2px"');

        fs.writeFileSync(file, content);
    }
});
console.log('Done reverting Search button and fixing SVG toggle bounds.');
