import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { NoteMetadata, Scene, Character } from '../../../shared/types';

interface GraphViewProps {
  notes: NoteMetadata[];
  scenes: Scene[];
  characters: Character[];
  onSelectNote: (noteId: string) => void;
  selectedNoteId: string | null;
}

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  topAncestorId: string;
  connectionCount: number;
  nodeType: 'note' | 'scene';
  characterId?: string;
  characterColor?: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  type: 'wikilink' | 'scene-link' | 'shared-tag';
}

interface Filters {
  showNotes: boolean;
  showScenes: boolean;
  showSceneToScene: boolean;
  hiddenCharacters: Set<string>;
  showWikilinks: boolean;
  showSceneLinks: boolean;
  showSharedTags: boolean;
}

// Parent-based colors for note nodes
const GROUP_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#84cc16',
];

function getGroupColor(ancestorId: string, groups: string[]): string {
  if (!ancestorId) return '#6b7280';
  const idx = groups.indexOf(ancestorId);
  return GROUP_COLORS[idx % GROUP_COLORS.length];
}

// Character-based colors for scene nodes
const CHARACTER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#a855f7',
  '#f97316', '#14b8a6', '#e879f9', '#eab308',
];

function getCharacterColor(charIdx: number): string {
  return CHARACTER_COLORS[charIdx % CHARACTER_COLORS.length];
}

