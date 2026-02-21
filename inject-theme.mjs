import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('views/**/*.html');
const script = `<script>try{if(localStorage.getItem('wubu-theme')==='dark'){document.documentElement.setAttribute('data-theme', 'dark')}}catch(e){}</script>`;

for (const file of files) {
    let content = readFileSync(file, 'utf8');
    if (content.includes('</head>') && !content.includes('wubu-theme')) {
        content = content.replace('</head>', `${script}\n</head>`);
        writeFileSync(file, content);
    }
}
console.log('Injected theme script in ' + files.length + ' files.');
