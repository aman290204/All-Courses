/**
 * useScrollRestore.ts — Session-scoped scroll position persistence (Phase 5).
 *
 * Saves the scroll container's scrollTop to sessionStorage on scroll
 * (debounced, 200 ms). Restores with behavior: 'instant' on mount — Rule 42.
 * Uses sessionStorage (not localStorage) — scroll position is per-tab,
 * not cross-session.
 */
import { type RefObject, useEffect } from 'react';

const SCROLL_KEY = 'cortexa-scroll-y';
const DEBOUNCE_MS = 200;

export function useScrollRestore(ref: RefObject<HTMLElement | null>): void {
  // Restore on mount (Rule 42 — behavior: 'instant').
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw !== null) {
      const y = parseInt(raw, 10);
      if (!isNaN(y) && y > 0) {
        el.scrollTo({ top: y, behavior: 'instant' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on scroll (debounced).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
        timer = null;
      }, DEBOUNCE_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer !== null) clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
