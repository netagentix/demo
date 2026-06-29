import { Vector, Semantic } from '../OS_kernel/js/corekernel.js';
import { EvolutionCalibration } from '../OS_kernel/js/05_evolution_calibration.js';
import { TemporalDynamics } from '../OS_kernel/js/03_temporal_dynamics.js';

// -- GRAPH YAML STR -----------------------------------------------------------
const MAP_YAML_STR = `
world:
  gravity: 0.8
  waves:
    - { name: 'wave1', freq: 0.003, phase: 0.0, amp: 0.5 }
    - { name: 'wave2', freq: 0.006, phase: 1.5, amp: 0.3 }
    - { name: 'wave3', freq: 0.012, phase: 0.5, amp: 0.1 }
    - { name: 'wave_badai', freq: 0.040, phase: 0.0, amp: 0.0 }

robot:
  stance_width: 60
  max_leg_length: 120
  min_leg_length: 70
  motor_speed: 1.5       # Limit of muscle contraction speed (inertia tolerance)
  balance_threshold: 1.0 # CoG deviation tolerance (1.0 means exactly at the foot limit)
  muscle_k: 0.08         # Muscle response pull (Spring)
  muscle_damp: 0.75      # Mechanical friction damping (Damper)

logic:
  kaki_kiri: [3.0, 1.0, [["cog_offset_x", -5.0], ["ship_tilt_vel", -0.5]], "sigmoid"]
  kaki_kanan: [3.0, 1.0, [["cog_offset_x", 5.0], ["ship_tilt_vel", 0.5]], "sigmoid"]
`;

class BipedalSailorKernel extends EvolutionCalibration {
    constructor(cfg) {
        super(cfg);
        this.cfg = cfg;
        this.tempo = new TemporalDynamics(cfg);
        
        cfg.world.waves.forEach(w => {
            this.tempo.registerOscillator(w.name, w.freq, w.phase, w.amp);
        });
        
        this.reset();
        this.kineticEnabled = true; // Flag untuk mengaktifkan/menonaktifkan Layer 4
    }
    
    reset() {
        const w = this.cfg.world;
        const w1 = this.tempo.sampleOscillator(w.waves[0].name) - w.waves[0].amp / 2;
        const w2 = this.tempo.sampleOscillator(w.waves[1].name) - w.waves[1].amp / 2;
        const w3 = this.tempo.sampleOscillator(w.waves[2].name) - w.waves[2].amp / 2;
        this.shipAngle = (w1 + w2 + w3);
        this.prevShipAngle = this.shipAngle;
        this.shipVel = 0;
        this.badaiActive = false;
        
        if (this.tempo && this.tempo._oscillators['wave_badai']) {
            this.tempo._oscillators['wave_badai'].amplitude = 0;
        }
        
        this.legL = this.cfg.robot.max_leg_length;
        this.legR = this.cfg.robot.max_leg_length;
        this.velL = 0;
        this.velR = 0;
        this.smoothCog = 0;
        
        this.fallen = false;
        this.fallPivot = null;
        this.fallRotation = 0; 
        this.fallOmega = 0;
        
        this.stats = { cogX: 0, dynamicCogX: 0, targetL: 0, targetR: 0 };
        this.context = {};
    }
    
    _activateNode(nodeCfg, context) {
        if (!nodeCfg) return 0;
        const [bias, gain, inputs, activation] = nodeCfg;
        
        let sum = bias;
        for (const [key, weight] of inputs) {
            sum += (context[key] || 0) * weight;
        }
        
        if (activation === 'sigmoid') {
            return 1.0 / (1.0 + Math.exp(-sum * gain));
        } else if (activation === 'linear') {
            return sum * gain;
        }
        return sum;
    }
    
    // =========================================================================
    // IMPLEMENTASI PIPELINE 4 LAYER
    // =========================================================================

