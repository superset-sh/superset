import { createCommand } from "@superset/cli-framework";
import type { ApiClient } from "./api-client";
import type { SupersetConfig } from "./config";
import type { AuthSource } from "./resolve-auth";

export interface CliContext {
	api: ApiClient;
	config: SupersetConfig;
	bearer: string;
	authSource: AuthSource;
}

export const command = createCommand<CliContext>();
