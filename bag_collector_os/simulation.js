import { Vector, Semantic, AgentixKernel } from '../OS_kernel/js/corekernel.js';

class BagCollectorKernel extends AgentixKernel {
    constructor(cfg) {
        super(cfg);
        
        this.bounds = [-400, -300, 400, 300];
        this.gridSize = 5;
        this.cellSize = 60;
        this.gridCenter = [-150, 0];
        
        this.heatMap = new Float32Array(this.gridSize * this.gridSize);
        this.heatMap.fill(0.1);
        
        this.robotCount = 3;
        this.stationCount = 1;
        
        this.initObjects();
        this.initRobots();
        
        this.wheelBase = 30;
        this.maxSteer = Math.PI / 4;
        
        // KONFIGURASI RELASI (YAML)
        this.graphYAML = `
agents:
  robot:
    attractors:
      - object: 'bag_position'
        weight: 1.5
        relation: 'empty'
      - object: 'unload_terminal'
        weight: 1.0
        relation: 'near_full'
      - object: 'unload_terminal'
        weight: 2.5
        relation: 'full'
      - object: 'charging_station'
        weight: 3.0
        relation: 'bat_near_critic'
      - object: 'charging_station'
        weight: 6.0
        relation: 'bat_critic'
    repulsors:
      - object: 'unload_terminal'
        weight: 0.2
        relation: 'empty'
      - object: 'bag_position'
        weight: 0.3
        relation: 'near_full'
      - object: 'charging_station'
        weight: 1.5
        relation: 'bat_safe'
      - object: 'other_robots'
        weight: 3.0
`;
        this.graph = {
            robot: {
                attractors: [
                    { object: 'bag_position', weight: 1.5, relation: 'empty' },
                    { object: 'unload_terminal', weight: 1.0, relation: 'near_full' },
                    { object: 'unload_terminal', weight: 2.5, relation: 'full' },
                    { object: 'charging_station', weight: 3.0, relation: 'bat_near_critic' },
                    { object: 'charging_station', weight: 6.0, relation: 'bat_critic' }
                ],
                repulsors: [
                    { object: 'unload_terminal', weight: 0.2, relation: 'empty' },
                    { object: 'bag_position', weight: 0.3, relation: 'near_full' },
                    { object: 'charging_station', weight: 1.5, relation: 'bat_safe' },
                    { object: 'other_robots', weight: 3.0 }
                ]
            }
        };
    }
    
    initObjects() {
        this.objects = {
            'unload_terminal': { pos: [300, 150] }
        };
        
        if (this.stationCount === 1) {
            this.objects['charging_station_1'] = { pos: [300, -150] };
            delete this.objects['charging_station_2'];
        } else {
            this.objects['charging_station_1'] = { pos: [300, -150] };
            this.objects['charging_station_2'] = { pos: [300, -30] };
        }
    }
    
