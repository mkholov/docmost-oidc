import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createOidcProvider,
  deleteOidcProvider,
  getOidcProviders,
  updateOidcProvider,
} from "@/features/oidc/services/oidc-service.ts";
import {
  ICreateOidcProvider,
  IOidcProvider,
  IUpdateOidcProvider,
} from "@/features/oidc/types/oidc.types.ts";

export const OIDC_PROVIDERS_KEY = ["oidc-providers"];

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

function useInvalidateProviders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: OIDC_PROVIDERS_KEY });
    // the login page reads enabled providers from the public workspace data
    queryClient.invalidateQueries({ queryKey: ["workspace-public"] });
  };
}

export function useOidcProvidersQuery() {
  return useQuery({
    queryKey: OIDC_PROVIDERS_KEY,
    queryFn: () => getOidcProviders(),
  });
}

export function useCreateOidcProviderMutation() {
  const { t } = useTranslation();
  const invalidate = useInvalidateProviders();
  return useMutation<IOidcProvider, Error, ICreateOidcProvider>({
    mutationFn: (data) => createOidcProvider(data),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: t("SSO provider created") });
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to create SSO provider")),
        color: "red",
      });
    },
  });
}

export function useUpdateOidcProviderMutation() {
  const { t } = useTranslation();
  const invalidate = useInvalidateProviders();
  return useMutation<IOidcProvider, Error, IUpdateOidcProvider>({
    mutationFn: (data) => updateOidcProvider(data),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: t("SSO provider updated") });
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to update SSO provider")),
        color: "red",
      });
    },
  });
}

export function useDeleteOidcProviderMutation() {
  const { t } = useTranslation();
  const invalidate = useInvalidateProviders();
  return useMutation<void, Error, string>({
    mutationFn: (providerId) => deleteOidcProvider(providerId),
    onSuccess: () => {
      invalidate();
      notifications.show({ message: t("SSO provider deleted") });
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to delete SSO provider")),
        color: "red",
      });
    },
  });
}
