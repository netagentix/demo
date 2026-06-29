import { RelationalKernel, Vector } from '../OS_kernel/js/corekernel.js';

class FormationKernel extends RelationalKernel {
    constructor(config) {
        super(config);
        this.agents = [];
        this.activeType = 'triangle';
        this.canvas = null;
        this.ctx = null;
        this.transitionSpeed = 0.05; // Default slow
        this.iteration = 0;
        
        this.logics = {
            triangle: (i, N, cfg) => {
                const spacing = cfg.spacing;
                const row = Math.floor(Math.sqrt(2 * i + 0.25) - 0.5);
                const firstInRow = (row * (row + 1)) / 2;
                const col = i - firstInRow;
                return [(col - row / 2) * spacing, row * spacing * 0.866 + cfg.center_offset[1]];
            },
            circle: (i, N, cfg) => {
                const R = cfg.min_radius + N * cfg.radius_step;
                const angle = (i / N) * Math.PI * 2;
                return [Math.cos(angle) * R, Math.sin(angle) * R];
            },
            cube: (i, N, cfg) => {
                const cols = Math.ceil(Math.sqrt(N));
                const spacing = cfg.grid_size;
                const r = Math.floor(i / cols);
                const c = i % cols;
                const offset = (cols - 1) / 2;
                return [(c - offset) * spacing, (r - offset) * spacing];
            },
            cross: (i, N, cfg) => {
                const spacing = cfg.arm_spacing;
                const arm = i % 4;
                const idx = Math.floor(i / 4) + 1;
                const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
                const dir = dirs[arm];
                return [dir[0] * idx * spacing, dir[1] * idx * spacing];
            }
        };

        this.init();
    }

