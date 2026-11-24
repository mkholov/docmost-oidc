import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  addPageMembers,
  getPageMembers,
  getPageRestrictionInfo,
  removePageMember,
  restrictPage,
  unrestrictPage,
  updatePageMemberRole,
} from "@/features/page-restriction/services/page-restriction-service.ts";

const infoKey = (pageId: string) => ["page-access-info", pageId];
const membersKey = (pageId: string) => ["page-access-members", pageId];

export function usePageRestrictionInfo(pageId: string | undefined) {
  return useQuery({
    queryKey: infoKey(pageId ?? ""),
    queryFn: () => getPageRestrictionInfo(pageId as string),
    enabled: !!pageId,
  });
}

export function usePageMembers(pageId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: membersKey(pageId ?? ""),
    queryFn: () => getPageMembers(pageId as string),
    enabled: !!pageId && enabled,
  });
}

/** Shared mutation wiring: refresh access info, members, page and tree. */
function usePageAccessMutation<TVars>(
  pageId: string,
  fn: (vars: TVars) => Promise<unknown>,
  successMessage?: string,
) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: infoKey(pageId) });
      qc.invalidateQueries({ queryKey: membersKey(pageId) });
      // page.permissions (lock icon, edit mode) and the sidebar tree
      qc.invalidateQueries({ queryKey: ["pages"] });
      qc.invalidateQueries({ queryKey: ["root-sidebar-pages"] });
      qc.invalidateQueries({ queryKey: ["sidebar-pages"] });
      if (successMessage) notifications.show({ message: t(successMessage) });
    },
    onError: (err: any) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to update access"),
        color: "red",
      });
    },
  });
}

export function useRestrictPage(pageId: string) {
  return usePageAccessMutation(pageId, () => restrictPage(pageId), "Page access restricted");
}

export function useUnrestrictPage(pageId: string) {
  return usePageAccessMutation(pageId, () => unrestrictPage(pageId), "Page access restored");
}

export function useAddPageMembers(pageId: string) {
  return usePageAccessMutation(
    pageId,
    (vars: { userIds: string[]; groupIds: string[]; role: "reader" | "writer" }) =>
      addPageMembers({ pageId, ...vars }),
    "Access granted",
  );
}

export function useRemovePageMember(pageId: string) {
  return usePageAccessMutation(
    pageId,
    (vars: { userId?: string; groupId?: string }) => removePageMember({ pageId, ...vars }),
  );
}

export function useUpdatePageMemberRole(pageId: string) {
  return usePageAccessMutation(
    pageId,
    (vars: { userId?: string; groupId?: string; role: "reader" | "writer" }) =>
      updatePageMemberRole({ pageId, ...vars }),
  );
}
