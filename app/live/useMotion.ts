"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Feeds Motion Duel: reports how much the phone is moving, as the magnitude of
 * the change between consecutive accelerometer samples (orientation-agnostic,
 * no gravity baseline to subtract).
 *
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from a user gesture,
 * so arming is an explicit call wired to a button. Laptops and desktops have
 * no accelerometer at all - there, pointer movement stands in, which keeps the
 * game playable at a desk and demoable in a browser.
 *
 * The consumer throttles what it sends; this hook just reports every sample.
 */

export type MotionStatus = "idle" | "armed" | "denied";

type MaybePermissioned = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function useMotion(active: boolean, onMagnitude: (magnitude: number) => void) {
  const [status, setStatus] = useState<MotionStatus>("idle");
  // Kept in a ref so the listener effect below does not resubscribe on every
  // render just because the caller passed a fresh closure. Written in an effect
  // rather than during render, which React forbids.
  const report = useRef(onMagnitude);
  useEffect(() => {
    report.current = onMagnitude;
  }, [onMagnitude]);

  const arm = useCallback(async () => {
    const DM = (typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : null) as MaybePermissioned | null;
    if (DM?.requestPermission) {
      try {
        setStatus((await DM.requestPermission()) === "granted" ? "armed" : "denied");
      } catch {
        setStatus("denied"); // Safari throws when not called from a gesture.
      }
    } else {
      // No permission gate on this platform; the listeners below just work
      // (or never fire, in which case the pointer fallback carries it).
      setStatus("armed");
    }
  }, []);

  useEffect(() => {
    if (!active || status !== "armed") return;

    let last: { x: number; y: number; z: number } | null = null;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      if (last) {
        report.current(Math.hypot(a.x - last.x, a.y - last.y, a.z - last.z));
      }
      last = { x: a.x, y: a.y, z: a.z };
    };

    // Desk fallback: dragging the pointer is "moving the phone". Scaled so a
    // lazy wiggle registers and a violent shake clearly flinches.
    let lastPointer: { x: number; y: number } | null = null;
    const onPointer = (event: PointerEvent) => {
      if (lastPointer) {
        report.current(Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) / 14);
      }
      lastPointer = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("pointermove", onPointer);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [active, status]);

  return { status, arm };
}
