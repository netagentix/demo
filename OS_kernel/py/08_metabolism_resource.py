"""
============================================================
KERNEL AGENTIX OS — 08_metabolism_resource.py
Module 8: Metabolism & Resource
Manajemen Baterai/Memori Berbasis Valensi
============================================================
Depends on: corekernel.py
"""
from corekernel import AgentixKernel, Semantic


class MetabolismResource(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._batteries = {}
        self._memory    = {}
        self._budgets   = {}

    def register_battery(self, agent_id, capacity=1.0, initial=1.0, regen=0.005):
        self._batteries[agent_id] = {
            'charge':   min(initial, capacity),
            'capacity': capacity,
            'regen':    regen,
        }

    def get_charge(self, agent_id):
        return self._batteries.get(agent_id, {}).get('charge', 1.0)

    def charge_valence(self, agent_id):
        b = self._batteries.get(agent_id)
        if not b: return 1.0
        return Semantic.normalize(b['charge'], b['capacity'])

    def consume(self, agent_id, amount):
        b = self._batteries.get(agent_id)
        if not b: return 0.0
        actual     = min(amount, b['charge'])
        b['charge'] = max(0.0, b['charge'] - actual)
        return actual

    def regenerate(self, agent_id):
        b = self._batteries.get(agent_id)
        if b: b['charge'] = min(b['capacity'], b['charge'] + b['regen'])

    def regenerate_all(self):
        for aid in self._batteries: self.regenerate(aid)

    def energy_gate(self, agent_id, threshold=0.2, sharpness=8):
        return Semantic.soft_thresh(self.charge_valence(agent_id), threshold, sharpness)

    def register_budget(self, agent_id, cost_map):
        """cost_map: { 'sprint': 0.02, 'jump': 0.05, 'idle': 0.001 }"""
        self._budgets[agent_id] = dict(cost_map)

    def get_action_cost(self, agent_id, action_type):
        return self._budgets.get(agent_id, {}).get(action_type, 0.0)

    def afford_action(self, agent_id, action_type, desired_intensity=1.0):
        cost   = self.get_action_cost(agent_id, action_type)
        gate   = self.energy_gate(agent_id)
        actual = desired_intensity * gate
        self.consume(agent_id, cost * actual)
        return actual

    def register_memory(self, agent_id, capacity=100):
        self._memory[agent_id] = {'used': 0, 'capacity': capacity}

    def alloc_memory(self, agent_id, tokens):
        m = self._memory.get(agent_id)
        if not m: return 0
        free   = m['capacity'] - m['used']
        actual = min(tokens, free)
        m['used'] += actual
        return actual

    def free_memory(self, agent_id, tokens):
        m = self._memory.get(agent_id)
        if m: m['used'] = max(0, m['used'] - tokens)

    def memory_pressure(self, agent_id):
        m = self._memory.get(agent_id)
        if not m: return 0.0
        return Semantic.normalize(m['used'], m['capacity'])

    def resource_snapshot(self):
        return {
            aid: {
                'charge_valence':  self.charge_valence(aid),
                'memory_pressure': self.memory_pressure(aid),
            }
            for aid in self._batteries
        }
