import { usePaneContext } from './PaneContext';
import PaneNode from './PaneNode';

export default function PaneManager() {
  const { layout } = usePaneContext();
  return (
    <div className="pane-manager">
      <PaneNode node={layout.root} />
    </div>
  );
}
