import { createContext, useContext } from 'react';

export interface SheetLayout {
  /** Folded to its title, so the map shows almost whole (ADR-47); the person decides, the map never folds it alone. */
  readonly collapsed: boolean;
  readonly setCollapsed: (collapsed: boolean) => void;
}

const FIXED: SheetLayout = { collapsed: false, setCollapsed: () => undefined };

/** Shared by the map screen and whichever panel it shows (the person's map or everyone's). */
export const SheetLayoutContext = createContext<SheetLayout>(FIXED);

export function useSheetLayout(): SheetLayout {
  return useContext(SheetLayoutContext);
}
