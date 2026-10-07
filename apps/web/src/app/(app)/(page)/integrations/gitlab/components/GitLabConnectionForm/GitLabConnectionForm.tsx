import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";

interface GitLabConnectionFormProps {
	i18n: I18n;
	apiUrl: string;
	organizationId: string;
	oauthHost: string | null;
	tokenHost: string;
	groupPath: string;
	disabled: boolean;
}

export function GitLabConnectionForm({
	i18n,
	apiUrl,
	organizationId,
	oauthHost,
	tokenHost,
	groupPath,
	disabled,
}: GitLabConnectionFormProps) {
	const connectUrl = new URL("/api/gitlab/connect", apiUrl);
	const tokenUrl = new URL(connectUrl);
	tokenUrl.searchParams.set("organizationId", organizationId);
	return (
		<div className="grid gap-6 md:grid-cols-2">
			<section className="space-y-3">
				<h3 className="font-medium">
					{i18n._(msg({ message: "Connect with GitLab" }))}
				</h3>
				{oauthHost ? (
					<form action={tokenUrl.href} method="post">
						<fieldset disabled={disabled} className="space-y-3">
							<input type="hidden" name="mode" value="oauth" />
							<input
								type="hidden"
								name="organizationId"
								value={organizationId}
							/>
							<input type="hidden" name="host" value={oauthHost} />
							<p className="text-sm text-muted-foreground">{oauthHost}</p>
							<label className="block space-y-1" htmlFor="gitlab-oauth-path">
								<span>{i18n._(msg({ message: "Project or group path" }))}</span>
								<Input
									id="gitlab-oauth-path"
									name="groupPath"
									defaultValue={groupPath}
									placeholder="acme/subgroup/project"
									required
								/>
							</label>
							<Button type="submit">
								{i18n._(msg({ message: "Connect with GitLab" }))}
							</Button>
						</fieldset>
					</form>
				) : (
					<p className="text-sm text-muted-foreground">
						{i18n._(
							msg({
								message:
									"The server's GitLab OAuth host is invalid. Contact your administrator or use a token.",
							}),
						)}
					</p>
				)}
			</section>
			<section className="space-y-3">
				<h3 className="font-medium">
					{i18n._(msg({ message: "Connect with a token" }))}
				</h3>
				<p className="text-sm text-muted-foreground">
					{i18n._(
						msg({
							message:
								"Use a personal access token with api and read_repository scopes. Your GitLab account must be allowed to manage webhooks for the selected project or group.",
						}),
					)}
				</p>
				<form action={tokenUrl.href} method="post">
					<fieldset disabled={disabled} className="space-y-3">
						<label className="block space-y-1" htmlFor="gitlab-token-host">
							<span>{i18n._(msg({ message: "GitLab host" }))}</span>
							<Input
								id="gitlab-token-host"
								name="host"
								defaultValue={tokenHost}
								placeholder="gitlab.com"
								required
							/>
						</label>
						<label className="block space-y-1" htmlFor="gitlab-token-path">
							<span>{i18n._(msg({ message: "Project or group path" }))}</span>
							<Input
								id="gitlab-token-path"
								name="groupPath"
								defaultValue={groupPath}
								placeholder="acme/subgroup/project"
								required
							/>
						</label>
						<label className="block space-y-1" htmlFor="gitlab-token">
							<span>{i18n._(msg({ message: "Personal access token" }))}</span>
							<Input
								id="gitlab-token"
								name="token"
								type="password"
								autoComplete="new-password"
								required
							/>
						</label>
						<Button type="submit">
							{i18n._(msg({ message: "Connect with a token" }))}
						</Button>
					</fieldset>
				</form>
			</section>
		</div>
	);
}
