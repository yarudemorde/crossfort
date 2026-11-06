import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Coord } from "../../game/types";
import settings from "../../../data/presentation.settings.json";
import { MapGestureController } from "./gestures";
import {
  xy,
  toScreen,
  fitMapCamera,
  type MapBounds,
  type Camera,
  type Point,
} from "./geometry";
export function useMapGestures(
  bounds: MapBounds,
  key: string,
  initialBounds?: MapBounds,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef(new MapGestureController());
  const [camera, setCamera] = useState<Camera>(controller.current.camera);
  const sizeRef = useRef({ width: 0, height: 0 });
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const raf = useRef(0);
  const autoRaf = useRef(0);
  const publish = useCallback(() => {
    if (!raf.current)
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        setCamera({ ...controller.current.camera });
      });
  }, []);
  const stopAuto = useCallback(() => {
    cancelAnimationFrame(autoRaf.current);
    autoRaf.current = 0;
  }, []);
  const go = useCallback(
    (target: Camera, smooth: boolean) => {
      stopAuto();
      const from = { ...controller.current.camera };
      if (
        !smooth ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        controller.current.camera = target;
        setCamera({ ...target });
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / settings.camera.focusMs),
          ease = t * t * (3 - 2 * t);
        controller.current.camera = {
          scale: target.scale,
          x: from.x + (target.x - from.x) * ease,
          y: from.y + (target.y - from.y) * ease,
        };
        publish();
        if (t < 1) autoRaf.current = requestAnimationFrame(tick);
      };
      autoRaf.current = requestAnimationFrame(tick);
    },
    [publish, stopAuto],
  );
  const focus = useCallback(
    (coord: Coord, smooth = true) => {
      const c = controller.current.camera,
        p = xy(coord),
        s = sizeRef.current;
      go(
        {
          ...c,
          x: s.width / 2 - p.x * c.scale,
          y: (s.height - settings.camera.toolbarInsetPx) / 2 - p.y * c.scale,
        },
        smooth,
      );
    },
    [go],
  );
  const fit = useCallback(
    (smooth = true) => {
      go(fitMapCamera(boundsRef.current, sizeRef.current), smooth);
    },
    [go],
  );
  const ensureVisible = useCallback(
    (points: Point[]) => {
      const s = sizeRef.current,
        c = controller.current.camera;
      if (!points.length || controller.current.pointers.size) return;
      const p = points.map((x) => toScreen(c, x));
      const minX = Math.min(...p.map((x) => x.x)),
        maxX = Math.max(...p.map((x) => x.x)),
        minY = Math.min(...p.map((x) => x.y)),
        maxY = Math.max(...p.map((x) => x.y));
      const margin = 48;
      const dx =
        minX < margin
          ? margin - minX
          : maxX > s.width - margin
            ? s.width - margin - maxX
            : 0;
      const dy =
        minY < margin
          ? margin - minY
          : maxY > s.height - margin
            ? s.height - margin - maxY
            : 0;
      if (dx || dy) go({ ...c, x: c.x + dx, y: c.y + dy }, true);
    },
    [go],
  );
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let initialized = false;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      if (!next.width || !next.height) return;
      if (
        next.width === sizeRef.current.width &&
        next.height === sizeRef.current.height &&
        initialized
      )
        return;
      sizeRef.current = next;
      if (!initialized) {
        initialized = true;
        go(fitMapCamera(initialBounds ?? boundsRef.current, next), false);
      }
      // UI panels change the visible area, never the camera. Recentring here
      // made every card selection and hand toggle move the battlefield.
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAuto();
      const r = el.getBoundingClientRect();
      const delta =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
      controller.current.zoom(
        { x: e.clientX - r.left, y: e.clientY - r.top },
        Math.exp(
          -delta * settings.camera.wheelSensitivity * (e.ctrlKey ? 2 : 1),
        ),
      );
      publish();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      stopAuto();
      controller.current.pointers.clear();
    };
    // A new battle resets the camera; UI resizing only updates camera bounds.
  }, [key]);
  const point = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return {
    viewport,
    camera,
    focus,
    fit,
    ensureVisible,
    zoom: (factor: number) => {
      stopAuto();
      const s = sizeRef.current;
      controller.current.zoom({ x: s.width / 2, y: s.height / 2 }, factor);
      publish();
    },
    bindings: {
      onPointerDownCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        stopAuto();
        controller.current.down(e.pointerId, point(e));
        if (controller.current.pointers.size > 1)
          e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMoveCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (controller.current.move(e.pointerId, point(e))) {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          publish();
        }
      },
      onPointerUpCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
        controller.current.up(e.pointerId);
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
        controller.current.up(e.pointerId, true);
      },
      onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (
          e.target === e.currentTarget &&
          !e.currentTarget.hasPointerCapture(e.pointerId)
        )
          controller.current.up(e.pointerId);
      },
      onClickCapture: (e: ReactMouseEvent<HTMLDivElement>) => {
        if (controller.current.suppressClick && e.detail !== 0) {
          controller.current.suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}
