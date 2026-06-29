// Robust process shim for browser environments
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {} };
  // Minimal hrtime implementation using performance.now()
  globalThis.process.hrtime = function (prev) {
    const ms = performance.now();
    const totalNs = Math.floor(ms * 1e6);
    const sec = Math.floor(totalNs / 1e9);
    const ns = totalNs % 1e9;
    if (prev && Array.isArray(prev)) {
      return [sec - prev[0], ns - prev[1]];
    }
    return [sec, ns];
  };
  globalThis.process.hrtime.bigint = function () {
    const ms = performance.now();
    return BigInt(Math.floor(ms * 1e6));
  };
}

import { Vector, Semantic, AgentixKernel } from './corekernel.js';

/**
 * Swarm Corridor Cross – Relational Crowd Kernel (OS version)
 * No explicit if‑then in runtime loops.
 */
class SwarmKernel extends AgentixKernel {
    constructor(config) {
        super(config);
        this.dim = this.cfg.runtime_params.field_dim;
        this.reset();
    }

    // ---------------------------------------------------------------
    // 1️⃣ Reset – spawn agents
    // ---------------------------------------------------------------
    reset() {
        this.agents = [];

        console.log(this.cfg);

        const dim = this.dim;
        const baseA = this.cfg.agent_init?.A ?? this.cfg.agents_init?.A ?? 0;
        const baseB = this.cfg.agent_init?.B ?? this.cfg.agents_init?.B ?? 0;
        const visitor = this.cfg.global?.visitor ?? 0;
        this.visitor_val = document.getElementById('visitor-val');
        this.visitor_val.innerHTML = visitor;
        const K = this.cfg.global?.K ?? 1;
        const extra = Math.round(Math.tanh(visitor / K) * 50);
        const countA = Math.round(baseA + extra);
        const countB = Math.round(baseB + extra);

        console.log(countA);
        // Team A – left to right
        for (let i = 0; i < countA; i++) {
            this.agents.push({
                id: `A${i}`,
                team: 'A',
                team_val: 1.0,
                pos: [Math.random() * 20, Math.random() * dim[1]],
                vel: [0, 0],
                color: '#60a5fa',
                netForce: [0, 0],
                context: {}
            });
        }
        // Team B – right to left
        for (let i = 0; i < countB; i++) {
            this.agents.push({
                id: `B${i}`,
                team: 'B',
                team_val: -1.0,
                pos: [dim[0] - Math.random() * 20, Math.random() * dim[1]],
                vel: [0, 0],
                color: '#f87171',
                netForce: [0, 0],
                context: {}
            });
        }
        this.iteration = 0;
    }

    // ---------------------------------------------------------------
    // 2️⃣ Perceptory – read UI / config values (no if‑then)
    // ---------------------------------------------------------------
    perceptoryLayer() {
        const params = this.cfg.runtime_params;
        const logic = this.cfg.roles_logic.walker;
        const getVal = (id, fallback) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : fallback;
        };
        this.currentFriction = getVal('param-friction', params.friction);
        this.currentNeighborDist = getVal('param-neighbor-dist', params.neighbor_dist);
        this.currentAttractorWeight = getVal('param-attractor-weight', logic.attractor_weight);
        this.currentLaneBias = getVal('param-lane-bias', logic.lane_bias);
        this.currentSameTeamRep = getVal('param-same-team-rep', logic.repulsion.same_team);
        this.currentOppositeTeamRep = getVal('param-opposite-team-rep', logic.repulsion.opposite_team);
        this.currentWallRep = getVal('param-wall-rep', logic.repulsion.wall);
        this.currentAlignment = getVal('param-alignment', logic.alignment || 0.25);
        const visitor = this.cfg.global?.visitor ?? 0;
        const K = this.cfg.global?.K ?? 1;
        this.currentCrowdDensity = 0.9 - Math.tanh(visitor / K) * 0.3;

