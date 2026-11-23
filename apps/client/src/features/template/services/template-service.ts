import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  ICreateTemplate,
  IListTemplatesParams,
  ITemplate,
  IUpdateTemplate,
} from "@/features/template/types/template.types.ts";

export async function getTemplates(
  params: IListTemplatesParams,
): Promise<IPagination<ITemplate>> {
  const req = await api.post<IPagination<ITemplate>>("/templates", params);
  return req.data;
}

export async function getTemplate(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/info", {
    templateId,
    includeContent: true,
  });
  return req.data;
}

export async function createTemplate(data: ICreateTemplate): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/create", data);
  return req.data;
}

export async function updateTemplate(data: IUpdateTemplate): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/update", data);
  return req.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.post("/templates/delete", { templateId });
}