    // Layer 1: Perceptory/Sensory Graph (Data Mentah)
    perceptoryLayer() {
        this.tempo.step();
        const r = this.cfg.robot;
        const w = this.cfg.world;
        
        this.prevShipAngle = this.shipAngle;
        const w1 = this.tempo.sampleOscillator(w.waves[0].name) - w.waves[0].amp / 2;
        const w2 = this.tempo.sampleOscillator(w.waves[1].name) - w.waves[1].amp / 2;
        const w3 = this.tempo.sampleOscillator(w.waves[2].name) - w.waves[2].amp / 2;
        
        const badaiOsc = this.tempo._oscillators['wave_badai'];
        if (this.badaiActive) {
            badaiOsc.amplitude = badaiOsc.amplitude * 0.90 + 0.9 * 0.10;
        } else {
            badaiOsc.amplitude = badaiOsc.amplitude * 0.95;
        }
        const w4 = this.tempo.sampleOscillator('wave_badai') - badaiOsc.amplitude / 2;
        
        this.shipAngle = (w1 + w2 + w3 + w4); 
        this.shipVel = this.shipAngle - this.prevShipAngle;
    }
    
    // Layer 2: Semantic State Graph (Data Terolah/Valence)
    semanticLayer() {
        if (this.fallen) return;
        
        const r = this.cfg.robot;
        const d = r.stance_width;
        
        // Pelvis Geometry
        const pelvisX = (Math.pow(this.legL, 2) - Math.pow(this.legR, 2) + Math.pow(d, 2)) / (2 * d) - (d / 2);
        const dxL = pelvisX - (-d / 2);
        const ySq = Math.pow(this.legL, 2) - Math.pow(dxL, 2);
        const pelvisY = ySq > 0 ? -Math.sqrt(ySq) : 0;
        
        // Global CoG
        const cosS = Math.cos(this.shipAngle);
        const sinS = Math.sin(this.shipAngle);
        
        const globalPelvisX = pelvisX * cosS - pelvisY * sinS;
        const globalPelvisY = pelvisX * sinS + pelvisY * cosS;
        
        const cog_offset_x = globalPelvisX / (d / 2); 
        this.smoothCog = this.smoothCog * 0.7 + cog_offset_x * 0.3;
        
        this.context = {
            cog_offset_x: this.smoothCog,
            ship_tilt_vel: this.shipVel * 50,
            globalPelvisX,
            pelvisX,
            pelvisY
        };
    }
    
    // Layer 3: Decision State Graph (Hasil Keputusan)
    decisionLayer() {
        if (this.fallen) return;
        
        const sigL = this._activateNode(this.cfg.logic.kaki_kiri, this.context);
        const sigR = this._activateNode(this.cfg.logic.kaki_kanan, this.context);
        
        const r = this.cfg.robot;
        this.targetL = r.min_leg_length + sigL * (r.max_leg_length - r.min_leg_length);
        this.targetR = r.min_leg_length + sigR * (r.max_leg_length - r.min_leg_length);
    }
    
    // Layer 4: Kinetic State Graph (Embodiment)
    kineticLayer() {
        if (this.fallen) {
            this.fallOmega += (this.fallPivot === 'right' ? 0.02 : -0.02);
            this.fallRotation += this.fallOmega;
            if (this.fallPivot === 'right' && this.fallRotation > Math.PI/2.2) {
                this.fallRotation = Math.PI/2.2;
                this.fallOmega = 0;
            }
            if (this.fallPivot === 'left' && this.fallRotation < -Math.PI/2.2) {
                this.fallRotation = -Math.PI/2.2;
                this.fallOmega = 0;
            }
            return;
        }
        
        const r = this.cfg.robot;
        
        if (this.kineticEnabled) {
            // Spring-Damper & Inertia (Kinetic Layer Active)
            const k = r.muscle_k;
            const damp = r.muscle_damp;
            
            this.velL += (this.targetL - this.legL) * k;
            this.velR += (this.targetR - this.legR) * k;
            
            this.velL *= damp;
            this.velR *= damp;
            
            this.velL = Math.max(-r.motor_speed, Math.min(r.motor_speed, this.velL));
            this.velR = Math.max(-r.motor_speed, Math.min(r.motor_speed, this.velR));
            
            this.legL += this.velL;
            this.legR += this.velR;
        } else {
            // TANPA KINETIC LAYER: Keputusan langsung diterapkan (Instan)
            // Ini akan menyebabkan gerakan patah-patah dan ketidakstabilan tinggi
            this.legL = this.targetL;
            this.legR = this.targetR;
            this.velL = 0;
            this.velR = 0;
        }
        
        // Physical safety clamping
        this.legL = Math.max(r.min_leg_length, Math.min(r.max_leg_length, this.legL));
        this.legR = Math.max(r.min_leg_length, Math.min(r.max_leg_length, this.legR));
        
        // Fall Detection
        const d = r.stance_width;
        const inertiaRepulsor = this.shipVel * 10; 
        const dynamic_cog_offset = this.smoothCog + inertiaRepulsor;
        
        if (dynamic_cog_offset > r.balance_threshold) {
            this.fallen = true;
            this.fallPivot = 'right';
        } else if (dynamic_cog_offset < -r.balance_threshold) {
            this.fallen = true;
            this.fallPivot = 'left';
        }
        
        // Save stats for UI
        this.stats.cogX = this.context.globalPelvisX;
        this.stats.dynamicCogX = dynamic_cog_offset * (d/2);
        this.stats.targetL = this.targetL;
        this.stats.targetR = this.targetR;
        this.stats.pelvisLocal = [this.context.pelvisX, this.context.pelvisY];
    }
}

