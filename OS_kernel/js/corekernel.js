/**
 * Relational Kernel Core
 * Relational Topology Dynamics Framework (RTDF)
 * 
 * Standardized engine for multi-agent simulations using purely relational logic.
 * Gold Rule: No explicit if-then in runtime loops. All logic mapped in YAML.
 */

class Vector {
    static add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
    static sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
    static mul(a, s) { return [a[0] * s, a[1] * s]; }
    static div(a, s) {
        const mag = s + 1e-12;
        return [a[0] / mag, a[1] / mag];
    }
    static norm(a) { return Math.sqrt(a[0] ** 2 + a[1] ** 2); }
    static dist(a, b) { return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2); }
    static normalize(a) { return this.div(a, this.norm(a)); }
    static rotate(v, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
    }
    static lerp(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
}

class RelationalKernel {
    constructor(config) {
        this.cfg = config;
        this.iteration = 0;
        this.agents = {};
        this.objects = {};
        this.sensors = {};

        // Internal activation functions map
        this.activators = {
            sigmoid: (x, beta = 1.0) => 1 / (1 + Math.exp(-beta * x)),
            gaussian: (x, sigma = 1.0) => Math.exp(-(x ** 2) / (2 * sigma ** 2)),
            tanh: (x, alpha = 1.0) => Math.tanh(x * alpha),
            linear: (x, scale = 1.0) => x * scale,
            clamp: (x, min = 0, max = 1) => Math.max(min, Math.min(max, x))
        };
    }

    /**
     * Resolve a logic node from YAML without if-then
     * @param {Object} node - The logic node from config
     * @param {Object} context - The current sensing context
     */
    _activateNode(node, context) {
        // Node format: [bias, scale, [[sensor_name, weight], ...], activator_name]
        const [bias, scale, inputs, activator] = node;
        let sum = bias;
        inputs.forEach(([key, weight]) => {
            sum += (context[key] || 0) * weight;
        });
        const fn = this.activators[activator || 'sigmoid'];
        return fn(sum) * scale;
    }

    /**
     * Resolve a relational target from a map using a key (e.g., role)
     * Avoids if-then by direct dictionary access
     */
    _resolveRelational(key, relationMap, dataContext) {
        const entry = relationMap[key] || {};
        const results = {};
        Object.entries(entry).forEach(([prop, sourceKey]) => {
            results[prop] = dataContext[sourceKey] || sourceKey; // Fallback to literal if not in context
        });
        return results;
    }

    /**
     * Compute RTD (Relative Tension Distribution)
     * Normalizes a set of values using RMS to create a balanced "flow"
     */
    _computeRTD(vals, alpha = 2.8) {
        const squareSum = vals.reduce((acc, v) => acc + v * v, 0);
        const rms = Math.sqrt(squareSum / (vals.length + 1e-12));
        return vals.map(v => Math.tanh((v / (rms + 1e-12)) * alpha));
    }

    /**
     * Standard relational force calculation
     * Sums vectors based on relational weights in YAML
     */
    _resolveForces(sourcePos, attractors, targets) {
        let netForce = [0, 0];
        Object.entries(attractors).forEach(([role, weight]) => {
            const target = targets[role] || [0, 0];
            const diff = Vector.sub(target, sourcePos);
            const dist = Vector.norm(diff) + 1e-12;
            const dir = Vector.div(diff, dist);
            netForce = Vector.add(netForce, Vector.mul(dir, weight));
        });
        return netForce;
    }

    /**
     * Masked action execution
     * Uses a multiplier to zero out actions instead of if-then
     */
    _applyMaskedForce(velocity, force, mask) {
        return Vector.add(velocity, Vector.mul(force, +mask));
    }

    /**
     * Clip position to boundaries using Math.min/max (No if)
     */
    _boundaryClip(pos, bounds) {
        return [
            Math.max(bounds[0], Math.min(bounds[2], pos[0])),
            Math.max(bounds[1], Math.min(bounds[3], pos[1]))
        ];
    }
}

/**
 * Semantic Layer Utilities
 * Converts raw perceptory data (noise, nulls, absolutes) into clean geometric valences (0.0 to 1.0 or -1.0 to 1.0).
 * Acts as the bridge between the physical simulation and the Relational Kernel.
 */
class Semantic {
    /**
     * Linear Normalization (0.0 to 1.0)
     * Example: queueCount / maxQueue
     */
    static normalize(raw, max_val) {
        return Math.max(0, Math.min(1, (raw || 0) / (max_val || 1)));
    }

    /**
     * Symmetrical Normalization (-1.0 to 1.0)
     * Example: bird Y distance to gap center
     */
    static symNormalize(raw, radius) {
        return Math.max(-1, Math.min(1, (raw || 0) / (radius || 1)));
    }

    /**
     * Inverted Normalization (1.0 to 0.0)
     * Example: Distance -> Proximity (Closer = Higher Valence)
     */
    static proximity(dist, max_dist) {
        return Math.max(0, 1 - (Math.abs(dist || 0) / (max_dist || 1)));
    }

    /**
     * Deadzone filter: Eliminates micro-fluctuations (jitter/noise)
     * Returns 0 if within threshold, otherwise returns the raw value
     */
    static deadzone(raw, threshold) {
        const val = raw || 0;
        return +(Math.abs(val) > threshold) * val;
    }

    /**
     * Binary Sensor (0.0 or 1.0)
     * Example: Is there an obstacle colliding? (True/False to 1/0)
     */
    static binary(condition) {
        return +(!!condition);
    }
}

export { RelationalKernel, Vector, Semantic };