export default function GraphView({ notes, scenes, characters, onSelectNote, selectedNoteId }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);

  // Use refs for state that draw needs — avoids recreating draw/simulation on hover
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNoteRef = useRef<string | null>(selectedNoteId);
  selectedNoteRef.current = selectedNoteId;

  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ nodeId: string | null; isPanning: boolean; startX: number; startY: number; startTx: number; startTy: number }>({
    nodeId: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0,
  });

  // Filters
  const [filters, setFilters] = useState<Filters>({
    showNotes: true,
    showScenes: true,
    showSceneToScene: false,
    hiddenCharacters: new Set(),
    showWikilinks: true,
    showSceneLinks: true,
    showSharedTags: true,
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Compute top-level ancestor for each note (for color grouping)
  const getTopAncestor = useCallback((noteId: string, notesArr: NoteMetadata[]): string => {
    const noteMap = new Map(notesArr.map(n => [n.id, n]));
    let current = noteMap.get(noteId);
    while (current?.parentId) {
      const parent = noteMap.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current?.id || noteId;
  }, []);

  const groups = useMemo(() => {
    const ancestorIds = notes.map(n => getTopAncestor(n.id, notes));
    return [...new Set(ancestorIds.filter(Boolean))];
  }, [notes, getTopAncestor]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // Characters that actually appear in scenes
  const sceneCharacters = useMemo(() => {
    const charIds = new Set(scenes.map(s => s.characterId));
    return characters.filter(c => charIds.has(c.id));
  }, [scenes, characters]);

  // Draw function — reads everything from refs, never causes re-creation
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const t = transformRef.current;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);

    const allNodes = nodesRef.current;
    const allLinks = linksRef.current;
    const f = filtersRef.current;
    const hovered = hoveredNodeRef.current;
    const selected = selectedNoteRef.current;
    const grps = groupsRef.current;

    // Build a nodeType lookup
    const nodeTypeMap = new Map<string, 'note' | 'scene'>();
    for (const node of allNodes) {
      nodeTypeMap.set(node.id, node.nodeType);
    }

    // When scene-to-scene is off, find which scenes connect to at least one note
    let scenesConnectedToNote: Set<string> | null = null;
    if (f.showScenes && !f.showSceneToScene) {
      scenesConnectedToNote = new Set();
      for (const link of allLinks) {
        const sId = (link.source as GraphNode).id;
        const tId = (link.target as GraphNode).id;
        const sType = nodeTypeMap.get(sId);
        const tType = nodeTypeMap.get(tId);
        if (sType === 'scene' && tType === 'note') scenesConnectedToNote.add(sId);
        if (tType === 'scene' && sType === 'note') scenesConnectedToNote.add(tId);
      }
    }

    // Filter visible nodes
    const visibleIds = new Set<string>();
    for (const node of allNodes) {
      if (node.nodeType === 'note' && !f.showNotes) continue;
      if (node.nodeType === 'scene') {
        if (!f.showScenes) continue;
        if (node.characterId && f.hiddenCharacters.has(node.characterId)) continue;
        // When scene-to-scene is off, only show scenes linked to a note
        if (scenesConnectedToNote && !scenesConnectedToNote.has(node.id)) continue;
      }
      visibleIds.add(node.id);
    }

    // Filter visible links
    const visibleLinks: GraphLink[] = [];
    for (const link of allLinks) {
      const sId = (link.source as GraphNode).id;
      const tId = (link.target as GraphNode).id;
      if (!visibleIds.has(sId) || !visibleIds.has(tId)) continue;
      if (link.type === 'wikilink' && !f.showWikilinks) continue;
      if (link.type === 'scene-link' && !f.showSceneLinks) continue;
      if (link.type === 'shared-tag' && !f.showSharedTags) continue;
      // Hide scene-to-scene edges when toggle is off
      if (!f.showSceneToScene) {
        const sType = nodeTypeMap.get(sId);
        const tType = nodeTypeMap.get(tId);
        if (sType === 'scene' && tType === 'scene') continue;
      }
      visibleLinks.push(link);
    }

    // Hide nodes that have no visible edges (keep orphan notes that never had any connections)
    const linkedNodeIds = new Set<string>();
    for (const link of visibleLinks) {
      linkedNodeIds.add((link.source as GraphNode).id);
      linkedNodeIds.add((link.target as GraphNode).id);
    }
    for (const id of [...visibleIds]) {
      if (linkedNodeIds.has(id)) continue;
      const node = allNodes.find(n => n.id === id);
      // Keep notes that have zero total connections (true orphans)
      if (node && node.nodeType === 'note' && node.connectionCount === 0) continue;
      visibleIds.delete(id);
    }

    // Draw links
    for (const link of visibleLinks) {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;
      if (source.x == null || target.x == null) continue;

      const isHighlighted = (hovered && (source.id === hovered || target.id === hovered))
        || (selected && (source.id === selected || target.id === selected));

      ctx.beginPath();
      ctx.moveTo(source.x, source.y!);
      ctx.lineTo(target.x, target.y!);

      if (link.type === 'shared-tag') {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isHighlighted ? 'rgba(99,102,241,0.5)' : 'rgba(156,163,175,0.2)';
        ctx.lineWidth = 1;
      } else if (link.type === 'scene-link') {
        ctx.setLineDash([]);
        ctx.strokeStyle = isHighlighted ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.25)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = isHighlighted ? 'rgba(99,102,241,0.8)' : 'rgba(156,163,175,0.35)';
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const node of allNodes) {
      if (node.x == null) continue;
      if (!visibleIds.has(node.id)) continue;
      const r = Math.max(6, Math.min(16, 6 + node.connectionCount * 2));
      const isHovered = node.id === hovered;
      const isSelected = node.id === selected;
      const isScene = node.nodeType === 'scene';
      const color = isScene
        ? (node.characterColor || '#ef4444')
        : getGroupColor(node.topAncestorId, grps);

      if (isScene) {
        const size = r * 1.6;
        const half = size / 2;
        const cr = 3;
        ctx.beginPath();
        ctx.moveTo(node.x - half + cr, node.y! - half);
        ctx.lineTo(node.x + half - cr, node.y! - half);
        ctx.arcTo(node.x + half, node.y! - half, node.x + half, node.y! - half + cr, cr);
        ctx.lineTo(node.x + half, node.y! + half - cr);
        ctx.arcTo(node.x + half, node.y! + half, node.x + half - cr, node.y! + half, cr);
        ctx.lineTo(node.x - half + cr, node.y! + half);
        ctx.arcTo(node.x - half, node.y! + half, node.x - half, node.y! + half - cr, cr);
        ctx.lineTo(node.x - half, node.y! - half + cr);
        ctx.arcTo(node.x - half, node.y! - half, node.x - half + cr, node.y! - half, cr);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r, 0, Math.PI * 2);
      }

      if (isSelected) {
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (isScene) {
          const size = r * 1.6 + 8;
          const half = size / 2;
          ctx.beginPath();
          ctx.rect(node.x - half, node.y! - half, size, size);
        } else {
          ctx.beginPath();
          ctx.arc(node.x, node.y!, r + 4, 0, Math.PI * 2);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (isHovered) {
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const fontSize = isHovered || isSelected ? 12 : 10;
      ctx.font = `${isSelected ? '600' : '400'} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = isHovered || isSelected ? '#1f2937' : '#6b7280';
      ctx.textAlign = 'center';
      const label = node.title.length > 24 ? node.title.substring(0, 22) + '...' : node.title;
      ctx.fillText(label, node.x, node.y! + r + 14);
    }

    ctx.restore();
  }, []); // No dependencies — reads from refs only

  // Build graph + simulation — only when data changes
  useEffect(() => {
    const nodeMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];
    const linkSet = new Set<string>();

    for (const note of notes) {
      nodeMap.set(note.id, {
        id: note.id,
        title: note.title || 'Untitled',
        topAncestorId: getTopAncestor(note.id, notes),
        connectionCount: 0,
        nodeType: 'note',
      });
    }

    for (const scene of scenes) {
      const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
      const character = characters.find(c => c.id === scene.characterId);
      const charIdx = characters.indexOf(character!);
      nodeMap.set(sceneKey, {
        id: sceneKey,
        title: scene.title || `${character?.name || '?'} #${scene.sceneNumber}`,
        topAncestorId: '',
        connectionCount: 0,
        nodeType: 'scene',
        characterId: scene.characterId,
        characterColor: getCharacterColor(charIdx),
      });
    }

    for (const note of notes) {
      for (const targetId of note.outgoingLinks) {
        if (nodeMap.has(targetId)) {
          const key = [note.id, targetId].sort().join('::');
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: note.id, target: targetId, type: 'wikilink' });
          }
        }
      }
    }

    for (const note of notes) {
      for (const sceneKey of note.sceneLinks) {
        if (nodeMap.has(sceneKey)) {
          const key = [note.id, sceneKey].sort().join('::');
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: note.id, target: sceneKey, type: 'scene-link' });
          }
        }
      }
    }

    const tagToNodeIds = new Map<string, string[]>();
    for (const note of notes) {
      if (note.tags) {
        for (const tag of note.tags) {
          const list = tagToNodeIds.get(tag) || [];
          list.push(note.id);
          tagToNodeIds.set(tag, list);
        }
      }
    }
    for (const scene of scenes) {
      if (scene.tags) {
        const sceneKey = `${scene.characterId}:${scene.sceneNumber}`;
        for (const tag of scene.tags) {
          const list = tagToNodeIds.get(tag) || [];
          list.push(sceneKey);
          tagToNodeIds.set(tag, list);
        }
      }
    }
    for (const [, nodeIds] of tagToNodeIds) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key = [nodeIds[i], nodeIds[j]].sort().join('::');
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: nodeIds[i], target: nodeIds[j], type: 'shared-tag' });
          }
        }
      }
    }

    for (const link of links) {
      const sId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
      const tId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
      const s = nodeMap.get(sId);
      const t = nodeMap.get(tId);
      if (s) s.connectionCount++;
      if (t) t.connectionCount++;
    }

    // Only include scene nodes that have at least one connection
    const connectedScenes = new Set<string>();
    for (const link of links) {
      const sId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
      const tId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
      if (nodeMap.get(sId)?.nodeType === 'scene') connectedScenes.add(sId);
      if (nodeMap.get(tId)?.nodeType === 'scene') connectedScenes.add(tId);
    }

    const finalNodes = Array.from(nodeMap.values()).filter(
      n => n.nodeType === 'note' || connectedScenes.has(n.id)
    );
    const finalNodeIds = new Set(finalNodes.map(n => n.id));
    const finalLinks = links.filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return finalNodeIds.has(sId) && finalNodeIds.has(tId);
    });

    nodesRef.current = finalNodes;
    linksRef.current = finalLinks;

    // Center the graph initially
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      transformRef.current = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
    }

    const directLinks = finalLinks.filter(l => l.type === 'wikilink' || l.type === 'scene-link');
    const tagLinks = finalLinks.filter(l => l.type === 'shared-tag');

    const sim = forceSimulation<GraphNode>(finalNodes)
      .force('charge', forceManyBody().strength(-120))
      .force('link-direct', forceLink<GraphNode, GraphLink>(directLinks)
        .id(d => d.id)
        .distance(80)
        .strength(1))
      .force('link-tag', forceLink<GraphNode, GraphLink>(tagLinks)
        .id(d => d.id)
        .distance(160)
        .strength(0.3))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<GraphNode>().radius(d => Math.max(6, Math.min(16, 6 + d.connectionCount * 2)) + 8))
      .on('tick', draw);

    simRef.current = sim;

    return () => { sim.stop(); };
  }, [notes, scenes, characters, draw, getTopAncestor]);

  // Redraw when filters or selection change (without restarting simulation)
  useEffect(() => {
    draw();
  }, [filters, selectedNoteId, draw]);

  // Screen to graph coords
  const screenToGraph = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    return {
      x: (sx - t.x) / t.scale,
      y: (sy - t.y) / t.scale,
    };
  }, []);

  // Compute visible node IDs (same logic as draw) — used by findNodeAt
  const getVisibleNodeIds = useCallback((): Set<string> => {
    const allNodes = nodesRef.current;
    const allLinks = linksRef.current;
    const f = filtersRef.current;

    const nodeTypeMap = new Map<string, 'note' | 'scene'>();
    for (const node of allNodes) nodeTypeMap.set(node.id, node.nodeType);

    let scenesConnectedToNote: Set<string> | null = null;
    if (f.showScenes && !f.showSceneToScene) {
      scenesConnectedToNote = new Set();
      for (const link of allLinks) {
        const sId = (link.source as GraphNode).id;
        const tId = (link.target as GraphNode).id;
        if (nodeTypeMap.get(sId) === 'scene' && nodeTypeMap.get(tId) === 'note') scenesConnectedToNote.add(sId);
        if (nodeTypeMap.get(tId) === 'scene' && nodeTypeMap.get(sId) === 'note') scenesConnectedToNote.add(tId);
      }
    }

    const candidateIds = new Set<string>();
    for (const node of allNodes) {
      if (node.nodeType === 'note' && !f.showNotes) continue;
      if (node.nodeType === 'scene') {
        if (!f.showScenes) continue;
        if (node.characterId && f.hiddenCharacters.has(node.characterId)) continue;
        if (scenesConnectedToNote && !scenesConnectedToNote.has(node.id)) continue;
      }
      candidateIds.add(node.id);
    }

    // Filter edges, then narrow nodes to those with visible edges
    const linkedIds = new Set<string>();
    for (const link of allLinks) {
      const sId = (link.source as GraphNode).id;
      const tId = (link.target as GraphNode).id;
      if (!candidateIds.has(sId) || !candidateIds.has(tId)) continue;
      if (link.type === 'wikilink' && !f.showWikilinks) continue;
      if (link.type === 'scene-link' && !f.showSceneLinks) continue;
      if (link.type === 'shared-tag' && !f.showSharedTags) continue;
      if (!f.showSceneToScene && nodeTypeMap.get(sId) === 'scene' && nodeTypeMap.get(tId) === 'scene') continue;
      linkedIds.add(sId);
      linkedIds.add(tId);
    }

    const visibleIds = new Set<string>();
    for (const id of candidateIds) {
      if (linkedIds.has(id)) { visibleIds.add(id); continue; }
      const node = allNodes.find(n => n.id === id);
      if (node && node.nodeType === 'note' && node.connectionCount === 0) visibleIds.add(id);
    }
    return visibleIds;
  }, []);

  // Find node at position
  const findNodeAt = useCallback((gx: number, gy: number): GraphNode | null => {
    const nodes = nodesRef.current;
    const visible = getVisibleNodeIds();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!visible.has(node.id)) continue;
      const r = Math.max(6, Math.min(16, 6 + node.connectionCount * 2));
      const dx = (node.x || 0) - gx;
      const dy = (node.y || 0) - gy;
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return node;
    }
    return null;
  }, [getVisibleNodeIds]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const gp = screenToGraph(sx, sy);
    const node = findNodeAt(gp.x, gp.y);

    if (node) {
      dragRef.current = { nodeId: node.id, isPanning: false, startX: sx, startY: sy, startTx: 0, startTy: 0 };
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      dragRef.current = {
        nodeId: null, isPanning: true,
        startX: sx, startY: sy,
        startTx: transformRef.current.x, startTy: transformRef.current.y,
      };
    }
  }, [screenToGraph, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const drag = dragRef.current;
    if (drag.isPanning) {
      transformRef.current.x = drag.startTx + (sx - drag.startX);
      transformRef.current.y = drag.startTy + (sy - drag.startY);
      draw();
      return;
    }

    if (drag.nodeId) {
      const gp = screenToGraph(sx, sy);
      const node = nodesRef.current.find(n => n.id === drag.nodeId);
      if (node) {
        node.fx = gp.x;
        node.fy = gp.y;
      }
      return;
    }

    // Hover detection — update ref + redraw, no setState
    const gp = screenToGraph(sx, sy);
    const node = findNodeAt(gp.x, gp.y);
    const newHovered = node ? node.id : null;
    if (newHovered !== hoveredNodeRef.current) {
      hoveredNodeRef.current = newHovered;
      draw();
    }
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }, [screenToGraph, findNodeAt, draw]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.nodeId) {
      const node = nodesRef.current.find(n => n.id === drag.nodeId);
      if (node) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const dist = Math.sqrt((sx - drag.startX) ** 2 + (sy - drag.startY) ** 2);
          if (dist < 5 && node.nodeType === 'note') {
            onSelectNote(node.id);
          }
        }
        node.fx = null;
        node.fy = null;
      }
      simRef.current?.alphaTarget(0);
    }
    dragRef.current = { nodeId: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
  }, [onSelectNote]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const t = transformRef.current;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(0.1, Math.min(5, t.scale * factor));
    t.x = sx - (sx - t.x) * (newScale / t.scale);
    t.y = sy - (sy - t.y) * (newScale / t.scale);
    t.scale = newScale;
    draw();
  }, [draw]);

  const handleMouseLeave = useCallback(() => {
    hoveredNodeRef.current = null;
    draw();
    const drag = dragRef.current;
    if (drag.nodeId) {
      const node = nodesRef.current.find(n => n.id === drag.nodeId);
      if (node) { node.fx = null; node.fy = null; }
      simRef.current?.alphaTarget(0);
    }
    dragRef.current = { nodeId: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
  }, [draw]);

  // Animated zoom toward canvas center
  const zoomAnimRef = useRef<number>(0);
  const animateZoom = useCallback((targetScale: number, targetX: number, targetY: number) => {
    if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
    const t = transformRef.current;
    const startScale = t.scale;
    const startX = t.x;
    const startY = t.y;
    const duration = 200;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      t.scale = startScale + (targetScale - startScale) * ease;
      t.x = startX + (targetX - startX) * ease;
      t.y = startY + (targetY - startY) * ease;
      draw();
      if (progress < 1) {
        zoomAnimRef.current = requestAnimationFrame(step);
      }
    };
    zoomAnimRef.current = requestAnimationFrame(step);
  }, [draw]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const t = transformRef.current;
    const newScale = Math.min(5, t.scale * 1.4);
    const newX = cx - (cx - t.x) * (newScale / t.scale);
    const newY = cy - (cy - t.y) * (newScale / t.scale);
    animateZoom(newScale, newX, newY);
  }, [animateZoom]);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const t = transformRef.current;
    const newScale = Math.max(0.1, t.scale / 1.4);
    const newX = cx - (cx - t.x) * (newScale / t.scale);
    const newY = cy - (cy - t.y) * (newScale / t.scale);
    animateZoom(newScale, newX, newY);
  }, [animateZoom]);

  const handleZoomFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = nodesRef.current;
    const f = filtersRef.current;
    const rect = canvas.getBoundingClientRect();

    // Find bounding box of visible nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let count = 0;
    for (const node of nodes) {
      if (node.x == null) continue;
      if (node.nodeType === 'note' && !f.showNotes) continue;
      if (node.nodeType === 'scene' && !f.showScenes) continue;
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y!);
      maxY = Math.max(maxY, node.y!);
      count++;
    }
    if (count === 0) return;

    const padding = 60;
    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;
    const scaleX = (rect.width - padding * 2) / graphW;
    const scaleY = (rect.height - padding * 2) / graphH;
    const newScale = Math.min(scaleX, scaleY, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newX = rect.width / 2 - centerX * newScale;
    const newY = rect.height / 2 - centerY * newScale;
    animateZoom(newScale, newX, newY);
  }, [animateZoom]);

  // Filter toggle helpers
  const toggleFilter = (key: 'showNotes' | 'showScenes' | 'showSceneToScene' | 'showWikilinks' | 'showSceneLinks' | 'showSharedTags') => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCharacter = (charId: string) => {
    setFilters(prev => {
      const next = new Set(prev.hiddenCharacters);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return { ...prev, hiddenCharacters: next };
    });
  };

  return (
    <div className="graph-view-container">
      <canvas
        ref={canvasRef}
        className="graph-view-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Filter panel toggle */}
      <button
        className={`graph-filter-toggle ${filtersOpen ? 'active' : ''}`}
        onClick={() => setFiltersOpen(!filtersOpen)}
        title="Filters"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h12M4 8h8M6 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="graph-filter-panel">
          <div className="graph-filter-section">
            <div className="graph-filter-section-title">Nodes</div>
            <label className="graph-filter-check">
              <input type="checkbox" checked={filters.showNotes} onChange={() => toggleFilter('showNotes')} />
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#6b7280" /></svg>
              Notes
            </label>
            <label className="graph-filter-check">
              <input type="checkbox" checked={filters.showScenes} onChange={() => toggleFilter('showScenes')} />
              <svg width="10" height="10"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="#ef4444" /></svg>
              Scenes
            </label>
            {filters.showScenes && (
              <label className="graph-filter-check graph-filter-indent">
                <input type="checkbox" checked={filters.showSceneToScene} onChange={() => toggleFilter('showSceneToScene')} />
                Scene-to-scene
              </label>
            )}
          </div>

          {filters.showScenes && sceneCharacters.length > 0 && (
            <div className="graph-filter-section">
              <div className="graph-filter-section-title">Characters</div>
              {sceneCharacters.map((char, i) => (
                <label key={char.id} className="graph-filter-check">
                  <input
                    type="checkbox"
                    checked={!filters.hiddenCharacters.has(char.id)}
                    onChange={() => toggleCharacter(char.id)}
                  />
                  <span className="graph-filter-color-dot" style={{ background: getCharacterColor(i) }} />
                  {char.name}
                </label>
              ))}
            </div>
          )}

          <div className="graph-filter-section">
            <div className="graph-filter-section-title">Edges</div>
            <label className="graph-filter-check">
              <input type="checkbox" checked={filters.showWikilinks} onChange={() => toggleFilter('showWikilinks')} />
              <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="#9ca3af" strokeWidth="1.5" /></svg>
              Links
            </label>
            <label className="graph-filter-check">
              <input type="checkbox" checked={filters.showSceneLinks} onChange={() => toggleFilter('showSceneLinks')} />
              <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="#ef4444" strokeWidth="1.5" /></svg>
              Scene links
            </label>
            <label className="graph-filter-check">
              <input type="checkbox" checked={filters.showSharedTags} onChange={() => toggleFilter('showSharedTags')} />
              <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" /></svg>
              Shared tags
            </label>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="graph-zoom-controls">
        <button className="graph-zoom-btn" onClick={handleZoomIn} title="Zoom in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="graph-zoom-btn" onClick={handleZoomOut} title="Zoom out">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="graph-zoom-btn" onClick={handleZoomFit} title="Fit to view">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 6V3.5A1.5 1.5 0 0 1 3.5 2H6M10 2h2.5A1.5 1.5 0 0 1 14 3.5V6M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5H10M6 14H3.5A1.5 1.5 0 0 1 2 12.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="graph-view-legend">
        <div className="graph-view-legend-item">
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#6b7280" /></svg>
          <span>Note</span>
        </div>
        <div className="graph-view-legend-item">
          <svg width="12" height="12"><rect x="1" y="1" width="10" height="10" rx="2" fill="#ef4444" /></svg>
          <span>Scene</span>
        </div>
        <div className="graph-view-legend-separator" />
        <div className="graph-view-legend-item">
          <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#9ca3af" strokeWidth="1.5" /></svg>
          <span>Link</span>
        </div>
        <div className="graph-view-legend-item">
          <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#ef4444" strokeWidth="1.5" /></svg>
          <span>Scene link</span>
        </div>
        <div className="graph-view-legend-item">
          <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 4" /></svg>
          <span>Shared tag</span>
        </div>
      </div>
    </div>
  );
}
