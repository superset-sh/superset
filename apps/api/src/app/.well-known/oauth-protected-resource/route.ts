import { auth } from "@superset/auth/server";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

export const GET = oAuthProtectedResourceMetadata(auth);
