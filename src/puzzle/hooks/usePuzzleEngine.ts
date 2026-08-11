import { useEffect, useState } from 'react';

import type { PuzzleEngine } from '../engine';
import type { PuzzleEngineState } from '../types';

/** Subscribes to an existing engine instance — does not create a new one. */
export function usePuzzleEngine(engine: PuzzleEngine | null) {
  const [state, setState] = useState<PuzzleEngineState | null>(engine?.getState() ?? null);

  useEffect(() => {
    if (!engine) {
      setState(null);
      return;
    }
    setState(engine.getState());
    return engine.subscribe(setState);
  }, [engine]);

  return { engine, state };
}