    initRobots() {
        const colors = ['#38bdf8', '#fbbf24', '#ec4899', '#10b981', '#a855f7', '#f43f5e', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
        this.robots = [];
        
        for (let i = 0; i < this.robotCount; i++) {
            this.robots.push({
                id: i + 1,
                pos: [-300, -200 + i * 45], // Staggered Y
                angle: 0,
                battery: 100 - i * 5, // Slight battery stagger
                load: 0,
                maxLoad: 20,
                color: colors[i % colors.length],
                lane: i % 5, // Share lanes if > 5
                activeGoal: 'IDLE',
                loadTimer: 0,
                unloadTimer: 0,
                chargeTimer: 0,
                target: [0, 0],
                forces: { bag: 0, charge: 0, unload: 0 }
            });
        }
        
        this.createUITelemetry();
    }
    
    createUITelemetry() {
        const container = document.getElementById('telemetry-container');
        if (!container) return;
        container.innerHTML = '';
        
        this.robots.forEach(r => {
            const card = document.createElement('div');
            card.className = 'robot-card';
            card.innerHTML = `
                <div class="robot-header">
                    <span class="robot-name" style="color: ${r.color};">Robot 0${r.id}</span>
                    <span class="robot-status status-idle" id="r${r.id}-status">IDLE</span>
                </div>
                <div>
                    <div class="telemetry-row">
                        <span class="tel-label">Baterai</span>
                        <span class="tel-val" id="r${r.id}-bat-val">100%</span>
                    </div>
                    <div class="bar-wrap"><div class="bar-fill" id="r${r.id}-bat-bar" style="width: 100%; background: var(--success);"></div></div>
                </div>
                <div>
                    <div class="telemetry-row">
                        <span class="tel-label">Muatan</span>
                        <span class="tel-val" id="r${r.id}-load-val">0/20</span>
                    </div>
                    <div class="bar-wrap"><div class="bar-fill" id="r${r.id}-load-bar" style="width: 0%; background: var(--accent);"></div></div>
                </div>
            `;
            container.appendChild(card);
        });
    }
    
    getCellPos(col, row) {
        const ox = this.gridCenter[0] - (this.gridSize * this.cellSize) / 2 + this.cellSize / 2;
        const oy = this.gridCenter[1] - (this.gridSize * this.cellSize) / 2 + this.cellSize / 2;
        return [ox + col * this.cellSize, oy + row * this.cellSize];
    }
    
    perceptoryLayer() {
        for (let i = 0; i < this.heatMap.length; i++) {
            if (Math.random() < 0.01) this.heatMap[i] = Math.min(1.0, this.heatMap[i] + 0.2);
        }
        
        this.robots.forEach(r => {
            let maxScore = -1;
            let targetCell = [r.lane, 0];
            let maxHeat = 0;
            
            for (let row = 0; row < this.gridSize; row++) {
                const idx = row * this.gridSize + r.lane;
                const heat = this.heatMap[idx];
                
                const cellPos = this.getCellPos(r.lane, row);
                const dist = Vector.dist(r.pos, cellPos);
                const score = heat / (dist + 50);
                
                const isHigher = +(score > maxScore);
                maxScore = maxScore * (1 - isHigher) + score * isHigher;
                maxHeat = maxHeat * (1 - isHigher) + heat * isHigher;
                
                targetCell = [targetCell[0], targetCell[1] * (1 - isHigher) + row * isHigher];
            }
            r.bestCell = targetCell;
            r.bestCellPos = this.getCellPos(targetCell[0], targetCell[1]);
            r.bestCellHeat = maxHeat;
        });
    }
    
    semanticLayer() {
        const rules = this.graph.robot;
        
        // List stasiun yang aktif
        const stations = [];
        if (this.objects.charging_station_1) stations.push(this.objects.charging_station_1);
        if (this.objects.charging_station_2) stations.push(this.objects.charging_station_2);
        
        this.robots.forEach(r => {
            // Cari stasiun terdekat untuk robot ini
            let closestStation = stations[0];
            let minD = Vector.dist(r.pos, closestStation.pos);
            stations.forEach(s => {
                const d = Vector.dist(r.pos, s.pos);
                if (d < minD) { minD = d; closestStation = s; }
            });
            r.targetStation = closestStation; // Simpan untuk decision layer
            
            // Cek apakah stasiun terdekat ini sedang diisi oleh robot lain
            const isStationOccupied = this.robots.some(other => 
                other.id !== r.id && other.chargeTimer > 0 && Vector.dist(other.pos, closestStation.pos) < 50
            );
            
            // 1. State extraction (Dibuat adaptif terhadap r.maxLoad!)
            const isEmpty = +(r.load < r.maxLoad * 0.75);
            const isNearFull = +(r.load >= r.maxLoad * 0.75 && r.load < r.maxLoad);
            const isFull = +(r.load >= r.maxLoad);
            
            const isSafe = +(r.battery > 40);
            const isNearCritic = +(r.battery <= 40 && r.battery > 10);
            const isCritic = +(r.battery <= 10);
            
            const canCharge = +(r.load === 0);
            const shouldWaitAndWork = +(isStationOccupied && isNearCritic);
            const effectiveNearCritic = isNearCritic * (1 - shouldWaitAndWork) * canCharge;
            
            r.states = {
                empty: isEmpty,
                near_full: isNearFull,
                full: isFull,
                bat_safe: isSafe,
                bat_near_critic: effectiveNearCritic,
                bat_critic: isCritic * canCharge
            };
            
            // 2. Force calculation
            r.netForce = Vector.zero();
            r.forces = { bag: 0, charge: 0, unload: 0 };
            
            const targetMap = {
                'bag_position': r.bestCellPos,
                'charging_station': closestStation.pos, // Dinamis ke stasiun terdekat
                'unload_terminal': this.objects.unload_terminal.pos
            };
            
            // Attractors
            rules.attractors.forEach(attr => {
                const targetPos = targetMap[attr.object];
                const toObj = Vector.sub(targetPos, r.pos);
                const dist = Vector.norm(toObj) + 1e-12;
                const dir = Vector.div(toObj, dist);
                
                const relValence = attr.relation ? (r.states[attr.relation] || 0) : 1.0;
                const weight = attr.weight * relValence;
                
                r.netForce = Vector.add(r.netForce, Vector.mul(dir, weight));
                
                if (attr.object === 'bag_position') r.forces.bag += weight;
                if (attr.object === 'charging_station') r.forces.charge += weight;
                if (attr.object === 'unload_terminal') r.forces.unload += weight;
            });
            
            // Repulsors
            rules.repulsors.forEach(rep => {
                let f_repel = Vector.zero();
                
                if (rep.object === 'other_robots') {
                    this.robots.forEach(other => {
                        if (other.id !== r.id) {
                            const diff = Vector.sub(r.pos, other.pos);
                            const dist = Vector.norm(diff) + 1e-12;
                            
                            const isOtherCharging = +(other.chargeTimer > 0);
                            const radius = this.cellSize * (1 + isOtherCharging);
                            const mask = +(dist < radius);
                            const forceScale = 1.0 + isOtherCharging * 20.0;
                            
                            const force = (rep.weight * forceScale / (dist + 10)) * mask;
                            f_repel = Vector.add(f_repel, Vector.mul(Vector.div(diff, dist), force));
                        }
                    });
                } else if (rep.object === 'charging_station') {
                    // Tolakan dari SEMUA stasiun jika merasa aman
                    stations.forEach(s => {
                        const diff = Vector.sub(r.pos, s.pos);
                        const dist = Vector.norm(diff) + 1e-12;
                        const relValence = r.states['bat_safe'] || 0;
                        const force = (rep.weight / (dist + 10)) * relValence;
                        f_repel = Vector.add(f_repel, Vector.mul(Vector.div(diff, dist), force * 100));
                    });
                } else {
                    const targetPos = targetMap[rep.object];
                    const diff = Vector.sub(r.pos, targetPos);
                    const dist = Vector.norm(diff) + 1e-12;
                    const relValence = rep.relation ? (r.states[rep.relation] || 0) : 1.0;
                    const force = (rep.weight / (dist + 10)) * relValence;
                    f_repel = Vector.mul(Vector.div(diff, dist), force * 100);
                }
                
                r.netForce = Vector.add(r.netForce, f_repel);
            });
        });
    }
    
    decisionLayer() {
        this.robots.forEach(r => {
            const isBag = +(r.forces.bag > r.forces.charge && r.forces.bag > r.forces.unload);
            const isCharge = +(r.forces.charge > r.forces.bag && r.forces.charge > r.forces.unload);
            const isUnload = +(r.forces.unload > r.forces.bag && r.forces.unload > r.forces.charge);
            
            r.target = [
                r.bestCellPos[0] * isBag + r.targetStation.pos[0] * isCharge + this.objects.unload_terminal.pos[0] * isUnload,
                r.bestCellPos[1] * isBag + r.targetStation.pos[1] * isCharge + this.objects.unload_terminal.pos[1] * isUnload
            ];
            
            r.activeGoal = isBag ? 'COLLECT' : (isCharge ? 'CHARGE' : (isUnload ? 'UNLOAD' : 'IDLE'));
            
            const distToTarget = Vector.dist(r.pos, r.target);
            const isAtTarget = +(distToTarget < 30);
            
            // 1. Proses Load Bag
            const inCellX = +(Math.abs(r.pos[0] - r.bestCellPos[0]) < this.cellSize / 2);
            const inCellY = +(Math.abs(r.pos[1] - r.bestCellPos[1]) < this.cellSize / 2);
            const isInCell = inCellX * inCellY;
            
            const doTake = isInCell * isBag * +(r.bestCellHeat > 0.2) * +(r.load < r.maxLoad) * +(r.loadTimer === 0);
            r.loadTimer += 90 * doTake;
            r.load += doTake;
            
            const idx = r.bestCell[1] * this.gridSize + r.bestCell[0];
            this.heatMap[idx] = this.heatMap[idx] * (1 - doTake) + 0.1 * doTake;
            
            // 2. Proses Unload
            const doUnload = isAtTarget * isUnload * +(r.load > 0) * +(r.unloadTimer === 0);
            r.unloadTimer += 90 * doUnload;
            r.load = r.load * (1 - doUnload);
            
            // 3. Proses Charge
            let closestDist = 999;
            let closestId = null;
            let isStationBusy = 0;
            
            this.robots.forEach(other => {
                const d = Vector.dist(other.pos, r.targetStation.pos);
                const isClosest = +(d < closestDist);
                closestDist = closestDist * (1 - isClosest) + d * isClosest;
                closestId = closestId * (1 - isClosest) + other.id * isClosest;
                
                // Cek apakah ada robot lain yang SEDANG mengecas di stasiun ini
                const isAtThisStation = +(d < 40);
                const isCharging = +(other.chargeTimer > 0);
                isStationBusy = Math.max(isStationBusy, isAtThisStation * isCharging * +(other.id !== r.id));
            });
            
            // Robot hanya diizinkan cas jika dia yang paling dekat DAN stasiun tidak sedang sibuk diisi robot lain
            const isAuthorized = +(closestId === r.id) * (1 - isStationBusy);
            const doCharge = isAtTarget * isCharge * isAuthorized * +(r.chargeTimer === 0) * +(r.battery < 100);
            r.chargeTimer += 180 * doCharge;
        });
    }
    
    kineticLayer() {
        this.robots.forEach(r => {
            r.loadTimer = Math.max(0, r.loadTimer - 1);
            r.unloadTimer = Math.max(0, r.unloadTimer - 1);
            r.chargeTimer = Math.max(0, r.chargeTimer - 1);
            
            const isCharging = +(r.chargeTimer > 0);
            r.battery = Math.min(100, r.battery + (100 / 180) * isCharging);
            r.battery = Math.max(0, r.battery - 0.03 * (1 - isCharging));
            
            const forceMag = Vector.norm(r.netForce) + 1e-12;
            const isStopped = +(r.loadTimer > 0 || r.unloadTimer > 0 || r.chargeTimer > 0);
            const isMoving = +(forceMag > 0.1) * (1 - isStopped);
            
            const targetAngle = Math.atan2(r.netForce[1], r.netForce[0]);
            let angleDiff = targetAngle - r.angle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            const steer = Math.max(-this.maxSteer, Math.min(this.maxSteer, angleDiff));
            
            const speed = 2.5 * (1.0 - Math.abs(steer) / this.maxSteer * 0.5) * isMoving;
            
            r.pos[0] += speed * Math.cos(r.angle);
            r.pos[1] += speed * Math.sin(r.angle);
            r.angle += (speed / this.wheelBase) * Math.tan(steer);
            
            r.pos[0] = Math.max(-400, Math.min(400, r.pos[0]));
            r.pos[1] = Math.max(-300, Math.min(300, r.pos[1]));
            r.angle = Math.atan2(Math.sin(r.angle), Math.cos(r.angle));
        });
    }
}

// -- RENDERER --
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
        const cx = W / 2;
        const cy = H / 2;
        
