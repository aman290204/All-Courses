import { useEffect, useState } from "react";

/**
 * useReducedMotion — subscribes to the prefers-reduced-motion media query.
 *
 * Returns true when the OS-level "reduce motion" setting is enabled.
 * The loader's CSS already handles reduced motion via a media query (the
 * cinematic hold is preserved, animations collapse to their end state).
 * This hook exists for components that need to make JS-level decisions
 * (e.g. disabling an entrance transition entirely rather than collapsing
 * its duration). Available for Phase 3+ consumers.
 *
 * SSR-safe: returns false during server render, then re-evaluates on mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent): void => setReduced(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

export default useReducedMotion;
