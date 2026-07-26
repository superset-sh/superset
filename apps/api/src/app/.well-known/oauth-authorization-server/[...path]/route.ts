import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@superset/auth/server";
import { withAgentAuthMetadata } from "@/lib/agent-auth-metadata";

export const GET = withAgentAuthMetadata(oauthProviderAuthServerMetadata(auth));
