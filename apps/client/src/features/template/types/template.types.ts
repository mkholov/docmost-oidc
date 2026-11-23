export interface ITemplateCreator {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ITemplate {
  id: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  /** null = available in the whole workspace */
  spaceId: string | null;
  spaceName?: string | null;
  creatorId: string | null;
  creator?: ITemplateCreator | null;
  createdAt: string;
  updatedAt: string;
  content?: any;
  canEdit?: boolean;
}

/** "workspace", a space id, or undefined for everything visible. */
export type TemplateScope = string | undefined;

export interface IListTemplatesParams {
  scope?: TemplateScope;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface ICreateTemplate {
  title?: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: any;
  fromPageId?: string;
}

export interface IUpdateTemplate {
  templateId: string;
  title?: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: any;
}

export const WORKSPACE_SCOPE = "workspace";
