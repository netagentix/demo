"""
============================================================
KERNEL AGENTIX OS — 04_hierarchical_holarchy.py
Module 4: Hierarchical Holarchy
Manajer State Berjenjang (Holon-based State Manager)
============================================================
Depends on: corekernel.py
"""
from corekernel import AgentixKernel, Semantic


class HierarchicalHolarchy(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._holons = {}
        self._root   = None

    def register_holon(self, hid, parent=None, states=None, initial_state=None, priority=1.0):
        states = states or []
        self._holons[hid] = {
            'id':          hid,
            'parent':      parent,
            'children':    [],
            'states':      states,
            'active_state': initial_state or (states[0] if states else None),
            'tension':     {},
            'authority':   0.0,
            'priority':    priority,
        }
        if parent and parent in self._holons:
            self._holons[parent]['children'].append(hid)
        if not parent:
            self._root = hid
        return self

    def set_tensions(self, holon_id, tension_map):
        h = self._holons.get(holon_id)
        if h: h['tension'] = dict(tension_map)

    def resolve_state(self, holon_id):
        h = self._holons.get(holon_id)
        if not h or not h['states']: return None
        vals   = [h['tension'].get(s, 0.0) * h['authority'] for s in h['states']]
        rtd    = self._compute_rtd(vals)
        winner = h['active_state']
        max_s  = -float('inf')
        for s, v in zip(h['states'], rtd):
            if v > max_s:
                max_s  = v
                winner = s
        h['active_state'] = winner
        return winner

    def propagate_authority(self):
        if not self._root: return
        self._holons[self._root]['authority'] = 1.0
        self._cascade_authority(self._root)

    def _cascade_authority(self, hid):
        h = self._holons.get(hid)
        if not h or not h['children']: return
        total_p = sum(self._holons[c]['priority'] for c in h['children'] if c in self._holons)
        for cid in h['children']:
            child = self._holons.get(cid)
            if not child: continue
            child['authority'] = h['authority'] * (child['priority'] / (total_p + 1e-12))
            self._cascade_authority(cid)

    def tick_holarchy(self):
        self.propagate_authority()
        for hid in reversed(self._topological_order()):
            self.resolve_state(hid)

    def _topological_order(self):
        visited, result = set(), []
        def visit(hid):
            if hid in visited: return
            visited.add(hid)
            for c in self._holons.get(hid, {}).get('children', []):
                visit(c)
            result.append(hid)
        if self._root: visit(self._root)
        return result

    def get_state(self, holon_id):
        return self._holons.get(holon_id, {}).get('active_state')

    def get_authority(self, holon_id):
        return self._holons.get(holon_id, {}).get('authority', 0.0)

    def state_valence(self, holon_id, state_name):
        h = self._holons.get(holon_id)
        if not h: return 0.0
        t   = h['tension'].get(state_name, 0.0)
        mx  = max(list(h['tension'].values()) + [1e-12])
        return Semantic.normalize(t, mx)
