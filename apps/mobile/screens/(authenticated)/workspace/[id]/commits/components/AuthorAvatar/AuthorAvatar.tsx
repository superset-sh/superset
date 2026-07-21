import { useLiveQuery } from "@tanstack/react-db";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

// GitHub noreply addresses encode the account: `<id>+<login>@` (current) or
// `<login>@` (legacy) — both resolve to an avatar URL without any lookup.
const GITHUB_NOREPLY =
	/^(?:(\d+)\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/;

function githubAvatarUrl(email: string): string | null {
	const match = GITHUB_NOREPLY.exec(email);
	if (!match) return null;
	const [, id, login] = match;
	return id
		? `https://avatars.githubusercontent.com/u/${id}?s=72`
		: `https://github.com/${login}.png?size=72`;
}

/**
 * Commit-author avatar: an org member's Superset avatar matched by email,
 * then by exact display name (git emails rarely match account emails), then
 * GitHub noreply-derived URLs, else an initial.
 */
export function AuthorAvatar({
	name,
	email,
	size = 18,
}: {
	name: string;
	// Optional at runtime: hosts older than the authorEmail field omit it.
	email: string | undefined;
	size?: number;
}) {
	const collections = useCollections();
	const { data: users } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);
	const [failed, setFailed] = useState(false);

	const url = useMemo(() => {
		const normalizedEmail = (email ?? "").trim().toLowerCase();
		const normalizedName = name.trim().toLowerCase();
		const byEmail = normalizedEmail
			? (users ?? []).find(
					(user) => user.email.toLowerCase() === normalizedEmail,
				)
			: undefined;
		const byName =
			normalizedName.length > 0
				? (users ?? []).find(
						(user) => user.name.trim().toLowerCase() === normalizedName,
					)
				: undefined;
		return (
			byEmail?.image ??
			byName?.image ??
			(normalizedEmail ? githubAvatarUrl(normalizedEmail) : null)
		);
	}, [users, email, name]);

	const dimensions = { width: size, height: size, borderRadius: size / 2 };

	if (!url || failed) {
		return (
			<View className="bg-muted items-center justify-center" style={dimensions}>
				<Text
					className="text-muted-foreground font-semibold"
					style={{ fontSize: size * 0.55, lineHeight: size }}
				>
					{(name.trim()[0] ?? "?").toUpperCase()}
				</Text>
			</View>
		);
	}
	return (
		<Image
			source={{ uri: url }}
			style={dimensions}
			onError={() => setFailed(true)}
		/>
	);
}
