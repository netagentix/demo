"""
============================================================
KERNEL AGENTIX OS — 02_spatial_mapping.py
Module 2: Spatial Mapping
Geometri & Relasi Ruang
============================================================
Depends on: corekernel.py
"""
import math
from corekernel import AgentixKernel, Vector, Semantic


class SpatialMapping(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._zones    = {}
        self._topology = {}

    def register_zone(self, name, shape):
        """shape: [x1,y1,x2,y2] or {'cx','cy','radius'}"""
        self._zones[name] = shape

    def zone_valence(self, pos, zone_name, sharpness=10):
        z = self._zones.get(zone_name)
        if not z: return 0.0
        if isinstance(z, dict):  # circle
            dist   = Vector.dist(pos, [z['cx'], z['cy']])
            return 1.0 / (1.0 + math.exp(sharpness * (dist - z['radius'])))
        x1, y1, x2, y2 = z
        margin = min(pos[0]-x1, x2-pos[0], pos[1]-y1, y2-pos[1])
        denom  = (x2-x1 + y2-y1) * 0.25 + 1e-12
        return 1.0 / (1.0 + math.exp(-sharpness * margin / denom))

    def in_zone(self, pos, zone_name):
        z = self._zones.get(zone_name)
        if not z: return 0
        if isinstance(z, dict):
            return int(Vector.dist(pos, [z['cx'], z['cy']]) <= z['radius'])
        x1, y1, x2, y2 = z
        return int(x1 <= pos[0] <= x2 and y1 <= pos[1] <= y2)

    def nearest_agent(self, pos, agents, exclude_id=None):
        min_dist, nearest = float('inf'), None
        for a in agents:
            skip = int(a.id == exclude_id)
            d    = Vector.dist(pos, a.pos) + skip * 1e9
            if d < min_dist:
                min_dist, nearest = d, a
        return {'agent': nearest, 'dist': min_dist}

    def k_nearest_agents(self, pos, agents, k=3, exclude_id=None):
        filtered = [a for a in agents if a.id != exclude_id]
        scored   = sorted(filtered, key=lambda a: Vector.dist(pos, a.pos))
        return [{'agent': a, 'dist': Vector.dist(pos, a.pos)} for a in scored[:k]]

    def centroid(self, positions):
        n   = len(positions) or 1
        sx  = sum(p[0] for p in positions) / n
        sy  = sum(p[1] for p in positions) / n
        return [sx, sy]

    def sector_scan(self, pos, direction, half_angle, radius, agents):
        norm_dir = Vector.normalize(direction)
        result   = []
        for a in agents:
            diff  = Vector.sub(a.pos, pos)
            dist  = Vector.norm(diff)
            if dist < 1e-3 or dist > radius: continue
            cos_a = Vector.dot(Vector.normalize(diff), norm_dir)
            if cos_a > math.cos(half_angle):
                result.append(a)
        return result

    def register_topology(self, topology):
        self._topology = topology

    def get_relations(self, role):
        return self._topology.get(role, [])

    def territory_pressure(self, pos, zone_name, max_dist=100):
        inside = self.zone_valence(pos, zone_name)
        z      = self._zones.get(zone_name)
        if not z: return 0.0
        if isinstance(z, dict):
            center = [z['cx'], z['cy']]
        else:
            center = [(z[0]+z[2])/2, (z[1]+z[3])/2]
        dist = Vector.dist(pos, center)
        return (1 - inside) * Semantic.normalize(dist, max_dist)

    def formation_anchor(self, center, heading, formation, agent_index):
        offset  = formation[agent_index % len(formation)]
        rotated = Vector.rotate(offset, Vector.angle(heading))
        return Vector.add(center, rotated)
