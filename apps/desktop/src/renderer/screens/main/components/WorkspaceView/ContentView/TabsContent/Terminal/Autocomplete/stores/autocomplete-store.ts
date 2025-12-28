import { create } from "zustand";

export interface AutocompleteState {
	// Ghost text suggestion
	suggestion: string | null;
	suggestionPrefix: string;

	// Command buffer tracking
	commandBuffer: string;

	// UI state
	isHistoryPickerOpen: boolean;
	isCompletionDropdownOpen: boolean;

	// Completion dropdown state
	completions: Array<{
		name: string;
		insertText: string;
		isDirectory: boolean;
		icon: string;
	}>;
	selectedCompletionIndex: number;

	// Actions
	setSuggestion: (suggestion: string | null, prefix?: string) => void;
	setCommandBuffer: (buffer: string) => void;
	appendToCommandBuffer: (char: string) => void;
	backspaceCommandBuffer: () => void;
	clearCommandBuffer: () => void;
	openHistoryPicker: () => void;
	closeHistoryPicker: () => void;
	openCompletionDropdown: (
		completions: Array<{
			name: string;
			insertText: string;
			isDirectory: boolean;
			icon: string;
		}>,
	) => void;
	closeCompletionDropdown: () => void;
	selectNextCompletion: () => void;
	selectPrevCompletion: () => void;
	getSelectedCompletion: () =>
		| {
				name: string;
				insertText: string;
				isDirectory: boolean;
				icon: string;
		  }
		| undefined;
	reset: () => void;
}

const initialState = {
	suggestion: null,
	suggestionPrefix: "",
	commandBuffer: "",
	isHistoryPickerOpen: false,
	isCompletionDropdownOpen: false,
	completions: [],
	selectedCompletionIndex: 0,
};

export const useAutocompleteStore = create<AutocompleteState>((set, get) => ({
	...initialState,

	setSuggestion: (suggestion, prefix = "") => {
		set({ suggestion, suggestionPrefix: prefix });
	},

	setCommandBuffer: (buffer) => {
		set({ commandBuffer: buffer });
	},

	appendToCommandBuffer: (char) => {
		set((state) => ({ commandBuffer: state.commandBuffer + char }));
	},

	backspaceCommandBuffer: () => {
		set((state) => ({ commandBuffer: state.commandBuffer.slice(0, -1) }));
	},

	clearCommandBuffer: () => {
		set({ commandBuffer: "", suggestion: null, suggestionPrefix: "" });
	},

	openHistoryPicker: () => {
		set({ isHistoryPickerOpen: true });
	},

	closeHistoryPicker: () => {
		set({ isHistoryPickerOpen: false });
	},

	openCompletionDropdown: (completions) => {
		set({
			isCompletionDropdownOpen: true,
			completions,
			selectedCompletionIndex: 0,
		});
	},

	closeCompletionDropdown: () => {
		set({
			isCompletionDropdownOpen: false,
			completions: [],
			selectedCompletionIndex: 0,
		});
	},

	selectNextCompletion: () => {
		set((state) => ({
			selectedCompletionIndex:
				(state.selectedCompletionIndex + 1) % state.completions.length,
		}));
	},

	selectPrevCompletion: () => {
		set((state) => ({
			selectedCompletionIndex:
				(state.selectedCompletionIndex - 1 + state.completions.length) %
				state.completions.length,
		}));
	},

	getSelectedCompletion: () => {
		const state = get();
		return state.completions[state.selectedCompletionIndex];
	},

	reset: () => {
		set(initialState);
	},
}));
