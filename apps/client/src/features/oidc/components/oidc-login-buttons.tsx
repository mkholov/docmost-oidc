import { useEffect, useMemo, useRef } from "react";
import { Alert, Button, Divider, Stack } from "@mantine/core";
import { IconAlertCircle, IconLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import { getRedirectParam } from "@/lib/app-route.ts";
import { buildOidcLoginUrl } from "@/features/oidc/services/oidc-service.ts";
import { IPublicAuthProvider } from "@/features/oidc/types/oidc.types.ts";

const AUTO_REDIRECT_KEY = "docmost:oidcAutoRedirect";
const AUTO_REDIRECT_COOLDOWN_MS = 2 * 60_000;

const ERROR_MESSAGES: Record<string, string> = {
  provider_not_found: "This sign-in provider is not available.",
  invalid_state: "Your sign-in session expired. Please try again.",
  idp_error: "The identity provider rejected the sign-in.",
  token_exchange_failed: "Could not complete sign-in with the identity provider.",
  email_missing: "The identity provider did not share your email address.",
  email_not_verified: "Your email address is not verified at the identity provider.",
  signup_disabled: "No account exists for this email. Ask an admin to invite you.",
  domain_not_allowed: "Your email domain is not allowed in this workspace.",
  account_conflict: "This account is already linked to a different identity.",
  user_disabled: "Your account has been deactivated.",
  sso_failed: "Single sign-on failed. Please try again.",
};

function readSsoError(): string | null {
  const code = new URLSearchParams(window.location.search).get("sso_error");
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.sso_failed;
}

function autoRedirectedRecently(): boolean {
  try {
    const ts = Number(window.sessionStorage.getItem(AUTO_REDIRECT_KEY));
    return Number.isFinite(ts) && Date.now() - ts < AUTO_REDIRECT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberAutoRedirect() {
  try {
    window.sessionStorage.setItem(AUTO_REDIRECT_KEY, String(Date.now()));
  } catch {
    // storage unavailable; the cooldown is best-effort
  }
}

export default function OidcLoginButtons() {
  const { t } = useTranslation();
  const { data } = useWorkspacePublicDataQuery();
  const { data: currentUser } = useCurrentUser();
  const autoRedirected = useRef(false);
  const ssoError = useMemo(() => readSsoError(), []);

  const providers: IPublicAuthProvider[] = useMemo(
    () => (data?.authProviders ?? []).filter((p) => p.type === "oidc"),
    [data?.authProviders],
  );

  const signIn = (provider: IPublicAuthProvider) => {
    window.location.href = buildOidcLoginUrl(provider.id, getRedirectParam());
  };

  // With SSO enforced and a single provider there is nothing to choose,
  // so go straight to the IdP unless we just came back from it.
  useEffect(() => {
    if (autoRedirected.current) return;
    if (!data?.enforceSso || providers.length !== 1) return;
    if (currentUser?.user || ssoError) return;
    if (new URLSearchParams(window.location.search).has("logout")) return;
    if (autoRedirectedRecently()) return;

    autoRedirected.current = true;
    rememberAutoRedirect();
    signIn(providers[0]);
  }, [data?.enforceSso, providers, currentUser?.user, ssoError]);

  if (!providers.length && !ssoError) {
    return null;
  }

  return (
    <>
      {ssoError && (
        <Alert
          variant="light"
          color="red"
          icon={<IconAlertCircle />}
          mb="md"
          role="alert"
        >
          {t(ssoError)}
        </Alert>
      )}

      {providers.length > 0 && (
        <>
          <Stack align="stretch" justify="center" gap="sm">
            {providers.map((provider) => (
              <Button
                key={provider.id}
                onClick={() => signIn(provider)}
                leftSection={<IconLock size={16} />}
                variant="default"
                fullWidth
              >
                {t("Sign in with {{name}}", { name: provider.name })}
              </Button>
            ))}
          </Stack>

          {!data?.enforceSso && (
            <Divider my="xs" label={t("OR")} labelPosition="center" />
          )}
        </>
      )}
    </>
  );
}
