import Foundation

private final class AttachmentsSheetBundleMarker {}

private let attachmentsResources: Bundle = {
  let framework = Bundle(for: AttachmentsSheetBundleMarker.self)
  guard let url = framework.url(forResource: "AttachmentsSheetResources", withExtension: "bundle"),
        let resources = Bundle(url: url) else { return framework }
  return resources
}()

/// Native chrome follows the per-app iOS language, including VoiceOver.
func attachmentsLocalized(_ key: String) -> String {
  NSLocalizedString(key, bundle: attachmentsResources, value: key, comment: "")
}