// -- RENDERER & UI --
class Renderer {
    constructor(canvas, cfg) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cfg = cfg;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const wrap = document.getElementById('canvas-wrap');
        this.canvas.width = wrap.clientWidth;
        this.canvas.height = wrap.clientHeight;
    }

    drawLeg(pelvis, foot, L1, L2, dir) {
        const ctx = this.ctx;
        const dx = pelvis[0] - foot[0];
        const dy = pelvis[1] - foot[1];
        const d = Math.sqrt(dx*dx + dy*dy);
        
        const angle1 = Math.atan2(dy, dx);
        const d_clamped = Math.min(d, L1 + L2 - 0.01); 
        
        const cosA = (L1*L1 + d_clamped*d_clamped - L2*L2) / (2 * L1 * d_clamped);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
        
        const kneeAngle = angle1 + dir * alpha;
        const knee = [
            foot[0] + L1 * Math.cos(kneeAngle),
            foot[1] + L1 * Math.sin(kneeAngle)
        ];
        
        ctx.beginPath();
        ctx.moveTo(foot[0], foot[1]);
        ctx.lineTo(knee[0], knee[1]);
        ctx.lineTo(pelvis[0], pelvis[1]);
        ctx.stroke();
        
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath(); ctx.arc(foot[0], foot[1], 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(knee[0], knee[1], 5, 0, Math.PI*2); ctx.fill();
    }

    draw(kernel) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2 + 100;
        const r = this.cfg.robot;
        
        ctx.clearRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(14, 165, 233, 0.1)';
        ctx.fillRect(0, cy, W, H - cy);
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(kernel.shipAngle);

        ctx.fillStyle = '#334155';
        ctx.fillRect(-250, 0, 500, 20);
        ctx.fillStyle = '#475569';
        ctx.fillRect(-230, 20, 460, 40);

        ctx.save();
        
        const color = kernel.fallen ? '#ef4444' : '#38bdf8';
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const stanceW = r.stance_width;
        const footL = [-stanceW/2, 0];
        const footR = [stanceW/2, 0];
        
        let pelvis = kernel.stats.pelvisLocal || [0, -r.max_leg_length];
        
        if (kernel.fallen) {
            const pivotX = kernel.fallPivot === 'right' ? stanceW/2 : -stanceW/2;
            ctx.translate(pivotX, 0);
            ctx.rotate(kernel.fallRotation);
            ctx.translate(-pivotX, 0);
        }
        
        const L1 = r.max_leg_length * 0.55;
        const L2 = r.max_leg_length * 0.55;
        this.drawLeg(pelvis, footL, L1, L2, -1);
        this.drawLeg(pelvis, footR, L1, L2, 1);

        const torsoAngle = Math.atan2(pelvis[0], -pelvis[1]);
        const shoulder = [
            pelvis[0] + 50 * Math.sin(torsoAngle),
            pelvis[1] - 50 * Math.cos(torsoAngle)
        ];
        ctx.beginPath();
        ctx.moveTo(pelvis[0], pelvis[1]);
        ctx.lineTo(shoulder[0], shoulder[1]);
        ctx.stroke();
        
        ctx.fillStyle = '#0f172a';
        const headRadius = 18;
        ctx.beginPath(); ctx.arc(shoulder[0], shoulder[1] - 7, headRadius, 0, Math.PI*2); ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(shoulder[0], shoulder[1] - 10, 4, 0, Math.PI*2); ctx.fill();
        if (kernel.fallen) {
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(shoulder[0]-4, shoulder[1]-14); ctx.lineTo(shoulder[0]+4, shoulder[1]-6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(shoulder[0]+4, shoulder[1]-14); ctx.lineTo(shoulder[0]-4, shoulder[1]-6); ctx.stroke();
        }

        ctx.restore(); 
        ctx.restore(); 
        
        if (!kernel.fallen) {
            ctx.save();
            ctx.translate(cx, cy);
            
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -200); ctx.stroke();
            
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.beginPath(); ctx.moveTo(kernel.stats.cogX, 0); ctx.lineTo(kernel.stats.cogX, -200); ctx.stroke();
            
            ctx.fillStyle = '#22c55e';
            ctx.beginPath(); ctx.arc(-r.stance_width/2, 0, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(r.stance_width/2, 0, 4, 0, Math.PI*2); ctx.fill();

            ctx.restore();
        }
    }
}