        console.log(this.currentCrowdDensity);
    }

    // ---------------------------------------------------------------
    // 3️⃣ Semantic – compute relational context
    // ---------------------------------------------------------------
    semanticLayer() {
        const nd = this.currentNeighborDist;
        this.agents.forEach(a => {
            let density = 0;
            let alignmentSum = [0, 0];
            let neighborAct = 0;
            const repList = [];
            this.agents.forEach(b => {
                const diff = Vector.sub(a.pos, b.pos);
                const dist = Vector.norm(diff) + 0.001;
                const sensor = Math.exp(-(dist ** 2) / (nd ** 2));
                density += sensor;
                const isMate = 0.5 * (a.team_val * b.team_val + 1);
                const isFoe = 1 - isMate;
                const weight = isMate * this.currentSameTeamRep + isFoe * this.currentOppositeTeamRep;
                repList.push({ dir: Vector.div(diff, dist), strength: sensor * weight });
                alignmentSum = Vector.add(alignmentSum, Vector.mul(b.vel, isMate * sensor));
                neighborAct += isMate * sensor;
            });
            a.context = { density, alignmentSum, neighborAct, repList };
        });
    }

    // ---------------------------------------------------------------
    // 4️⃣ Decision – combine forces (no explicit conditionals)
    // ---------------------------------------------------------------
    decisionLayer() {
        this.agents.forEach(a => {
            // Attractor along X based on team direction
            let force = Vector.mul([a.team_val, 0], this.currentAttractorWeight);
            // Lane bias toward upper/lower corridor
            const targetY = (this.dim[1] / 2) - (a.team_val * this.dim[1] * 0.25);
            force = Vector.add(force, [0, (targetY - a.pos[1]) * this.currentLaneBias]);
            // Repulsion aggregation
            a.context.repList?.forEach(r => {
                force = Vector.add(force, Vector.mul(r.dir, r.strength));
            });
            // Alignment steering
            const avgAlign = Vector.div(a.context.alignmentSum, a.context.neighborAct + 1e-6);
            force = Vector.add(force, Vector.mul(Vector.sub(avgAlign, a.vel), this.currentAlignment));
            // Wall pressure (vertical only)
            const wallY = (1 / (a.pos[1] + 0.1) ** 2) - (1 / (this.dim[1] - a.pos[1] + 0.1) ** 2);
            force = Vector.add(force, [0, wallY * (this.currentWallRep * 0.1)]);
            // Crowd density slowdown
            const speedMul = 1 / (1 + a.context.density * this.currentCrowdDensity);
            a.netForce = Vector.mul(force, speedMul);
        });
    }

    // ---------------------------------------------------------------
    // 5️⃣ Kinetic – integrate motion and clip boundaries (no if‑then)
    // ---------------------------------------------------------------
    kineticLayer() {
        this.agents.forEach(a => {
            // Apply friction and net force
            a.vel = Vector.mul(Vector.add(a.vel, a.netForce), this.currentFriction);
            // Integrate position
            a.pos = Vector.add(a.pos, a.vel);
            // Horizontal wrap
            a.pos[0] = (a.pos[0] + this.dim[0]) % this.dim[0];
            // Vertical clip (avoid top/bottom walls)
            a.pos[1] = Math.max(0.2, Math.min(this.dim[1] - 0.2, a.pos[1]));
        });
    }
}

/** Renderer – draws agents onto the canvas */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    }
    draw(kernel) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const dim = kernel.dim;
        const sx = W / dim[0];
        const sy = H / dim[1];
        // Fade trail
        ctx.fillStyle = 'rgba(10,12,16,0.25)';
        ctx.fillRect(0,0,W,H);
        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let x=0;x<W;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,H);} 
        for(let y=0;y<H;y+=40){ctx.moveTo(0,y);ctx.lineTo(W,y);} 
        ctx.stroke();
        // Corridor walls
        ctx.strokeStyle = 'rgba(99,102,241,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4,8]);
        ctx.beginPath();
        ctx.moveTo(0,0.2*sy); ctx.lineTo(W,0.2*sy);
        ctx.moveTo(0,(dim[1]-0.2)*sy); ctx.lineTo(W,(dim[1]-0.2)*sy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Agents
        kernel.agents.forEach(a => {
            const px = a.pos[0]*sx;
            const py = a.pos[1]*sy;
            ctx.shadowBlur = 8;
            ctx.shadowColor = a.color;
            ctx.fillStyle = a.color;
            ctx.beginPath();
            ctx.arc(px,py,4,0,Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // heading vector
            const dir = Vector.normalize(a.vel);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px,py);
            ctx.lineTo(px+dir[0]*7, py+dir[1]*7);
            ctx.stroke();
        });
    }
}

