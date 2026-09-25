import ExpoModulesCore

/// One entry in a composer picker — the model menu, and the project and branch
/// chips above the editor.
///
/// `iconUri` is either a remote URL or a *local file* URI. What it cannot be is
/// a Metro asset reference: SwiftUI cannot read those, so React Native resolves
/// bundled art with `expo-asset` first (see `useAgentIconUri`).
struct ComposerMenuOption: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var iconUri: String? = nil

  /// Lead with a project avatar. Distinct from `iconUri` because most projects
  /// have no logo, and the app draws an initial for them rather than leaving a
  /// gap — see `ProjectAvatar`, which this mirrors. Without the flag a chip
  /// with no logo would be indistinguishable from a chip that never wanted one.
  @Field var avatar: Bool = false

  /// Reads as a qualifier rather than as the subject. The reference sets the
  /// branch a step back from the project name it belongs to.
  @Field var muted: Bool = false

  /// Whether this chip leads with anything at all. Callers check it before
  /// placing `ComposerOptionIcon` in a stack: an empty view still costs the
  /// stack's spacing, which shows up as a chip that is indented for a logo it
  /// does not have.
  var hasIcon: Bool {
    avatar || !(iconUri ?? "").isEmpty
  }

  /// The initial the avatar falls back to.
  var initial: String {
    String(label.first ?? "P").uppercased()
  }

  static func == (lhs: ComposerMenuOption, rhs: ComposerMenuOption) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.iconUri == rhs.iconUri
      && lhs.avatar == rhs.avatar && lhs.muted == rhs.muted
  }
}
