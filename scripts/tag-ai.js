// Wubu Tag AI & Cheat GUI
// Trigger: Ctrl+E to toggle menu

(function () {
    console.log("[Wubu] Tag AI: Initializing...");

    // --- CONSTANTS & CONFIG ---
    const KEY_CODES = {
        // Player 1 (Arrows) by default
        P1: { UP: ['ArrowUp', 38], LEFT: ['ArrowLeft', 37], RIGHT: ['ArrowRight', 39], DOWN: ['ArrowDown', 40] },
        // Player 2 (WASD) - Optional if user selects P2
        P2: { UP: ['KeyW', 87], LEFT: ['KeyA', 65], RIGHT: ['KeyD', 68], DOWN: ['KeyS', 83] },
        P3: { UP: ['KeyI', 73], LEFT: ['KeyJ', 74], RIGHT: ['KeyL', 76], DOWN: ['KeyK', 75] },
        P4: { UP: ['KeyT', 84], LEFT: ['KeyF', 70], RIGHT: ['KeyH', 72], DOWN: ['KeyG', 71] }
    };

    // --- GUI CREATION ---
    const guiState = {
        active: false,
        aiEnabled: false,
        visuals: true,
        playerIndex: 0, // 0 = P1, 1 = P2, etc.
        role: 'runner', // 'runner' or 'chaser'
        autoJump: true
    };

    const gui = document.createElement('div');
    gui.id = 'wubu-tag-gui';
    gui.innerHTML = `
        <div style="font-family: 'Outfit', sans-serif; padding: 15px; color: white; background: rgba(15, 23, 42, 0.95); border: 1px solid #6366f1; border-radius: 12px; width: 280px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <h3 style="margin:0; font-size: 1.1rem; color: #6366f1;">Tag AI Control</h3>
                <span style="font-size: 0.8rem; color: #94a3b8;">Ctrl+E</span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap: 10px;">
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Player Slot:</span>
                    <select id="sel-player" style="background:#1e293b; color:white; border:1px solid #6366f1; border-radius:4px; padding:4px;">
                        <option value="0">Player 1 (Arrows)</option>
                        <option value="1">Player 2 (WASD)</option>
                        <option value="2">Player 3 (IJKL)</option>
                        <option value="3">Player 4 (TFGH)</option>
                    </select>
                </label>

                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span>AI Role:</span>
                    <select id="sel-role" style="background:#1e293b; color:white; border:1px solid #6366f1; border-radius:4px; padding:4px;">
                        <option value="runner">Runner (Avoid)</option>
                        <option value="chaser">Chaser (Pursue)</option>
                    </select>
                </label>
                
                <label style="display:flex; justify-content:space-between; cursor:pointer; margin-top:5px;">
                    <span>Enable AI</span>
                    <input type="checkbox" id="chk-ai-enable">
                </label>
                
                <label style="display:flex; justify-content:space-between; cursor:pointer;">
                    <span>Auto Jump</span>
                    <input type="checkbox" id="chk-autojump" checked>
                </label>

                <label style="display:flex; justify-content:space-between; cursor:pointer;">
                    <span>Visuals (Debug)</span>
                    <input type="checkbox" id="chk-visuals" checked>
                </label>
                
                <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 8px;">
                    <div id="status-display" style="font-size: 0.85rem; color: #6366f1;">Status: Idle</div>
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

    // --- INPUT SIMULATION ---
    const activeKeys = new Set();

    function setKey(keyDef, active) {
        if (!keyDef) return;
        const [code, keyCode] = keyDef;

        if (active) {
            if (!activeKeys.has(code)) {
                window.dispatchEvent(new KeyboardEvent('keydown', {
                    code: code,
                    key: code,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true
                }));
                activeKeys.add(code);
            }
        } else {
            if (activeKeys.has(code)) {
                window.dispatchEvent(new KeyboardEvent('keyup', {
                    code: code,
                    key: code,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true
                }));
                activeKeys.delete(code);
            }
        }
    }

    function resetInputs() {
        const pKeys = getPlayerKeys();
        setKey(pKeys.LEFT, false);
        setKey(pKeys.RIGHT, false);
        setKey(pKeys.UP, false);
        setKey(pKeys.DOWN, false);
    }

    function getPlayerKeys() {
        switch (guiState.playerIndex) {
            case 1: return KEY_CODES.P2;
            case 2: return KEY_CODES.P3;
            case 3: return KEY_CODES.P4;
            default: return KEY_CODES.P1;
        }
    }

    // --- RUNTIME & OBJECT SCANNING ---
    let runtime = null;
    let playerInstances = [];

    function findRuntime() {
        // C3 Runtime interface usually usually available globally or via specific hook
        if (window.c3_runtimeInterface) return window.c3_runtimeInterface._GetLocalRuntime();
        // Fallback: Check for C3 global
        if (window.C3_Runtime) return window.C3_Runtime;
        return null;
    }

    function scanGame() {
        if (!runtime) runtime = findRuntime();
        if (!runtime) return;

        playerInstances = [];

        try {
            // C3 Method: GetAllObjectTypeInstances
            if (runtime.GetAllObjectTypeInstances) {
                const all = runtime.GetAllObjectTypeInstances();
                for (const list of all) {
                    for (const inst of list) checkInstance(inst);
                }
            }
            // Fallback: Browse types
            else if (runtime.types_by_index) {
                runtime.types_by_index.forEach(t => {
                    if (t.instances) t.instances.forEach(i => checkInstance(i));
                });
            }
        } catch (e) {
            // console.warn("Scan warning:", e);
        }

        // Sort by IDs to maintain consistent P1, P2, P3, P4 ordering
        playerInstances.sort((a, b) => {
            const idA = a.GetUID ? a.GetUID() : (a.uid || 0);
            const idB = b.GetUID ? b.GetUID() : (b.uid || 0);
            return idA - idB;
        });

        // Update status if needed
        if (playerInstances.length > 0) {
            // Debug info
            // console.log("Players found:", playerInstances.length);
        }
    }

    function checkInstance(inst) {
        // Heuristic: Identify players by size (usually 32x32 ish) and Platform behavior
        // Accessing size might need GetWidth()/GetHeight() or direct props
        let w = inst.width;
        let h = inst.height;
        if (inst.GetWidth) w = inst.GetWidth();
        if (inst.GetHeight) h = inst.GetHeight();

        // Tag players are roughly square sprites, approx 30-100px depending on scaling
        if (w > 20 && w < 120 && h > 20 && h < 120) {
            // Check for Platform behavior
            let hasPlatform = false;
            // C3 SDK check
            if (inst.GetBehaviorSdkInstances) {
                const behaviors = inst.GetBehaviorSdkInstances();
                if (behaviors.some(b => b.GetSdkType && b.GetSdkType().GetName() === 'Platform')) hasPlatform = true;
            }
            // C2/Legacy check
            if (!hasPlatform && inst.behavior_insts) {
                // Harder to check type name in minified code, but let's assume any physics/platform object
                hasPlatform = true;
            }

            if (hasPlatform && (inst.isVisible === undefined || inst.isVisible)) {
                playerInstances.push(inst);
            }
        }
    }

    function getPos(inst) {
        if (inst.GetWorldInfo) {
            const wi = inst.GetWorldInfo();
            return { x: wi.GetX(), y: wi.GetY() };
        }
        return { x: inst.x, y: inst.y };
    }

    // --- AI LOGIC ---
    function runAI() {
        if (!guiState.aiEnabled) {
            // Ensure keys are released if we just disabled
            if (activeKeys.size > 0) resetInputs();
            return;
        }

        if (!playerInstances[guiState.playerIndex]) {
            document.getElementById('status-display').textContent = `Player ${guiState.playerIndex + 1} not found!`;
            return;
        }

        const me = playerInstances[guiState.playerIndex];
        const myPos = getPos(me);
        const pKeys = getPlayerKeys();

        // 1. Find Closest Target
        let closest = null;
        let minDist = Infinity;

        playerInstances.forEach((p, idx) => {
            if (idx === guiState.playerIndex) return; // Skip self
            const pPos = getPos(p);
            const d = Math.hypot(pPos.x - myPos.x, pPos.y - myPos.y);
            if (d < minDist) {
                minDist = d;
                closest = p;
            }
        });

        if (!closest) {
            document.getElementById('status-display').textContent = "Waiting for players...";
            resetInputs();
            return;
        }

        document.getElementById('status-display').textContent = `AI Active: ${guiState.role}`;
        const targetPos = getPos(closest);
        const dx = targetPos.x - myPos.x;
        const dy = targetPos.y - myPos.y; // Negative dy means target is ABOVE (standard 2D coords often y-down)

        // 2. Decide Movement
        let moveLeft = false;
        let moveRight = false;
        let jump = false;

        if (guiState.role === 'chaser') {
            // Move TOWARDS target
            if (dx > 10) moveRight = true;
            else if (dx < -10) moveLeft = true;

            // Jump if target is significantly above
            if (guiState.autoJump && dy < -50) jump = true;

        } else {
            // RUNNER: Move AWAY from target
            if (dx > 0) moveLeft = true; // Target is right, go left
            else moveRight = true;       // Target is left, go right

            // Panic jump if close
            if (guiState.autoJump && minDist < 150 && Math.random() < 0.1) jump = true;
        }

        // Apply Inputs
        setKey(pKeys.LEFT, moveLeft);
        setKey(pKeys.RIGHT, moveRight);

        // Simple Jump Logic
        // In some games, holding UP maintains jump. In others, tap.
        // We'll hold it if jumping.
        setKey(pKeys.UP, jump);
    }

    // --- VISUALS ---
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0'; canvas.style.left = '0';
    canvas.style.width = '100%'; canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '999998';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function drawVisuals() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!guiState.visuals || !guiState.active) return; // Only draw when menu Open OR always? Default: Open. 
        // Logic: if visuals enabled, draw always? Let's draw active state logic.

        if (!runtime) return;

        // Note: Coordinate conversion from World to Screen is complex without SDK access.
        // We will approximate or hope canvas matches window inner size mostly.

        // This visualizer is "Overlay" style.
        // If the game uses a camera/scroll, we need to subtract scrollX/scrollY.
        let scrollX = 0;
        let scrollY = 0;

        // Try getting layout scroll
        if (runtime.GetMainRunningLayout) {
            const layout = runtime.GetMainRunningLayout();
            // Assuming Layer 0 is main
            const layer = layout.GetLayer(0);
            scrollX = layer.GetScrollX() - (window.innerWidth / 2) * (1 / layer.GetScale()); // Approx centering?
            // Actually, Construct centers scroll. 
            // Canvas coords = (WorldX - ScrollX) * Scale + ScreenCenterX
            // For now, let's just draw raw and see if it aligns. (Often it won't without math).
        }

        // Placeholder: Drawing logic is tricky without perfect camera reverse-projection.
        // We can just draw a box at Top-Right showing "AI Active".

        ctx.fillStyle = guiState.aiEnabled ? '#0f0' : '#f00';
        ctx.font = '16px monospace';
        ctx.fillText(`AI: ${guiState.aiEnabled ? 'ON' : 'OFF'}`, 20, 30);
        ctx.fillText(`Players: ${playerInstances.length}`, 20, 50);
        ctx.fillText(`Dist: ${playerInstances.length > 1 ? 'Tracking' : 'N/A'}`, 20, 70);
    }

    // --- EVENT LISTENERS ---
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === 'KeyE') {
            e.preventDefault();
            guiState.active = !guiState.active;
            gui.style.display = guiState.active ? 'block' : 'none';
        }
    });

    document.getElementById('sel-player').addEventListener('change', (e) => {
        guiState.playerIndex = parseInt(e.target.value);
        resetInputs();
    });

    document.getElementById('sel-role').addEventListener('change', (e) => {
        guiState.role = e.target.value;
    });

    document.getElementById('chk-ai-enable').addEventListener('change', (e) => {
        guiState.aiEnabled = e.target.checked;
        if (!guiState.aiEnabled) resetInputs();
    });

    document.getElementById('chk-autojump').addEventListener('change', (e) => guiState.autoJump = e.target.checked);
    document.getElementById('chk-visuals').addEventListener('change', (e) => guiState.visuals = e.target.checked);

    // --- LOOPS ---
    setInterval(scanGame, 1000); // Scan every second
    setInterval(() => {
        runAI();
        if (guiState.visuals) drawVisuals();
    }, 50); // AI Logic 20fps

    console.log("[Wubu] Tag AI: Ready. Press Ctrl+E");
})();
