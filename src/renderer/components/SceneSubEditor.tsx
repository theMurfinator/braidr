import { useRef, useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Placeholder from '@tiptap/extension-placeholder';
import { Scene } from '../../shared/types';

function cleanContent(text: string): string {
  return text
    .replace(/==\*\*/g, '').replace(/\*\*==/g, '').replace(/==/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
}

interface SceneSubEditorProps {
  sceneKey: string;
  scene: Scene;
  content: string;
  characterName: string;
  characterColor: string;
  isFirst: boolean;
  onContentChange: (sceneKey: string, html: string) => void;
  onFocus: (sceneKey: string) => void;
  registerEditor: (sceneKey: string, editor: Editor | null) => void;
  onWordCountChange: (sceneKey: string, count: number) => void;
}

export default function SceneSubEditor({
  sceneKey,
  scene,
  content,
  characterName,
  characterColor,
  isFirst,
  onContentChange,
  onFocus,
  registerEditor,
  onWordCountChange,
}: SceneSubEditorProps) {
  const pendingRef = useRef<{ key: string; html: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingContentRef = useRef(false);
  const sceneKeyRef = useRef(sceneKey);
  sceneKeyRef.current = sceneKey;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const editor = useEditor({
    editorProps: {
      attributes: { spellcheck: 'true' },
    },
    extensions: [
      StarterKit,
      Heading.configure({ levels: [2, 3] }),
      HorizontalRule,
      Placeholder.configure({ placeholder: 'Start writing this scene...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      if (settingContentRef.current) return;
      const html = editor.getHTML();
      pendingRef.current = { key: sceneKeyRef.current, html };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) {
          onContentChangeRef.current(pendingRef.current.key, pendingRef.current.html);
          pendingRef.current = null;
        }
      }, 800);

      // Report word count
      const wc = editor.getText().split(/\s+/).filter(Boolean).length;
      onWordCountChange(sceneKeyRef.current, wc);
    },
    onFocus: () => {
      onFocus(sceneKey);
    },
  });

  // Register/unregister editor with parent
  useEffect(() => {
    if (editor) {
      registerEditor(sceneKey, editor);
    }
    return () => {
      registerEditor(sceneKey, null);
    };
  }, [editor, sceneKey]);

  // Sync content when it changes externally (e.g. draft restore)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== content) {
        settingContentRef.current = true;
        editor.commands.setContent(content || '');
        settingContentRef.current = false;
      }
    }
  }, [content]);

  // Report initial word count
  useEffect(() => {
    if (editor) {
      const wc = editor.getText().split(/\s+/).filter(Boolean).length;
      onWordCountChange(sceneKey, wc);
    }
  }, [editor]);

  // Flush pending content on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingRef.current) {
        onContentChangeRef.current(pendingRef.current.key, pendingRef.current.html);
        pendingRef.current = null;
      }
    };
  }, []);

  return (
    <div className="scrivenings-scene">
      {!isFirst && (
        <div className="scrivenings-divider">
          <div className="scrivenings-divider-line" />
        </div>
      )}
      <div className="scrivenings-scene-header">
        <span className="scrivenings-scene-label" style={{ color: characterColor }}>
          {characterName} {scene.sceneNumber}
        </span>
        <span className="scrivenings-scene-title">
          {cleanContent(scene.content) || 'Untitled scene'}
        </span>
      </div>
      <div className="scrivenings-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
