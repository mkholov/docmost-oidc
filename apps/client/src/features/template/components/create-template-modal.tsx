import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useCreateTemplateMutation } from "@/features/template/queries/template-query.ts";
import TemplateScopeSelect from "./template-scope-select.tsx";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Create the template from this page's content ("Save as template"). */
  fromPageId?: string;
  defaultTitle?: string;
  defaultSpaceId?: string | null;
  /** Live editor content; falls back to the saved page content. */
  getContent?: () => any;
}

export default function CreateTemplateModal({
  opened,
  onClose,
  fromPageId,
  defaultTitle,
  defaultSpaceId,
  getContent,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const createMutation = useCreateTemplateMutation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setTitle(defaultTitle ?? "");
    setDescription("");
    // only admins can create workspace-wide templates
    setSpaceId(defaultSpaceId ?? null);
  }, [opened, defaultTitle, defaultSpaceId]);

  const submit = async () => {
    try {
      const template = await createMutation.mutateAsync({
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        spaceId,
        fromPageId,
        content: getContent?.() ?? undefined,
      });
      onClose();
      navigate(`/templates/${template.id}`);
    } catch {
      // notification shown by the mutation
    }
  };

  const scopeMissing = !isAdmin && !spaceId;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={fromPageId ? t("Save as template") : t("New template")}
    >
      <Stack gap="md">
        <TextInput
          label={t("Title")}
          placeholder={t("e.g. Server description")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-autofocus
        />
        <Textarea
          label={t("Description")}
          autosize
          minRows={2}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <TemplateScopeSelect
          label={t("Available in")}
          value={spaceId}
          onChange={setSpaceId}
          allowWorkspace={isAdmin}
          placeholder={t("Select a space")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={createMutation.isPending}
            disabled={scopeMissing}
          >
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
