/** View types that can appear in a tab */
export type TabViewType = 'pov' | 'braided' | 'editor' | 'notes' | 'tasks' | 'timeline' | 'analytics' | 'account';

/** View-specific parameters that distinguish tabs of the same type */
export type TabParams =
  | { type: 'pov'; characterId?: string | null }
  | { type: 'braided'; subMode?: 'list' | 'table' | 'rails' }
  | { type: 'editor'; sceneKey?: string | null }
  | { type: 'notes'; noteId?: string | null }
  | { type: 'tasks' }
  | { type: 'timeline' }
  | { type: 'analytics' }
  | { type: 'account' };

export interface Tab {
  id: string;
  params: TabParams;
  title: string;
  isPinned?: boolean;
}

/** A leaf pane containing tabs */
export interface LeafPane {
  kind: 'leaf';
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

/** A split pane containing two children */
export interface SplitPane {
  kind: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: [PaneNode, PaneNode];
  splitRatio: number;
}

export type PaneNode = LeafPane | SplitPane;

/** Top-level layout state */
export interface PaneLayout {
  root: PaneNode;
  activePaneId: string;
}

/** All actions the pane reducer can handle */
export type PaneAction =
  | { type: 'OPEN_TAB'; paneId: string; tab: Tab; makeActive?: boolean }
  | { type: 'CLOSE_TAB'; paneId: string; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; paneId: string; tabId: string }
  | { type: 'SET_ACTIVE_PANE'; paneId: string }
  | { type: 'REORDER_TAB'; paneId: string; fromIndex: number; toIndex: number }
  | { type: 'SPLIT_PANE'; paneId: string; direction: 'horizontal' | 'vertical'; newTab?: Tab }
  | { type: 'CLOSE_PANE'; paneId: string }
  | { type: 'SET_SPLIT_RATIO'; paneId: string; ratio: number }
  | { type: 'MOVE_TAB'; fromPaneId: string; tabId: string; toPaneId: string; index: number }
  | { type: 'UPDATE_TAB_PARAMS'; paneId: string; tabId: string; params: TabParams; title?: string }
  | { type: 'SET_LAYOUT'; layout: PaneLayout };

/** Default tab title for a view type */
export function defaultTabTitle(type: TabViewType): string {
  switch (type) {
    case 'pov': return 'POV';
    case 'braided': return 'Timeline';
    case 'editor': return 'Editor';
    case 'notes': return 'Notes';
    case 'tasks': return 'Tasks';
    case 'timeline': return 'Timeline';
    case 'analytics': return 'Analytics';
    case 'account': return 'Account';
  }
}
