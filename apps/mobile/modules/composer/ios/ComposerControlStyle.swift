import SwiftUI

/// Press feedback for the composer's circular controls.
///
/// Deliberately **not** `.buttonStyle(.glass)`. Apple's Liquid Glass guidance
/// is one glass sheet per view — controls inside a glass surface sit on solid
/// fills, not on more glass. Nesting them double-layers the material, which
/// renders badly and makes the press state bleed outside the container. The
/// stock glass styles also add their own padding, so a 30pt label came out
/// visibly taller than the pill enclosing it.
struct ComposerControlStyle: ButtonStyle {
  var fill: AnyShapeStyle = AnyShapeStyle(.white.opacity(0.12))
  /// The reference glyphs read as light grey. `.primary` on a dark surface is
  /// pure white, which sits louder than the placeholder beside it.
  var foreground: AnyShapeStyle = AnyShapeStyle(.secondary)

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(
        width: ComposerMetrics.controlDiameter,
        height: ComposerMetrics.controlDiameter
      )
      .foregroundStyle(foreground)
      .background(fill, in: .circle)
      .opacity(configuration.isPressed ? 0.55 : 1)
      .scaleEffect(configuration.isPressed ? 0.92 : 1)
      .animation(.snappy(duration: 0.18), value: configuration.isPressed)
      // Keeps the touch target at the 44pt minimum without growing the circle,
      // which is what the stock styles get wrong here.
      .contentShape(.circle)
  }
}

extension ButtonStyle where Self == ComposerControlStyle {
  static var composerControl: ComposerControlStyle { ComposerControlStyle() }

  /// The send button: white fill, dark glyph, per every frame with a draft.
  ///
  /// The glyph is the theme's ink (`hsl(0 0% 9%)`), not pure black. Against a
  /// near-black app background a pure-black arrow reads as a hole punched
  /// through the button rather than as a mark drawn on it.
  static var composerSend: ComposerControlStyle {
    ComposerControlStyle(
      fill: AnyShapeStyle(.white),
      foreground: AnyShapeStyle(Color(white: 0.09))
    )
  }

  /// In flight: grey rather than white, so it reads as busy instead of ready.
  static var composerSending: ComposerControlStyle {
    ComposerControlStyle(
      fill: AnyShapeStyle(.white.opacity(0.22)),
      foreground: AnyShapeStyle(.white.opacity(0.7))
    )
  }
}

extension AnyTransition {
  /// Everything stacked above the control row. Asymmetric on purpose: it fades
  /// in on the card's own curve but leaves almost immediately, so the collapsed
  /// pill is never briefly showing expanded content inside it.
  static var composerContent: AnyTransition {
    .asymmetric(
      insertion: .opacity,
      removal: .opacity.animation(.easeOut(duration: ComposerMetrics.contentFadeOut))
    )
  }
}
