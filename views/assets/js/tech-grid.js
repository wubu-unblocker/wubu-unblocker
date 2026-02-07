const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d');
const cursorDot = document.getElementById('cursor-dot');

let width, height;
let points = [];

// Mouse state
let target = { x: -1000, y: -1000 };
let mouseX = -100;
let mouseY = -100;

// --- CONFIGURATION ---
const config = {
    spacing: 30,          // Slightly increased spacing for better performance
    mouseRadius: 250,
    baseOpacity: 0.08,
    activeOpacity: 0.7,
    color: { r: 14, g: 165, b: 233 },
    friction: 0.90,
    elasticity: 0.1
};

// Point Class
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.ox = x;
        this.oy = y;
        this.vx = 0;
        this.vy = 0;
    }

    update() {
        const dx = this.ox - this.x;
        const dy = this.oy - this.y;

        this.vx += dx * config.elasticity;
        this.vy += dy * config.elasticity;

        const distDx = this.x - target.x;
        const distDy = this.y - target.y;
        const dist = Math.sqrt(distDx * distDx + distDy * distDy);

        if (dist < config.mouseRadius) {
            const force = (config.mouseRadius - dist) / config.mouseRadius;
            const angle = Math.atan2(distDy, distDx);
            const push = force * 15;

            this.vx += Math.cos(angle) * push;
            this.vy += Math.sin(angle) * push;
        }

        this.vx *= config.friction;
        this.vy *= config.friction;

        this.x += this.vx;
        this.y += this.vy;
    }
}

function init() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    points = [];

    const cols = Math.ceil(width / config.spacing) + 1;
    const rows = Math.ceil(height / config.spacing) + 1;

    for (let i = 0; i < cols; i++) {
        points[i] = [];
        for (let j = 0; j < rows; j++) {
            points[i][j] = new Point(i * config.spacing, j * config.spacing);
        }
    }
}

function getOpacity(x, y) {
    const dx = x - target.x;
    const dy = y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < config.mouseRadius) {
        const intensity = 1 - (dist / config.mouseRadius);
        return config.baseOpacity + (intensity * (config.activeOpacity - config.baseOpacity));
    }
    return config.baseOpacity;
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    // --- 1. UPDATE CUSTOM CURSOR ---
    if (cursorDot) {
        cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    }

    // --- 2. UPDATE GRID ---
    for (let i = 0; i < points.length; i++) {
        for (let j = 0; j < points[i].length; j++) {
            const p = points[i][j];
            p.update();

            // Vertical
            if (j < points[i].length - 1) {
                const pBelow = points[i][j + 1];
                const midX = (p.x + pBelow.x) / 2;
                const midY = (p.y + pBelow.y) / 2;
                const alpha = getOpacity(midX, midY);

                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(pBelow.x, pBelow.y);
                ctx.strokeStyle = `rgba(${config.color.r}, ${config.color.g}, ${config.color.b}, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Horizontal
            if (i < points.length - 1) {
                const pRight = points[i + 1][j];
                const midX = (p.x + pRight.x) / 2;
                const midY = (p.y + pRight.y) / 2;
                const alpha = getOpacity(midX, midY);

                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(pRight.x, pRight.y);
                ctx.strokeStyle = `rgba(${config.color.r}, ${config.color.g}, ${config.color.b}, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(draw);
}

// --- EVENTS ---
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();

    // For grid physics
    target.x = e.clientX - rect.left;
    target.y = e.clientY - rect.top;

    // For custom cursor visual
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.addEventListener('mouseleave', () => {
    target.x = -1000;
    target.y = -1000;
    if (cursorDot) cursorDot.style.opacity = 0;
});

window.addEventListener('mouseenter', () => {
    if (cursorDot) cursorDot.style.opacity = 1;
});

window.addEventListener('resize', init);

// Start only if canvas exists
if (canvas) {
    init();
    draw();
}