        ctx.clearRect(0, 0, W, H);
        
        ctx.save();
        ctx.translate(cx, cy);
        
        // 1. Grid
        for (let row = 0; row < kernel.gridSize; row++) {
            for (let col = 0; col < kernel.gridSize; col++) {
                const pos = kernel.getCellPos(col, row);
                const idx = row * kernel.gridSize + col;
                const heat = kernel.heatMap[idx];
                
                ctx.fillStyle = `rgba(14, 165, 233, ${heat * 0.5})`;
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(pos[0] - kernel.cellSize/2, pos[1] - kernel.cellSize/2, kernel.cellSize, kernel.cellSize);
                ctx.strokeRect(pos[0] - kernel.cellSize/2, pos[1] - kernel.cellSize/2, kernel.cellSize, kernel.cellSize);
                
                if (heat > 0.5) {
                    ctx.fillStyle = '#0ea5e9';
                    ctx.fillRect(pos[0] - 10, pos[1] - 10, 20, 20);
                }
            }
        }
        
        // 2. Stasiun
        const stations = [];
        if (kernel.objects.charging_station_1) stations.push(kernel.objects.charging_station_1);
        if (kernel.objects.charging_station_2) stations.push(kernel.objects.charging_station_2);
        
        stations.forEach(s => {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.fillRect(s.pos[0] - 30, s.pos[1] - 30, 60, 60);
            ctx.strokeRect(s.pos[0] - 30, s.pos[1] - 30, 60, 60);
            ctx.fillStyle = '#22c55e';
            ctx.font = '10px Outfit';
            ctx.fillText('CHARGE', s.pos[0] - 20, s.pos[1] + 5);
        });
        
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.fillRect(kernel.objects.unload_terminal.pos[0] - 30, kernel.objects.unload_terminal.pos[1] - 40, 60, 80);
        ctx.strokeRect(kernel.objects.unload_terminal.pos[0] - 30, kernel.objects.unload_terminal.pos[1] - 40, 60, 80);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('UNLOAD', kernel.objects.unload_terminal.pos[0] - 20, kernel.objects.unload_terminal.pos[1] + 5);
        
