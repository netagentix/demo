"""
============================================================
KERNEL AGENTIX OS — corekernel.py
Relational Topology Dynamics Framework (RTDF) v2.0
============================================================
Gold Rule: No explicit if-then in runtime loops.
All logic is mapped through relational tension & config dict.

EXPORTS:
  - Vector        : Static 2D vector math
  - Semantic      : Perceptory-to-valence converters
  - AgentixKernel : Base kernel class (extend for simulations)
============================================================
"""

import math


# ─────────────────────────────────────────
# 1. VECTOR — Static 2D Vector Math
# ─────────────────────────────────────────
class Vector:
    @staticmethod
    def add(a, b):    return [a[0]+b[0], a[1]+b[1]]
    @staticmethod
    def sub(a, b):    return [a[0]-b[0], a[1]-b[1]]
    @staticmethod
    def mul(a, s):    return [a[0]*s,    a[1]*s   ]
    @staticmethod
    def div(a, s):    m = s + 1e-12; return [a[0]/m, a[1]/m]
    @staticmethod
    def norm(a):      return math.sqrt(a[0]**2 + a[1]**2)
    @staticmethod
    def dist(a, b):   return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)
    @staticmethod
    def normalize(a): return Vector.div(a, Vector.norm(a))
    @staticmethod
    def dot(a, b):    return a[0]*b[0] + a[1]*b[1]
    @staticmethod
    def cross(a, b):  return a[0]*b[1] - a[1]*b[0]
    @staticmethod
    def rotate(v, angle):
        c, s = math.cos(angle), math.sin(angle)
        return [v[0]*c - v[1]*s, v[0]*s + v[1]*c]
    @staticmethod
    def lerp(a, b, t):
        return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]
    @staticmethod
    def clamp(a, lo, hi):
        return [max(lo, min(hi, a[0])), max(lo, min(hi, a[1]))]
    @staticmethod
    def zero():        return [0.0, 0.0]
    @staticmethod
    def angle(a):     return math.atan2(a[1], a[0])
    @staticmethod
    def from_angle(angle, length=1.0):
        return [math.cos(angle)*length, math.sin(angle)*length]


# ─────────────────────────────────────────
# 2. SEMANTIC — Perceptory-to-Valence Layer
# ─────────────────────────────────────────
class Semantic:
    @staticmethod
    def normalize(raw, max_val):
        return max(0.0, min(1.0, (raw or 0) / (max_val or 1)))

    @staticmethod
    def sym_norm(raw, radius):
        return max(-1.0, min(1.0, (raw or 0) / (radius or 1)))

    @staticmethod
    def proximity(dist, max_dist):
        return max(0.0, 1.0 - abs(dist or 0) / (max_dist or 1))

    @staticmethod
    def deadzone(raw, threshold):
        val = raw or 0
        return float(abs(val) > threshold) * val

    @staticmethod
    def binary(cond):
        return 1.0 if cond else 0.0

    @staticmethod
    def soft_thresh(raw, center, sharpness=5.0):
        return 1.0 / (1.0 + math.exp(-sharpness * ((raw or 0) - center)))

    @staticmethod
    def decay(raw, rate=0.95):
        return (raw or 0) * rate

    @staticmethod
    def angle_diff(a, b):
        d = ((b - a) % (2*math.pi) + 3*math.pi) % (2*math.pi) - math.pi
        return d / math.pi


# ─────────────────────────────────────────
# 3. AGENTIX KERNEL — Base Class
# ─────────────────────────────────────────
class AgentixKernel:
    def __init__(self, config=None):
        self.cfg       = config or {}
        self.iteration = 0
        self.agents    = {}
        self.objects   = {}
        self.sensors   = {}

        # Activation Function Registry
        self.activators = {
            'sigmoid':  lambda x, beta=1.0:       1.0 / (1.0 + math.exp(-beta * max(-500, x))),
            'gaussian': lambda x, sigma=1.0:      math.exp(-(x**2) / (2 * sigma**2 + 1e-12)),
            'tanh':     lambda x, alpha=1.0:      math.tanh(x * alpha),
            'linear':   lambda x, scale=1.0:      x * scale,
            'relu':     lambda x, leak=0.0:       x if x >= 0 else x * leak,
            'clamp':    lambda x, lo=0, hi=1:     max(lo, min(hi, x)),
            'softplus': lambda x:                 math.log(1 + math.exp(min(x, 500))),
            'swish':    lambda x:                 x / (1 + math.exp(min(-x, 500))),
        }

    def _activate_node(self, node, context):
        """
        Activate a YAML-defined logic node.
        node format: [bias, scale, [[key, weight], ...], activator_name]
        """
        bias, scale, inputs, activator_name = node
        total = bias
        for key, w in inputs:
            total += context.get(key, 0) * w
        fn = self.activators.get(activator_name or 'sigmoid')
        return fn(total) * scale

    def _compute_rtd(self, vals, alpha=2.8):
        """Relative Tension Distribution via RMS normalization."""
        rms = math.sqrt(sum(v*v for v in vals) / (len(vals) + 1e-12))
        return [math.tanh((v / (rms + 1e-12)) * alpha) for v in vals]

    def _resolve_relational(self, key, relation_map, data_context):
        """Map role key → data context values (no if-then)."""
        entry = relation_map.get(key, {})
        return {
            prop: data_context.get(src, src)
            for prop, src in entry.items()
        }

    def _resolve_forces(self, source_pos, attractors, targets):
        """Sum attractor force vectors from a weight map."""
        net = Vector.zero()
        for role, weight in attractors.items():
            tgt  = targets.get(role, Vector.zero())
            diff = Vector.sub(tgt, source_pos)
            dist = Vector.norm(diff) + 1e-12
            net  = Vector.add(net, Vector.mul(Vector.div(diff, dist), weight))
        return net

    def _apply_masked_force(self, velocity, force, mask):
        """Apply force scaled by mask (replaces if-then gate)."""
        return Vector.add(velocity, Vector.mul(force, float(mask)))

    def _boundary_clip(self, pos, bounds):
        """Clip position within [x1,y1,x2,y2] bounds."""
        return [
            max(bounds[0], min(bounds[2], pos[0])),
            max(bounds[1], min(bounds[3], pos[1])),
        ]

    def register_activator(self, name, fn):
        """Register a custom activation function."""
        self.activators[name] = fn

    def step(self):
        """Pipeline 4 layer."""
        self.iteration += 1
        self.perceptory_layer()
        self.semantic_layer()
        self.decision_layer()
        self.kinetic_layer()

    def perceptory_layer(self):
        """Layer 1: Capture raw sensor data."""
        pass

    def semantic_layer(self):
        """Layer 2: Process raw data into semantic states/valence."""
        pass

    def decision_layer(self):
        """Layer 3: Resolve tensions and make decisions."""
        pass

    def kinetic_layer(self):
        """Layer 4: Translate decisions into motor actions (embodiment)."""
        pass
