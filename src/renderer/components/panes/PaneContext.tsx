import { createContext, useContext, useMemo } from 'react';
import { PaneLayout, PaneAction, LeafPane, Tab } from '../../../shared/paneTypes';
import { findLeafPane } from './paneUtils';

export interface PaneContextValue {
  layout: PaneLayout;
  dispatch: (action: PaneAction) => void;
  activePane: LeafPane;
  activeTab: Tab;
}

const PaneContext = createContext<PaneContextValue | null>(null);

export function PaneProvider({ layout, dispatch, children }: {
  layout: PaneLayout;
  dispatch: (action: PaneAction) => void;
  children: React.ReactNode;
}) {
  const value = useMemo<PaneContextValue>(() => {
    const activePane = findLeafPane(layout.root, layout.activePaneId);
    const fallbackPane: LeafPane = activePane || (layout.root as LeafPane);
    const activeTab = fallbackPane.tabs.find(t => t.id === fallbackPane.activeTabId) || fallbackPane.tabs[0];
    return { layout, dispatch, activePane: fallbackPane, activeTab };
  }, [layout, dispatch]);

  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>;
}

export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) throw new Error('usePaneContext must be used within PaneProvider');
  return ctx;
}

export default PaneContext;
