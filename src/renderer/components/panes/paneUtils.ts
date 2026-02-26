import { PaneNode, LeafPane, SplitPane, PaneLayout, TabParams } from '../../../shared/paneTypes';

/** Find a leaf pane by ID */
export function findLeafPane(node: PaneNode, id: string): LeafPane | null {
  if (node.kind === 'leaf') return node.id === id ? node : null;
  return findLeafPane(node.children[0], id) || findLeafPane(node.children[1], id);
}

/** Get all leaf panes as a flat array */
export function getAllLeaves(node: PaneNode): LeafPane[] {
  if (node.kind === 'leaf') return [node];
  return [...getAllLeaves(node.children[0]), ...getAllLeaves(node.children[1])];
}

/** Find a leaf pane that is NOT the given pane ID */
export function findOtherLeafPane(root: PaneNode, excludeId: string): LeafPane | null {
  const leaves = getAllLeaves(root);
  return leaves.find(l => l.id !== excludeId) || null;
}

/** Find parent split pane of a given node ID */
export function findParent(root: PaneNode, childId: string): SplitPane | null {
  if (root.kind === 'leaf') return null;
  if (root.children[0].id === childId || root.children[1].id === childId) return root;
  return findParent(root.children[0], childId) || findParent(root.children[1], childId);
}

/** Replace a node in the tree by ID, returning a new tree */
export function replaceNode(root: PaneNode, id: string, replacement: PaneNode): PaneNode {
  if (root.id === id) return replacement;
  if (root.kind === 'leaf') return root;
  return {
    ...root,
    children: [
      replaceNode(root.children[0], id, replacement),
      replaceNode(root.children[1], id, replacement),
    ] as [PaneNode, PaneNode],
  };
}

/** Check if tab params match (same type and same key/id) */
function paramsMatch(a: TabParams, b: TabParams): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'editor': return a.sceneKey === (b as { type: 'editor'; sceneKey?: string | null }).sceneKey;
    case 'notes': return a.noteId === (b as { type: 'notes'; noteId?: string | null }).noteId;
    case 'pov': return a.characterId === (b as { type: 'pov'; characterId?: string | null }).characterId;
    default: return true;
  }
}

/** Find a tab across all panes matching given params */
export function findTabByParams(root: PaneNode, params: TabParams): { paneId: string; tabId: string } | null {
  const leaves = getAllLeaves(root);
  for (const leaf of leaves) {
    const tab = leaf.tabs.find(t => paramsMatch(t.params, params));
    if (tab) return { paneId: leaf.id, tabId: tab.id };
  }
  return null;
}

/** Find first tab of a given type in a specific pane */
export function findTabByType(pane: LeafPane, type: TabParams['type']): string | null {
  const tab = pane.tabs.find(t => t.params.type === type);
  return tab?.id || null;
}

/** Validate a deserialized layout */
export function isValidLayout(obj: unknown): obj is PaneLayout {
  if (!obj || typeof obj !== 'object') return false;
  const layout = obj as PaneLayout;
  if (!layout.root || !layout.activePaneId) return false;
  return isValidNode(layout.root);
}

function isValidNode(node: unknown): node is PaneNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as PaneNode;
  if (n.kind === 'leaf') {
    return Array.isArray(n.tabs) && n.tabs.length > 0 && typeof n.activeTabId === 'string';
  }
  if (n.kind === 'split') {
    const s = n as SplitPane;
    return Array.isArray(s.children) && s.children.length === 2
      && isValidNode(s.children[0]) && isValidNode(s.children[1]);
  }
  return false;
}
