import ExpoModulesCore

/// One item in the composer's tray, handed over from React Native as data.
///
/// The tray itself stays in React Native — it is shared with the attachments
/// sheet and the rest of the app — so the composer renders a description of it
/// rather than owning it. Removal and taps go back out as events.
struct ComposerAttachment: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var uri: String = ""
  /// `image` renders the thumbnail; anything else falls back to a doc glyph.
  @Field var kind: String = "file"

  var isImage: Bool { kind == "image" }

  /// Written out rather than synthesised: `@Field` wrappers are not themselves
  /// `Equatable`, so the compiler cannot derive this.
  static func == (lhs: ComposerAttachment, rhs: ComposerAttachment) -> Bool {
    lhs.id == rhs.id && lhs.uri == rhs.uri && lhs.kind == rhs.kind
  }
}
