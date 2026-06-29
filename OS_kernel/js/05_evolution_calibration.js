/**
 * ============================================================
 * KERNEL AGENTIX OS — 05_evolution_calibration.js
 * Module 5: Evolution & Calibration
 * Adaptasi Bobot & Penyesuaian Otomatis (Genetic + Gradient)
 * ============================================================
 * Depends on: corekernel.js
 */
import { AgentixKernel, Semantic } from './corekernel.js';

class EvolutionCalibration extends AgentixKernel {
    constructor(config) {
        super(config);
        this._genomes   = {};   // { id: { weights: [], fitness: 0 } }
        this._pool      = [];   // sorted genome pool
        this._generation = 0;
    }

    // ─────────────────────────────────────────
    // GENOME — a flat weight vector
    // ─────────────────────────────────────────
    registerGenome(id, weights) {
        this._genomes[id] = {
            id,
            weights: [...weights],
            fitness: 0,
            age:     0,
        };
        this._pool.push(this._genomes[id]);
        return this;
    }

    getWeights(id)   { return this._genomes[id]?.weights || []; }
    getFitness(id)   { return this._genomes[id]?.fitness || 0; }

    setFitness(id, score) {
        if (this._genomes[id]) this._genomes[id].fitness = score;
    }

    // ─────────────────────────────────────────
    // MUTATION — Gaussian perturbation
    // No if-then: mutation rate applied via mask
    // ─────────────────────────────────────────
    mutate(id, mutationRate = 0.1, sigma = 0.2) {
        const g = this._genomes[id];
        if (!g) return;
        g.weights = g.weights.map(w => {
            const doMutate = +(Math.random() < mutationRate);
            const noise    = this._gaussianNoise(0, sigma);
            return w + doMutate * noise;
        });
    }

    _gaussianNoise(mean, sigma) {
        // Box-Muller transform
        const u1 = Math.random() + 1e-12;
        const u2 = Math.random();
        return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // ─────────────────────────────────────────
    // CROSSOVER — blend two parent genomes
    // Uniform crossover: each gene from either parent
    // ─────────────────────────────────────────
    crossover(idA, idB, childId) {
        const ga = this._genomes[idA];
        const gb = this._genomes[idB];
        if (!ga || !gb) return;
        const weights = ga.weights.map((w, i) => {
            const useA = +(Math.random() > 0.5);
            return useA * w + (1 - useA) * (gb.weights[i] || w);
        });
        this.registerGenome(childId, weights);
    }

    // ─────────────────────────────────────────
    // SELECTION — tournament selection
    // Returns winner id (higher fitness wins)
    // ─────────────────────────────────────────
    tournamentSelect(candidateIds, k = 3) {
        const sample  = candidateIds.sort(() => Math.random() - 0.5).slice(0, k);
        let bestId    = sample[0];
        let bestFit   = this.getFitness(sample[0]);
        sample.forEach(id => {
            const f   = this.getFitness(id);
            const win = +(f > bestFit);
            bestFit   = bestFit * (1 - win) + f * win;
            bestId    = [bestId, id][win];
        });
        return bestId;
    }

    // ─────────────────────────────────────────
    // ELITISM — preserve top N genomes
    // ─────────────────────────────────────────
    eliteIds(n = 2) {
        return [...this._pool]
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, n)
            .map(g => g.id);
    }

    // ─────────────────────────────────────────
    // EVOLVE GENERATION — full GA cycle
    // keepElite: IDs to preserve unchanged
    // ─────────────────────────────────────────
    evolveGeneration(mutationRate = 0.1, sigma = 0.2, eliteCount = 2) {
        const allIds  = this._pool.map(g => g.id);
        const elites  = this.eliteIds(eliteCount);

        // Breed new children for non-elite slots
        allIds.filter(id => !elites.includes(id)).forEach(id => {
            const pA = this.tournamentSelect(allIds);
            const pB = this.tournamentSelect(allIds);
            this.crossover(pA, pB, id);
            this.mutate(id, mutationRate, sigma);
        });

        this._generation++;
        return this._generation;
    }

    // ─────────────────────────────────────────
    // GRADIENT CALIBRATION (online, per-weight)
    // Single-weight perturbation → estimate gradient
    // ─────────────────────────────────────────
    calibrateWeight(id, weightIndex, evalFn, epsilon = 0.01) {
        const g = this._genomes[id];
        if (!g) return;
        const original   = g.weights[weightIndex];
        g.weights[weightIndex] = original + epsilon;
        const fPlus = evalFn(g.weights);
        g.weights[weightIndex] = original - epsilon;
        const fMinus = evalFn(g.weights);
        const grad = (fPlus - fMinus) / (2 * epsilon);
        g.weights[weightIndex] = original + 0.01 * grad;  // small step
    }

    // ─────────────────────────────────────────
    // ADAPTIVE DECAY — auto-adjust weight decay
    // Uses fitness signal to modulate decay rate
    // ─────────────────────────────────────────
    adaptiveDecay(id, baseFitness, currentFitness, baseDecay = 0.99) {
        const improvement = Semantic.softThresh(currentFitness - baseFitness, 0, 5.0);
        // More improvement → less decay (keep exploring)
        const decay = baseDecay * (1 - 0.1 * improvement);
        const g = this._genomes[id];
        if (!g) return;
        g.weights = g.weights.map(w => w * decay);
    }

    // ─────────────────────────────────────────
    // STATS
    // ─────────────────────────────────────────
    stats() {
        const fits = this._pool.map(g => g.fitness);
        const max  = Math.max(...fits);
        const avg  = fits.reduce((a, b) => a + b, 0) / (fits.length || 1);
        return { generation: this._generation, maxFitness: max, avgFitness: avg };
    }
}

export { EvolutionCalibration };
