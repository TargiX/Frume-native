import React, { createContext, useContext } from 'react';

import { usePuzzleSession } from '../hooks/usePuzzleSession';

type PuzzleSessionContextValue = ReturnType<typeof usePuzzleSession>;

const PuzzleSessionContext = createContext<PuzzleSessionContextValue | null>(null);

export function PuzzleSessionProvider({ children }: { children: React.ReactNode }) {
  const value = usePuzzleSession();
  return <PuzzleSessionContext.Provider value={value}>{children}</PuzzleSessionContext.Provider>;
}

export function usePuzzleSessionContext(): PuzzleSessionContextValue {
  const context = useContext(PuzzleSessionContext);
  if (!context) {
    throw new Error('usePuzzleSessionContext must be used within PuzzleSessionProvider');
  }
  return context;
}
