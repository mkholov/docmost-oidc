import { Select, SelectProps } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { WORKSPACE_SCOPE } from "@/features/template/types/template.types.ts";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  /** null = whole workspace */
  value: string | null;
  onChange: (spaceId: string | null) => void;
  /** Hide the workspace-wide option (e.g. for non-admins). */
  allowWorkspace?: boolean;
}

/** Picks where a template is available: the whole workspace or one space. */
export default function TemplateScopeSelect({
  value,
  onChange,
  allowWorkspace = true,
  ...rest
}: Props) {
  const { t } = useTranslation();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });

  const data = [
    ...(allowWorkspace
      ? [{ value: WORKSPACE_SCOPE, label: t("Whole workspace") }]
      : []),
    ...(spaces?.items ?? [])
      .filter((s) => !s.archivedAt)
      .map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Select
      data={data}
      value={value ?? (allowWorkspace ? WORKSPACE_SCOPE : null)}
      onChange={(v) => onChange(!v || v === WORKSPACE_SCOPE ? null : v)}
      allowDeselect={false}
      searchable
      {...rest}
    />
  );
}
