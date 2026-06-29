// --------------------------------------------------------------
// Protein Folding – OS-specific version (layered implementation)
// --------------------------------------------------------------

import { AgentixKernel, Vector, Semantic } from '../OS_kernel/js/corekernel.js';

/** Helper: load external YAML configuration via fetch (AJAX) */
async function loadConfig() {
  const resp = await fetch('config.yaml');
  const text = await resp.text();
  return window.jsyaml.load(text);
}

/** Main simulation kernel – inherits abstract layers */
class ProteinFoldingKernel extends AgentixKernel {
  constructor(cfg) {
    super(cfg);
    this.nodes = [];
    this.generateChain();
  }

  /** Build amino‑acid chain from cfg.sequence */
  generateChain() {
    this.nodes = [];
    const { width: W, height: H } = this.cfg.canvas;
    const seq = this.cfg.sequence;
    const bondLen = this.cfg.simulation.bond_length;
    const startX = W / 2 - (seq.length * bondLen) / 2;
    for (let i = 0; i < seq.length; i++) {
      const typeKey = seq[i];
      const type = this.cfg.types[typeKey];
      const node = {
        id: i,
        type,
        pos: [startX + i * bondLen, H / 2 + (Math.random() * 10 - 5)],
        vel: [0, 0],
        force: [0, 0],
        bonds: [],
      };
      if (i > 0) {
        node.bonds.push(i - 1);
        this.nodes[i - 1].bonds.push(i);
      }
      this.nodes.push(node);
    }
  }

  /** -----------------------------------------------------------------
   *  Layer 1 – Perceptory (raw sensor capture)
   *  ----------------------------------------------------------------- */
  perceptoryLayer() {
    // No external sensors; placeholder for future extensions.
    this._pairwiseContexts = [];
  }

  /** -----------------------------------------------------------------
   *  Layer 2 – Semantic (convert raw data → valence)
   *  ----------------------------------------------------------------- */
  semanticLayer() {
    const simCfg = this.cfg.simulation;
    const logicNode = this.cfg.logic.pairwise_force.magnitude;
    // Reset forces before recomputation
    this.nodes.forEach(n => (n.force = [0, 0]));
    // Compute pairwise semantic context for decision layer
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const A = this.nodes[i];
        const B = this.nodes[j];
        const diff = Vector.sub(B.pos, A.pos);
        const dist = Vector.norm(diff);
        const bonded = A.bonds.includes(B.id);
        const context = {
          bond_stretch: bonded
            ? Semantic.symNorm(dist - simCfg.bond_length, simCfg.bond_length * 0.5)
            : 0,
          steric_overlap: Semantic.proximity(dist, simCfg.steric_radius * 2),
          hydrophobic_pull:
            !A.type.polar && !B.type.polar && !bonded
              ? Semantic.proximity(dist, simCfg.interaction_radius)
              : 0,
          ionic_pull:
            A.type.charge * B.type.charge !== 0 && !bonded
              ? Semantic.symNorm(-(A.type.charge * B.type.charge), 1) *
                Semantic.proximity(dist, simCfg.interaction_radius)
              : 0,
        };
        this._pairwiseContexts.push({ A, B, diff, dist, context });
      }
    }
  }

  /** -----------------------------------------------------------------
   *  Layer 3 – Decision (activate node & apply forces)
   *  ----------------------------------------------------------------- */
  decisionLayer() {
    const logicNode = this.cfg.logic.pairwise_force.magnitude;
    this._pairwiseContexts.forEach(item => {
      const { A, B, diff, dist, context } = item;
      const dir = Vector.div(diff, dist + 1e-8);
      const forceMagnitude = this._activateNode(logicNode, context);
      const forceVec = Vector.mul(dir, forceMagnitude);
      A.force = Vector.add(A.force, forceVec);
      B.force = Vector.sub(B.force, forceVec);
    });
    // Clear temporary storage
    this._pairwiseContexts = [];
  }

  /** -----------------------------------------------------------------
   *  Layer 4 – Kinetic (heat, integration, boundary)
   *  ----------------------------------------------------------------- */
  kineticLayer() {
    const simCfg = this.cfg.simulation;
    this.nodes.forEach(n => {
      const heatForce = [
        (Math.random() - 0.5) * simCfg.heat,
        (Math.random() - 0.5) * simCfg.heat,
      ];
      n.force = Vector.add(n.force, heatForce);
      n.vel = Vector.add(n.vel, n.force);
      n.vel = Vector.mul(n.vel, simCfg.friction);
      n.pos = Vector.add(n.pos, n.vel);
      n.pos = this._boundaryClip(n.pos, [20, 20, this.cfg.canvas.width - 20, this.cfg.canvas.height - 20]);
    });
  }
}

