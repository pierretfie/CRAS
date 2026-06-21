import { useState, useEffect } from "react";

// Shared state for the drawer open/close
let drawerOpen = false;
const listeners = new Set<(open: boolean) => void>();

function setDrawerOpen(open: boolean) {
  drawerOpen = open;
  listeners.forEach((l) => l(open));
}

export function useAIDrawer() {
  const [isOpen, setIsOpen] = useState(drawerOpen);

  useEffect(() => {
    const listener = (open: boolean) => setIsOpen(open);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    isOpen,
    open: () => setDrawerOpen(true),
    close: () => setDrawerOpen(false),
    toggle: () => setDrawerOpen(!drawerOpen),
  };
}
