import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";

export type PageMemberRole = "reader" | "writer";

export interface IPageRestrictionInfo {
  pageId: string;
  spaceId: string;
  isRestricted: boolean;
  inheritedFrom: { pageId: string; slugId: string; title: string | null } | null;
  canManage: boolean;
  canEdit: boolean;
}

export type IPageMember =
  | {
      type: "user";
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      role: PageMemberRole;
    }
  | {
      type: "group";
      id: string;
      name: string;
      memberCount: number;
      isDefault: boolean;
      role: PageMemberRole;
    };

export async function getPageRestrictionInfo(pageId: string) {
  const req = await api.post<IPageRestrictionInfo>("/page-access/info", { pageId });
  return req.data;
}

export async function getPageMembers(pageId: string) {
  const req = await api.post<IPagination<IPageMember>>("/page-access/members", {
    pageId,
    limit: 100,
  });
  return req.data;
}

export async function restrictPage(pageId: string) {
  const req = await api.post<IPageRestrictionInfo>("/page-access/restrict", { pageId });
  return req.data;
}

export async function unrestrictPage(pageId: string) {
  const req = await api.post<IPageRestrictionInfo>("/page-access/unrestrict", { pageId });
  return req.data;
}

export async function addPageMembers(data: {
  pageId: string;
  userIds?: string[];
  groupIds?: string[];
  role: PageMemberRole;
}) {
  const req = await api.post<{ added: number }>("/page-access/add", data);
  return req.data;
}

export async function removePageMember(data: {
  pageId: string;
  userId?: string;
  groupId?: string;
}) {
  await api.post("/page-access/remove", data);
}

export async function updatePageMemberRole(data: {
  pageId: string;
  userId?: string;
  groupId?: string;
  role: PageMemberRole;
}) {
  await api.post("/page-access/role", data);
}
