import fs from 'fs';

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

        // Remove duplicate style attributes and ensure proper class and sizing
        content = content.replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*id="themeToggle"[^>]*>/g, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="60" height="30" id="themeToggle" class="nav-icon" style="padding: 4px; cursor: pointer;">');

        fs.writeFileSync(file, content);
    }
});

console.log('Fixed SVG tags.');
