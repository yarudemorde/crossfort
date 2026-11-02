import settings from "../../data/presentation.settings.json";
import type { ActiveAnimation, VisualFrame } from "./types";
export function frameTiming(frame: VisualFrame, reduced = false) {
  if (reduced)
    return {
      impactMs:
        frame.kind === "destroy" || frame.kind === "vanish"
          ? settings.reducedMotionMs
          : 0,
      durationMs:
        frame.kind === "hit"
          ? 400
          : frame.kind === "sync"
            ? 0
            : settings.reducedMotionMs,
    };
  if (frame.kind === "move")
    return {
      impactMs: settings.movement.stepMs,
      durationMs: settings.movement.stepMs + settings.movement.pauseMs,
    };
  if (frame.kind === "hit") {
    const flight =
      frame.mode === "spell" || frame.mode === "heal" || frame.mode === "boost"
        ? settings.combat.projectileMs
        : frame.sourceRange === 1
          ? settings.combat.meleeMs
          : settings.combat.projectileMs;
    const impactMs = settings.combat.windupMs + flight;
    return { impactMs, durationMs: impactMs + settings.combat.popupMs };
  }
  const durationMs =
    frame.kind === "destroy"
      ? settings.combat.deathMs
      : frame.kind === "territory"
        ? settings.territoryMs
        : frame.kind === "sync"
          ? 0
          : settings.revealMs;
  return {
    impactMs:
      frame.kind === "destroy" || frame.kind === "vanish" ? durationMs : 0,
    durationMs,
  };
}
export type AnimationScheduler = {
  now: () => number;
  request: (fn: (time: number) => void) => number;
  cancel: (id: number) => void;
};
export class AnimationQueue {
  private generation = 0;
  private raf = 0;
  private release?: () => void;
  private serial = 0;
  constructor(
    private scheduler: AnimationScheduler = {
      now: () => performance.now(),
      request: (fn) => requestAnimationFrame(fn),
      cancel: (id) => cancelAnimationFrame(id),
    },
  ) {}
  cancel() {
    this.generation++;
    this.scheduler.cancel(this.raf);
    this.release?.();
    this.release = undefined;
  }
  private wait(ms: number, generation: number) {
    if (ms <= 0) return Promise.resolve();
    const started = this.scheduler.now();
    return new Promise<void>((resolve) => {
      this.release = resolve;
      const tick = (now: number) => {
        if (generation !== this.generation) {
          resolve();
          return;
        }
        if (now - started >= ms) {
          this.release = undefined;
          resolve();
        } else this.raf = this.scheduler.request(tick);
      };
      this.raf = this.scheduler.request(tick);
    });
  }
  async play(
    frames: VisualFrame[],
    callbacks: {
      start: (active: ActiveAnimation) => void;
      impact: (active: ActiveAnimation) => void;
    },
    reduced = false,
  ) {
    this.cancel();
    const generation = this.generation;
    for (const frame of frames) {
      if (generation !== this.generation) return false;
      const active: ActiveAnimation = {
        frame,
        serial: ++this.serial,
        startedAt: this.scheduler.now(),
        impact: false,
        reduced,
      };
      const timing = frameTiming(frame, reduced);
      callbacks.start(active);
      if (timing.impactMs > 0) await this.wait(timing.impactMs, generation);
      if (generation !== this.generation) return false;
      callbacks.impact({ ...active, impact: true });
      // Start the hold after the impact has been committed. A delayed animation
      // frame must never merge impact, counterattack and death into one paint.
      if (timing.durationMs > timing.impactMs)
        await this.wait(timing.durationMs - timing.impactMs, generation);
      if (generation !== this.generation) return false;
    }
    return generation === this.generation;
  }
}
