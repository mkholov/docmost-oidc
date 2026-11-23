import { useEffect } from "react";
import {
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { IOidcProvider } from "@/features/oidc/types/oidc.types.ts";
import {
  useCreateOidcProviderMutation,
  useUpdateOidcProviderMutation,
} from "@/features/oidc/queries/oidc-query.ts";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Provider to edit; omit to create a new one. */
  provider?: IOidcProvider | null;
}

interface FormValues {
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  allowSignup: boolean;
  isEnabled: boolean;
}

export default function OidcProviderModal({ opened, onClose, provider }: Props) {
  const { t } = useTranslation();
  const createMutation = useCreateOidcProviderMutation();
  const updateMutation = useUpdateOidcProviderMutation();
  const isEdit = !!provider;

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      oidcIssuer: "",
      oidcClientId: "",
      oidcClientSecret: "",
      allowSignup: false,
      isEnabled: true,
    },
    validate: {
      name: (v) => (v.trim() ? null : t("Name is required")),
      oidcIssuer: (v) => {
        try {
          const url = new URL(v.trim());
          return ["http:", "https:"].includes(url.protocol)
            ? null
            : t("Enter a valid URL");
        } catch {
          return t("Enter a valid URL");
        }
      },
      oidcClientId: (v) => (v.trim() ? null : t("Client ID is required")),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues({
      name: provider?.name ?? "",
      oidcIssuer: provider?.oidcIssuer ?? "",
      oidcClientId: provider?.oidcClientId ?? "",
      oidcClientSecret: "",
      allowSignup: provider?.allowSignup ?? false,
      isEnabled: provider?.isEnabled ?? true,
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, provider?.id]);

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name.trim(),
      oidcIssuer: values.oidcIssuer.trim(),
      oidcClientId: values.oidcClientId.trim(),
      allowSignup: values.allowSignup,
      isEnabled: values.isEnabled,
      ...(values.oidcClientSecret
        ? { oidcClientSecret: values.oidcClientSecret }
        : {}),
    };

    if (isEdit) {
      await updateMutation.mutateAsync({ providerId: provider.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onClose();
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t("Edit OIDC provider") : t("Add OIDC provider")}
      size="lg"
    >
      <form onSubmit={form.onSubmit((v) => onSubmit(v).catch(() => {}))}>
        <Stack gap="md">
          <TextInput
            label={t("Display name")}
            description={t('Shown on the login button, e.g. "Keycloak"')}
            withAsterisk
            {...form.getInputProps("name")}
          />
          <TextInput
            label={t("Issuer URL")}
            description={t(
              "The /.well-known/openid-configuration document must be served under this URL",
            )}
            placeholder="https://sso.example.com/realms/main"
            withAsterisk
            {...form.getInputProps("oidcIssuer")}
          />
          <TextInput
            label={t("Client ID")}
            withAsterisk
            {...form.getInputProps("oidcClientId")}
          />
          <PasswordInput
            label={t("Client secret")}
            description={
              isEdit && provider?.hasClientSecret
                ? t("Leave empty to keep the current secret")
                : t("Leave empty for public clients")
            }
            autoComplete="new-password"
            {...form.getInputProps("oidcClientSecret")}
          />
          <Switch
            label={t("Allow signup")}
            description={t(
              "Create an account for users who sign in for the first time",
            )}
            {...form.getInputProps("allowSignup", { type: "checkbox" })}
          />
          <Switch
            label={t("Enabled")}
            description={t("Show this provider on the login page")}
            {...form.getInputProps("isEnabled", { type: "checkbox" })}
          />

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={loading}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
