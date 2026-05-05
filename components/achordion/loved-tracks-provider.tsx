"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type LovedTracksContextValue = {
  isLoved: (mbid: string | null | undefined) => boolean;
  setLoved: (mbid: string, score: 0 | 1 | -1) => void;
};

const LovedTracksContext = createContext<LovedTracksContextValue | null>(null);

export function LovedTracksProvider({
  initialLoved,
  children,
}: {
  initialLoved: string[];
  children: ReactNode;
}) {
  const [loved, setLovedSet] = useState<Set<string>>(
    () => new Set(initialLoved),
  );

  const isLoved = useCallback(
    (mbid: string | null | undefined) => !!mbid && loved.has(mbid),
    [loved],
  );

  const setLoved = useCallback((mbid: string, score: 0 | 1 | -1) => {
    setLovedSet((prev) => {
      const next = new Set(prev);
      if (score === 1) next.add(mbid);
      else next.delete(mbid);
      return next;
    });
  }, []);

  return (
    <LovedTracksContext.Provider value={{ isLoved, setLoved }}>
      {children}
    </LovedTracksContext.Provider>
  );
}

/**
 * Returns isLoved/setLoved bound to the nearest LovedTracksProvider.
 *
 * Falls back to no-ops when no provider is mounted (e.g. signed-out trees),
 * so the hook is safe to call from anywhere without try/catch.
 */
export function useLoved(): LovedTracksContextValue {
  const ctx = useContext(LovedTracksContext);
  return (
    ctx ?? {
      isLoved: () => false,
      setLoved: () => {},
    }
  );
}
