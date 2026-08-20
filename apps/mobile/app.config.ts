import path from "node:path";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";
import { withIosAccentColor } from "./config-plugins/withIosAccentColor";

// Load .env file
config({
	path: path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

export default ({ config }: ConfigContext) => ({
	...config,
	name: "Superset",
	slug: "superset",
	version: "1.0.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "superset",
	splash: {
		image: "./assets/splash-icon.png",
		resizeMode: "contain" as const,
		backgroundColor: "#09090b",
	},
	ios: {
		supportsTablet: false,
		bundleIdentifier: "sh.superset.mobile",
		usesAppleSignIn: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#ffffff",
		},
		package: "sh.superset.mobile",
		predictiveBackGestureEnabled: false,
	},
	web: {
		favicon: "./assets/favicon.png",
		bundler: "metro",
	},
	plugins: [
		[withIosAccentColor, { color: "#FFFFFF" }],
		"expo-router",
		[
			"@sentry/react-native/expo",
			{
				organization: "superset-sh",
				project: "mobile",
			},
		],
		"expo-localization",
		"expo-apple-authentication",
		[
			"expo-image-picker",
			{
				photosPermission:
					"Superset needs access to your photo library so you can attach images to chat messages.",
				cameraPermission:
					"Superset uses the camera so you can attach photos to chat messages.",
				microphonePermission:
					"Superset uses the microphone so you can dictate chat messages.",
			},
		],
		"expo-document-picker",
		[
			"expo-speech-recognition",
			{
				microphonePermission:
					"Superset uses the microphone so you can dictate chat messages.",
				speechRecognitionPermission:
					"Superset uses speech recognition to turn your voice into text.",
			},
		],
	],
	extra: {
		router: {},
		eas: {
			projectId: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		},
	},
	owner: "supserset-sh",
});
