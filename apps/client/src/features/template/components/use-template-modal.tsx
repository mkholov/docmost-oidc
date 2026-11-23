import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { createPage } from "@/features/page/services/page-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getTemplate } from "@/features/template/services/template-service.ts";
import { ITemplate } from "@/features/template/types/template.types.ts";

interface Props {
  opened: boolean;
  onClose: () => void;
  template: ITemplate | null;
}

/** Creates a new page in a chosen space from a template. */
export default function UseTemplateModal({ opened, onClose, template }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeSpaces = (spaces?.items ?? []).filter((s) => !s.archivedAt);

  useEffect(() => {
    if (!opened) return;
    setSpaceId(template?.spaceId ?? activeSpaces[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, template?.id]);

  const submit = async () => {
    if (!template || !spaceId) return;
    setLoading(true);
    try {
      const full = template.content ? template : await getTemplate(template.id);
      const page = await createPage({
        spaceId,
        title: full.title ?? undefined,
        icon: full.icon ?? undefined,
        content: full.content,
        format: "json",
      } as any);
      const space = activeSpaces.find((s) => s.id === spaceId);
      onClose();
      navigate(buildPageUrl(space?.slug, page.slugId, page.title));
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to create page"),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Create page from template")}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t("A new page will be created from “{{title}}”.", {
            title: template?.title || t("Untitled"),
          })}
        </Text>
        <Select
          label={t("Space")}
          data={activeSpaces.map((s) => ({ value: s.id, label: s.name }))}
          value={spaceId}
          onChange={(v) => setSpaceId(v as string | null)}
          searchable
          allowDeselect={false}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={loading} disabled={!spaceId}>
            {t("Create page")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
