import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerRootComponent } from "expo";
import { view } from "./storybook.requires";

const StorybookUIRoot = view.getStorybookUI({
	storage: {
		getItem: AsyncStorage.getItem,
		setItem: AsyncStorage.setItem,
	},
	enableWebsockets: true,
});

registerRootComponent(StorybookUIRoot);

export default StorybookUIRoot;
