import ExpoModulesCore

/// One session tab in the strip above the quick keys.
///
/// Carries no behaviour, exactly like `ComposerQuickKey`: what a session *is* —
/// which terminal it attaches to, whether closing it kills an agent mid-task,
/// what order the tabs sit in — stays in React Native. The composer draws a
/// pill and reports which one was touched.
///
/// `iconUri` is a *local file* URI, never a Metro asset reference: SwiftUI
/// cannot read those, so React Native resolves the bundled brand mark with
/// `expo-asset` first (see `useAgentIconUris`). Empty for a plain shell, which
/// falls back to its initial the way `ComposerOptionIcon` does.
struct ComposerSessionTab: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var iconUri: String? = nil
  @Field var selected: Bool = false

  /// Desktop's StatusIndicator states — `permission`, `working`, `failed`,
  /// `review` — or absent for a session with nothing to say. A string rather
  /// than a colour: the meaning crosses the bridge, the palette is the
  /// composer's, the same split every other field here uses.
  @Field var attention: String? = nil

  /// The initial the mark falls back to when the session has no brand — a
  /// plain shell. Mirrors `ComposerMenuOption.initial`.
  var initial: String {
    String(label.first ?? "?").uppercased()
  }

  static func == (lhs: ComposerSessionTab, rhs: ComposerSessionTab) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.iconUri == rhs.iconUri
      && lhs.selected == rhs.selected && lhs.attention == rhs.attention
  }
}

/// A single static control at the head of the session strip.
///
/// Same contract as `ComposerQuickKey`: the composer draws a chip and reports
/// that it was pressed. What it opens — the workspace's pull requests, in the
/// only caller today — stays in React Native, which is why nothing here names
/// one.
///
/// Absent on every surface that has no such link, which is also how the home
/// composer never grows one.
struct ComposerSessionAction: Record, Equatable {
  /// SF Symbol name, e.g. `arrow.triangle.pull`. Chosen in React Native, the
  /// way `ComposerQuickKey.symbol` is. Drawn while `iconUri` is still
  /// resolving, and instead of it when there is none.
  @Field var symbol: String = ""

  /// A mark to draw in place of the symbol. Same rule as
  /// `ComposerSessionTab.iconUri`: a *local file* URI, resolved in React
  /// Native with `expo-asset`, never a Metro asset reference. Rendered as a
  /// template so `tint` reaches it.
  @Field var iconUri: String? = nil

  /// Which accent the glyph takes, as a state name — or absent for the same
  /// foreground the strip's other controls use. The meaning crosses the
  /// bridge, the palette is the composer's: see `ComposerSessionActionTint`.
  @Field var tint: String? = nil

  /// Accessibility label, translated in React Native like every other string
  /// the strip draws.
  @Field var label: String = ""

  static func == (lhs: ComposerSessionAction, rhs: ComposerSessionAction) -> Bool {
    lhs.symbol == rhs.symbol && lhs.iconUri == rhs.iconUri && lhs.tint == rhs.tint
      && lhs.label == rhs.label
  }
}

/// Every user-facing string the tab strip draws.
///
/// They arrive as data because the composer cannot translate: Lingui's macros
/// and catalogs live in React Native, and a hardcoded English `"Close session"`
/// here would be the one untranslated string on an otherwise translated screen.
/// Same reasoning as `ComposerQuickKey.label`, which is also handed over rather
/// than derived.
struct ComposerSessionTabLabels: Record, Equatable {
  /// Menu item: puts the session's terminal id on the pasteboard.
  @Field var copyId: String = ""
  /// Menu item, destructive. React Native still confirms before killing.
  @Field var close: String = ""
  /// Accessibility label for the trailing `+`.
  @Field var newSession: String = ""
  /// Accessibility label for the trailing overview grid.
  @Field var allSessions: String = ""
  /// Accessibility label for the leading chevron, which only exists once the
  /// strip has scrolled away from its first tab.
  @Field var scrollToStart: String = ""

  static func == (lhs: ComposerSessionTabLabels, rhs: ComposerSessionTabLabels) -> Bool {
    lhs.copyId == rhs.copyId && lhs.close == rhs.close
      && lhs.newSession == rhs.newSession && lhs.allSessions == rhs.allSessions
      && lhs.scrollToStart == rhs.scrollToStart
  }
}