function updateUI(kernel, cfg) {
    const formatDeg = (rad) => (rad * 180 / Math.PI).toFixed(1) + '°';
    
    document.getElementById('ship-tilt').textContent = formatDeg(kernel.shipAngle);
    const globalAngle = kernel.fallen ? kernel.fallRotation : Math.atan2(kernel.stats.cogX, -kernel.stats.pelvisLocal[1]);
    document.getElementById('robot-tilt').textContent = formatDeg(globalAngle);
    
    const statEl = document.getElementById('status-val');
    if (kernel.fallen) {
        statEl.textContent = 'FALLEN (PHYSICS LIMIT)';
        statEl.className = 'value danger';
    } else {
        statEl.textContent = 'STABLE';
        statEl.className = 'value success';
    }

    const setBar = (id, val, max) => {
        document.getElementById(id + '-val').textContent = val.toFixed(1);
        const pct = Math.min(100, Math.max(0, Math.abs(val) / max * 100));
        document.getElementById(id + '-bar').style.width = pct + '%';
    };

    document.getElementById('grav-val').parentElement.querySelector('.indicator-label').textContent = 'Dynamic CoG (Repulsor)';
    setBar('grav', kernel.stats.dynamicCogX, cfg.robot.stance_width);
    
    document.getElementById('attr-val').parentElement.querySelector('.indicator-label').textContent = 'Left Muscle (Target Length)';
    setBar('attr', kernel.legL, cfg.robot.max_leg_length);
    
    document.getElementById('repel-val').parentElement.querySelector('.indicator-label').textContent = 'Right Muscle (Target Length)';
    setBar('repel', kernel.legR, cfg.robot.max_leg_length);
    
    document.getElementById('motor-val').parentElement.querySelector('.indicator-label').textContent = 'Inertia / Muscle Speed';
    setBar('motor', Math.abs(kernel.stats.targetL - kernel.legL), cfg.robot.motor_speed * 10);
}

window.onload = () => {
    const cfg = window.jsyaml.load(MAP_YAML_STR);
    const kernel = new BipedalSailorKernel(cfg);
    const renderer = new Renderer(document.getElementById('sim-canvas'), cfg);
    
    document.getElementById('reset-btn').onclick = () => kernel.reset();
    document.getElementById('shove-btn').onclick = () => {
        kernel.badaiActive = true;
        setTimeout(() => { kernel.badaiActive = false; }, 2500);
    };

    // Handler untuk toggle Kinetic Layer
    document.getElementById('kinetic-toggle').onchange = (e) => {
        kernel.kineticEnabled = e.target.checked;
    };

    function loop() {
        // Memanggil step() yang sekarang menjalankan pipeline 4 layer
        kernel.step();
        renderer.draw(kernel);
        updateUI(kernel, cfg);
        requestAnimationFrame(loop);
    }
    loop();
};
