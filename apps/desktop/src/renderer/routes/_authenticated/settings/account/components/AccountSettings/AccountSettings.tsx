import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
		onSuccess: () => toast.success(t("settings.account.toast.signedOut")),
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
			toast.success(t("settings.account.toast.avatarUpdated"));
		} catch {
			toast.error(t("settings.account.toast.avatarFailed"));
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
			toast.success(t("settings.account.toast.nameUpdated"));
		} catch {
			toast.error(t("settings.account.toast.nameFailed"));
			setNameValue(user.name ?? "");
		}
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{t("settings.account.title")}</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{t("settings.account.subtitle")}
				</p>
			</div>

			<div className="space-y-3">
				{showProfile &&
					(isLoading ? (
						<ProfileSkeleton />
					) : user ? (
						<>
							<SettingRow
								label={t("settings.account.avatar.label")}
								hint={t("settings.account.avatar.hint")}
							>
								<button
									type="button"
									onClick={handleAvatarUpload}
									disabled={selectImageMutation.isPending}
									className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100"
									aria-label={t("settings.account.avatar.changeLabel")}
								>
									<Avatar
										size="xl"
										fullName={user.name}
										image={avatarPreview}
									/>
								</button>
							</SettingRow>

							<SettingRow label={t("settings.account.name.label")}>
								<Input
									value={nameValue}
									onChange={(e) => setNameValue(e.target.value)}
									onBlur={handleNameBlur}
									placeholder={t("settings.account.name.placeholder")}
									className="w-80"
								/>
							</SettingRow>

							<SettingRow label={t("settings.account.email.label")}>
								<Input
									value={user.email}
									readOnly
									className="w-80 opacity-60"
								/>
							</SettingRow>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							{t("settings.account.unableToLoad")}
						</p>
					))}

				{showSignOut && (
					<div className={showProfile ? "pt-5" : undefined}>
						<SettingRow
							label={t("settings.account.signOut.label")}
							hint={t("settings.account.signOut.hint")}
						>
							<Button
								variant="outline"
								onClick={() => signOutMutation.mutate()}
							>
								{t("settings.account.signOut.button")}
							</Button>
						</SettingRow>
					</div>
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
		<div className="flex items-center justify-between gap-8">
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
