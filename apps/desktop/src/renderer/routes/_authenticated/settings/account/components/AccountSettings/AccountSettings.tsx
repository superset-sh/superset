import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getImageExtensionFromMimeType,
	parseBase64DataUrl,
} from "shared/file-types";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ProfileSkeleton } from "./components/ProfileSkeleton";

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const showProfile = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_PROFILE,
		visibleItems,
	);
	const showSignOut = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		visibleItems,
	);

	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const collections = useCollections();

	const [nameValue, setNameValue] = useState("");
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

	const { data: usersData, isLoading } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const user = usersData?.find((u) => u.id === currentUserId);

	const signOutMutation = electronTrpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Signed out"),
	});

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	useEffect(() => {
		if (!user) return;
		setNameValue(user.name ?? "");
		setAvatarPreview(user.image ?? null);
	}, [user]);

	async function handleAvatarUpload() {
		if (!user) return;

		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;

			const { mimeType } = parseBase64DataUrl(result.dataUrl);
			const ext = getImageExtensionFromMimeType(mimeType) ?? "png";

			const uploadResult = await apiTrpcClient.user.uploadAvatar.mutate({
				fileData: result.dataUrl,
				fileName: `avatar.${ext}`,
				mimeType,
			});

			setAvatarPreview(uploadResult.url);
			toast.success("Avatar updated!");
		} catch {
			toast.error("Failed to update avatar");
		}
	}

	async function handleNameBlur() {
		if (!user || nameValue === user.name) return;

		if (!nameValue) {
			setNameValue(user.name ?? "");
			return;
		}

		try {
			await apiTrpcClient.user.updateProfile.mutate({ name: nameValue });
			toast.success("Name updated!");
		} catch {
			toast.error("Failed to update name");
			setNameValue(user.name ?? "");
		}
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Account</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your account settings
				</p>
			</div>

			<div className="space-y-8">
				{showProfile && (
					<section>
						<h3 className="text-sm font-medium mb-3">Profile</h3>
						{isLoading ? (
							<ProfileSkeleton />
						) : user ? (
							<div className="rounded-lg border bg-card overflow-hidden">
								<SettingRow
									label="Avatar"
									hint="Recommended size is 256x256px"
								>
									<div className="flex items-center gap-3">
										<Avatar
											size="xl"
											fullName={user.name}
											image={avatarPreview}
										/>
										<Button
											variant="outline"
											size="sm"
											onClick={handleAvatarUpload}
											disabled={selectImageMutation.isPending}
										>
											Change
										</Button>
									</div>
								</SettingRow>

								<SettingRow label="Name">
									<Input
										value={nameValue}
										onChange={(e) => setNameValue(e.target.value)}
										onBlur={handleNameBlur}
										placeholder="Your name"
										className="w-80"
									/>
								</SettingRow>

								<SettingRow label="Email">
									<Input
										value={user.email}
										readOnly
										className="w-80 opacity-60"
									/>
								</SettingRow>
							</div>
						) : (
							<div className="rounded-lg border bg-card p-4">
								<p className="text-sm text-muted-foreground">
									Unable to load user info
								</p>
							</div>
						)}
					</section>
				)}

				{showSignOut && (
					<section>
						<h3 className="text-sm font-medium mb-3">Sign out</h3>
						<div className="rounded-lg border bg-card overflow-hidden">
							<SettingRow
								label="Sign out of this device"
								hint="You'll need to sign in again to use Superset on this device."
							>
								<Button
									variant="outline"
									onClick={() => signOutMutation.mutate()}
								>
									Sign out
								</Button>
							</SettingRow>
						</div>
					</section>
				)}
			</div>
		</div>
	);
}

interface SettingRowProps {
	label: string;
	hint?: string;
	children: React.ReactNode;
}

function SettingRow({ label, hint, children }: SettingRowProps) {
	return (
		<div className="flex items-center justify-between gap-8 p-4 border-t border-border first:border-t-0">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium">{label}</div>
				{hint && (
					<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
				)}
			</div>
			<div className="flex-shrink-0">{children}</div>
		</div>
	);
}
