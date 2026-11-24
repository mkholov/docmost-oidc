import { useState } from "react";
import { Button, Indicator, Modal, Tabs } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLock, IconWorld } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAtom } from "jotai";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useShareForPageQuery } from "@/features/share/queries/share-query";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
// public sharing is a free feature; its tab is reused unchanged
import { PublishTab } from "@/ee/page-permission/components/publish-tab";
import { PageAccessTab } from "./page-access-tab.tsx";

/**
 * "Share" button in the page header: page access (community page
 * restrictions) and public publishing.
 */
export function PageShareButton({ readOnly }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const { pageSlug, spaceSlug } = useParams();
  const [opened, { open, close }] = useDisclosure(false);
  const [tab, setTab] = useState<string | null>("access");

  const [workspace] = useAtom(workspaceAtom);
  const { data: space } = useSpaceQuery(spaceSlug);
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const pageId = page?.id;
  const isRestricted = page?.permissions?.hasRestriction ?? false;
  const { data: share } = useShareForPageQuery(pageId);
  const isPublic = !!share;

  return (
    <>
      <Button
        style={{ border: "none" }}
        size="compact-sm"
        variant="default"
        leftSection={
          isRestricted ? (
            <Indicator color="red" offset={5} withBorder>
              <IconLock size={20} stroke={1.5} />
            </Indicator>
          ) : isPublic ? (
            <Indicator color="green" offset={5} withBorder>
              <IconWorld size={20} stroke={1.5} />
            </Indicator>
          ) : null
        }
        onClick={() => {
          setTab(isPublic && !isRestricted ? "publish" : "access");
          open();
        }}
      >
        {t("Share")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={t("Share")}
        size={640}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Tabs value={tab} onChange={setTab} color="dark">
          <Tabs.List mb="md">
            <Tabs.Tab value="access">{t("Access")}</Tabs.Tab>
            <Tabs.Tab value="publish">{t("Publish")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="access">
            {pageId && opened && <PageAccessTab pageId={pageId} />}
          </Tabs.Panel>
          <Tabs.Panel value="publish">
            {pageId && (
              <PublishTab
                pageId={pageId}
                readOnly={readOnly}
                isRestricted={isRestricted}
                workspaceSharingDisabled={
                  workspace?.settings?.sharing?.disabled === true
                }
                spaceSharingDisabled={space?.settings?.sharing?.disabled === true}
              />
            )}
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
}
