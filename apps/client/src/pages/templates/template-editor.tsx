import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconFilePlus,
  IconInfoCircle,
  IconTrash,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  useDeleteTemplateMutation,
  useTemplateQuery,
  useUpdateTemplateMutation,
} from "@/features/template/queries/template-query.ts";
import TemplateContentEditor from "@/features/template/components/template-content-editor.tsx";
import TemplateScopeSelect from "@/features/template/components/template-scope-select.tsx";
import UseTemplateModal from "@/features/template/components/use-template-modal.tsx";
import classes from "@/features/template/components/template.module.css";

export default function TemplateEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { isAdmin } = useUserRole();
  const { data: template, isLoading, isError } = useTemplateQuery(templateId);
  const updateMutation = useUpdateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [useOpened, setUseOpened] = useState(false);
  const contentRef = useRef<any>(null);

  useEffect(() => {
    if (!template) return;
    setTitle(template.title ?? "");
    setDescription(template.description ?? "");
    setSpaceId(template.spaceId ?? null);
    contentRef.current = template.content;
    setDirty(false);
    // reset only when another template is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  // warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const canEdit = !!template?.canEdit;

  const save = useCallback(async () => {
    if (!template || !canEdit) return;
    try {
      await updateMutation.mutateAsync({
        templateId: template.id,
        title: title.trim(),
        description,
        content: contentRef.current,
        ...(spaceId !== (template.spaceId ?? null) ? { spaceId } : {}),
      });
      setDirty(false);
      notifications.show({ message: t("Template saved") });
    } catch {
      // notification shown by the mutation
    }
  }, [template, canEdit, title, description, spaceId, updateMutation, t]);

  const onContentChange = useCallback((editor: Editor) => {
    contentRef.current = editor.getJSON();
    setDirty(true);
  }, []);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t("Delete template"),
      children: (
        <Text size="sm">
          {t("Delete “{{title}}”? Pages created from it are not affected.", {
            title: template?.title || t("Untitled"),
          })}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await deleteMutation.mutateAsync(template.id);
        setDirty(false);
        navigate("/templates");
      },
    });

  if (isLoading) {
    return (
      <Container py="xl">
        <Loader size="sm" />
      </Container>
    );
  }

  if (isError || !template) {
    return (
      <Container py="xl">
        <Text>{t("Template not found")}</Text>
      </Container>
    );
  }

  return (
    <div>
      <DocumentTitle title={template.title || t("Untitled")} />
      <Container size={900} pt="md">
        <Group justify="space-between" mb="md">
          <Button
            component={Link}
            to="/templates"
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
          >
            {t("Templates")}
          </Button>
          <Group gap="xs">
            {dirty && (
              <Badge color="yellow" variant="light">
                {t("Unsaved changes")}
              </Badge>
            )}
            <Button
              variant="default"
              leftSection={<IconFilePlus size={16} />}
              onClick={() => setUseOpened(true)}
              disabled={dirty}
              title={dirty ? t("Save the template first") : undefined}
            >
              {t("Create page")}
            </Button>
            {canEdit && (
              <>
                <Button
                  leftSection={<IconDeviceFloppy size={16} />}
                  onClick={save}
                  loading={updateMutation.isPending}
                  disabled={!dirty}
                >
                  {t("Save")}
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  onClick={confirmDelete}
                  aria-label={t("Delete template")}
                >
                  <IconTrash size={16} />
                </Button>
              </>
            )}
          </Group>
        </Group>

        {!canEdit && (
          <Alert variant="light" icon={<IconInfoCircle />} mb="md">
            {t("You can use this template but not edit it.")}
          </Alert>
        )}

        <Stack gap="sm" mb="lg">
          <TextInput
            variant="unstyled"
            size="xl"
            fw={700}
            placeholder={t("Untitled")}
            value={title}
            readOnly={!canEdit}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              setDirty(true);
            }}
            styles={{ input: { fontSize: "2rem", fontWeight: 700 } }}
            aria-label={t("Template title")}
          />
          <Group grow align="flex-start">
            <Textarea
              placeholder={t("Description")}
              autosize
              minRows={1}
              value={description}
              readOnly={!canEdit}
              onChange={(e) => {
                setDescription(e.currentTarget.value);
                setDirty(true);
              }}
              aria-label={t("Description")}
            />
            <TemplateScopeSelect
              value={spaceId}
              onChange={(v) => {
                setSpaceId(v);
                setDirty(true);
              }}
              allowWorkspace={isAdmin || !template.spaceId}
              disabled={!canEdit}
              aria-label={t("Available in")}
              maw={260}
            />
          </Group>
          {canEdit && (
            <Text size="xs" c="dimmed">
              {t("Type / to insert blocks. Press Ctrl+S to save.")}
            </Text>
          )}
        </Stack>
      </Container>

      <div className={classes.editorShell}>
        <TemplateContentEditor
          templateId={template.id}
          content={template.content}
          editable={canEdit}
          onChange={onContentChange}
          onSave={save}
        />
      </div>

      <UseTemplateModal
        opened={useOpened}
        onClose={() => setUseOpened(false)}
        template={template}
      />
    </div>
  );
}
