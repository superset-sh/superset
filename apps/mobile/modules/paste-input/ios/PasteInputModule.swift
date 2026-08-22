import ExpoModulesCore
import UIKit

public final class PasteInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PasteInput")

    View(PasteInputView.self) {
      Events("onPasteImages")

      Prop("enabled") { (view, enabled: Bool) in
        view.isPasteEnabled = enabled
      }
    }
  }
}

/**
 The edit menu resolves standard actions by walking the responder chain, so
 this ancestor volunteering for `paste(_:)` puts Paste in the field's menu
 for image-only pasteboards — the case the text field declines. Text paste
 never reaches here.
 */
final class PasteInputView: ExpoView {
  let onPasteImages = EventDispatcher()
  var isPasteEnabled = true

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    pasteConfiguration = UIPasteConfiguration(forAccepting: UIImage.self)
  }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(UIResponderStandardEditActions.paste(_:)) {
      // Metadata check — never triggers the system paste prompt.
      return isPasteEnabled && UIPasteboard.general.hasImages
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func paste(_ sender: Any?) {
    // User-initiated paste: reading the pasteboard here shows no alert.
    let images = UIPasteboard.general.images ?? []
    var payload: [[String: Any]] = []
    for image in images {
      guard let data = image.jpegData(compressionQuality: 0.8) else { continue }
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("pasted-\(UUID().uuidString).jpg")
      guard (try? data.write(to: url)) != nil else { continue }
      payload.append([
        "uri": url.absoluteString,
        "width": image.size.width * image.scale,
        "height": image.size.height * image.scale
      ])
    }
    guard !payload.isEmpty else { return }
    onPasteImages(["images": payload])
  }
}