        // 3. Robot
        kernel.robots.forEach(r => {
            ctx.beginPath();
            ctx.strokeStyle = r.color;
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1;
            ctx.moveTo(r.pos[0], r.pos[1]);
            ctx.lineTo(r.target[0], r.target[1]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.save();
            ctx.translate(r.pos[0], r.pos[1]);
            ctx.rotate(r.angle);
            
            ctx.fillStyle = r.color;
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-10, 10);
            ctx.lineTo(-10, -10);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.fillRect(-12, -12, 6, 4);
            ctx.fillRect(-12, 8, 6, 4);
            ctx.fillRect(12, -2, 6, 4);
            
            if (r.loadTimer > 0 || r.unloadTimer > 0 || r.chargeTimer > 0) {
                const total = r.loadTimer > 0 ? 90 : (r.unloadTimer > 0 ? 90 : 180);
                const current = r.loadTimer || r.unloadTimer || r.chargeTimer;
                ctx.beginPath();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.arc(0, 0, 15, 0, (current / total) * Math.PI * 2);
                ctx.stroke();
            }
            
            ctx.restore();
            
            for (let i = 0; i < r.load; i++) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(r.pos[0] - 15 + i*3, r.pos[1] - 20, 2, 4);
            }
        });
        
        ctx.restore();
    }
}

