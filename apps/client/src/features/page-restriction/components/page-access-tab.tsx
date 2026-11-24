import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconInfoCircle,
  IconLock,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IconGroupCircle } from "@/components/icons/icon-people-circle.tsx";
import { MultiMemberSelect } from "@/features/space/components/multi-member-select.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import {
  useAddPageMembers,
  usePageMembers,
  usePageRestrictionInfo,
  useRemovePageMember,
  useRestrictPage,
  useUnrestrictPage,
  useUpdatePageMemberRole,
} from "@/features/page-restriction/queries/page-restriction-query.ts";
import {
  IPageMember,
  PageMemberRole,
} from "@/features/page-restriction/services/page-restriction-service.ts";

const OPEN = "space";
const RESTRICTED = "restricted";

export function PageAccessTab({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: info, isLoading } = usePageRestrictionInfo(pageId);
  const { data: members } = usePageMembers(pageId, !!info?.isRestricted);
  const restrict = useRestrictPage(pageId);
  const unrestrict = useUnrestrictPage(pageId);

  if (isLoading || !info) return <Loader size="sm" />;

  const canManage = info.canManage;

  const changeGeneralAccess = (value: string | null) => {
    if (value === RESTRICTED && !info.isRestricted) {
      restrict.mutate(undefined);
    }
    if (value === OPEN && info.isRestricted) {
      modals.openConfirmModal({
        title: t("Remove restriction"),
        children: (
          <Text size="sm">
            {t(
              "Everyone in the space will be able to open this page again. Continue?",
            )}
          </Text>
        ),
        centered: true,
        labels: { confirm: t("Remove restriction"), cancel: t("Cancel") },
        onConfirm: () => unrestrict.mutate(undefined),
      });
    }
  };

  return (
    <Stack gap="md">
      {info.inheritedFrom && (
        <Alert variant="light" color="orange" icon={<IconLock size={18} />}>
          {t("Access is also limited by the parent page")}{" "}
          <Anchor
            component={Link}
            to={buildPageUrl(
              spaceSlug,
              info.inheritedFrom.slugId,
              info.inheritedFrom.title ?? undefined,
            )}
          >
            {info.inheritedFrom.title || t("Untitled")}
          </Anchor>
          {". "}
          {t("People need access there as well.")}
        </Alert>
      )}

      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {info.isRestricted ? <IconLock size={20} /> : <IconUsers size={20} />}
          <div>
            <Text size="sm" fw={500}>
              {t("General access")}
            </Text>
            <Text size="xs" c="dimmed">
              {info.isRestricted
                ? t("Only the people and groups below can open this page and its subpages")
                : t("Everyone in the space can open this page")}
            </Text>
          </div>
        </Group>
        <Select
          w={210}
          allowDeselect={false}
          disabled={!canManage || restrict.isPending || unrestrict.isPending}
          value={info.isRestricted ? RESTRICTED : OPEN}
          onChange={changeGeneralAccess}
          data={[
            { value: OPEN, label: t("Space members") },
            { value: RESTRICTED, label: t("Only selected people") },
          ]}
          aria-label={t("General access")}
        />
      </Group>

      {!canManage && (
        <Text size="xs" c="dimmed">
          {t("Only people who can edit this page can change its access.")}
        </Text>
      )}

      {info.isRestricted && (
        <>
          {canManage && <AddMembersForm pageId={pageId} />}
          <Stack gap={6}>
            {(members?.items ?? []).map((member) => (
              <MemberRow
                key={`${member.type}-${member.id}`}
                pageId={pageId}
                member={member}
                canManage={canManage}
              />
            ))}
          </Stack>
        </>
      )}

      {!info.isRestricted && canManage && (
        <Alert variant="light" icon={<IconInfoCircle size={18} />}>
          {t(
            "Choose “Only selected people” to hide this page and its subpages from the rest of the space.",
          )}
        </Alert>
      )}
    </Stack>
  );
}

function AddMembersForm({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<PageMemberRole>("reader");
  // remount the select after adding to clear its internal search state
  const [resetKey, setResetKey] = useState(0);
  const add = useAddPageMembers(pageId);

  const submit = () => {
    const userIds = selected
      .filter((v) => v.startsWith("user-"))
      .map((v) => v.slice(5));
    const groupIds = selected
      .filter((v) => v.startsWith("group-"))
      .map((v) => v.slice(6));
    add.mutate(
      { userIds, groupIds, role },
      {
        onSuccess: () => {
          setSelected([]);
          setResetKey((k) => k + 1);
        },
      },
    );
  };

  return (
    <Group align="flex-end" gap="xs" wrap="nowrap">
      <div style={{ flex: 1 }}>
        <MultiMemberSelect key={resetKey} onChange={setSelected} />
      </div>
      <RoleSelect value={role} onChange={setRole} />
      <Button onClick={submit} disabled={!selected.length} loading={add.isPending}>
        {t("Add")}
      </Button>
    </Group>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: PageMemberRole;
  onChange: (role: PageMemberRole) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select
      w={150}
      allowDeselect={false}
      disabled={disabled}
      value={value}
      onChange={(v) => v && onChange(v as PageMemberRole)}
      data={[
        { value: "reader", label: t("Can view") },
        { value: "writer", label: t("Can edit") },
      ]}
      aria-label={t("Role")}
    />
  );
}

function MemberRow({
  pageId,
  member,
  canManage,
}: {
  pageId: string;
  member: IPageMember;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const remove = useRemovePageMember(pageId);
  const updateRole = useUpdatePageMemberRole(pageId);
  const target =
    member.type === "user" ? { userId: member.id } : { groupId: member.id };
  const isMe = member.type === "user" && member.id === currentUser?.user?.id;

  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        {member.type === "user" ? (
          <CustomAvatar avatarUrl={member.avatarUrl} name={member.name} size={32} />
        ) : (
          <IconGroupCircle />
        )}
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {member.name}
            {isMe ? ` (${t("you")})` : ""}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {member.type === "user"
              ? member.email
              : t("{{count}} members", { count: member.memberCount })}
          </Text>
        </div>
      </Group>
      <Group gap={4} wrap="nowrap">
        <RoleSelect
          value={member.role}
          disabled={!canManage || updateRole.isPending}
          onChange={(role) => updateRole.mutate({ ...target, role })}
        />
        {canManage && (
          <Tooltip label={t("Remove access")} withArrow>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("Remove access")}
              loading={remove.isPending}
              onClick={() => remove.mutate(target)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
}
