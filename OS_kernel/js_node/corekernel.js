/**
 * ============================================================
 * Agentix OS Kernel — corekernel.js  [Node.js Edition]
 * Relational Topology Dynamics Framework (RTDF) v2.0
 * ============================================================
 *
 * Copyright (C) 2024  Agentix Team
 *
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * ============================================================
 * Gold Rule: No explicit if-then in runtime loops.
 * All logic is mapped through relational tension & YAML config.
 *
 * DIFFERENCE FROM BROWSER VERSION:
 *   - Uses CommonJS (require/module.exports) instead of ES6 import/export.
 *   - No DOM or window references. Safe for headless/edge execution.
 *   - Adds process.hrtime.bigint() timing utility for real-time edge telemetry.
 *
 * EXPORTS:
 *   - Vector        : Static 2D vector math
 *   - Semantic      : Perceptory-to-valence converters
 *   - AgentixKernel : Base kernel class (extend this for simulations)
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────
// 1. VECTOR — Static 2D Vector Math
// ─────────────────────────────────────────────
class Vector {
    static add(a, b)   { return [a[0]+b[0], a[1]+b[1]]; }
    static sub(a, b)   { return [a[0]-b[0], a[1]-b[1]]; }
    static mul(a, s)   { return [a[0]*s,    a[1]*s   ]; }
    static div(a, s)   { const m = s + 1e-12; return [a[0]/m, a[1]/m]; }
    static norm(a)     { return Math.sqrt(a[0]**2 + a[1]**2); }
    static dist(a, b)  { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }
    static normalize(a){ return Vector.div(a, Vector.norm(a)); }
    static dot(a, b)   { return a[0]*b[0] + a[1]*b[1]; }
    static cross(a, b) { return a[0]*b[1] - a[1]*b[0]; }
    static rotate(v, angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return [v[0]*c - v[1]*s, v[0]*s + v[1]*c];
    }
    static lerp(a, b, t) {
        return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
    }
    static clamp(a, min, max) {
        return [Math.max(min, Math.min(max, a[0])),
                Math.max(min, Math.min(max, a[1]))];
    }
    static zero()  { return [0, 0]; }
    static angle(a){ return Math.atan2(a[1], a[0]); }
    static fromAngle(angle, len = 1) {
        return [Math.cos(angle)*len, Math.sin(angle)*len];
    }
}

// ─────────────────────────────────────────────
// 2. SEMANTIC — Perceptory-to-Valence Layer
//    Converts raw sensor data → clean [0,1] or [-1,1]
// ─────────────────────────────────────────────
class Semantic {
    /** Linear normalization → [0, 1] */
    static normalize(raw, maxVal)   { return Math.max(0, Math.min(1, (raw||0)/(maxVal||1))); }
    /** Symmetric normalization → [-1, 1] */
    static symNorm(raw, radius)     { return Math.max(-1, Math.min(1, (raw||0)/(radius||1))); }
    /** Proximity: closer = higher → [0, 1] */
    static proximity(dist, maxDist) { return Math.max(0, 1 - Math.abs(dist||0)/(maxDist||1)); }
    /** Deadzone filter: removes micro-jitter */
    static deadzone(raw, threshold) { return +(Math.abs(raw||0) > threshold) * (raw||0); }
    /** Binary: boolean/existence → 0.0 or 1.0 */
    static binary(cond)             { return +(!!cond); }
    /** Soft threshold via sigmoid */
    static softThresh(raw, center, sharpness = 5.0) {
        return 1 / (1 + Math.exp(-sharpness * ((raw||0) - center)));
    }
    /** Exponential decay (energy falloff) */
    static decay(raw, rate = 0.95)  { return (raw||0) * rate; }
    /** Angle difference normalized to [-1, 1] */
    static angleDiff(a, b) {
        let d = ((b - a) % (2*Math.PI) + 3*Math.PI) % (2*Math.PI) - Math.PI;
        return d / Math.PI;
    }
}

