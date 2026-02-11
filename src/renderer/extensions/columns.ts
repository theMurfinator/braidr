import { Node, mergeAttributes } from '@tiptap/core';

export const ColumnBlock = Node.create({
  name: 'columnBlock',
  group: 'block',
  content: 'column+',
  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element) => parseInt(element.getAttribute('data-columns') || '2'),
        renderHTML: (attributes) => ({ 'data-columns': attributes.columns }),
      },
      widths: {
        default: null,
        parseHTML: (element) => {
          const w = element.getAttribute('data-widths');
          return w ? JSON.parse(w) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.widths) {
            return { 'data-widths': JSON.stringify(attributes.widths) };
          }
          return {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columnBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columnBlock',
        class: `column-block columns-${HTMLAttributes['data-columns'] || 2}`,
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.classList.add('column-block', `columns-${node.attrs.columns}`);
      dom.setAttribute('data-type', 'columnBlock');
      dom.setAttribute('data-columns', String(node.attrs.columns));

      const contentDOM = document.createElement('div');
      contentDOM.classList.add('column-block-inner');
      dom.appendChild(contentDOM);

      // Apply stored widths to children after render
      const applyWidths = (widths: number[] | null) => {
        if (!widths) return;
        const children = contentDOM.querySelectorAll(':scope > .column-item');
        children.forEach((child, i) => {
          if (widths[i] !== undefined) {
            (child as HTMLElement).style.flex = `0 0 ${widths[i]}%`;
          }
        });
      };

      // Initial width application (deferred so children exist)
      requestAnimationFrame(() => applyWidths(node.attrs.widths));

      // -- Resize handles --
      // Handles live in a separate non-editable container to avoid
      // mixed contentEditable siblings confusing Chrome's focus system.
      const handleContainer = document.createElement('div');
      handleContainer.contentEditable = 'false';
      handleContainer.classList.add('column-resize-handles');
      dom.appendChild(handleContainer);

      const handles: HTMLElement[] = [];
      const numCols = node.attrs.columns;

      let isResizing = false;
      let currentMoveHandler: ((e: MouseEvent) => void) | null = null;
      let currentUpHandler: ((e: MouseEvent) => void) | null = null;

      const cleanupResize = () => {
        if (currentMoveHandler) document.removeEventListener('mousemove', currentMoveHandler);
        if (currentUpHandler) document.removeEventListener('mouseup', currentUpHandler);
        currentMoveHandler = null;
        currentUpHandler = null;
        isResizing = false;
        dom.classList.remove('column-resizing');
        handles.forEach(h => h.classList.remove('active'));
      };

      const positionHandles = () => {
        const cols = contentDOM.querySelectorAll(':scope > .column-item');
        handles.forEach((handle, i) => {
          if (cols[i]) {
            const colRect = cols[i].getBoundingClientRect();
            const domRect = dom.getBoundingClientRect();
            handle.style.left = `${colRect.right - domRect.left - 6}px`;
          }
        });
      };

      for (let i = 0; i < numCols - 1; i++) {
        const handle = document.createElement('div');
        handle.classList.add('column-resize-handle');
        handle.setAttribute('data-handle-index', String(i));
        handles.push(handle);

        const onMouseDown = (e: MouseEvent) => {
          // Only preventDefault to stop text selection during drag.
          // Do NOT stopPropagation — let ProseMirror see the event
          // so that stopEvent() can properly handle it.
          e.preventDefault();

          cleanupResize();
          isResizing = true;
          const startX = e.clientX;

          const columns = contentDOM.querySelectorAll(':scope > .column-item');
          const totalWidth = contentDOM.getBoundingClientRect().width;
          const startWidths = Array.from(columns).map(
            (col) => (col.getBoundingClientRect().width / totalWidth) * 100
          );

          handle.classList.add('active');
          dom.classList.add('column-resizing');

          const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const currentTotalWidth = contentDOM.getBoundingClientRect().width;
            const deltaPct = (deltaX / currentTotalWidth) * 100;

            const minPct = 15;
            const leftNew = startWidths[i] + deltaPct;
            const rightNew = startWidths[i + 1] - deltaPct;

            if (leftNew >= minPct && rightNew >= minPct) {
              const newWidths = [...startWidths];
              newWidths[i] = leftNew;
              newWidths[i + 1] = rightNew;

              const cols = contentDOM.querySelectorAll(':scope > .column-item');
              cols.forEach((col, idx) => {
                (col as HTMLElement).style.flex = `0 0 ${newWidths[idx]}%`;
              });

              positionHandles();
            }
          };

          const onMouseUp = () => {
            cleanupResize();

            // Persist the new widths into the node attribute
            const cols = contentDOM.querySelectorAll(':scope > .column-item');
            const currentTotalWidth = contentDOM.getBoundingClientRect().width;
            const finalWidths = Array.from(cols).map(
              (col) => Math.round((col.getBoundingClientRect().width / currentTotalWidth) * 1000) / 10
            );

            if (typeof getPos === 'function') {
              try {
                const pos = getPos();
                if (pos !== undefined) {
                  editor.commands.command(({ tr }) => {
                    tr.setNodeAttribute(pos, 'widths', finalWidths);
                    return true;
                  });
                }
              } catch (e) {
                console.warn('Column resize: could not persist widths', e);
              }
            }

            // Re-focus the editor to restore editing capability
            editor.commands.focus();
          };

          currentMoveHandler = onMouseMove;
          currentUpHandler = onMouseUp;

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
        handleContainer.appendChild(handle);
      }

      // Position handles after content renders
      requestAnimationFrame(() => positionHandles());
      // Reposition on window resize
      const resizeObserver = new ResizeObserver(() => positionHandles());
      resizeObserver.observe(contentDOM);

      return {
        dom,
        contentDOM,

        // Tell ProseMirror to ignore events originating from resize handles.
        // Without this, ProseMirror tries to interpret clicks on
        // contentEditable=false handles as selection actions, which corrupts
        // its internal selection state.
        stopEvent: (event: Event) => {
          const target = event.target as HTMLElement;
          if (!target) return false;
          return target.classList.contains('column-resize-handle') ||
                 target.closest('.column-resize-handle') !== null ||
                 target.closest('.column-resize-handles') !== null;
        },

        // Tell ProseMirror to ignore DOM mutations caused by resize
        // (style changes on column items, handle repositioning).
        // Without this, ProseMirror re-parses the document on every
        // resize frame, corrupting its internal state.
        ignoreMutation: (mutation: MutationRecord) => {
          // Ignore all style attribute changes (from resizing flex values, handle left positions)
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            return true;
          }
          // Ignore all mutations inside the handle container
          if (mutation.target instanceof HTMLElement &&
              (mutation.target.closest('.column-resize-handles') !== null ||
               mutation.target.classList.contains('column-resize-handles'))) {
            return true;
          }
          // Ignore class changes on the column-block itself (column-resizing toggle)
          if (mutation.type === 'attributes' && mutation.attributeName === 'class' &&
              mutation.target === dom) {
            return true;
          }
          // Let ProseMirror handle everything else (actual content edits)
          return false;
        },

        update: (updatedNode) => {
          if (updatedNode.type.name !== 'columnBlock') return false;
          // Apply widths synchronously where possible, defer only positioning
          applyWidths(updatedNode.attrs.widths);
          requestAnimationFrame(() => positionHandles());
          return true;
        },

        destroy: () => {
          cleanupResize();
          resizeObserver.disconnect();
        },
      };
    };
  },
});

export const Column = Node.create({
  name: 'column',
  group: '',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'column-item',
      }),
      0,
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnBlock: {
      insertColumns: (columns: number) => ReturnType;
    };
  }
}

// Helper to add insertColumns command
export const ColumnBlockCommands = Node.create({
  name: 'columnBlockCommands',

  addCommands() {
    return {
      insertColumns:
        (columns: number) =>
        ({ commands }) => {
          const columnContent = Array(columns)
            .fill(null)
            .map(() => ({
              type: 'column',
              content: [{ type: 'paragraph' }],
            }));

          return commands.insertContent({
            type: 'columnBlock',
            attrs: { columns },
            content: columnContent,
          });
        },
    };
  },
});
