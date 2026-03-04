import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@superset/auth/server";

export const GET = oauthProviderAuthServerMetadata(auth);
