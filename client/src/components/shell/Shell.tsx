/**
 * Shell.tsx — Top-level chrome: composes Drawer, Header, Sidebar, Main
 * (which receives `children` — the ArchiveTree or the empty state),
 * and Footer.
 *
 * The Shell wires the search input ref so a single ⌘K/Ctrl+K listener
 * here can focus the input regardless of which child component owns it.
 * Esc clears focus first, then query (uiStore.clearFocusOrQuery).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { Drawer } from './Drawer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import styles from './Shell.module.css';

export interface ShellProps {
  readonly children: ReactNode;
}

export function Shell({ children }: ShellProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const clearFocusOrQuery = useUIStore((s) => s.clearFocusOrQuery);

  useScrollRestore(mainRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (k === 'escape') {
        clearFocusOrQuery();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearFocusOrQuery]);

  return (
    <div className={`fade-up ${styles.shell}`}>
      <Drawer />
      <Header searchInputRef={inputRef} />
      <div className={styles.body}>
        <Sidebar />
        <main ref={mainRef} className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