// -- UI UPDATE --
function updateUI(kernel) {
    kernel.robots.forEach(r => {
        const id = `r${r.id}`;
        const statusEl = document.getElementById(`${id}-status`);
        if (!statusEl) return; // Slider might have changed count
        
        statusEl.textContent = r.activeGoal;
        document.getElementById(`${id}-bat-val`).textContent = `${Math.floor(r.battery)}%`;
        document.getElementById(`${id}-bat-bar`).style.width = `${r.battery}%`;
        
        const batColor = r.battery > 40 ? 'var(--success)' : (r.battery > 10 ? 'var(--warning)' : 'var(--danger)');
        document.getElementById(`${id}-bat-bar`).style.background = batColor;
        
        document.getElementById(`${id}-load-val`).textContent = `${r.load}/${r.maxLoad}`;
        document.getElementById(`${id}-load-bar`).style.width = `${(r.load / r.maxLoad) * 100}%`;
        
        statusEl.className = 'robot-status';
        if (r.activeGoal === 'COLLECT') statusEl.classList.add('status-collect');
        if (r.activeGoal === 'UNLOAD') statusEl.classList.add('status-unload');
        if (r.activeGoal === 'CHARGE') statusEl.classList.add('status-charge');
    });
}

// -- INITIALIZATION --
window.onload = () => {
    const canvas = document.getElementById('sim-canvas');
    const kernel = new BagCollectorKernel();
    const renderer = new Renderer(canvas);
    
    // Sliders
    const robotSlider = document.getElementById('param-robot-count');
    const robotVal = document.getElementById('val-robot-count');
    robotSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        robotVal.textContent = val;
        kernel.robotCount = val;
        kernel.initRobots();
    };
    
    const stationSlider = document.getElementById('param-station-count');
    const stationVal = document.getElementById('val-station-count');
    stationSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        stationVal.textContent = val;
        kernel.stationCount = val;
        kernel.initObjects();
    };
    
    const loadSlider = document.getElementById('param-max-load');
    const loadVal = document.getElementById('val-max-load');
    loadSlider.oninput = (e) => {
        const val = parseInt(e.target.value);
        loadVal.textContent = val;
        kernel.robots.forEach(r => r.maxLoad = val);
    };
    
    function loop() {
        kernel.step();
        renderer.draw(kernel);
        updateUI(kernel);
        requestAnimationFrame(loop);
    }
    
    loop();
};
