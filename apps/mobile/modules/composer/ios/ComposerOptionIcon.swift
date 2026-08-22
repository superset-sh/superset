import SwiftUI

/// The leading mark on a picker chip: a project's logo, or its initial when it
/// has none.
///
/// Mirrors React Native's `ProjectAvatar`, corner ratio included, so the chip
/// and the project picker sheet show the same thing. The one deliberate
/// difference is the fallback tile's fill: the theme's `muted` token is a solid
/// colour, and a solid patch on the composer's glass reads as a sticker rather
/// than a surface, so it uses the same translucent fill as the controls.
struct ComposerOptionIcon: View {
  let option: ComposerMenuOption

  private var size: CGFloat { ComposerMetrics.modelIconSize }
  private var shape: RoundedRectangle {
    // `ProjectAvatar`'s ratio rather than a fixed radius, so the two stay in
    // step if either size changes.
    RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
  }

  var body: some View {
    if let uri = option.iconUri, !uri.isEmpty, let url = URL(string: uri) {
      AsyncImage(url: url) { image in
        image.resizable().aspectRatio(contentMode: .fit)
      } placeholder: {
        // Falling back to the initial rather than to blank keeps the chip's
        // width stable while the logo loads.
        initial
      }
      .frame(width: size, height: size)
      .clipShape(shape)
    } else if option.avatar {
      initial
        .frame(width: size, height: size)
        .clipShape(shape)
    }
  }

  private var initial: some View {
    Text(option.initial)
      .font(.system(size: size * 0.45, weight: .bold))
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.white.opacity(0.12))
  }
}
