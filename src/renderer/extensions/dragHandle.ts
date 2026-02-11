import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';

const dragHandleKey = new PluginKey('dragHandle');

function findTopLevelBlockAt(view: EditorView, y: number): { pos: number; node: any; dom: HTMLElement } | null {
  // Find the block-level node at this y coordinate
  const editorRect = view.dom.getBoundingClientRect();
  const pos = view.posAtCoords({ left: editorRect.left + 10, top: y });
  if (!pos) return null;

  const $pos = view.state.doc.resolve(pos.pos);
  // Walk up to find the top-level block (depth 1 = direct child of doc)
  let depth = $pos.depth;
  while (depth > 1) depth--;

  if (depth < 1) return null;

  const blockPos = $pos.before(depth);
  const node = view.state.doc.nodeAt(blockPos);
  if (!node) return null;

  const dom = view.nodeDOM(blockPos) as HTMLElement;
  if (!dom) return null;

  return { pos: blockPos, node, dom };
}

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let handle: HTMLDivElement | null = null;
    let dropIndicator: HTMLDivElement | null = null;
    let currentBlockPos: number | null = null;
    let isDragging = false;

    const createHandle = () => {
      const el = document.createElement('div');
      el.className = 'drag-handle';
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="4.5" cy="3" r="1.2"/>
        <circle cx="9.5" cy="3" r="1.2"/>
        <circle cx="4.5" cy="7" r="1.2"/>
        <circle cx="9.5" cy="7" r="1.2"/>
        <circle cx="4.5" cy="11" r="1.2"/>
        <circle cx="9.5" cy="11" r="1.2"/>
      </svg>`;
      el.draggable = true;
      el.style.display = 'none';
      return el;
    };

    const createDropIndicator = () => {
      const el = document.createElement('div');
      el.className = 'drag-drop-indicator';
      el.style.display = 'none';
      return el;
    };

    return [
      new Plugin({
        key: dragHandleKey,
        view(editorView) {
          handle = createHandle();
          dropIndicator = createDropIndicator();
          editorView.dom.parentElement?.appendChild(handle);
          editorView.dom.parentElement?.appendChild(dropIndicator);

          // Drag start: select the block node
          handle.addEventListener('dragstart', (e) => {
            if (currentBlockPos == null) return;
            isDragging = true;

            const { state, dispatch } = editorView;
            const node = state.doc.nodeAt(currentBlockPos);
            if (!node) return;

            // Create a node selection for the block
            const sel = NodeSelection.create(state.doc, currentBlockPos);
            dispatch(state.tr.setSelection(sel));

            // Set drag data
            e.dataTransfer?.setDragImage(handle!, 0, 0);
            e.dataTransfer!.effectAllowed = 'move';

            // Use ProseMirror's built-in drag slice
            const slice = sel.content();
            editorView.dragging = { slice, move: true };
          });

          handle.addEventListener('dragend', () => {
            isDragging = false;
            if (dropIndicator) dropIndicator.style.display = 'none';
          });

          return {
            update() {},
            destroy() {
              handle?.remove();
              dropIndicator?.remove();
            },
          };
        },

        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              if (isDragging) return false;

              const block = findTopLevelBlockAt(view, event.clientY);
              if (block && handle) {
                const editorRect = view.dom.getBoundingClientRect();
                const blockRect = block.dom.getBoundingClientRect();
                handle.style.display = 'flex';
                handle.style.top = `${blockRect.top - editorRect.top + view.dom.scrollTop}px`;
                handle.style.left = '-28px';
                currentBlockPos = block.pos;
              } else if (handle) {
                handle.style.display = 'none';
                currentBlockPos = null;
              }
              return false;
            },

            mouseleave(_view, _event) {
              if (!isDragging && handle) {
                // Delay hiding to allow clicking the handle
                setTimeout(() => {
                  if (!isDragging && handle && !handle.matches(':hover')) {
                    handle.style.display = 'none';
                    currentBlockPos = null;
                  }
                }, 100);
              }
              return false;
            },

            dragover(view, event) {
              if (!isDragging) return false;
              event.preventDefault();

              const block = findTopLevelBlockAt(view, event.clientY);
              if (block && dropIndicator) {
                const editorRect = view.dom.getBoundingClientRect();
                const blockRect = block.dom.getBoundingClientRect();
                const midY = blockRect.top + blockRect.height / 2;
                const aboveBlock = event.clientY < midY;
                const indicatorY = aboveBlock ? blockRect.top : blockRect.bottom;

                dropIndicator.style.display = 'block';
                dropIndicator.style.top = `${indicatorY - editorRect.top + view.dom.scrollTop}px`;
                dropIndicator.style.left = '0';
                dropIndicator.style.right = '0';
              }
              return false;
            },

            drop(view, event) {
              isDragging = false;
              if (dropIndicator) dropIndicator.style.display = 'none';
              // Let ProseMirror handle the actual drop
              return false;
            },
          },
        },
      }),
    ];
  },
});
