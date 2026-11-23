import { useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconDots,
  IconFilePlus,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import {
  useDeleteTemplateMutation,
  useTemplatesQuery,
} from "@/features/template/queries/template-query.ts";
import {
  ITemplate,
  WORKSPACE_SCOPE,
} from "@/features/template/types/template.types.ts";
import CreateTemplateModal from "@/features/template/components/create-template-modal.tsx";
import UseTemplateModal from "@/features/template/components/use-template-modal.tsx";
import classes from "@/features/template/components/template.module.css";

const ALL = "all";

export default function TemplateList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [query] = useDebouncedValue(search, 250);
  const [scope, setScope] = useState<string>(ALL);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data, isLoading } = useTemplatesQuery({
    query,
    scope: scope === ALL ? undefined : scope,
  });
  const deleteMutation = useDeleteTemplateMutation();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [useTarget, setUseTarget] = useState<ITemplate | null>(null);

  const scopeOptions = [
    { value: ALL, label: t("All templates") },
    { value: WORKSPACE_SCOPE, label: t("Whole workspace") },
    ...(spaces?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const confirmDelete = (tpl: ITemplate) =>
    modals.openConfirmModal({
      title: t("Delete template"),
      children: (
        <Text size="sm">
          {t("Delete “{{title}}”? Pages created from it are not affected.", {
            title: tpl.title || t("Untitled"),
          })}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(tpl.id),
    });

  const items = data?.items ?? [];

  return (
    <Container size={1000} py="xl">
      <DocumentTitle title={t("Templates")} />
      <Group justify="space-between" mb="lg">
        <Title order={1} size="h3">
          {t("Templates")}
        </Title>
        <Button leftSection={<IconPlus size={16} />} onClick={createHandlers.open}>
          {t("New template")}
        </Button>
      </Group>

      <Group mb="lg" gap="sm" grow preventGrowOverflow={false}>
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder={t("Search templates")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          data={scopeOptions}
          value={scope}
          onChange={(v) => setScope(v ?? ALL)}
          allowDeselect={false}
          searchable
          maw={260}
        />
      </Group>

      {!isLoading && items.length === 0 && (
        <Stack align="center" py={60} gap="xs">
          <IconTemplate size={40} stroke={1.5} />
          <Text fw={500}>{t("No templates yet")}</Text>
          <Text size="sm" c="dimmed" ta="center" maw={420}>
            {t(
              "Create a template from scratch, or open any page and choose “Save as template” in its menu.",
            )}
          </Text>
        </Stack>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {items.map((tpl) => (
          <Card
            key={tpl.id}
            withBorder
            radius="md"
            padding="md"
            className={classes.card}
            onClick={() => navigate(`/templates/${tpl.id}`)}
          >
            <Stack gap="xs" h="100%">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {tpl.icon ? <span>{tpl.icon}</span> : <IconTemplate size={18} />}
                  <Text fw={500} truncate>
                    {tpl.title || t("Untitled")}
                  </Text>
                </Group>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t("Template actions")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                    <Menu.Item
                      leftSection={<IconFilePlus size={16} />}
                      onClick={() => setUseTarget(tpl)}
                    >
                      {t("Create page")}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconPencil size={16} />}
                      onClick={() => navigate(`/templates/${tpl.id}`)}
                    >
                      {t("Open")}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={16} />}
                      onClick={() => confirmDelete(tpl)}
                    >
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              {tpl.description && (
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {tpl.description}
                </Text>
              )}
              <Group justify="space-between" mt="auto">
                <Text size="xs" c="dimmed">
                  {tpl.spaceName ?? t("Whole workspace")}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUseTarget(tpl);
                  }}
                >
                  {t("Use")}
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      <CreateTemplateModal
        opened={createOpened}
        onClose={createHandlers.close}
        defaultSpaceId={scope !== ALL && scope !== WORKSPACE_SCOPE ? scope : null}
      />
      <UseTemplateModal
        opened={!!useTarget}
        onClose={() => setUseTarget(null)}
        template={useTarget}
      />
    </Container>
  );
}
