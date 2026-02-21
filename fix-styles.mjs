import fs from 'fs';

// 1. Remove the active background from wubu.css completely (no rounded background)
let cssPath = 'views/assets/css/wubu.css';
let css = fs.readFileSync(cssPath, 'utf8');

css = css.replace(/\.nav-links a\.active \{[\s\S]*?\}/, '.nav-links a.active {\n    color: var(--accent) !important;\n}');
fs.writeFileSync(cssPath, css);

// 2. Add 3D background to surf.html
let surfPath = 'views/pages/surf.html';
let surf = fs.readFileSync(surfPath, 'utf8');

const canvasScript = `
    <!-- Interactive 3D Background -->
    <canvas id="bg-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -2; pointer-events: none; opacity: 0.6;"></canvas>
    <script>
        (function() {
            const canvas = document.getElementById('bg-canvas');
            const ctx = canvas.getContext('2d');
            let width, height;

            // Nodes
            const nodes = [];
            const numNodes = 80;
            const maxDistance = 150;

            // Mouse tracking
            let mouseX = 0;
            let mouseY = 0;
            let targetMouseX = 0;
            let targetMouseY = 0;

            function resize() {
                const parent = canvas.parentElement;
                width = parent.clientWidth || window.innerWidth;
                height = parent.clientHeight || window.innerHeight;
                canvas.width = width * window.devicePixelRatio;
                canvas.height = height * window.devicePixelRatio;
                ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            }

            window.addEventListener('resize', resize);
            document.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                targetMouseX = e.clientX - rect.left;
                targetMouseY = e.clientY - rect.top;
            });

            // Initialize nodes
            for (let i = 0; i < numNodes; i++) {
                nodes.push({
                    x: Math.random() * 2000 - 1000, 
                    y: Math.random() * 2000 - 1000,
                    z: Math.random() * 2 + 0.1, // Depth
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5
                });
            }

            // Get color from CSS variable or fallback
            function getAccent() {
                const root = document.documentElement;
                const isDark = root.getAttribute('data-theme') === 'dark';
                return isDark ? '138, 43, 226' : '99, 102, 241';
            }

            function draw() {
                ctx.clearRect(0, 0, width, height);

                // Smooth mouse interpolation (easing)
                mouseX += (targetMouseX - mouseX) * 0.05;
                mouseY += (targetMouseY - mouseY) * 0.05;

                // Center coordinates
                const cx = width / 2;
                const cy = height / 2;

                const accentProps = getAccent();

                // Project 3D to 2D
                const projected = nodes.map(node => {
                    // Parallax shift based on mouse and node depth
                    const dx = (mouseX - cx) * node.z * 0.5;
                    const dy = (mouseY - cy) * node.z * 0.5;

                    // Move nodes
                    node.x += node.vx;
                    node.y += node.vy;

                    // Wrap around logic roughly
                    if(node.x > 1500) node.x = -1500;
                    if(node.x < -1500) node.x = 1500;
                    if(node.y > 1500) node.y = -1500;
                    if(node.y < -1500) node.y = 1500;

                    // Calculate final 2D pos
                    const scale = 3 / (3 + node.z); // Perspective scale
                    return {
                        x: cx + (node.x + dx) * scale,
                        y: cy + (node.y + dy) * scale,
                        scale: scale,
                        z: node.z
                    };
                });

                // Draw lines between close nodes
                ctx.lineWidth = 1;
                for (let i = 0; i < projected.length; i++) {
                    const p1 = projected[i];
                    
                    // Only process visibly on screen
                    if(p1.x < -100 || p1.x > width + 100 || p1.y < -100 || p1.y > height + 100) continue;

                    for (let j = i + 1; j < projected.length; j++) {
                        const p2 = projected[j];
                        const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

                        if (distSq < maxDistance * maxDistance) {
                            const opacity = (1 - Math.sqrt(distSq) / maxDistance) * 0.5 * p1.scale;
                            ctx.strokeStyle = \`rgba(\${accentProps}, \${opacity})\`;
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.stroke();
                        }
                    }
                }

                // Draw points
                for (let i = 0; i < projected.length; i++) {
                    const p = projected[i];
                    if(p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) continue;
                    
                    const opacity = 0.5 * p.scale;
                    ctx.fillStyle = \`rgba(\${accentProps}, \${opacity})\`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 2 * p.scale, 0, Math.PI * 2);
                    ctx.fill();
                }

                requestAnimationFrame(draw);
            }

            // Init
            setTimeout(() => {
                resize();
                draw();
            }, 100);
        })();
    </script>
`;

if (!surf.includes('id="bg-canvas"')) {
    surf = surf.replace('<div class="proxy-bg-glow"></div>', canvasScript + '\n    <div class="proxy-bg-glow"></div>');
    fs.writeFileSync(surfPath, surf);
}

// 3. Update settings.html
let sPath = 'views/pages/misc/deobf/settings.html';
let sHtml = fs.readFileSync(sPath, 'utf8');

sHtml = sHtml.replace(/<form id=\"iconform\" class=\"cloakform\" style=\"display:flex; gap:10px;\">/, '<form id="iconform" class="cloakform" style="display:flex; gap:10px; margin-bottom: 24px;">'); // add spacing above the buttons

sHtml = sHtml.replace(/<a href=\"\{\{route\}\}\{\/questions\}\"[^]*?>\{\{mask\}\}\{\{Find Icon URL\}\}<\/a>/, `<a href="{{route}}{{/questions}}" style="display:flex; align-items:center; justify-content:center; padding: 12px 16px; border-radius: 12px; background: var(--surface); color: var(--text-main); text-decoration: none; font-weight: 600; font-size: 0.95rem; border: 1px solid var(--border); transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.color='var(--accent)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-main)'; this.style.transform='translateY(0)'"><i class="fas fa-search" style="margin-right: 8px;"></i>{{mask}}{{Find Icon URL}}</a>`);

sHtml = sHtml.replace(/<summary style=\"cursor:pointer; font-weight:700; background: var\(--surface\); padding: 12px 16px; border-radius: 10px; border: 1px solid var\(--border\); transition: 0\.2s;\" onmouseover=\"this\.style\.borderColor='var\(--accent\)'\" onmouseout=\"this\.style\.borderColor='var\(--border\)'\">Advanced<\/summary>/, `<summary style="cursor:pointer; font-weight:700; background: var(--surface); padding: 16px 20px; border-radius: 12px; border: 1px solid var(--border); transition: all 0.2s; display:flex; justify-content:space-between; align-items:center; font-size:1.05rem;" onmouseover="this.style.borderColor='var(--accent)'; this.style.boxShadow='0 4px 12px rgba(138, 43, 226, 0.1)'" onmouseout="this.style.borderColor='var(--border)'; this.style.boxShadow='none'">Advanced <i class="fas fa-chevron-down" style="font-size: 0.9rem; color: var(--text-secondary);"></i></summary>`);

sHtml = sHtml.replace(/<details style=\"margin-top: 14px;\">/, `<details style="margin-top: 24px;">`);
fs.writeFileSync(sPath, sHtml);


console.log('Fixed styling features requested');
