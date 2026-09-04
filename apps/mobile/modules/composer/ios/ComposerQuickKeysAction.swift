import ExpoModulesCore

/// The one static control beside the quick keys.
///
/// Same contract as `ComposerQuickKey`: the composer draws a chip and reports
/// that it was pressed. What it opens — the workspace's pull requests, in the
/// only caller today — stays in React Native, which is why nothing here names
/// one.
///
/// Absent on every surface that has no such link, which is also how the home
/// composer never grows one.
struct ComposerQuickKeysAction: Record, Equatable {
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
  /// foreground the keys use. The meaning crosses the bridge, the palette is
  /// the composer's: see `ComposerQuickKeysActionTint`.
  @Field var tint: String? = nil

  /// Accessibility label, translated in React Native like every other string
  /// the composer draws.
  @Field var label: String = ""

  static func == (lhs: ComposerQuickKeysAction, rhs: ComposerQuickKeysAction) -> Bool {
    lhs.symbol == rhs.symbol && lhs.iconUri == rhs.iconUri && lhs.tint == rhs.tint
      && lhs.label == rhs.label
  }
}
