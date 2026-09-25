import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { BIO_MAX } from "@superset/trpc/leaderboard-schema";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface Draft {
	handle: string;
	bio: string;
	xHandle: string;
	websiteUrl: string;
}

export function ProfileFields({ handle }: { handle: string }) {
	const { t } = useLingui();

	const profile = useQuery({
		queryKey: ["leaderboard", "profile", handle] as const,
		queryFn: () =>
			apiTrpcClient.leaderboard.public.participant.query({
				handle,
				period: "all",
			}),
		staleTime: 60_000,
		retry: false,
	});

	const [draft, setDraft] = useState<Draft | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		const loaded = profile.data;
		if (!loaded) return;
		setDraft((current) =>
			current?.handle === handle
				? current
				: {
						handle,
						bio: loaded.bio ?? "",
						xHandle: loaded.xHandle ?? "",
						websiteUrl: loaded.websiteUrl ?? "",
					},
		);
	}, [profile.data, handle]);

	const bio = draft?.bio ?? "";
	const xHandle = draft?.xHandle ?? "";
	const websiteUrl = draft?.websiteUrl ?? "";
	const edit = (patch: Partial<Omit<Draft, "handle">>) =>
		setDraft((current) => (current ? { ...current, ...patch } : current));
	const locked = !draft || profile.isError;

	const save = async () => {
		setSaving(true);
		try {
			await apiTrpcClient.leaderboard.updateProfile.mutate({
				bio: bio.trim() || null,
				xHandle: xHandle.trim() || null,
				websiteUrl: websiteUrl.trim() || null,
			});
			await profile.refetch();
			toast.success(
				t({
					message: "Saved",
				}),
			);
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't save"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="mt-4 space-y-3 border-t border-border pt-4">
			<div className="space-y-1.5">
				<Label htmlFor="leaderboard-bio" className="text-xs">
					<Trans>Bio</Trans>
				</Label>
				<Textarea
					id="leaderboard-bio"
					disabled={locked}
					value={bio}
					maxLength={BIO_MAX}
					rows={2}
					onChange={(event) => edit({ bio: event.target.value })}
					placeholder={t({
						message: "One line about how you work",
					})}
				/>
				<p className="text-[0.7rem] text-muted-foreground">
					<Trans>
						{String(bio.length)}/{String(BIO_MAX)}. Links are stripped.
					</Trans>
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div className="space-y-1.5">
					<Label htmlFor="leaderboard-x" className="text-xs">
						<Trans>X handle</Trans>
					</Label>
					<Input
						id="leaderboard-x"
						disabled={locked}
						value={xHandle}
						onChange={(event) => edit({ xHandle: event.target.value })}
						placeholder="yourhandle"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="leaderboard-site" className="text-xs">
						<Trans>Website</Trans>
					</Label>
					<Input
						id="leaderboard-site"
						disabled={locked}
						value={websiteUrl}
						onChange={(event) => edit({ websiteUrl: event.target.value })}
						placeholder="https://example.com"
					/>
				</div>
			</div>

			<p className="text-[0.7rem] text-muted-foreground">
				<Trans>
					Your GitHub link comes from the account you signed in with, so it
					shows as verified and cannot be edited here.
				</Trans>
			</p>

			{profile.isError ? (
				<div className="flex items-center gap-3">
					<p className="text-[0.7rem] text-destructive">
						<Trans>Couldn't load your profile, so editing is disabled.</Trans>
					</p>
					<Button size="sm" variant="outline" onClick={() => profile.refetch()}>
						<Trans>Retry</Trans>
					</Button>
				</div>
			) : (
				<Button size="sm" onClick={save} disabled={saving || !draft}>
					{saving ? <Trans>Saving…</Trans> : <Trans>Save profile</Trans>}
				</Button>
			)}
		</div>
	);
}
