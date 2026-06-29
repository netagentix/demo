"""
============================================================
KERNEL AGENTIX OS — 10_intent_anchoring.py
Module 10: Intent Anchoring
Penerjemah Niat Luar Menjadi Jangkar Topologi
============================================================
Depends on: corekernel.py
"""
from corekernel import AgentixKernel, Vector, Semantic


class IntentAnchoring(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._anchors      = {}
        self._global_goals = {}

    def set_anchor(self, agent_id, intent_name, weight=1.0, target=None,
                   valence_target=None, decay=1.0, ttl=float('inf')):
        self._anchors.setdefault(agent_id, {})[intent_name] = {
            'weight':         max(0.0, min(1.0, weight)),
            'target':         list(target) if target else None,
            'valence_target': valence_target,
            'decay':          decay,
            'born':           self.iteration,
            'ttl':            ttl,
        }

    def clear_anchor(self, agent_id, intent_name):
        if agent_id in self._anchors:
            self._anchors[agent_id].pop(intent_name, None)

    def clear_all_anchors(self, agent_id):
        self._anchors[agent_id] = {}

    def resolve_anchors(self, agent_id):
        anchors = self._anchors.get(agent_id, {})
        now     = self.iteration
        active  = {}
        dead    = []
        for name, a in anchors.items():
            age      = now - a['born']
            is_alive = age < a['ttl']
            a['weight'] = max(0.0, a['weight'] * a['decay'])
            if a['weight'] > 1e-4 and is_alive:
                active[name] = a
            else:
                dead.append(name)
        for name in dead:
            del anchors[name]
        return active

    def intent_force(self, agent_id, agent_pos):
        net = Vector.zero()
        for a in self.resolve_anchors(agent_id).values():
            if not a or not a['target']: continue
            diff = Vector.sub(a['target'], agent_pos)
            dist = Vector.norm(diff) + 1e-12
            net  = Vector.add(net, Vector.mul(Vector.div(diff, dist), a['weight']))
        return net

    def valence_pull(self, agent_id, context):
        active  = self.resolve_anchors(agent_id)
        entries = [a for a in active.values() if a and a.get('valence_target')]
        if not entries: return 0.0
        pulls = [
            abs(context.get(a['valence_target']['field'], 0.0) - a['valence_target']['value']) * a['weight']
            for a in entries
        ]
        return min(1.0, sum(pulls) / len(pulls))

    def set_global_goal(self, goal_name, target, weight=0.5):
        self._global_goals[goal_name] = {'target': list(target), 'weight': weight}

    def global_intent_force(self, agent_pos):
        net = Vector.zero()
        for g in self._global_goals.values():
            diff = Vector.sub(g['target'], agent_pos)
            dist = Vector.norm(diff) + 1e-12
            net  = Vector.add(net, Vector.mul(Vector.div(diff, dist), g['weight']))
        return net

    def composite_force(self, agent_id, agent_pos, global_blend=0.3):
        local_f  = self.intent_force(agent_id, agent_pos)
        global_f = self.global_intent_force(agent_pos)
        return Vector.add(
            Vector.mul(local_f,  1.0 - global_blend),
            Vector.mul(global_f, global_blend),
        )

    def anchor_summary(self, agent_id):
        return [
            {'intent': name, 'weight': round(a['weight'], 3), 'has_target': bool(a['target'])}
            for name, a in self.resolve_anchors(agent_id).items()
        ]
