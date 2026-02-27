import { LeafPane } from '../../../shared/paneTypes';
import { usePaneContext } from './PaneContext';
import { findParent } from './paneUtils';
import TabBar from './TabBar';
import TabContent from './TabContent';

interface LeafPaneContainerProps {
  pane: LeafPane;
}

export default function LeafPaneContainer({ pane }: LeafPaneContainerProps) {
  const { layout, dispatch } = usePaneContext();
  const isActive = layout.activePaneId === pane.id;
  const isSplit = !!findParent(layout.root, pane.id);

  const handleFocus = () => {
    if (!isActive) {
      dispatch({ type: 'SET_ACTIVE_PANE', paneId: pane.id });
    }
  };

  return (
    <div
      className={`leaf-pane ${isActive ? 'active' : ''}`}
      onClick={handleFocus}
    >
      {/* Only show tab bar if there are multiple tabs */}
      {pane.tabs.length > 1 && (
        <TabBar paneId={pane.id} tabs={pane.tabs} activeTabId={pane.activeTabId} />
      )}
      <div className="tab-content-area">
        {pane.tabs.map(tab => (
          <div
            key={tab.id}
            className="tab-content-wrapper"
            style={{ display: tab.id === pane.activeTabId ? 'flex' : 'none', flex: 1, minHeight: 0 }}
          >
            <TabContent tab={tab} />
          </div>
        ))}
      </div>
      {isSplit && (
        <button
          className="pane-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'CLOSE_PANE', paneId: pane.id });
          }}
          title="Close pane (Cmd+Shift+W)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
