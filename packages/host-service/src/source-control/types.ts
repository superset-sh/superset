import type {
	RepositoryIdentity,
	SourceControlProvider,
} from "@superset/shared/source-control";
import type { GitLabClient } from "./gitlab/gitlab";

export interface SourceControlProviderClient {
	provider: SourceControlProvider;
	repository: RepositoryIdentity;
	gitlab?: GitLabClient;
}