// Duplicate loadConfig removed; original definition retained above

// ----------------------------------------------------------------
// UI bootstrap – pass canvas dimensions into the kernel config
(async () => {
  const cfg = await loadConfig();
  const canvas = document.getElementById('sim-canvas');
  // embed canvas size in config for kernel use
  cfg.canvas = { width: canvas.width, height: canvas.height };
  const kernel = new ProteinFoldingKernel(cfg);
  
  // ----------------------------------------------------------------
  // Simple renderer (unchanged visual logic)
  class Renderer {
    constructor(canvas, cfg) {
      this.ctx = canvas.getContext('2d');
      this.cfg = cfg;
      this.W = canvas.width;
      this.H = canvas.height;
    }
    draw(kernel) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      // Bonds
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#475569';
      for (let i = 0; i < kernel.nodes.length - 1; i++) {
        const a = kernel.nodes[i].pos;
        const b = kernel.nodes[i + 1].pos;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      // Amino acids
      kernel.nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.pos[0], n.pos[1], 12, 0, Math.PI * 2);
        ctx.fillStyle = n.type.color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (n.type.charge !== 0) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 12px Outfit';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.type.charge > 0 ? '+' : '-', n.pos[0], n.pos[1] + 1);
        } else if (!n.type.polar) {
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 10px Outfit';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', n.pos[0], n.pos[1] + 1);
        }
      });
      this.drawUI(kernel);
    }
    drawUI(kernel) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(10, 10, 240, 160);
      const kineticEnergy = kernel.nodes.reduce((s, n) => s + Vector.norm(n.vel), 0);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 16px Outfit';
      ctx.textAlign = 'left';
      ctx.fillText(
        kineticEnergy < 2.0 ? 'Status: EQUILIBRIUM' : 'Status: FOLDING',
        25,
        35
      );
      ctx.font = '14px Outfit';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Kinetic Energy: ${kineticEnergy.toFixed(2)}`, 25, 60);
      // legend
      ctx.font = '13px Outfit';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('■ Hydrophobic (H)', 25, 95);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('■ Polar', 160, 95);
      ctx.fillStyle = '#ef4444';
      ctx.fillText('■ Positive (+)', 25, 120);
      ctx.fillStyle = '#22c55e';
      ctx.fillText('■ Negative (-)', 160, 120);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Outfit';
      ctx.fillText('Glass Box AI - Relational Kernel', 25, 150);
    }
  }

  const renderer = new Renderer(canvas, cfg);
  let running = true;
  const loop = () => {
    if (running) kernel.step(); // uses layered pipeline
    renderer.draw(kernel);
    requestAnimationFrame(loop);
  };

  // UI controls – identical to original
  document.getElementById('btn-toggle').addEventListener('click', e => {
    running = !running;
    e.target.innerText = running ? 'Pause Simulation' : 'Resume Simulation';
    e.target.className = running ? 'primary' : '';
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    kernel.generateChain();
    if (!running) {
      running = true;
      document.getElementById('btn-toggle').innerText = 'Pause Simulation';
      document.getElementById('btn-toggle').className = 'primary';
    }
  });
  document.getElementById('btn-jiggle').addEventListener('click', () => {
    kernel.nodes.forEach(n => {
      n.vel = Vector.add(n.vel, [
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
      ]);
    });
  });

  loop();
})();
