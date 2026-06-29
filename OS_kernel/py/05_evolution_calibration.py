"""
============================================================
KERNEL AGENTIX OS — 05_evolution_calibration.py
Module 5: Evolution & Calibration
Adaptasi Bobot & Penyesuaian Otomatis
============================================================
Depends on: corekernel.py
"""
import math, random
from corekernel import AgentixKernel, Semantic


class EvolutionCalibration(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._genomes    = {}
        self._pool       = []
        self._generation = 0

    def register_genome(self, gid, weights):
        g = {'id': gid, 'weights': list(weights), 'fitness': 0.0, 'age': 0}
        self._genomes[gid] = g
        self._pool.append(g)
        return self

    def get_weights(self, gid):  return list(self._genomes[gid]['weights']) if gid in self._genomes else []
    def get_fitness(self, gid):  return self._genomes.get(gid, {}).get('fitness', 0.0)
    def set_fitness(self, gid, score):
        if gid in self._genomes: self._genomes[gid]['fitness'] = score

    def mutate(self, gid, mutation_rate=0.1, sigma=0.2):
        g = self._genomes.get(gid)
        if not g: return
        g['weights'] = [
            w + (1 if random.random() < mutation_rate else 0) * self._gaussian(0, sigma)
            for w in g['weights']
        ]

    def _gaussian(self, mean, sigma):
        u1 = random.random() + 1e-12
        u2 = random.random()
        return mean + sigma * math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

    def crossover(self, id_a, id_b, child_id):
        ga, gb = self._genomes.get(id_a), self._genomes.get(id_b)
        if not ga or not gb: return
        weights = [
            ga['weights'][i] if random.random() > 0.5 else gb['weights'][i]
            for i in range(len(ga['weights']))
        ]
        self.register_genome(child_id, weights)

    def tournament_select(self, candidate_ids, k=3):
        sample   = random.sample(candidate_ids, min(k, len(candidate_ids)))
        best_id  = sample[0]
        best_fit = self.get_fitness(sample[0])
        for gid in sample:
            f = self.get_fitness(gid)
            if f > best_fit:
                best_fit, best_id = f, gid
        return best_id

    def elite_ids(self, n=2):
        return [g['id'] for g in sorted(self._pool, key=lambda g: -g['fitness'])[:n]]

    def evolve_generation(self, mutation_rate=0.1, sigma=0.2, elite_count=2):
        all_ids = [g['id'] for g in self._pool]
        elites  = self.elite_ids(elite_count)
        for gid in all_ids:
            if gid in elites: continue
            pa = self.tournament_select(all_ids)
            pb = self.tournament_select(all_ids)
            self.crossover(pa, pb, gid)
            self.mutate(gid, mutation_rate, sigma)
        self._generation += 1
        return self._generation

    def calibrate_weight(self, gid, weight_index, eval_fn, epsilon=0.01):
        g = self._genomes.get(gid)
        if not g: return
        original = g['weights'][weight_index]
        g['weights'][weight_index] = original + epsilon
        f_plus  = eval_fn(g['weights'])
        g['weights'][weight_index] = original - epsilon
        f_minus = eval_fn(g['weights'])
        grad = (f_plus - f_minus) / (2 * epsilon)
        g['weights'][weight_index] = original + 0.01 * grad

    def adaptive_decay(self, gid, base_fitness, current_fitness, base_decay=0.99):
        improvement = Semantic.soft_thresh(current_fitness - base_fitness, 0, 5.0)
        decay = base_decay * (1 - 0.1 * improvement)
        g = self._genomes.get(gid)
        if g: g['weights'] = [w * decay for w in g['weights']]

    def stats(self):
        fits = [g['fitness'] for g in self._pool]
        return {
            'generation':   self._generation,
            'max_fitness':  max(fits) if fits else 0,
            'avg_fitness':  sum(fits) / len(fits) if fits else 0,
        }
