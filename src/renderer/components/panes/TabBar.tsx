import { useRef, useState } from 'react';
import { Tab, TabParams, defaultTabTitle } from '../../../shared/paneTypes';
import { usePaneContext } from './PaneContext';

interface TabBarProps {
  paneId: string;
  tabs: Tab[];
  activeTabId: string;
}

const VIEW_ICONS: Record<TabParams['type'], string> = {
  pov: 'M4 6h16M4 12h10M4 18h13',
  braided: 'M8 3v18M16 3v18M3 8h18M3 16h18',
  editor: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  notes: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  timeline: 'M3 12h18M7 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM21 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  analytics: 'M3 12h4v9H3zM10 6h4v15h-4zM17 2h4v19h-4z',
  account: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};

export default function TabBar({ paneId, tabs, activeTabId }: TabBarProps) {
  const { dispatch } = usePaneContext();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragRef.current !== null && dragRef.current !== idx) {
      dispatch({ type: 'REORDER_TAB', paneId, fromIndex: dragRef.current, toIndex: idx });
    }
    setDragIdx(null);
    setDropIdx(null);
    dragRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDropIdx(null);
    dragRef.current = null;
  };

  const handleNewTab = () => {
    const tab: Tab = {
      id: crypto.randomUUID(),
      params: { type: 'editor' },
      title: defaultTabTitle('editor'),
    };
    dispatch({ type: 'OPEN_TAB', paneId, tab, makeActive: true });
  };

  return (
    <div className="tab-bar">
      {tabs.map((tab, idx) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''} ${dragIdx === idx ? 'dragging' : ''} ${dropIdx === idx ? 'drop-target' : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', paneId, tabId: tab.id })}
          draggable
          onDragStart={e => handleDragStart(e, idx)}
          onDragOver={e => handleDragOver(e, idx)}
          onDrop={e => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
        >
          <svg className="tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={VIEW_ICONS[tab.params.type]} />
          </svg>
          <span className="tab-title">{tab.title}</span>
          {tabs.length > 1 && !tab.isPinned && (
            <button
              className="tab-close"
              onClick={e => {
                e.stopPropagation();
                dispatch({ type: 'CLOSE_TAB', paneId, tabId: tab.id });
              }}
              title="Close tab"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button className="tab-bar-add" onClick={handleNewTab} title="New tab (Cmd+T)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        className="tab-bar-split"
        onClick={() => dispatch({ type: 'SPLIT_PANE', paneId, direction: 'horizontal' })}
        title="Split pane (Cmd+\)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      </button>
    </div>
  );
}
