import Foundation
import UniformTypeIdentifiers

/// Something pasted into the composer, resolved to a file on disk.
///
/// The attachment tray takes file URIs — that is what the pickers hand it — so
/// pasted bytes have to land somewhere before React Native can use them.
struct ComposerPastedItem {
  let uri: String
  let name: String
  let isImage: Bool

  /// Resolves the providers a paste hands over, in order, skipping any that
  /// carry nothing we can use.
  static func load(from providers: [NSItemProvider]) async -> [ComposerPastedItem] {
    var items: [ComposerPastedItem] = []
    for provider in providers {
      // `??` would put the second call inside an autoclosure, which cannot be
      // async — a file first, then bytes.
      if let file = await loadFile(from: provider) {
        items.append(file)
      } else if let image = await loadImage(from: provider) {
        items.append(image)
      }
    }
    return items
  }

  /// A file copied in Files arrives as a URL. The one handed over is temporary
  /// and reclaimed as soon as the completion returns, so it has to be copied
  /// rather than referenced.
  private static func loadFile(from provider: NSItemProvider) async -> ComposerPastedItem? {
    guard provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
    else { return nil }
    return await withCheckedContinuation { continuation in
      _ = provider.loadFileRepresentation(
        forTypeIdentifier: UTType.item.identifier
      ) { url, _ in
        guard let url else { return continuation.resume(returning: nil) }
        let name = url.lastPathComponent
        let destination = FileManager.default.temporaryDirectory
          .appendingPathComponent("\(UUID().uuidString.prefix(8))-\(name)")
        // A failed copy would otherwise hand back an item pointing at a file
        // that was never written, and the tray would only find out at upload.
        guard (try? FileManager.default.copyItem(at: url, to: destination)) != nil
        else { return continuation.resume(returning: nil) }
        let isImage = UTType(filenameExtension: url.pathExtension)?
          .conforms(to: .image) ?? false
        continuation.resume(
          returning: ComposerPastedItem(
            uri: destination.absoluteString,
            name: name,
            isImage: isImage
          )
        )
      }
    }
  }

  /// An image copied from Photos or a browser arrives as bytes. The original
  /// encoding is kept rather than re-rendered — a screenshot pasted as PNG
  /// should stay a PNG.
  private static func loadImage(from provider: NSItemProvider) async -> ComposerPastedItem? {
    let type = [UTType.png, .jpeg, .heic, .gif, .webP, .tiff].first {
      provider.hasItemConformingToTypeIdentifier($0.identifier)
    }
    guard let type else { return nil }
    return await withCheckedContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
        guard let data else { return continuation.resume(returning: nil) }
        let ext = type.preferredFilenameExtension ?? "png"
        let name = "pasted-\(UUID().uuidString.prefix(8)).\(ext)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        guard (try? data.write(to: url)) != nil else {
          return continuation.resume(returning: nil)
        }
        continuation.resume(
          returning: ComposerPastedItem(uri: url.absoluteString, name: name, isImage: true)
        )
      }
    }
  }

  /// Everything the composer will take off a pasteboard.
  static var acceptableTypeIdentifiers: [String] {
    [UTType.image, .fileURL, .item].map(\.identifier)
  }
}
