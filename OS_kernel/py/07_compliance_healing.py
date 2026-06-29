"""
============================================================
KERNEL AGENTIX OS — 07_compliance_healing.py
Module 7: Compliance & Self-Healing
Kepatuhan Peran · Isolasi Anomali · Imunitas Sistem
============================================================
Depends on: corekernel.py
"""
from corekernel import AgentixKernel, Semantic


class ComplianceHealing(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._contracts  = {}
        self._health     = {}
        self._immunity   = 1.0
        self._anomaly_log = []

    def register_contract(self, agent_id, contract):
        """contract: { 'speed': [0, 1], 'energy': [0.2, 1], ... }"""
        self._contracts[agent_id] = dict(contract)
        self._health[agent_id]    = 1.0

    def compliance_score(self, agent_id, context):
        contract = self._contracts.get(agent_id)
        if not contract: return 1.0
        scores = []
        for field, (lo, hi) in contract.items():
            val    = context.get(field, 0.0)
            rng    = hi - lo + 1e-12
            excess = max(0, lo - val) + max(0, val - hi)
            scores.append(max(0.0, 1.0 - excess / rng))
        return sum(scores) / len(scores) if scores else 1.0

    def update_health(self, agent_id, context, decay_good=0.05, decay_bad=0.2):
        compliance = self.compliance_score(agent_id, context)
        current    = self._health.get(agent_id, 1.0)
        is_good    = int(compliance > 0.5)
        decay      = is_good * decay_good + (1 - is_good) * decay_bad
        new_health = max(0.0, min(1.0, current + decay * (compliance - current)))
        self._health[agent_id] = new_health
        if new_health < 0.3:
            self._anomaly_log.insert(0, {
                'tick': self.iteration, 'agent_id': agent_id,
                'health': new_health, 'compliance': compliance,
            })
        return new_health

    def get_health(self, agent_id):
        return self._health.get(agent_id, 1.0)

    def authority_mask(self, agent_id, threshold=0.3, sharpness=10):
        return Semantic.soft_thresh(self.get_health(agent_id), threshold, sharpness)

    def is_quarantined(self, agent_id, threshold=0.15):
        return int(self.get_health(agent_id) < threshold)

    def update_immunity(self):
        vals = list(self._health.values())
        self._immunity = sum(vals) / len(vals) if vals else 1.0
        return self._immunity

    def get_immunity(self): return self._immunity

    def recovery_pulse(self, boost=0.05):
        bonus = self._immunity * boost
        for aid in self._health:
            self._health[aid] = min(1.0, self._health[aid] + bonus)

    def get_anomaly_log(self, last=10):
        return self._anomaly_log[:last]

    def clear_anomaly_log(self):
        self._anomaly_log = []
