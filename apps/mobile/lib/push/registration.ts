import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiClient } from "../trpc/client";

let registeredToken: string | null = null;

export async function registerForPush(): Promise<void> {
	if (!Device.isDevice) return;
	if (Platform.OS !== "ios" && Platform.OS !== "android") return;
	const { status } = await Notifications.requestPermissionsAsync();
	if (status !== "granted") return;
	const { data: token } = await Notifications.getExpoPushTokenAsync({
		projectId: Constants.expoConfig?.extra?.eas?.projectId,
	});
	await apiClient.push.registerDevice.mutate({
		token,
		platform: Platform.OS,
	});
	registeredToken = token;
}

export async function unregisterFromPush(): Promise<void> {
	const token = registeredToken;
	if (!token) return;
	registeredToken = null;
	await apiClient.push.unregisterDevice.mutate({ token });
}