/** UI helpers */
function updateUI(kernel, fps=60, jitter=0) {
    const iter = document.getElementById('iter-val');
    const flow = document.getElementById('flow-efficiency-val');
    const coll = document.getElementById('collision-val');
    const fpsEl = document.getElementById('fps-val');
    const jit = document.getElementById('jitter-val');
    if(iter) iter.textContent = kernel.iteration;
    // Simple efficiency metric (average X velocity)
    let sumX = 0;
    kernel.agents.forEach(a=>{ sumX += a.vel[0]*a.team_val; });
    const eff = Math.min(100, Math.max(0, (sumX / kernel.agents.length) / 0.95 * 100)).toFixed(1)+'%';
    if(flow) flow.textContent = eff;
    // Collision count (proximal opposing agents)
    let collisions = 0;
    const agents = kernel.agents;
    for(let i=0;i<agents.length;i++){
        for(let j=i+1;j<agents.length;j++){
            if(agents[i].team_val !== agents[j].team_val && Vector.dist(agents[i].pos, agents[j].pos)<3) collisions++;
        }
    }
    if(coll) coll.textContent = collisions;
    if(fpsEl) fpsEl.textContent = Math.round(fps);
    if(jit) jit.textContent = jitter.toFixed(1)+' ms';
}

import Telemetry from './telemetry.js';
window.onload = async () => {
    // Load configuration from map.yaml
    const resp = await fetch('/map/swarm_corridor_cross_mini_home');
    const yamlText = await resp.text();

    // Simple YAML parser for this project's structure
    const parseYAML = (text) => {
        const lines = text.split('\n');
        const result = {};
        let cur = result;
        const stack = [];
        for (let line of lines) {
            if (!line.trim() || line.trim().startsWith('#')) continue;
            const indent = line.search(/\S/);
            const level = Math.floor(indent / 2); // assuming 2‑space indent
            while (stack.length > level) {
                stack.pop();
                cur = stack[stack.length - 1] || result;
            }
            const [keyPart, ...rest] = line.trim().split(':');
            const key = keyPart.trim();
            const valuePart = rest.join(':').trim();
            if (valuePart === '') {
                // start nested object
                cur[key] = {};
                cur = cur[key];
                stack.push(cur);
            } else {
                let parsed = valuePart;
                if (/^\[.*\]$/.test(valuePart)) {
                    // array literal
                    try { parsed = JSON.parse(valuePart.replace(/'/g, '"')); } catch(e) { parsed = []; }
                } else if (!isNaN(Number(valuePart))) {
                    parsed = Number(valuePart);
                }
                cur[key] = parsed;
            }
        }
        return result;
    };

    const initConfig = parseYAML(yamlText);

    const kernel = new SwarmKernel(initConfig);
    const renderer = new Renderer(document.getElementById('sim-canvas'));
    let running = false;
    let animId = null;
    let lastTime = performance.now();
    const telemetry = new Telemetry();
    let avgFps = 60;
    let avgJitter = 0;
    const startBtn = document.getElementById('start-btn');
    const stepBtn = document.getElementById('step-btn');
    const resetBtn = document.getElementById('reset-btn');
    if(startBtn){
        startBtn.addEventListener('click',()=>{
            running = !running;
            if(running){
                startBtn.textContent='Pause Simulation';
                startBtn.classList.add('active');
                const loop = () => {
                    const now = performance.now();
                    const delta = now - lastTime;
                    telemetry.record(delta);
                    // lastTime will be updated after telemetry record
                    // (already done in telemetry.record if needed)
                    // No second delta declaration
                    lastTime = now;
                    const curFps = 1000/Math.max(0.1, delta);
                    avgFps = avgFps*0.95 + curFps*0.05;
                    const jitter = Math.abs(delta - (1000/avgFps));
                    avgJitter = avgJitter*0.95 + jitter*0.05;
                    kernel.step();
                    renderer.draw(kernel);
                    updateUI(kernel, avgFps, avgJitter);
                    animId = requestAnimationFrame(loop);
                };
                loop();
            } else {
                startBtn.textContent='Start Simulation';
                startBtn.classList.remove('active');
                if(animId) cancelAnimationFrame(animId);
            }
        });
    }
    if(stepBtn){
        stepBtn.addEventListener('click',()=>{
            if(!running){
                kernel.step();
                renderer.draw(kernel);
                updateUI(kernel, avgFps, avgJitter);
            }
        });
    }
    if(resetBtn){
        resetBtn.addEventListener('click',()=>{
            kernel.reset();
            renderer.draw(kernel);
            updateUI(kernel, avgFps, avgJitter);
        });
    }
    // Initial render
    renderer.draw(kernel);
    updateUI(kernel, avgFps, avgJitter);
};
