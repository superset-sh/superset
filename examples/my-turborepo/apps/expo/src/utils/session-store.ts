import * as SecureStore from "expo-secure-store";

const key = "session_token";

export const getToken = () => SecureStore.getItem(key);
export const deleteToken = () => SecureStore.deleteItemAsync(key);
export const setToken = (v: string) => SecureStore.setItem(key, v);
