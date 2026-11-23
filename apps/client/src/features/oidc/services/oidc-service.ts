import api from "@/lib/api-client";
import {
  ICreateOidcProvider,
  IOidcProvider,
  IOidcProviderList,
  IUpdateOidcProvider,
} from "@/features/oidc/types/oidc.types.ts";

export async function getOidcProviders(): Promise<IOidcProviderList> {
  const req = await api.post<IOidcProviderList>("/oidc/providers");
  return req.data;
}

export async function createOidcProvider(
  data: ICreateOidcProvider,
): Promise<IOidcProvider> {
  const req = await api.post<IOidcProvider>("/oidc/providers/create", data);
  return req.data;
}

export async function updateOidcProvider(
  data: IUpdateOidcProvider,
): Promise<IOidcProvider> {
  const req = await api.post<IOidcProvider>("/oidc/providers/update", data);
  return req.data;
}

export async function deleteOidcProvider(providerId: string): Promise<void> {
  await api.post("/oidc/providers/delete", { providerId });
}

export function buildOidcLoginUrl(providerId: string, redirect?: string | null) {
  const url = `/api/oidc/${encodeURIComponent(providerId)}/login`;
  return redirect ? `${url}?redirect=${encodeURIComponent(redirect)}` : url;
}
