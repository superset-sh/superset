import { Menu } from "electron";

/**
 * Electron shows no context menu by default, so right-clicking text inputs
 * (textarea, contenteditable editors like the TipTap new-workspace prompt)
 * did nothing. Restore the standard edit menu for editable elements.
 *
 * Custom in-page menus (Radix ContextMenu) call preventDefault on the DOM
 * contextmenu event, which stops Chromium from emitting this webContents
 * event, so they are unaffected. Embedded browser panes have their own
 * handler in browser-manager.
 */
export function attachEditContextMenu(wc: Electron.WebContents): void {
	wc.on("context-menu", (_event, params) => {
		if (!params.isEditable) return;

		const menuItems: Electron.MenuItemConstructorOptions[] = [];

		for (const suggestion of params.dictionarySuggestions) {
			menuItems.push({
				label: suggestion,
				click: () => wc.replaceMisspelling(suggestion),
			});
		}
		if (params.misspelledWord) {
			menuItems.push(
				{
					label: "Add to Dictionary",
					click: () =>
						wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
				},
				{ type: "separator" },
			);
		}

		menuItems.push(
			{ role: "undo", enabled: params.editFlags.canUndo },
			{ role: "redo", enabled: params.editFlags.canRedo },
			{ type: "separator" },
			{ role: "cut", enabled: params.editFlags.canCut },
			{ role: "copy", enabled: params.editFlags.canCopy },
			{ role: "paste", enabled: params.editFlags.canPaste },
			{ type: "separator" },
			{ role: "selectAll", enabled: params.editFlags.canSelectAll },
		);

		Menu.buildFromTemplate(menuItems).popup();
	});
}
