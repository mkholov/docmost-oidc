import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/main.tsx";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  updateTemplate,
} from "@/features/template/services/template-service.ts";
import {
  ICreateTemplate,
  IListTemplatesParams,
  ITemplate,
  IUpdateTemplate,
} from "@/features/template/types/template.types.ts";

export const TEMPLATES_KEY = "templates";
const templateKey = (id: string) => ["template", id];

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function useTemplatesQuery(params: IListTemplatesParams, enabled = true) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, params],
    queryFn: () => getTemplates({ limit: 100, ...params }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function prefetchTemplates() {
  void queryClient.prefetchQuery({
    queryKey: [TEMPLATES_KEY, {}],
    queryFn: () => getTemplates({ limit: 100 }),
  });
}

export function useTemplateQuery(templateId: string | undefined) {
  return useQuery({
    queryKey: templateKey(templateId ?? ""),
    queryFn: () => getTemplate(templateId as string),
    enabled: !!templateId,
    // keep the editor from being reset by background refetches
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateTemplateMutation() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation<ITemplate, Error, ICreateTemplate>({
    mutationFn: (data) => createTemplate(data),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
      qc.setQueryData(templateKey(template.id), template);
      notifications.show({ message: t("Template created") });
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to create template")),
        color: "red",
      });
    },
  });
}

export function useUpdateTemplateMutation() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation<ITemplate, Error, IUpdateTemplate>({
    mutationFn: (data) => updateTemplate(data),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
      qc.setQueryData(templateKey(template.id), template);
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to save template")),
        color: "red",
      });
    },
  });
}

export function useDeleteTemplateMutation() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (templateId) => deleteTemplate(templateId),
    onSuccess: (_data, templateId) => {
      qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
      qc.removeQueries({ queryKey: templateKey(templateId) });
      notifications.show({ message: t("Template deleted") });
    },
    onError: (err) => {
      notifications.show({
        message: errorMessage(err, t("Failed to delete template")),
        color: "red",
      });
    },
  });
}
