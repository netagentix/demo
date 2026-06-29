"""
============================================================
KERNEL AGENTIX OS — 03_temporal_dynamics.py
Module 3: Temporal Dynamics
Waktu · Sumasi Sinyal · Frekuensi
============================================================
Depends on: corekernel.py
"""
import math
from collections import deque
from corekernel import AgentixKernel, Semantic


class TemporalDynamics(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._clocks      = {}
        self._signals     = {}
        self._oscillators = {}
        self._history     = {}

    # ─── CLOCK ───────────────────────────────
    def register_clock(self, name, phase=0):
        self._clocks[name] = {'tick': phase}

    def tick_clock(self, name, pause_mask=0):
        c = self._clocks.get(name)
        if not c: return 0
        c['tick'] += (1 - pause_mask)
        return c['tick']

    def reset_clock(self, name):
        if name in self._clocks: self._clocks[name]['tick'] = 0

    def get_clock(self, name):
        return self._clocks.get(name, {}).get('tick', 0)

    def phase_gate(self, clock_name, period):
        t = self.get_clock(clock_name)
        return int(t > 0 and int(t) % max(1, round(period)) == 0)

    # ─── SIGNAL ACCUMULATOR (leaky integrator) ───
    def register_signal(self, name, initial=0.0):
        self._signals[name] = initial

    def integrate_signal(self, name, inp, decay=0.9, max_val=1.0):
        prev = self._signals.get(name, 0.0)
        self._signals[name] = max(0.0, min(max_val, prev * decay + inp))
        return self._signals[name]

    def get_signal(self, name):
        return self._signals.get(name, 0.0)

    def sum_signals(self, signal_names, weights):
        return sum(
            self._signals.get(n, 0.0) * weights[i]
            for i, n in enumerate(signal_names)
        )

    # ─── OSCILLATOR ──────────────────────────
    def register_oscillator(self, name, freq=0.01, phase=0.0, amplitude=1.0):
        self._oscillators[name] = {'freq': freq, 'phase': phase, 'amplitude': amplitude}

    def sample_oscillator(self, name):
        osc = self._oscillators.get(name)
        if not osc: return 0.0
        t = self.iteration
        return osc['amplitude'] * (0.5 + 0.5 * math.sin(2*math.pi * osc['freq'] * t + osc['phase']))

    def pulse_oscillator(self, name):
        osc = self._oscillators.get(name)
        if not osc: return 0.0
        period = max(1, round(1 / (osc['freq'] + 1e-12)))
        return float(self.iteration % period == 0) * osc['amplitude']

    # ─── ROLLING HISTORY ─────────────────────
    def register_history(self, name, buffer_size=30):
        self._history[name] = {'buf': deque([0.0]*buffer_size, maxlen=buffer_size), 'size': buffer_size}

    def push_history(self, name, value):
        h = self._history.get(name)
        if h: h['buf'].append(value)

    def moving_avg(self, name, n):
        h = self._history.get(name)
        if not h: return 0.0
        buf = list(h['buf'])[-n:]
        return sum(buf) / len(buf) if buf else 0.0

    def trend_valence(self, name, n=10):
        h = self._history.get(name)
        if not h: return 0.0
        buf = list(h['buf'])
        recent = buf[-1] if buf else 0.0
        old    = buf[-n] if len(buf) >= n else buf[0] if buf else 0.0
        return Semantic.sym_norm(recent - old, 1.0)

    # ─── FREQUENCY DETECTOR ──────────────────
    def register_freq_detector(self, name, window=60):
        self.register_history('_freq_' + name, window)

    def record_event(self, name):
        self.push_history('_freq_' + name, 1.0)

    def sample_freq(self, name):
        h = self._history.get('_freq_' + name)
        size = h['size'] if h else 60
        self.push_history('_freq_' + name, 0.0)
        return self.moving_avg('_freq_' + name, size)
