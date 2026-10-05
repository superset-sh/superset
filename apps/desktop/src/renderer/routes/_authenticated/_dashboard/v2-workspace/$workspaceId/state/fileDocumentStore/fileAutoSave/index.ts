import { getDocuments, subscribeDocuments } from "../fileDocumentStore";
import { FileAutoSaveController } from "./fileAutoSave";

export const fileAutoSave = new FileAutoSaveController({
	getDocuments,
	subscribeDocuments,
});
