import { useReducer, useEffect, useCallback } from 'react';
import { PaneLayout, PaneAction, PaneNode, LeafPane, Tab, TabParams, defaultTabTitle } from '../../../shared/paneTypes';
import { findLeafPane, replaceNode, findParent, getAllLeaves } from './paneUtils';

function createLeafPane(tabs: Tab[], activeTabId?: string): LeafPane {
  return {
    kind: 'leaf',
    id: crypto.randomUUID(),
    tabs,
    activeTabId: activeTabId || tabs[0]?.id || '',
  };
}

function createTab(params: TabParams, title?: string): Tab {
  return {
    id: crypto.randomUUID(),
    params,
    title: title || defaultTabTitle(params.type),
  };
}

function paneReducer(state: PaneLayout, action: PaneAction): PaneLayout {
  switch (action.type) {
    case 'SET_LAYOUT':
      return action.layout;

    case 'SET_ACTIVE_PANE':
      return { ...state, activePaneId: action.paneId };

    case 'OPEN_TAB': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      // Check if tab with same params already exists
      const existing = pane.tabs.find(t => t.params.type === action.tab.params.type
        && JSON.stringify(t.params) === JSON.stringify(action.tab.params));
      if (existing) {
        // Just activate it
        const updated: LeafPane = { ...pane, activeTabId: existing.id };
        return { ...state, root: replaceNode(state.root, pane.id, updated) };
      }
      const updated: LeafPane = {
        ...pane,
        tabs: [...pane.tabs, action.tab],
        activeTabId: action.makeActive !== false ? action.tab.id : pane.activeTabId,
      };
      return { ...state, root: replaceNode(state.root, pane.id, updated) };
    }

    case 'CLOSE_TAB': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      const tabIndex = pane.tabs.findIndex(t => t.id === action.tabId);
      if (tabIndex === -1) return state;
      // Don't close pinned tabs
      if (pane.tabs[tabIndex].isPinned) return state;
      const newTabs = pane.tabs.filter(t => t.id !== action.tabId);
      // Don't close the last tab
      if (newTabs.length === 0) return state;
      let newActiveTabId = pane.activeTabId;
      if (pane.activeTabId === action.tabId) {
        // Activate adjacent tab
        const newIdx = Math.min(tabIndex, newTabs.length - 1);
        newActiveTabId = newTabs[newIdx].id;
      }
      const updated: LeafPane = { ...pane, tabs: newTabs, activeTabId: newActiveTabId };
      return { ...state, root: replaceNode(state.root, pane.id, updated) };
    }

    case 'SET_ACTIVE_TAB': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      if (!pane.tabs.find(t => t.id === action.tabId)) return state;
      const updated: LeafPane = { ...pane, activeTabId: action.tabId };
      return {
        ...state,
        root: replaceNode(state.root, pane.id, updated),
        activePaneId: action.paneId,
      };
    }

    case 'REORDER_TAB': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      const tabs = [...pane.tabs];
      const [moved] = tabs.splice(action.fromIndex, 1);
      tabs.splice(action.toIndex, 0, moved);
      const updated: LeafPane = { ...pane, tabs };
      return { ...state, root: replaceNode(state.root, pane.id, updated) };
    }

    case 'UPDATE_TAB_PARAMS': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      const tabs = pane.tabs.map(t =>
        t.id === action.tabId ? { ...t, params: action.params, ...(action.title !== undefined ? { title: action.title } : {}) } : t
      );
      const updated: LeafPane = { ...pane, tabs };
      return { ...state, root: replaceNode(state.root, pane.id, updated) };
    }

    case 'SPLIT_PANE': {
      const pane = findLeafPane(state.root, action.paneId);
      if (!pane) return state;
      const newTab = action.newTab || createTab({ type: 'editor' });
      const newPane = createLeafPane([newTab]);
      const splitNode: PaneNode = {
        kind: 'split',
        id: crypto.randomUUID(),
        direction: action.direction,
        children: [pane, newPane],
        splitRatio: 0.5,
      };
      return {
        ...state,
        root: replaceNode(state.root, pane.id, splitNode),
        activePaneId: newPane.id,
      };
    }

    case 'CLOSE_PANE': {
      const parent = findParent(state.root, action.paneId);
      if (!parent) return state; // Can't close root pane
      const sibling = parent.children[0].id === action.paneId
        ? parent.children[1]
        : parent.children[0];
      const newRoot = replaceNode(state.root, parent.id, sibling);
      const leaves = getAllLeaves(newRoot);
      const newActivePaneId = leaves.find(l => l.id === state.activePaneId)?.id
        || leaves[0]?.id || state.activePaneId;
      return { root: newRoot, activePaneId: newActivePaneId };
    }

    case 'SET_SPLIT_RATIO': {
      if (state.root.kind !== 'split') return state;
      // Find the split pane by ID
      const update = (node: PaneNode): PaneNode => {
        if (node.id === action.paneId && node.kind === 'split') {
          return { ...node, splitRatio: action.ratio };
        }
        if (node.kind === 'split') {
          return {
            ...node,
            children: [update(node.children[0]), update(node.children[1])] as [PaneNode, PaneNode],
          };
        }
        return node;
      };
      return { ...state, root: update(state.root) };
    }

    case 'MOVE_TAB': {
      const fromPane = findLeafPane(state.root, action.fromPaneId);
      const toPane = findLeafPane(state.root, action.toPaneId);
      if (!fromPane || !toPane) return state;
      const tab = fromPane.tabs.find(t => t.id === action.tabId);
      if (!tab) return state;
      // Remove from source
      const fromTabs = fromPane.tabs.filter(t => t.id !== action.tabId);
      if (fromTabs.length === 0) return state; // Don't leave a pane empty
      const fromActiveTabId = fromPane.activeTabId === action.tabId
        ? fromTabs[Math.min(fromPane.tabs.indexOf(tab), fromTabs.length - 1)].id
        : fromPane.activeTabId;
      const updatedFrom: LeafPane = { ...fromPane, tabs: fromTabs, activeTabId: fromActiveTabId };
      // Insert into target
      const toTabs = [...toPane.tabs];
      toTabs.splice(action.index, 0, tab);
      const updatedTo: LeafPane = { ...toPane, tabs: toTabs, activeTabId: tab.id };
      let newRoot = replaceNode(state.root, fromPane.id, updatedFrom);
      newRoot = replaceNode(newRoot, toPane.id, updatedTo);
      return { ...state, root: newRoot, activePaneId: toPane.id };
    }

    default:
      return state;
  }
}

