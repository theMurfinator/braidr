import React, { createContext, useContext } from 'react';
import { Tab, TabParams } from '../../../shared/paneTypes';

/**
 * App.tsx provides a render function for each view type.
 * This avoids extracting the inline POV/braided views into components right now.
 * TabContent just calls the appropriate renderer.
 */
export type ViewRenderer = (tabParams: TabParams, tabId: string) => React.ReactElement | null;

const ViewRendererContext = createContext<ViewRenderer | null>(null);

export function ViewRendererProvider({ renderer, children }: {
  renderer: ViewRenderer;
  children: React.ReactNode;
}) {
  return <ViewRendererContext.Provider value={renderer}>{children}</ViewRendererContext.Provider>;
}

interface TabContentProps {
  tab: Tab;
}

export default function TabContent({ tab }: TabContentProps) {
  const renderer = useContext(ViewRendererContext);
  if (!renderer) return null;
  return renderer(tab.params, tab.id);
}
