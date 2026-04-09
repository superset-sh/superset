export interface SshConnectionConfig {
	host: string;
	port: number;
	user: string;
	identityFile?: string;
	workDir: string;
	containerName?: string;
}

export interface DevcontainerScriptOutput {
	host: string;
	port: number;
	user: string;
	identityFile?: string;
	workDir: string;
	containerName?: string;
}

export interface DevcontainerScriptInput {
	repo: string;
	branch: string;
	branchNoPrefix: string;
	newBranch: boolean;
	workspaceName: string;
	workspaceId: string;
}
