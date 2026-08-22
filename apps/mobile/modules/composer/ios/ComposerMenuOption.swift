import ExpoModulesCore

/// One entry in a composer picker — the model menu today, the project, branch
/// and target chips next.
///
/// `iconUri` is a *local file* URI, not a Metro asset reference: SwiftUI cannot
/// read the latter, so React Native resolves bundled art with `expo-asset`
/// first (see `useAgentIconUri`).
struct ComposerMenuOption: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var iconUri: String? = nil

  static func == (lhs: ComposerMenuOption, rhs: ComposerMenuOption) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.iconUri == rhs.iconUri
  }
}
