import { ClaudeRuntimeAuthCredentialMatching } from "./credential-matching";

export interface ClaudeRuntimeAccount {
	selection: string | null;
	credentialsJson: string;
	oauthAccount: unknown;
}

export interface ClaudeRuntimeStorage {
	readSelection(): Promise<ClaudeRuntimeAccount | null>;
	checkpointRuntime(): Promise<() => Promise<void>>;
	readRuntime(): Promise<{ credentials: string[]; oauthAccount: unknown }>;
	readAccounts(): Promise<ClaudeRuntimeAccount[]>;
	writeAccount(account: ClaudeRuntimeAccount): Promise<void>;
	writeRuntime(account: ClaudeRuntimeAccount): Promise<void>;
	writeSelection(account: ClaudeRuntimeAccount): Promise<void>;
}

const identity = new ClaudeRuntimeAuthCredentialMatching();

export async function switchClaudeRuntimeAccount(
	storage: ClaudeRuntimeStorage,
	selection: string | null,
	commit: () => Promise<void>,
): Promise<void> {
	let previous = await storage.readSelection();
	let accounts = await storage.readAccounts();
	if (previous) {
		const runtime = await storage.readRuntime();
		const accepted: ClaudeRuntimeAccount[] = [];
		for (const credentialsJson of new Set(runtime.credentials)) {
			if (
				credentialsJson === previous.credentialsJson ||
				!identity.isValidCredentialsJsonObject(credentialsJson)
			)
				continue;
			const matches = accounts.map((account) => ({
				account,
				match: identity.runtimeCredentialsMatchAccount(
					credentialsJson,
					runtime.oauthAccount,
					identity.readIdentityFromOauthAccount(account.oauthAccount),
					account.credentialsJson,
					account.oauthAccount,
				),
			}));
			const matched = matches.filter(({ match }) => match === "match");
			if (
				matched.length !== 1 ||
				matches.some(({ match }) => match === "unverifiable")
			)
				continue;
			const account = matched[0]?.account;
			if (!account) continue;
			if (
				identity.runtimeCredentialsAreOlder(
					credentialsJson,
					account.credentialsJson,
				)
			)
				continue;
			accepted.push({ ...account, credentialsJson });
		}
		const freshest = accepted.sort(
			(left, right) =>
				(identity.readFreshnessFromCredentials(right.credentialsJson) ?? 0) -
				(identity.readFreshnessFromCredentials(left.credentialsJson) ?? 0),
		)[0];
		if (freshest) {
			await storage.writeAccount(freshest);
			accounts = await storage.readAccounts();
			previous =
				accounts.find((account) => account.selection === previous?.selection) ??
				previous;
		} else if (
			selection === previous.selection &&
			runtime.credentials.some(
				(credentials) =>
					credentials !== previous?.credentialsJson &&
					identity.isValidCredentialsJsonObject(credentials),
			)
		) {
			await commit();
			return;
		}
	}
	const selected = accounts.find((account) => account.selection === selection);
	if (
		!selected ||
		!identity.isValidCredentialsJsonObject(selected.credentialsJson)
	) {
		throw new Error(
			"The selected Claude account has no readable subscription credentials.",
		);
	}
	const restore = await storage.checkpointRuntime();
	try {
		await storage.writeRuntime(selected);
		await storage.writeSelection(selected);
		await commit();
	} catch (error) {
		await restore();
		throw error;
	}
}