/** Create the default initial layout */
export function createInitialLayout(viewType?: TabParams['type']): PaneLayout {
  const type = viewType || 'pov';
  const tab = createTab({ type } as TabParams);
  const paneId = crypto.randomUUID();
  return {
    root: {
      kind: 'leaf',
      id: paneId,
      tabs: [tab],
      activeTabId: tab.id,
    },
    activePaneId: paneId,
  };
}

/** Try to restore layout from localStorage */
function getStoredLayout(): PaneLayout | null {
  try {
    const saved = localStorage.getItem('braidr-pane-layout');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Basic validation
    if (parsed?.root && parsed?.activePaneId) {
      return parsed as PaneLayout;
    }
  } catch { /* ignore */ }
  return null;
}

export function usePaneLayout() {
  const storedLayout = getStoredLayout();
  const savedViewMode = localStorage.getItem('braidr-last-view-mode') as TabParams['type'] | null;
  const initial = storedLayout || createInitialLayout(savedViewMode || 'pov');

  const [layout, dispatch] = useReducer(paneReducer, initial);

  // Persist layout to localStorage on changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem('braidr-pane-layout', JSON.stringify(layout));
    }, 500);
    return () => clearTimeout(timeout);
  }, [layout]);

  const stableDispatch = useCallback((action: PaneAction) => {
    dispatch(action);
  }, []);

  return { layout, dispatch: stableDispatch };
}

export { createTab };
