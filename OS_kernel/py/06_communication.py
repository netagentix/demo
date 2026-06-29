"""
============================================================
KERNEL AGENTIX OS — 06_communication.py
Module 6: Communication Interface
Transmisi Valensi Antar-Agen (Valence Bus)
============================================================
Depends on: corekernel.py
"""
from corekernel import AgentixKernel, Vector, Semantic


class CommunicationInterface(AgentixKernel):
    def __init__(self, config=None):
        super().__init__(config)
        self._bus      = []
        self._channels = {}
        self._inbox    = {}
        self._max_age  = (config or {}).get('comm', {}).get('max_age', 30)

    def broadcast(self, sender_id, channel, valence, pos=None, data=None):
        packet = {
            'sender_id': sender_id,
            'channel':   channel,
            'valence':   max(-1.0, min(1.0, valence)),
            'pos':       list(pos) if pos else None,
            'data':      dict(data or {}),
            'born':      self.iteration,
        }
        self._bus.append(packet)
        self._channels.setdefault(channel, []).append(packet)

    def send(self, sender_id, target_id, valence, data=None):
        self._inbox.setdefault(target_id, []).append({
            'sender_id': sender_id,
            'valence':   valence,
            'data':      dict(data or {}),
            'born':      self.iteration,
        })

    def read_inbox(self, agent_id):
        msgs = self._inbox.get(agent_id, [])
        self._inbox[agent_id] = []
        return msgs

    def scan_channel(self, channel, reader_pos=None, radius=float('inf')):
        result = []
        for p in self._channels.get(channel, []):
            age      = self.iteration - p['born']
            age_mask = int(age <= self._max_age)
            freshness = Semantic.decay(1.0, 0.97 ** age)
            spatial_w = 1.0
            if reader_pos and p['pos']:
                dist      = Vector.dist(reader_pos, p['pos'])
                spatial_w = Semantic.proximity(dist, radius)
            weight = age_mask * freshness * spatial_w
            if weight > 1e-4:
                result.append({**p, 'weight': weight})
        return result

    def aggregate_channel(self, channel, reader_pos=None, radius=float('inf')):
        packets = self.scan_channel(channel, reader_pos, radius)
        if not packets: return 0.0
        total_w = sum(p['weight'] for p in packets) + 1e-12
        sum_val = sum(p['valence'] * p['weight'] for p in packets)
        return sum_val / total_w

    def channel_consensus(self, channel):
        agg = self.aggregate_channel(channel)
        return (1 if agg > 0 else (-1 if agg < 0 else 0))

    def proximity_scan(self, reader_pos, radius):
        now = self.iteration
        out = []
        for p in self._bus:
            age     = now - p['born']
            alive   = age <= self._max_age
            in_range = not p['pos'] or Vector.dist(reader_pos, p['pos']) <= radius
            if alive and in_range:
                out.append({**p, 'dist': Vector.dist(reader_pos, p['pos']) if p['pos'] else 0.0})
        return out

    def flush_expired(self):
        now = self.iteration
        self._bus = [p for p in self._bus if (now - p['born']) <= self._max_age]
        for ch in list(self._channels):
            self._channels[ch] = [p for p in self._channels[ch] if (now - p['born']) <= self._max_age]

    def relay(self, packet, relayer_id, decay=0.8):
        self.broadcast(
            relayer_id,
            packet['channel'],
            packet['valence'] * decay,
            packet.get('pos'),
            {**packet.get('data', {}), 'relayed': True},
        )
