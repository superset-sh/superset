import ExpoModulesCore

/// One quick key, handed over as data.
///
/// Carries no behaviour on purpose: the bytes a key writes into the PTY, and
/// whether it submits instead, stay in React Native alongside the terminal that
/// owns them. The composer draws a mark and reports which one was pressed.
struct ComposerQuickKey: Record, Identifiable, Equatable {
  @Field var id: String = ""
  /// Monospaced label. Ignored when `symbol` is set.
  @Field var label: String? = nil
  /// SF Symbol name, e.g. `arrow.up`.
  @Field var symbol: String? = nil

  /// A hairline between groups rather than a key. Data, not styling, because
  /// only the terminal knows which keys belong together — escapes, arrows,
  /// return. Still needs a unique `id`: `ForEach` identifies by it.
  @Field var divider: Bool = false

  static func == (lhs: ComposerQuickKey, rhs: ComposerQuickKey) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.symbol == rhs.symbol
      && lhs.divider == rhs.divider
  }
}
