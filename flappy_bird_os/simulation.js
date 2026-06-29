/**
 * Flappy Bird - Agentix OS Kernel (EvolutionCalibration)
 * Branchless No If-Then Implementation
 */

import { Vector, Semantic } from '../OS_kernel/js/corekernel.js';
import { EvolutionCalibration } from '../OS_kernel/js/05_evolution_calibration.js';

// -- EMBEDDED CONFIG ---------------------------------------------------------
const MAP_YAML_STR = `
world:
  width: 480
  height: 640
  gravity: 0.38
  pipe_speed: 2.0
  pipe_interval: 130
  pipe_gap: 165
  pipe_width: 52
  pipe_margin: 60

bird:
  x: 80
  radius: 14
  flap_strength: -7.0
  max_vel_down: 10
  max_vel_up: -12
  flap_blend: 0.6
  flap_threshold: 0.5

sentinel_pipe:
  x_offset: 1.2
  topH_ratio: 0.5
  passed: 0

rl:
  population: 30
  elite_keep: 6
  mutation_rate: 0.25
  mutation_sigma: 0.5
  crossover_threshold: 0.5

display:
  trail_length: 18
  best_color: "#fbbf24"
  alive_color: "#6366f1"
  dead_color: "rgba(99,102,241,0.15)"
`;

// -- PIPE SYSTEM -------------------------------------------------------------
class PipeSystem {
    constructor(cfg) {
        this.cfg = cfg;
        this.pipes = [];
        this.frameCount = 0;
    }

    reset() { this.pipes = []; this.frameCount = 0; }

    makeSentinel() {
        const s = this.cfg.sentinel_pipe;
        return {
            x:    this.cfg.world.width * s.x_offset,
            topH: this.cfg.world.height * s.topH_ratio - this.cfg.world.pipe_gap * 0.5,
            passed: s.passed
        };
    }

    step() {
        this.frameCount++;
        const spawnMask = 1 - Math.min(1, this.frameCount % this.cfg.world.pipe_interval);
        const gap = this.cfg.world.pipe_gap;
        const margin = this.cfg.world.pipe_margin;
        
        if (this.lastTopH === undefined) this.lastTopH = this.cfg.world.height / 2;
        const maxStep = 140; 
        let targetH = this.lastTopH + (Math.random() - 0.5) * maxStep;
        targetH = Math.max(margin, Math.min(this.cfg.world.height - gap - margin, targetH));
        this.lastTopH = targetH;

        const newPipe = { x: this.cfg.world.width + 10, topH: targetH, passed: 0, spawnID: this.frameCount };
        
        // No if-then spawn
        Array.from({length: spawnMask}).forEach(() => this.pipes.push({...newPipe}));
        
        this.pipes.forEach(p => { p.x -= this.cfg.world.pipe_speed; });
        this.pipes = this.pipes.filter(p => p.x + this.cfg.world.pipe_width > -10);
    }

    nextPipe(birdX) {
        const ahead = this.pipes.filter(p => p.x + this.cfg.world.pipe_width > birdX);
        return [...ahead, this.makeSentinel()][0];
    }
}

// -- KERNEL ---------------------------------------------------------------
class FlappyAgentix extends EvolutionCalibration {
    constructor(cfg) {
        super(cfg);
        const r = cfg.rl;
        this.bestFitness = 0;
        this.generationBestFit = 0;
        this.genBestScore = 0;
        this.allTimeBestScore = 0;
        
        this.agents = Array.from({length: r.population}, (_, i) => ({
            id: `agent_${i}`,
            y: cfg.world.height / 2,
            vy: 0,
            alive: true,
            score: 0,
            trail: [],
            context: {}
        }));

        // Initial base weights [bias, w_pipe_prox, w_gap_alt, w_grav, w_vel, w_obs]
        this.agents.forEach(a => {
            this.registerGenome(a.id, [-1.5, 0.0, 0.5, 0.2, 0.5, 0.0]);
        });

        this.pipes = new PipeSystem(cfg);
    }

