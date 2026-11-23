import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import CopyTextButton from "@/components/common/copy.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import {
  useDeleteOidcProviderMutation,
  useOidcProvidersQuery,
} from "@/features/oidc/queries/oidc-query.ts";
import OidcProviderModal from "@/features/oidc/components/oidc-provider-modal.tsx";
import { IOidcProvider } from "@/features/oidc/types/oidc.types.ts";

export default function OidcSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data, isLoading } = useOidcProvidersQuery();
  const deleteMutation = useDeleteOidcProviderMutation();
  const [modalOpened, setModalOpened] = useState(false);
  const [editing, setEditing] = useState<IOidcProvider | null>(null);

  if (!isAdmin) return null;

  const providers = data?.items ?? [];

  const openCreate = () => {
    setEditing(null);
    setModalOpened(true);
  };

  const openEdit = (provider: IOidcProvider) => {
    setEditing(provider);
    setModalOpened(true);
  };

  const confirmDelete = (provider: IOidcProvider) => {
    modals.openConfirmModal({
      title: t("Delete SSO provider"),
      children: (
        <Text size="sm">
          {t(
            "Users linked to {{name}} will no longer be able to sign in with it. Are you sure?",
            { name: provider.name },
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(provider.id),
    });
  };

  return (
    <>
      <DocumentTitle title={t("Single sign-on")} />
      <SettingsTitle title={t("Single sign-on (OIDC)")} />

      <Stack gap="lg">
        <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
          {t(
            "Connect an OpenID Connect identity provider such as Keycloak, Authentik, Okta, Entra ID or Google Workspace. Register the redirect URI below as an allowed callback in your provider.",
          )}
        </Alert>

        <EnforceSsoToggle hasEnabledProvider={providers.some((p) => p.isEnabled)} />

        <Group justify="space-between">
          <Title order={2} size="h4">
            {t("Providers")}
          </Title>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            {t("Add provider")}
          </Button>
        </Group>

        {!isLoading && providers.length === 0 && (
          <Text c="dimmed" size="sm">
            {t("No SSO providers configured yet.")}
          </Text>
        )}

        {providers.map((provider) => {
          const callbackUrl = data.callbackUrlTemplate.replace(
            "{providerId}",
            provider.id,
          );
          return (
            <Card key={provider.id} withBorder padding="md" radius="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Text fw={500}>{provider.name}</Text>
                    <Badge
                      color={provider.isEnabled ? "green" : "gray"}
                      variant="light"
                    >
                      {provider.isEnabled ? t("Enabled") : t("Disabled")}
                    </Badge>
                    {provider.allowSignup && (
                      <Badge variant="light">{t("Signup allowed")}</Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed" truncate>
                    {provider.oidcIssuer}
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm">{t("Redirect URI")}:</Text>
                    <Code style={{ overflowWrap: "anywhere" }}>
                      {callbackUrl}
                    </Code>
                    <CopyTextButton
                      text={callbackUrl}
                      size="sm"
                      label={t("Copy redirect URI")}
                    />
                  </Group>
                </Stack>

                <Group gap="xs" wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t("Edit")}
                    onClick={() => openEdit(provider)}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t("Delete")}
                    onClick={() => confirmDelete(provider)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>

      <OidcProviderModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        provider={editing}
      />
    </>
  );
}

function EnforceSsoToggle({ hasEnabledProvider }: { hasEnabledProvider: boolean }) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const checked = !!workspace?.enforceSso;

  const apply = async (value: boolean) => {
    try {
      const updated = await updateWorkspace({ enforceSso: value });
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to update"),
        color: "red",
      });
    }
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    if (!value) {
      apply(false);
      return;
    }
    modals.openConfirmModal({
      title: t("Enforce SSO"),
      children: (
        <Text size="sm">
          {t(
            "Password login will be disabled for everyone, including admins. Make sure you can sign in with SSO before enabling this.",
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Enforce"), cancel: t("Cancel") },
      onConfirm: () => apply(true),
    });
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Enforce SSO")}</Text>
        <Text size="sm" c="dimmed">
          {t("Members can only sign in through an SSO provider.")}
        </Text>
      </div>
      <Switch
        checked={checked}
        disabled={!checked && !hasEnabledProvider}
        onChange={onChange}
        aria-label={t("Toggle enforce SSO")}
      />
    </Group>
  );
}
