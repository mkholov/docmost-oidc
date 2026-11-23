import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconTable,
  IconLayoutKanban,
  IconCalendar,
  IconForms,
  IconTemplate,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { ErrorBoundary } from "react-error-boundary";
import { useConvertPageToBaseMutation } from "@/ee/base/queries/base-query";
import {
  pageEditorAtom,
  titleEditorAtom,
  yjsSyncedAtom,
} from "@/features/editor/atoms/editor-atoms";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { ITemplate } from "@/features/template/types/template.types.ts";
import { applyTemplateToEditors } from "@/features/template/components/apply-template.ts";
import { isBetaBaseForms } from "@/lib/config.ts";
import classes from "./empty-page-get-started.module.css";

const TemplatePickerModal = lazy(
  () => import("@/features/template/components/template-picker-modal.tsx"),
);

type EmptyPageGetStartedProps = {
  pageId: string;
  spaceId: string;
  editable: boolean;
};

export function EmptyPageGetStarted({
  pageId,
  spaceId,
  editable,
}: EmptyPageGetStartedProps) {
  const { t } = useTranslation();
  const editor = useAtomValue(pageEditorAtom);
  const titleEditor = useAtomValue(titleEditorAtom);
  const isSynced = useAtomValue(yjsSyncedAtom);
  const hasBases = useHasFeature(Feature.BASES);
  // community templates are always available
  const hasTemplates = true;
  const convertMutation = useConvertPageToBaseMutation();
  const [
    templatePickerOpened,
    { open: openTemplatePicker, close: closeTemplatePicker },
  ] = useDisclosure(false);

  const [isEmpty, setIsEmpty] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const sync = () => setIsEmpty(editor.isEmpty);
    sync();
    editor.on("update", sync);
    editor.on("create", sync);
    return () => {
      editor.off("update", sync);
      editor.off("create", sync);
    };
  }, [editor]);

  const handleUseTemplate = async (selected: ITemplate) => {
    if (!editor || editor.isDestroyed) {
      return false;
    }
    if (!applyTemplateToEditors(editor, titleEditor, selected)) {
      notifications.show({
        message: t("This page is no longer empty"),
        color: "red",
      });
      return false;
    }
    return true;
  };

  const chips = [
    ...(hasBases
      ? [
          {
            key: "base",
            label: t("Base"),
            icon: IconTable,
            color: "blue",
            onClick: () => convertMutation.mutate({ pageId }),
            disabled: convertMutation.isPending,
          },
          {
            key: "kanban",
            label: t("Kanban"),
            icon: IconLayoutKanban,
            color: "violet",
            onClick: () =>
              convertMutation.mutate({ pageId, template: "kanban" }),
            disabled: convertMutation.isPending,
          },
          {
            key: "calendar",
            label: t("Calendar"),
            icon: IconCalendar,
            color: "orange",
            onClick: () =>
              convertMutation.mutate({ pageId, template: "calendar" }),
            disabled: convertMutation.isPending,
          },
          ...(isBetaBaseForms()
            ? [
                {
                  key: "form",
                  label: t("Form"),
                  icon: IconForms,
                  color: "green",
                  onClick: () =>
                    convertMutation.mutate({ pageId, template: "form" }),
                  disabled: convertMutation.isPending,
                },
              ]
            : []),
        ]
      : []),
    ...(hasTemplates
      ? [
          {
            key: "template",
            label: t("Template"),
            icon: IconTemplate,
            color: "pink",
            onClick: openTemplatePicker,
            disabled: false,
          },
        ]
      : []),
  ];

  const showChips =
    editable && !!editor && isSynced && isEmpty && chips.length > 0;

  return (
    <>
      {showChips && (
        <div className={classes.wrapper} contentEditable={false}>
          <span className={classes.label}>{t("Get started with")}</span>
          <div className={classes.chipRow}>
            {chips.map((chip) => (
              <Button
                key={chip.key}
                variant="subtle"
                color="gray"
                size="sm"
                radius="md"
                className={classes.chip}
                leftSection={
                  <chip.icon
                    size={18}
                    color={`var(--mantine-color-${chip.color}-6)`}
                  />
                }
                onClick={chip.onClick}
                disabled={chip.disabled}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {hasTemplates && templatePickerOpened && (
        <ErrorBoundary fallbackRender={() => null}>
          <Suspense fallback={null}>
            <TemplatePickerModal
              opened={templatePickerOpened}
              onClose={closeTemplatePicker}
              onUse={handleUseTemplate}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
