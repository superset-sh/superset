import type { FileAutoSaveMode } from "@superset/local-db";
import type { SharedFileDocument } from "../types";

interface ScheduledSave {
	content: string | null;
	pending: boolean;
	blocked: boolean;
	requested: boolean;
	timer?: ReturnType<typeof setTimeout>;
}

interface DocumentSource {
	getDocuments(): SharedFileDocument[];
	subscribeDocuments(listener: () => void): () => void;
}

export class FileAutoSaveController {
	private mode: FileAutoSaveMode = "off";
	private readonly scheduled = new Map<string, ScheduledSave>();
	private running = false;

	constructor(private readonly source: DocumentSource) {}

	start(): () => void {
		this.running = true;
		const unsubscribe = this.source.subscribeDocuments(() => this.reconcile());
		this.reconcile();
		return () => {
			this.running = false;
			unsubscribe();
			for (const state of this.scheduled.values()) this.cancel(state);
			this.scheduled.clear();
		};
	}

	setMode(mode: FileAutoSaveMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		for (const state of this.scheduled.values()) {
			this.cancel(state);
			state.requested = false;
		}
		this.reconcile();
	}

	onFocusChange(document: SharedFileDocument): void {
		if (this.mode === "onFocusChange") this.request(document);
	}

	onWindowChange(): void {
		if (this.mode !== "onWindowChange" && this.mode !== "onFocusChange") return;
		for (const document of this.source.getDocuments()) this.request(document);
	}

	private cancel(state: ScheduledSave): void {
		clearTimeout(state.timer);
		state.timer = undefined;
	}

	private reconcile(): void {
		if (!this.running) return;
		const documents = this.source.getDocuments();
		const ids = new Set(documents.map((document) => document.id));
		for (const [id, state] of this.scheduled) {
			if (!ids.has(id)) {
				this.cancel(state);
				this.scheduled.delete(id);
			}
		}
		for (const document of documents) {
			const content =
				document.content.kind === "text" ? document.content.value : null;
			let state = this.scheduled.get(document.id);
			if (!state) {
				state = {
					content: null,
					pending: false,
					blocked: false,
					requested: false,
				};
				this.scheduled.set(document.id, state);
			}
			const changed = content !== state.content;
			const finished = state.pending && !document.pendingSave;
			state.content = content;
			state.pending = document.pendingSave;
			if (document.conflict || document.saveError) state.blocked = true;
			else if (!document.dirty || (finished && !document.hasExternalChange))
				state.blocked = false;
			if (
				!document.dirty ||
				content === null ||
				document.orphaned ||
				state.blocked ||
				this.mode === "off"
			) {
				this.cancel(state);
				state.requested = false;
				continue;
			}
			if (document.pendingSave) {
				this.cancel(state);
				continue;
			}
			if (state.requested) {
				this.request(document);
			} else if (this.mode === "afterDelay" && (changed || !state.timer)) {
				this.cancel(state);
				state.timer = setTimeout(() => {
					state.timer = undefined;
					this.request(document);
				}, 3000);
			}
		}
	}

	private request(document: SharedFileDocument): void {
		const state = this.scheduled.get(document.id);
		if (
			!this.running ||
			!state ||
			state.blocked ||
			!document.dirty ||
			document.orphaned ||
			document.conflict ||
			document.saveError
		)
			return;
		this.cancel(state);
		if (document.pendingSave) {
			state.requested = true;
			return;
		}
		state.requested = false;
		void document.save().then((result) => {
			if (result.status !== "saved") {
				state.blocked = true;
				state.requested = false;
				this.cancel(state);
			}
		});
	}
}