    init() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.agents = [];
        Array.from({length: this.cfg.initial_agents}).forEach(() => this.addAgent());
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.center = [this.canvas.width / 2, this.canvas.height / 2];
    }

    addAgent() {
        const canAdd = Math.max(0, Math.sign(this.cfg.max_agents - this.agents.length));
        [() => {}, () => {
            this.agents.push({
                pos: [Math.random() * this.canvas.width, Math.random() * this.canvas.height],
                vel: [0, 0],
                target: [this.canvas.width / 2, this.canvas.height / 2],
                id: Math.random().toString(36).substr(2, 5)
            });
            this.logToGraph(`Agent ${this.agents.length} spawned.`);
        }][canAdd]();
    }

    removeAgent() {
        const canRemove = Math.max(0, Math.sign(this.agents.length - this.cfg.min_agents));
        [() => {}, () => {
            const idx = Math.floor(Math.random() * this.agents.length);
            this.agents.splice(idx, 1);
            this.logToGraph(`Random extraction. Remaining: ${this.agents.length}`);
        }][canRemove]();
    }

    setFormation(type) {
        this.activeType = type;
        this.logToGraph(`Kernel: ${type.toUpperCase()}`);
    }

    logToGraph(msg) {
        const view = document.getElementById('graph-view');
        const op = [() => {}, () => {
            const div = document.createElement('div');
            div.textContent = `> ${msg}`;
            view.appendChild(div);
            view.scrollTop = view.scrollHeight;
        }][+!!view];
        op();
    }

    // --- OS LAYERS ---
    
    perceptoryLayer() {
        const slider = document.getElementById('speed-slider');
        const readSpeed = [() => this.transitionSpeed, () => parseFloat(slider.value)][+!!slider];
        this.transitionSpeed = readSpeed();
    }

    semanticLayer() {
        // Reserved for state extraction (e.g. "is_stable")
    }

    decisionLayer() {
        const N = this.agents.length;
        const phys = this.cfg.physics;
        const formationCfg = this.cfg.formations[this.activeType];
        const logicFn = this.logics[this.activeType];

        this.agents.forEach((a, i) => {
            // 1. Target Determination via Relational Logic
            const relPos = logicFn(i, N, formationCfg);
            const idealTarget = Vector.add(this.center, relPos);

            // Smoothly update target (Transition feature)
            const hasTarget = +(a.target !== undefined);
            const safeTarget = [a.pos, a.target][hasTarget];
            
            // Branchless interpolation (Low-pass filter)
            a.target = Vector.add(safeTarget, Vector.mul(Vector.sub(idealTarget, safeTarget), this.transitionSpeed));

            // 2. Force Accumulation
            let force = [0, 0];

            // A. Slot Attraction
            const toTarget = Vector.sub(a.target, a.pos);
            force = Vector.add(force, Vector.mul(toTarget, phys.stiffness));

            // B. Social Repulsion
            this.agents.forEach((other, j) => {
                const diff = Vector.sub(a.pos, other.pos);
                const d = Vector.norm(diff) + 0.1;
                const push = Math.max(0, phys.repulsion_radius - d) / phys.repulsion_radius;
                const repulsion = Vector.mul(Vector.normalize(diff), push * phys.repulsion_strength * 0.05);
                
                const mask = Math.abs(Math.sign(i - j)); 
                force = Vector.add(force, Vector.mul(repulsion, mask));
            });

            // C. Entropy
            const noise = [(Math.random() - 0.5) * phys.noise_amplitude, (Math.random() - 0.5) * phys.noise_amplitude];
            force = Vector.add(force, noise);

            a.netForce = force;
        });
    }

    kineticLayer() {
        const phys = this.cfg.physics;
        this.agents.forEach(a => {
            a.vel = Vector.mul(Vector.add(a.vel, a.netForce), phys.damping);
            a.pos = Vector.add(a.pos, a.vel);
        });
    }

    temporalLayer() {
        this.iteration++;
        this.updateUI();
    }

    step() {
        this.perceptoryLayer();
        this.semanticLayer();
        this.decisionLayer();
        this.kineticLayer();
        this.temporalLayer();
    }

    updateUI() {
        document.getElementById('agent-count').textContent = this.agents.length;
        const avgVel = this.agents.reduce((acc, a) => acc + Vector.norm(a.vel), 0) / (this.agents.length + 1e-6);
        const stability = Math.max(0, Math.min(100, 100 - avgVel * 40)).toFixed(1);
        document.getElementById('stability-val').textContent = stability + '%';
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid Background
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        for(let x=0; x<this.canvas.width; x+=50) { ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); }
        for(let y=0; y<this.canvas.height; y+=50) { ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); }
        ctx.stroke();

        this.agents.forEach(a => {
            // Target Slot
            ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
            ctx.beginPath();
            ctx.arc(a.target[0], a.target[1], 12, 0, Math.PI * 2);
            ctx.fill();

            // Agent
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.arc(a.pos[0], a.pos[1], 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }
}

async function start() {
    try {
        const yamlStr = `
field:
  width: 800
  height: 600
  bg_color: "#0a0a0f"
  grid_color: "rgba(255, 255, 255, 0.05)"

formations:
  triangle:
    id: 0
    name: "Triangle"
    spacing: 75
    center_offset: [0, -60]
    topology: "layered_pyramid"
  circle:
    id: 1
    name: "Circle"
    radius_step: 15
    min_radius: 60
    topology: "radial_shell"
  cube:
    id: 2
    name: "Cube"
    grid_size: 70
    topology: "orthogonal_grid"
  cross:
    id: 3
    name: "Cross"
    arm_spacing: 65
    topology: "central_axial"

physics:
  stiffness: 0.15
  damping: 0.85
  repulsion_strength: 1200
  repulsion_radius: 60
  noise_amplitude: 0.8

initial_agents: 10
max_agents: 40
min_agents: 2

rules:
  - "Each agent seeks its slot defined by the active formation kernel."
  - "Slots are calculated relative to the formation center of mass."
  - "Repulsion is a local field effect (1/d^2) applied to all neighbors."
  - "Formation switching preserves momentum but updates target vectors instantly."
`;
        const config = jsyaml.load(yamlStr);
        
        const sim = new FormationKernel(config);

        document.querySelectorAll('.formation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.formation-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                sim.setFormation(e.target.dataset.type);
            });
        });

        document.getElementById('add-agent').addEventListener('click', () => sim.addAgent());
        document.getElementById('remove-agent').addEventListener('click', () => sim.removeAgent());
        document.getElementById('reset-sim').addEventListener('click', () => sim.init());

        // Slider listener
        const speedSlider = document.getElementById('speed-slider');
        const speedVal = document.getElementById('speed-val');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                speedVal.textContent = e.target.value;
                sim.transitionSpeed = parseFloat(e.target.value);
            });
        }

        function loop() {
            sim.step();
            sim.render();
            requestAnimationFrame(loop);
        }
        loop();
    } catch (e) {
        console.error("Kernel Init Error:", e);
    }
}

start();
