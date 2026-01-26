import { auth } from "@superset/auth/server";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

export const GET = oAuthDiscoveryMetadata(auth);
