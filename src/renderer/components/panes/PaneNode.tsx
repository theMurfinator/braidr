import { PaneNode as PaneNodeType } from '../../../shared/paneTypes';
import LeafPaneContainer from './LeafPaneContainer';
import SplitPaneContainer from './SplitPaneContainer';

interface PaneNodeProps {
  node: PaneNodeType;
}

export default function PaneNode({ node }: PaneNodeProps) {
  if (node.kind === 'leaf') {
    return <LeafPaneContainer pane={node} />;
  }
  return <SplitPaneContainer pane={node} />;
}
