import QuickLookThumbnailing
import SwiftUI
import UIKit

/// A real preview of a file, filling its card the way an image thumbnail fills
/// one.
///
/// `QLThumbnailGenerator` renders the document itself — a JSON shows the shape
/// of its text, a PDF its page layout, a spreadsheet its columns. That is the
/// whole point: a generic glyph makes every attachment identical, so a
/// truncated name ends up being the only thing telling two of them apart.
///
/// Falls back to the composer's own glyph rather than to the system's type icon
/// when there is nothing to render. Apple's icons are drawn for a light Files
/// sheet and read as a bright rectangle on this dark card.
struct ComposerFileThumbnail: View {
  let attachment: ComposerAttachment
  let size: CGSize
  let cornerRadius: CGFloat

  @Environment(\.displayScale) private var displayScale
  @State private var thumbnail: UIImage?

  var body: some View {
    Group {
      if let thumbnail {
        Image(uiImage: thumbnail)
          .resizable()
          // Fill and crop rather than fit. A page is portrait and the tile is
          // square, so fitting letterboxes it down to a stamp with bars either
          // side; covering trades the page's silhouette for a legible slice of
          // its actual content, which is the part worth seeing this small.
          .aspectRatio(contentMode: .fill)
      } else {
        Image(systemName: "doc.fill")
          // Proportional: the same view backs the card's 36pt tile and the
          // 34pt collapsed square, and it should not be respecified for each.
          .font(.system(size: min(size.width, size.height) * 0.38))
          .foregroundStyle(.secondary)
      }
    }
    .frame(width: size.width, height: size.height)
    .background(.white.opacity(0.10))
    .clipShape(.rect(cornerRadius: cornerRadius, style: .continuous))
    .task(id: attachment.uri) {
      thumbnail = await ComposerThumbnailCache.shared.thumbnail(
        for: attachment.uri,
        fitting: size,
        scale: displayScale
      )
    }
  }
}

/// Generated thumbnails, kept for the life of the process.
///
/// Generation is an out-of-process round trip, so without this every layout pass
/// that rebuilds the carousel — adding an attachment, expanding, scrolling —
/// would ask for the same image again.
actor ComposerThumbnailCache {
  static let shared = ComposerThumbnailCache()

  private var cache: [String: UIImage] = [:]
  /// A composer holds a handful of attachments at a time; this is a backstop
  /// against a long-lived session, not a working limit.
  private static let capacity = 32

  /// QuickLook fits the render inside the requested box rather than filling it,
  /// so a portrait page asked for at card size comes back narrower than the
  /// card — and cropping it to full width would then upscale it into mush. The
  /// request is squared off and oversized so the crop always scales down.
  private static let coverAllowance: CGFloat = 1.5

  func thumbnail(for uri: String, fitting size: CGSize, scale: CGFloat) async -> UIImage? {
    if let cached = cache[uri] { return cached }
    guard let url = URL(string: uri), url.isFileURL else { return nil }

    let side = max(size.width, size.height) * Self.coverAllowance
    let request = QLThumbnailGenerator.Request(
      fileAt: url,
      size: CGSize(width: side, height: side),
      scale: scale,
      representationTypes: .thumbnail
    )
    guard
      let representation = try? await QLThumbnailGenerator.shared
        .generateBestRepresentation(for: request)
    else { return nil }

    if cache.count >= Self.capacity { cache.removeAll() }
    cache[uri] = representation.uiImage
    return representation.uiImage
  }
}
