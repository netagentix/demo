"""
============================================================
KERNEL AGENTIX OS — 01_tension_engine.py
Module 1: Tension Logic Engine
Attractor · Repulsor · Damper · Interferensi
============================================================
Depends on: corekernel.py
"""
import math
from corekernel import AgentixKernel, Vector, Semantic


class TensionEngine(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._tension_fields = {}
        self._damp_fields    = {}

    # ─────────────────────────────────────────
    # ATTRACTOR
    # ─────────────────────────────────────────
    def compute_attractor(self, source_pos, target_pos, weight, falloff=1.0):
        diff  = Vector.sub(target_pos, source_pos)
        dist  = Vector.norm(diff) + 1e-12
        force = weight / (dist ** falloff + 1e-12)
        return Vector.mul(Vector.div(diff, dist), force)

    # ─────────────────────────────────────────
    # REPULSOR
    # ─────────────────────────────────────────
    def compute_repulsor(self, source_pos, repulsor_pos, strength, radius):
        diff    = Vector.sub(source_pos, repulsor_pos)
        dist    = Vector.norm(diff) + 1e-12
        valence = strength * math.exp(-dist / (radius + 1e-12))
        return Vector.mul(Vector.div(diff, dist), valence)

    # ─────────────────────────────────────────
    # DAMPER
    # ─────────────────────────────────────────
    def apply_damper(self, velocity, damp_factor):
        return Vector.mul(velocity, max(0.0, min(1.0, damp_factor)))

    # ─────────────────────────────────────────
    # INTERFERENSI — superposition
    # ─────────────────────────────────────────
    def interfere_superpose(self, val_a, val_b, phase_shift=0.0):
        return val_a + val_b * math.cos(phase_shift)

    # ─────────────────────────────────────────
    # TENSION FIELD — named persistent field
    # ─────────────────────────────────────────
    def register_tension_field(self, name, initial=0.0):
        self._tension_fields[name] = initial

    def update_tension_field(self, name, delta, decay_rate=0.95, max_val=1.0):
        prev = self._tension_fields.get(name, 0.0)
        self._tension_fields[name] = max(0.0, min(max_val, prev * decay_rate + delta))
        return self._tension_fields[name]

    def get_tension(self, name):
        return self._tension_fields.get(name, 0.0)

    # ─────────────────────────────────────────
    # SHADOW VARIABLE — RTD competition
    # ─────────────────────────────────────────
    def resolve_shadow_intents(self, intents_map, alpha=2.8):
        """intents_map: { 'gas': 0.3, 'brake': 0.05, 'coast': 0.65 }"""
        keys = list(intents_map.keys())
        vals = list(intents_map.values())
        rtd  = self._compute_rtd(vals, alpha)
        return {k: rtd[i] for i, k in enumerate(keys)}

    # ─────────────────────────────────────────
    # POTENTIAL FIELD — combined attractor + repulsor
    # ─────────────────────────────────────────
    def compute_potential_field(self, agent_pos, attractors=None, repulsors=None):
        """
        attractors: [{'pos': [x,y], 'weight': w, 'falloff': f}, ...]
        repulsors:  [{'pos': [x,y], 'strength': s, 'radius': r}, ...]
        """
        net = Vector.zero()
        for a in (attractors or []):
            net = Vector.add(net, self.compute_attractor(
                agent_pos, a['pos'], a['weight'], a.get('falloff', 1.0)
            ))
        for r in (repulsors or []):
            net = Vector.add(net, self.compute_repulsor(
                agent_pos, r['pos'], r['strength'], r['radius']
            ))
        return net

    # ─────────────────────────────────────────
    # DAMPER FIELD — spatial zone damping
    # ─────────────────────────────────────────
    def register_damp_field(self, name, center, radius, strength):
        self._damp_fields[name] = {'center': center, 'radius': radius, 'strength': strength}

    def get_damp_at_pos(self, pos):
        total_damp = 1.0
        for f in self._damp_fields.values():
            dist    = Vector.dist(pos, f['center'])
            valence = Semantic.proximity(dist, f['radius'])
            total_damp *= (1.0 - f['strength'] * valence)
        return max(0.0, total_damp)

    # ─────────────────────────────────────────
    # VORTEX
    # ─────────────────────────────────────────
    def compute_vortex(self, source_pos, center_pos, strength, radius):
        diff    = Vector.sub(source_pos, center_pos)
        dist    = Vector.norm(diff) + 1e-12
        dir_v   = Vector.div(diff, dist)
        perp    = [-dir_v[1], dir_v[0]]
        valence = strength * math.exp(-dist / (radius + 1e-12))
        return Vector.mul(perp, valence)

    # ─────────────────────────────────────────
    # RING ATTRACTOR
    # ─────────────────────────────────────────
    def compute_ring_attractor(self, source_pos, center_pos, radius, strength):
        diff  = Vector.sub(source_pos, center_pos)
        dist  = Vector.norm(diff) + 1e-12
        dir_v = Vector.div(diff, dist)
        error = dist - radius
        return Vector.mul(dir_v, -strength * error)

    # ─────────────────────────────────────────
    # DENSITY FIELD
    # ─────────────────────────────────────────
    def compute_density(self, pos, neighbor_positions, radius):
        density = 0.0
        for n_pos in neighbor_positions:
            dist = Vector.dist(pos, n_pos)
            density += math.exp(-dist / (radius + 1e-12))
        return density

    # ─────────────────────────────────────────
    # SHEAR GEOMETRY
    # ─────────────────────────────────────────
    def compute_shear(self, source_pos, center_pos, normal_dir, strength):
        perp          = [-normal_dir[1], normal_dir[0]]
        diff          = Vector.sub(source_pos, center_pos)
        dist_to_plane = Vector.dot(diff, normal_dir)
        return Vector.mul(perp, strength * dist_to_plane)

    # ─────────────────────────────────────────
    # NOISE GEOMETRY
    # ─────────────────────────────────────────
    def compute_noise_force(self, pos, scale=1.0):
        x  = pos[0] * scale
        y  = pos[1] * scale
        nx = math.sin(x * 12.9898 + y * 78.233) * 43758.5453
        ny = math.cos(x * 4.898 + y * 23.23) * 23421.631
        return [nx - math.floor(nx) - 0.5, ny - math.floor(ny) - 0.5]