    step() {
        this.pipes.step();
        const {world: W, bird: B} = this.cfg;
        const pipe = this.pipes.nextPipe(B.x);
        const gapCenterY = pipe.topH + W.pipe_gap / 2;

        this.agents.forEach(a => {
            const aliveMask = +(a.alive);
            
            // 1. PERCEPTORY STATE
            const birdY = a.y;
            const pipeDistX = pipe.x - B.x;
            const gapYDiff = birdY - gapCenterY;

            // 2. SEMANTIC STATE
            a.context = {
                pipe_proximity: Math.max(0, 1 - (pipeDistX / W.width)),
                gap_altitude: gapYDiff / (W.pipe_gap / 2),
                bird_velocity: a.vy / B.max_vel_down,
                gravity: W.gravity,
                pipe_obstacle: +(pipeDistX < 50 && pipeDistX > -W.pipe_width)
            };

            // 3. TENSION ENGINE (Via Evolution Weights)
            const weights = this.getWeights(a.id);
            const bias = weights[0] || 0;
            const sum = bias 
                + a.context.pipe_proximity * (weights[1] || 0)
                + a.context.gap_altitude * (weights[2] || 0)
                + a.context.gravity * (weights[3] || 0)
                + a.context.bird_velocity * (weights[4] || 0)
                + a.context.pipe_obstacle * (weights[5] || 0);

            // 4. DECISION MASK
            const flapSignal = 1 / (1 + Math.exp(-sum)); // Sigmoid
            const doFlap = +(flapSignal > 0.5);

            // 5. PHYSICS (Branchless)
            a.vy += W.gravity * aliveMask;
            a.vy += doFlap * (B.flap_strength - a.vy) * B.flap_blend * aliveMask;
            a.vy = Math.max(B.max_vel_up, Math.min(B.max_vel_down, a.vy));
            a.y = Math.max(0, Math.min(W.height, a.y + a.vy * aliveMask));
            
            // Update Fitness
            this.setFitness(a.id, this.getFitness(a.id) + aliveMask);

            a.trail.push({x: B.x, y: a.y});
            a.trail = a.trail.slice(-this.cfg.display.trail_length);

            // 6. COLLISION MASK
            const r = B.radius;
            const dead_wall = +(a.y <= r) + +(a.y >= W.height - r);
            const dead_pipe = this.pipes.pipes.reduce((acc, p) => {
                const inX = +(B.x + r > p.x) * +(B.x - r < p.x + W.pipe_width);
                const inY = +(a.y - r < p.topH) + +(a.y + r > p.topH + W.pipe_gap);
                return acc + inX * Math.min(1, inY);
            }, 0);
            
            a.alive = a.alive && (dead_wall + dead_pipe) === 0;

            // 7. SCORING MASK
            if (!a.passedPipes) a.passedPipes = new Set();
            this.pipes.pipes.forEach((p, idx) => {
                const pipeID = p.spawnID || idx;
                const justPassed = +(p.x + W.pipe_width / 2 < B.x);
                const notCounted = +(!a.passedPipes.has(pipeID));
                const scoredNow = justPassed * notCounted * aliveMask;
                
                a.score += scoredNow;
                this.setFitness(a.id, this.getFitness(a.id) + 500 * scoredNow);
                
                // Add to set using array dispatch hack to avoid if (scoredNow)
                [() => {}, () => a.passedPipes.add(pipeID)][scoredNow]();
            });

            this.allTimeBestScore = Math.max(this.allTimeBestScore, a.score);
        });

        // 8. GENERATION EVOLUTION TRIGGER
        const anyAlive = this.agents.some(a => a.alive);
        [() => this.evolve(), () => {}][+anyAlive]();
    }

    evolve() {
        const r = this.cfg.rl;
        
        // Track stats before evolution
        const fits = this.agents.map(a => this.getFitness(a.id));
        this.generationBestFit = Math.max(...fits);
        this.bestFitness = Math.max(this.bestFitness, this.generationBestFit);
        this.genBestScore = Math.max(...this.agents.map(a => a.score));

        // Use Agentix Evolution module
        this.evolveGeneration(r.mutation_rate, r.mutation_sigma, r.elite_keep);

        // Reset agents physics
        this.agents.forEach(a => {
            a.y = this.cfg.world.height / 2;
            a.vy = 0;
            a.alive = true;
            a.score = 0;
            a.trail = [];
            a.passedPipes = new Set();
            this.setFitness(a.id, 0);
        });
        
        this.pipes.reset();
    }
}

