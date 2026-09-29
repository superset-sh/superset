import ExpoModulesCore

/// A caller's own button in the control row, beside `+`. Reports its id when
/// pressed, or opens `menu` and reports the chosen item instead.
struct ComposerControl: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var symbol: String = ""
  @Field var label: String = ""
  @Field var menu: [ComposerMenuOption]? = nil
  @Field var disabled: Bool = false

  static func == (lhs: ComposerControl, rhs: ComposerControl) -> Bool {
    lhs.id == rhs.id && lhs.symbol == rhs.symbol && lhs.label == rhs.label
      && lhs.menu == rhs.menu && lhs.disabled == rhs.disabled
  }
}
