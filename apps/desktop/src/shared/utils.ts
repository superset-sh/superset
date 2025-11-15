import pkg from "~/package.json";

const author = pkg.author.name ?? pkg.author;
const name = pkg.name;
const authorInKebabCase = author.replace(/\s+/g, "-");
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase();

/**
 * @param {string} id
 * @description Create the app id using the name and author from package.json transformed to kebab case if the id is not provided.
 * @default 'com.{author}.{app}' - the author and app comes from package.json
 * @example
 * makeAppId('com.example.app')
 * // => 'com.example.app'
 */
export function makeAppId(id: string = appId): string {
	return id;
}
