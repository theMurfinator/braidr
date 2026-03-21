export type MobileView = 'pov' | 'rails' | 'notes';

interface MobileSidebarProps {
  currentView: MobileView;
  onViewChange: (view: MobileView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode;
}

const viewLabels: Record<MobileView, string> = {
  pov: 'POV',
  rails: 'Rails',
  notes: 'Notes',
};

export default function MobileSidebar({
  currentView,
  onViewChange,
  collapsed,
  onToggleCollapse,
  children,
}: MobileSidebarProps) {
  if (collapsed) {
    return (
      <div style={{
        width: 44,
        minWidth: 44,
        background: '#1e1e2e',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
      }}>
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: 'none',
            color: '#ccc',
            fontSize: 20,
            cursor: 'pointer',
            padding: 8,
          }}
          aria-label="Expand sidebar"
        >
          &#9776;
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: 280,
      minWidth: 280,
      background: '#1e1e2e',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header with collapse button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
      }}>
        <div style={{
          display: 'flex',
          gap: 4,
          flex: 1,
        }}>
          {(Object.keys(viewLabels) as MobileView[]).map(view => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: currentView === view ? '#3a3a5a' : 'transparent',
                color: currentView === view ? '#fff' : '#888',
                border: currentView === view ? '1px solid #555' : '1px solid transparent',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: currentView === view ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {viewLabels[view]}
            </button>
          ))}
        </div>
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: 16,
            cursor: 'pointer',
            padding: '4px 8px',
            marginLeft: 4,
          }}
          aria-label="Collapse sidebar"
        >
          &#x2039;
        </button>
      </div>

      {/* View-specific content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px 0',
      }}>
        {children}
      </div>
    </div>
  );
}
