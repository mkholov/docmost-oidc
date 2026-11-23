import type { Editor } from "@tiptap/core";
import { ITemplate } from "@/features/template/types/template.types.ts";

/**
 * Fills an empty page with a template: body goes into the collaborative
 * editor (so it syncs like normal typing) and the title is set if the page
 * has none yet. Returns false if the page is no longer empty.
 */
export function applyTemplateToEditors(
  editor: Editor,
  titleEditor: Editor | null,
  template: ITemplate,
): boolean {
  if (!editor || editor.isDestroyed || !editor.isEmpty) return false;
  if (template.content) {
    editor.commands.setContent(template.content);
  }
  if (
    template.title &&
    titleEditor &&
    !titleEditor.isDestroyed &&
    titleEditor.isEditable &&
    !titleEditor.getText().trim()
  ) {
    titleEditor.commands.setContent(template.title);
  }
  return true;
}
