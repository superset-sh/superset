import { env } from "@/env";

/**
 * The OpenID sign-in that follows admin consent. Shared by the consent
 * callback, which starts it, and the identity callback, which finishes it —
 * the redirect URI and scopes have to match on both legs.
 */
export const IDENTITY_REDIRECT_URI = `${env.NEXT_PUBLIC_API_URL}/api/integrations/microsoft-teams/identity/callback`;
export const IDENTITY_SCOPES = "openid profile email";
