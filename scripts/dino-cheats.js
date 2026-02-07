// Wubu Chrome Dino Cheats
// Trigger: Ctrl+E to toggle menu

(function () {
    console.log("[Wubu] Dino Cheats: Initializing...");

    // --- GUI CREATION ---
    const guiState = {
        active: false,
        godMode: false,
        speedHack: 1.0,
        autoJump: false
    };

    const gui = document.createElement('div');
    gui.id = 'wubu-dino-gui';
    gui.innerHTML = `
        <div style="font-family: 'Outfit', sans-serif; padding: 15px; color: white; background: rgba(15, 23, 42, 0.95); border: 1px solid #6366f1; border-radius: 12px; width: 280px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <h3 style="margin:0; font-size: 1.1rem; color: #6366f1;">Dino Controls</h3>
                <span style="font-size: 0.8rem; color: #94a3b8;">Ctrl+E</span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap: 10px;">
                <label style="display:flex; justify-content:space-between; cursor:pointer;">
                    <span>Invincibility</span>
                    <input type="checkbox" id="chk-god">
                </label>
                
                <label style="display:flex; justify-content:space-between; cursor:pointer;">
                    <span>Auto Jump (AI)</span>
                    <input type="checkbox" id="chk-autojump">
                </label>

                <div style="display:flex; flex-direction:column; gap: 4px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span>Speed</span>
                        <span id="speed-val">1.0x</span>
                    </div>
                    <input type="range" id="rng-speed" min="1" max="50" step="1" value="1" style="width:100%">
                </div>
            </div>
        </div>
    `;

    gui.style.position = 'fixed';
    gui.style.top = '20px';
    gui.style.right = '20px';
    gui.style.zIndex = '999999';
    gui.style.display = 'none';
    document.body.appendChild(gui);

    // --- LOGIC ---
    let originalGameOver = null;

    function initHooks() {
        if (!window.Runner) return;

        if (!originalGameOver && window.Runner.prototype.gameOver) {
            originalGameOver = window.Runner.prototype.gameOver;
        }
    }

    function setGodMode(enable) {
        initHooks();
        if (!window.Runner) return;

        if (enable) {
            window.Runner.prototype.gameOver = function () {
                console.log("Dodged!");
            };
        } else {
            if (originalGameOver) window.Runner.prototype.gameOver = originalGameOver;
        }
    }

    function setSpeed(val) {
        if (!window.Runner || !window.Runner.instance_) return;
        window.Runner.instance_.setSpeed(val);
    }

    // Auto Jump Logic
    setInterval(() => {
        if (!guiState.autoJump) return;
        if (!window.Runner || !window.Runner.instance_ || !window.Runner.instance_.horizon) return;

        const instance = window.Runner.instance_;
        const obstacles = instance.horizon.obstacles;
        if (obstacles.length > 0) {
            const obs = obstacles[0];
            const distX = obs.xPos - instance.tRex.xPos;
            const speed = instance.currentSpeed;

            if (distX > 0 && distX < (20 * speed)) { // Dynamic distance based on speed
                // JUMP
                if (!instance.tRex.jumping && !instance.tRex.ducking) {
                    instance.tRex.startJump(instance.currentSpeed);
                }
            }
        }
    }, 16); // 60fps check

    // --- EVENT LISTENERS ---
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'KeyE') {
            e.preventDefault();
            guiState.active = !guiState.active;
            gui.style.display = guiState.active ? 'block' : 'none';
        }
    });

    document.getElementById('chk-god').addEventListener('change', (e) => {
        setGodMode(e.target.checked);
    });

    document.getElementById('chk-autojump').addEventListener('change', (e) => {
        guiState.autoJump = e.target.checked;
    });

    document.getElementById('rng-speed').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('speed-val').textContent = val + 'x';
        setSpeed(val);
    });

    console.log("[Wubu] Dino Cheats: Ready. Press Ctrl+E");
})();
