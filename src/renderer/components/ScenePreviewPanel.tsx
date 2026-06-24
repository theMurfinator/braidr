import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

// Inline editable scene-text editor for the preview panel. Mirrors EditorView's
// draft editor (same extensions + 800ms debounced auto-save) so edits here write
// back to the exact same draft the full editor uses.
function ScenePreviewEditor({ sceneId, draftContent, onDraftChange }: {
  sceneId: string;
  draftContent: Record<string, string>;
  onDraftChange: (sceneKey: string, html: string) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ key: string; html: string } | null>(null);
  const settingContentRef = useRef(false);
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;

  const editor = useEditor({
    editorProps: { attributes: { spellcheck: 'true' } },
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: 'Write this scene…' }),
    ],
    content: draftContent[sceneId] || '',
    onUpdate: ({ editor }) => {
      if (settingContentRef.current) return;
      pendingRef.current = { key: sceneIdRef.current, html: editor.getHTML() };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) {
          onDraftChange(pendingRef.current.key, pendingRef.current.html);
          pendingRef.current = null;
        }
      }, 800);
    },
  });

  // Flush any pending save and load the new scene's content when the selected
  // scene changes (or when the panel unmounts).
  useEffect(() => {
    if (editor) {
      settingContentRef.current = true;
      editor.commands.setContent(draftContent[sceneId] || '');
      settingContentRef.current = false;
    }
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (pendingRef.current) {
        onDraftChange(pendingRef.current.key, pendingRef.current.html);
        pendingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, editor]);

  return <EditorContent editor={editor} className="arc-preview-content arc-preview-editor" />;
}

// Right-side scene preview drawer: editable draft text + a "Go to Scene" button
// that opens the scene in the full editor. Used by both the Arc and POV views.
// `variant` controls layout: 'overlay' (absolute, slides over the view, used in
// Arc) or 'sticky' (a sticky right column, used in POV's scrolling layout).
export default function ScenePreviewPanel({
  sceneId,
  title,
  draftContent,
  onDraftChange,
  onGoToScene,
  onClose,
  variant = 'overlay',
}: {
  sceneId: string | null;
  title: string;
  draftContent: Record<string, string>;
  onDraftChange: (sceneKey: string, html: string) => void;
  onGoToScene: (sceneId: string) => void;
  onClose: () => void;
  variant?: 'overlay' | 'sticky';
}) {
  useEffect(() => {
    if (!sceneId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sceneId, onClose]);

  if (!sceneId) return null;
  return (
    <div className={`arc-preview-panel${variant === 'sticky' ? ' arc-preview-panel--sticky' : ''}`}>
      <div className="arc-preview-header">
        <span className="arc-preview-title">{title || 'Untitled scene'}</span>
        <div className="arc-preview-header-actions">
          <button
            className="arc-preview-goto"
            title="Open this scene in the full editor"
            onClick={() => onGoToScene(sceneId)}
          >
            Go to Scene →
          </button>
          <button className="arc-preview-close" title="Close preview (Esc)" onClick={onClose}>×</button>
        </div>
      </div>
      <ScenePreviewEditor key={sceneId} sceneId={sceneId} draftContent={draftContent} onDraftChange={onDraftChange} />
    </div>
  );
}
