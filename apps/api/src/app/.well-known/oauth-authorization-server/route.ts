import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@superset/auth/server";

export const GET = oAuthDiscoveryMetadata(auth);
