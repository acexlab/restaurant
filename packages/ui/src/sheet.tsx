'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** Critically damped spring (damping 1.0). Response in seconds, as Apple specifies it. */
const RESPONSE = 0.32;
const OMEGA = (2 * Math.PI) / RESPONSE;

/**
 * Apple's momentum projection: where a flick at v (px/s) would come to rest.
 * 0.99 ("snappier"), not scroll's 0.998: at 0.998 a slow 40px nudge already projected past half and closed.
 */
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate);

/** Progressive resistance past a boundary instead of a hard stop. */
const rubberband = (overshoot: number, dimension: number, c = 0.55) => (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Bottom sheet that behaves like a physical object:
 * - follows the finger 1:1 from where it was grabbed, rubber-bands past the top;
 * - on release, projects the flick to decide close vs. stay, then springs with the finger's velocity;
 * - can be grabbed mid-animation (motion always starts from the on-screen position);
 * - leaves the way it came (down), with a dimming scrim; Escape and the scrim close it.
 * Reduced motion: no slide or spring, it simply appears and disappears.
 */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const y = useRef(0); // presentation value: current on-screen offset, 0 = fully open
  const raf = useRef<number | null>(null);
  const releaseVelocity = useRef(0);
  const drag = useRef<{ startY: number; y0: number; history: { t: number; y: number }[] } | null>(null);

  const height = () => panel.current?.offsetHeight ?? 600;
  const apply = (v: number) => {
    y.current = v;
    if (panel.current) panel.current.style.transform = `translate3d(0, ${v}px, 0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, Math.max(0, 1 - v / height())));
  };
  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  /** x(t) = target + (x0 + (v0 + ωx0)t)e^(−ωt): starts at the current value with the given velocity, no overshoot. */
  const springTo = (target: number, v0 = 0, done?: () => void) => {
    stop();
    if (reducedMotion()) {
      apply(target);
      done?.();
      return;
    }
    const x0 = y.current - target;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const x = (x0 + (v0 + OMEGA * x0) * t) * Math.exp(-OMEGA * t);
      apply(target + x);
      if ((Math.abs(x) < 0.5 && t > 0.05) || t > 2) {
        apply(target);
        raf.current = null;
        done?.();
      } else raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    if (open) setMounted(true);
    else if (mounted) springTo(height(), releaseVelocity.current, () => setMounted(false));
    releaseVelocity.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Enter from below, then focus the sheet so keyboard and screen readers land inside it.
  useLayoutEffect(() => {
    if (!mounted || !open) return;
    apply(height());
    springTo(0);
    panel.current?.focus({ preventScroll: true });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    stop(); // interrupt: continue from the current on-screen position
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, y0: y.current, history: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = d.y0 + (e.clientY - d.startY);
    apply(next < 0 ? -rubberband(-next, height()) : next);
    d.history = [...d.history.slice(-4), { t: e.timeStamp, y: e.clientY }];
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const v = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0; // px/s
    if (y.current + project(v) > height() * 0.5) {
      releaseVelocity.current = v;
      onClose();
    } else springTo(0, v);
  };

  return (
    <div className="fixed inset-0 z-30" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div ref={scrim} aria-hidden className="absolute inset-0 bg-stone-950/40" style={{ opacity: 0 }} onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ transform: 'translate3d(0, 100vh, 0)', willChange: 'transform' }}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[1.25rem] bg-white shadow-[0_-12px_40px_-12px_rgb(30_25_21/0.35)] outline-none"
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="sticky top-0 z-10 flex cursor-grab touch-none justify-center bg-white/90 pb-2 pt-2.5 active:cursor-grabbing"
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-stone-300" />
        </div>
        <div className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