// ─────────────────────────────────────────────
// 3. AGENTIX KERNEL — Base Class
//    Extend this in each simulation
// ─────────────────────────────────────────────
class AgentixKernel {
    constructor(config) {
        this.cfg       = config || {};
        this.iteration = 0;
        this.agents    = {};
        this.objects   = {};
        this.sensors   = {};

        // ── High-resolution timing (Node.js only) ──
        // Uses process.hrtime.bigint() for nanosecond precision.
        // Useful for measuring real step latency on edge hardware.
        this._lastStepNs = process.hrtime.bigint();

        // ── Activation Function Registry ──
        this.activators = {
            sigmoid:  (x, beta = 1.0)       => 1 / (1 + Math.exp(-beta * x)),
            gaussian: (x, sigma = 1.0)      => Math.exp(-(x**2) / (2 * sigma**2)),
            tanh:     (x, alpha = 1.0)      => Math.tanh(x * alpha),
            linear:   (x, scale = 1.0)      => x * scale,
            relu:     (x, leak = 0.0)       => x >= 0 ? x : x * leak,
            clamp:    (x, min = 0, max = 1) => Math.max(min, Math.min(max, x)),
            softplus: (x)                   => Math.log(1 + Math.exp(x)),
            swish:    (x)                   => x / (1 + Math.exp(-x)),
        };
    }

    // ── Node.js Step Latency Profiler ──
    // Returns nanoseconds elapsed since the last call to this method.
    // Call once per step to measure real-time execution latency.
    measureStepLatencyNs() {
        const now = process.hrtime.bigint();
        const elapsed = now - this._lastStepNs;
        this._lastStepNs = now;
        return elapsed;
    }

    // ── Node.js Step Latency in milliseconds ──
    measureStepLatencyMs() {
        return Number(this.measureStepLatencyNs()) / 1_000_000;
    }

    // ── Node Activation (YAML-driven, no if-then) ──
    // Node format: [bias, scale, [[sensor_key, weight], ...], activator_name]
    _activateNode(node, context) {
        const [bias, scale, inputs, activator] = node;
        let sum = bias;
        inputs.forEach(([key, w]) => { sum += (context[key] || 0) * w; });
        const fn = this.activators[activator || 'sigmoid'];
        return fn(sum) * scale;
    }

    // ── RTD: Relative Tension Distribution ──
    // Normalizes competing intents via RMS → prevents runaway dominance
    _computeRTD(vals, alpha = 2.8) {
        const rms = Math.sqrt(vals.reduce((a, v) => a + v*v, 0) / (vals.length + 1e-12));
        return vals.map(v => Math.tanh((v / (rms + 1e-12)) * alpha));
    }

    // ── Resolve Relational Target Map ──
    // key → { prop: dataContext[sourceKey] }  (no if-then)
    _resolveRelational(key, relationMap, dataContext) {
        const entry = relationMap[key] || {};
        const out = {};
        Object.entries(entry).forEach(([prop, src]) => {
            out[prop] = dataContext[src] !== undefined ? dataContext[src] : src;
        });
        return out;
    }

    // ── Net Force from Attractor Map ──
    _resolveForces(sourcePos, attractors, targets) {
        let net = Vector.zero();
        Object.entries(attractors).forEach(([role, weight]) => {
            const tgt = targets[role] || Vector.zero();
            const diff = Vector.sub(tgt, sourcePos);
            const dist = Vector.norm(diff) + 1e-12;
            net = Vector.add(net, Vector.mul(Vector.div(diff, dist), weight));
        });
        return net;
    }

    // ── Masked Force Application (replaces if-then gate) ──
    _applyMaskedForce(velocity, force, mask) {
        return Vector.add(velocity, Vector.mul(force, +mask));
    }

    // ── Boundary Clip (no if-then) ──
    _boundaryClip(pos, bounds) {
        return [
            Math.max(bounds[0], Math.min(bounds[2], pos[0])),
            Math.max(bounds[1], Math.min(bounds[3], pos[1]))
        ];
    }

    // ── Register custom activator ──
    registerActivator(name, fn) {
        this.activators[name] = fn;
    }

    // ── Tick Pipeline (Override these in subclass) ──
    step() {
        this.iteration++;
        this.perceptoryLayer();
        this.semanticLayer();
        this.decisionLayer();
        this.kineticLayer();
    }

    perceptoryLayer() {
        // Layer 1: Capture raw sensor data
    }

    semanticLayer() {
        // Layer 2: Process raw data into semantic states/valence
    }

    decisionLayer() {
        // Layer 3: Resolve tensions and make decisions
    }

    kineticLayer() {
        // Layer 4: Translate decisions into motor actions (embodiment)
    }
}

// ── CommonJS Export (Node.js style) ──
module.exports = { Vector, Semantic, AgentixKernel };
