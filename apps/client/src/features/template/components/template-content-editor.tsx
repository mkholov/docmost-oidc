import "@/features/editor/styles/index.css";
import { useEffect, useRef } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { templateEditorExtensions } from "@/features/editor/extensions/extensions";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import { EditorLinkMenu } from "@/features/editor/components/link/link-menu";
import TableMenu from "@/features/editor/components/table/table-menu.tsx";
import { TableHandlesLayer } from "@/features/editor/components/table/handle/table-handles-layer";
import ImageMenu from "@/features/editor/components/image/image-menu.tsx";
import VideoMenu from "@/features/editor/components/video/video-menu.tsx";
import CalloutMenu from "@/features/editor/components/callout/callout-menu.tsx";
import ColumnsMenu from "@/features/editor/components/columns/columns-menu.tsx";
import DrawioMenu from "@/features/editor/components/drawio/drawio-menu";
import ExcalidrawMenu from "@/features/editor/components/excalidraw/excalidraw-menu-lazy";
import { platformModifierKey } from "@/lib";
import useCurrentUser from "@/features/user/hooks/use-current-user";

interface Props {
  templateId: string;
  content: any;
  editable: boolean;
  onChange?: (editor: Editor) => void;
  onSave?: () => void;
}

/**
 * Plain (non-collaborative) editor used for template bodies. Changes are
 * kept locally and saved explicitly by the template page.
 */
export default function TemplateContentEditor({
  templateId,
  content,
  editable,
  onChange,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const editorRef = useRef<Editor | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor(
    {
      extensions: templateEditorExtensions,
      content,
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      textDirection: "auto",
      editorProps: {
        attributes: { "aria-label": t("Template content") },
        handleDOMEvents: {
          keydown: (_view, event) => {
            if (platformModifierKey(event) && event.code === "KeyS") {
              event.preventDefault();
              onSaveRef.current?.();
              return true;
            }
            if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
              if (document.querySelector("#slash-command")) return true;
            }
          },
        },
        handlePaste: (_view, event) => {
          if (!editorRef.current) return false;
          return handlePaste(
            editorRef.current,
            event,
            { templateId },
            currentUser?.user?.id,
          );
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (!editorRef.current) return false;
          return handleFileDrop(editorRef.current, event, moved, {
            templateId,
          });
        },
      },
      onCreate({ editor }) {
        // uploads (images, files) are attached to the template
        // @ts-ignore
        editor.storage.templateId = templateId;
        editorRef.current = editor;
      },
      onUpdate({ editor }) {
        onChangeRef.current?.(editor);
      },
    },
    [templateId],
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className="editor-container" style={{ position: "relative" }}>
      <EditorContent editor={editor} />
      {editor && editable && (
        <div>
          <EditorLinkMenu editor={editor} />
          <EditorBubbleMenu editor={editor} />
          <TableMenu editor={editor} />
          <TableHandlesLayer editor={editor} />
          <ImageMenu editor={editor} />
          <VideoMenu editor={editor} />
          <CalloutMenu editor={editor} />
          <ExcalidrawMenu editor={editor} />
          <DrawioMenu editor={editor} />
          <ColumnsMenu editor={editor} />
        </div>
      )}
      <div style={{ paddingBottom: "20vh" }} />
    </div>
  );
}