// -- RENDERER ----------------------------------------------------
class Renderer {
    constructor(canvas, cfg) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cfg = cfg;
        this.canvas.width = cfg.world.width;
        this.canvas.height = cfg.world.height;
    }

    drawBird(a, birdCfg, color) {
        const ctx = this.ctx;
        const {x, y, vy} = a;
        const r = birdCfg.radius;

        if (a.trail && a.trail.length > 2) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.2;
            a.trail.forEach(t => ctx.lineTo(t.x, t.y));
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        const grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.1, x, y, r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, '#000');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        const eyeX = x + r * 0.4;
        const eyeY = y - r * 0.2;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, r * 0.35, 0, Math.PI * 2);
        ctx.fill();

        const pY = eyeY + Math.max(-2, Math.min(2, a.vy * 0.5));
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeX + 1, pY, r * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + r * 0.6, y - r * 0.2);
        ctx.lineTo(x + r * 0.6, y + r * 0.2);
        ctx.fill();
    }

    draw(kernel) {
        const ctx = this.ctx; const {world: W, display: D, bird: B} = this.cfg;
        ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, W.width, W.height);

        const nextPipe = kernel.pipes.nextPipe(B.x);
        if (nextPipe) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(B.x, kernel.agents[0].y);
            ctx.lineTo(nextPipe.x, nextPipe.topH + W.pipe_gap / 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        kernel.pipes.pipes.forEach(p => {
            const pw = W.pipe_width, gap = W.pipe_gap;
            const grad = ctx.createLinearGradient(p.x, 0, p.x + pw, 0);
            grad.addColorStop(0, '#166534');
            grad.addColorStop(0.5, '#22c55e');
            grad.addColorStop(1, '#166534');
            
            ctx.fillStyle = grad;
            ctx.fillRect(p.x, 0, pw, p.topH);
            ctx.fillRect(p.x, p.topH + gap, pw, W.height - p.topH - gap);
            
            ctx.fillStyle = '#14532d';
            ctx.fillRect(p.x - 4, p.topH - 20, pw + 8, 20);
            ctx.fillRect(p.x - 4, p.topH + gap, pw + 8, 20);
        });

        // Best agent visually
        const fits = kernel.agents.map(a => kernel.getFitness(a.id));
        const maxFit = Math.max(...fits);
        
        kernel.agents.filter(a => a.alive).forEach(a => {
            const isBest = kernel.getFitness(a.id) >= maxFit;
            const color = isBest ? D.best_color : D.alive_color;
            this.drawBird({...a, x: B.x}, B, color);
        });
        
        this.drawWeightGraph(kernel, maxFit);
    }
    
    drawWeightGraph(kernel, maxFit) {
        const canvas = document.getElementById('graph-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width; const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        
        let bestBird = kernel.agents.find(a => a.alive && kernel.getFitness(a.id) >= maxFit);
        if (!bestBird) bestBird = kernel.agents.find(a => a.alive) || kernel.agents[0];
        
        if (!bestBird || !bestBird.context) return;
        
        const weights = kernel.getWeights(bestBird.id);
        const bias = weights[0] || 0;
        
        ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 13px sans-serif';
        ctx.fillText('Agentix Tensor Weights', 10, 20);
        
        ctx.font = '11px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Bias: ${bias.toFixed(2)}`, 10, 40);
        
        let yPos = 60;
        let totalTension = bias;
        
        const labels = ['pipe_prox', 'gap_alt', 'gravity', 'velocity', 'obstacle'];
        
        labels.forEach((name, i) => {
            const weight = weights[i+1] || 0;
            // Map context names directly
            const contextKeys = ['pipe_proximity', 'gap_altitude', 'gravity', 'bird_velocity', 'pipe_obstacle'];
            const val = bestBird.context[contextKeys[i]] || 0;
            const force = val * weight;
            totalTension += force;
            
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText(name.substring(0, 10), 10, yPos);
            
            ctx.fillStyle = '#334155';
            ctx.fillRect(90, yPos - 8, 30, 8);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(90, yPos - 8, Math.abs(val) * 30, 8);
            
            ctx.fillStyle = force > 0 ? '#22c55e' : '#ef4444';
            const barLen = force * 15;
            ctx.fillRect(130 + Math.min(0, barLen), yPos - 8, Math.abs(barLen), 8);
            
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${force>0?'+':''}${force.toFixed(2)}`, 130 + Math.max(0, barLen) + 5, yPos);
            
            yPos += 18;
        });
        
        const flapSigmoid = 1 / (1 + Math.exp(-totalTension));
        const decision = flapSigmoid > 0.5 ? "FLAP" : "FALL";
        
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Tension: ${totalTension.toFixed(2)} -> ${decision}`, 10, yPos + 5);
    }
}

function updateUI(kernel) {
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    const stats = kernel.stats();

    set('gen-val', stats.generation);
    set('frame-val', kernel.pipes.frameCount);
    set('alive-val', kernel.agents.filter(a => a.alive).length + ' / ' + kernel.cfg.rl.population);
    
    set('gen-fit', kernel.generationBestFit.toFixed(0));
    set('best-fit', kernel.bestFitness.toFixed(0));
    
    const currentMaxScore = kernel.agents.reduce((m, a) => Math.max(m, a.score), 0);
    set('score-val', currentMaxScore);
    set('cur-pipes-val', currentMaxScore);
    set('gen-pipes-val', kernel.genBestScore);
    set('max-pipes-val', kernel.allTimeBestScore);
}

// Ensure JS-YAML is loaded and map config
window.onload = () => {
    // Inject javascipt dynamically if needed
    const cfg = window.jsyaml.load(MAP_YAML_STR);
    const kernel = new FlappyAgentix(cfg);
    const renderer = new Renderer(document.getElementById('sim-canvas'), cfg);
    let running = false; let raf;

    function loop() {
        kernel.step(); renderer.draw(kernel); updateUI(kernel);
        raf = requestAnimationFrame(loop);
    }

    document.getElementById('start-btn').addEventListener('click', e => {
        running = !running; e.target.textContent = running ? 'Pause' : 'Resume';
        [() => cancelAnimationFrame(raf), () => loop()][+running]();
    });

    document.getElementById('reset-btn').addEventListener('click', () => location.reload());
    renderer.draw(kernel);
};
