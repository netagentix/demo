// telemetry.js – simple telemetry recorder for fps and jitter
export default class Telemetry {
  constructor() {
    this.fpsHistory = [];
    this.jitterHistory = [];
    this.prevDelta = null;
  }

  /** Record a frame's delta time (ms) and compute fps & jitter */
  record(delta) {
    const fps = 1000 / Math.max(0.1, delta);
    this.fpsHistory.push(fps);
    if (this.prevDelta !== null) {
      const jitter = Math.abs(delta - this.prevDelta);
      this.jitterHistory.push(jitter);
    }
    this.prevDelta = delta;
  }

  /** Get average fps and jitter over the recorded history */
  getAverages() {
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      avgFps: avg(this.fpsHistory),
      avgJitter: avg(this.jitterHistory)
    };
  }
}
