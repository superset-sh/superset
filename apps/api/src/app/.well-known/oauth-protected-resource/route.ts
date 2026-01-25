import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { auth } from "@superset/auth/server";

export const GET = oAuthProtectedResourceMetadata(auth);
