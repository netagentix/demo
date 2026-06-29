"""
============================================================
KERNEL AGENTIX OS — 09_memory_condensation.py
Module 9: Memory Condensation
Penyimpanan Pola Setimbang / State Persistence
============================================================
Depends on: corekernel.py
"""
import math, json, copy
from corekernel import AgentixKernel


class MemoryCondensation(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._engrams    = {}
        self._snapshots  = {}
        self._max_engrams = (config or {}).get('memory', {}).get('max_engrams', 64)

    def condense(self, namespace, key, vector, weight=1.0):
        self._engrams.setdefault(namespace, [])
        existing = next((e for e in self._engrams[namespace] if e['key'] == key), None)
        if existing:
            existing['vector'] = [v*0.8 + (vector[i] if i < len(vector) else 0)*0.2
                                  for i, v in enumerate(existing['vector'])]
            existing['weight'] = min(1.0, existing['weight'] + weight * 0.1)
            existing['born']   = self.iteration
            return
        self._engrams[namespace].append({
            'key':    key,
            'vector': list(vector),
            'weight': min(1.0, weight),
            'born':   self.iteration,
        })
        if len(self._engrams[namespace]) > self._max_engrams:
            self._engrams[namespace].sort(key=lambda e: e['weight'])
            self._engrams[namespace].pop(0)

    def recall(self, namespace, query_vector, top_k=3):
        engrams = self._engrams.get(namespace, [])
        scored  = [
            {
                'key':        e['key'],
                'weight':     e['weight'],
                'similarity': self._cosine_sim(query_vector, e['vector']) * e['weight'],
                'engram':     e,
            }
            for e in engrams
        ]
        return sorted(scored, key=lambda x: -x['similarity'])[:top_k]

    def _cosine_sim(self, a, b):
        dot   = sum(a[i] * (b[i] if i < len(b) else 0) for i in range(len(a)))
        norm_a = math.sqrt(sum(v**2 for v in a)) + 1e-12
        norm_b = math.sqrt(sum(v**2 for v in b)) + 1e-12
        return dot / (norm_a * norm_b)

    def best_match_valence(self, namespace, query_vector):
        matches = self.recall(namespace, query_vector, 1)
        return max(0.0, matches[0]['similarity']) if matches else 0.0

    def decay_engrams(self, namespace, decay_rate=0.995, min_weight=0.05):
        if namespace not in self._engrams: return
        self._engrams[namespace] = [
            {**e, 'weight': e['weight'] * decay_rate}
            for e in self._engrams[namespace]
            if e['weight'] * decay_rate >= min_weight
        ]

    def decay_all(self, decay_rate=0.995):
        for ns in list(self._engrams): self.decay_engrams(ns, decay_rate)

    def save_snapshot(self, slot_name, state_object):
        self._snapshots[slot_name] = copy.deepcopy(state_object)

    def load_snapshot(self, slot_name):
        return copy.deepcopy(self._snapshots[slot_name]) if slot_name in self._snapshots else None

    def has_snapshot(self, slot_name): return slot_name in self._snapshots
    def list_snapshots(self):          return list(self._snapshots.keys())

    def is_equilibrium(self, namespace, query_vector, threshold=0.85):
        return int(self.best_match_valence(namespace, query_vector) >= threshold)

    def stats(self, namespace):
        engrams = self._engrams.get(namespace, [])
        avg_w   = sum(e['weight'] for e in engrams) / len(engrams) if engrams else 0.0
        return {
            'count':     len(engrams),
            'avg_weight': avg_w,
            'snapshots': len(self._snapshots),
        }
