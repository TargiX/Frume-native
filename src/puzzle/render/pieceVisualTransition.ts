type TrayExitState = {
  engineInTray: boolean;
  runtimeInTray: boolean;
  trayAttached: boolean;
};

/**
 * A finger drag detaches the visual from tray scrolling before React observes
 * the engine transition. Programmatic actions such as Assist do not, so they
 * must animate the piece from its tray slot to the new engine coordinates.
 */
export function shouldAnimateProgrammaticTrayExit({
  engineInTray,
  runtimeInTray,
  trayAttached,
}: TrayExitState): boolean {
  return engineInTray && !runtimeInTray && trayAttached;
}
