import { useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch, IconTemplate } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTemplatesQuery } from "@/features/template/queries/template-query.ts";
import { getTemplate } from "@/features/template/services/template-service.ts";
import { ITemplate } from "@/features/template/types/template.types.ts";
import classes from "./template.module.css";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Receives the full template (with content). Return false to keep the modal open. */
  onUse: (template: ITemplate) => Promise<boolean | void> | boolean | void;
}

export default function TemplatePickerModal({ opened, onClose, onUse }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [query] = useDebouncedValue(search, 250);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, isLoading } = useTemplatesQuery({ query }, opened);

  const pick = async (template: ITemplate) => {
    setBusyId(template.id);
    try {
      const full = await getTemplate(template.id);
      const result = await onUse(full);
      if (result !== false) onClose();
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <Modal opened={opened} onClose={onClose} title={t("Choose a template")} size="lg">
      <Stack gap="sm">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder={t("Search templates")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-autofocus
        />
        <ScrollArea.Autosize mah={420}>
          {isLoading && <Loader size="sm" />}
          {!isLoading && items.length === 0 && (
            <Text size="sm" c="dimmed" py="md" ta="center">
              {t("No templates found")}
            </Text>
          )}
          <Stack gap={4}>
            {items.map((tpl) => (
              <UnstyledButton
                key={tpl.id}
                className={classes.pickerItem}
                onClick={() => pick(tpl)}
                disabled={!!busyId}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    {tpl.icon ? (
                      <span>{tpl.icon}</span>
                    ) : (
                      <IconTemplate size={18} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {tpl.title || t("Untitled")}
                      </Text>
                      {tpl.description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {tpl.description}
                        </Text>
                      )}
                    </div>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed">
                      {tpl.spaceName ?? t("Whole workspace")}
                    </Text>
                    {busyId === tpl.id && <Loader size="xs" />}
                  </Group>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
