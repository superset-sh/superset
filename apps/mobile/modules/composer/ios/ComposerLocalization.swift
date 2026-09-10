import Foundation

private final class ComposerBundleMarker {}

private let composerResources: Bundle = {
  let framework = Bundle(for: ComposerBundleMarker.self)
  guard let url = framework.url(forResource: "ComposerResources", withExtension: "bundle"),
        let resources = Bundle(url: url) else { return framework }
  return resources
}()

/// Native chrome follows the per-app iOS language, including VoiceOver.
func composerLocalized(_ key: String) -> String {
  NSLocalizedString(key, bundle: composerResources, value: key, comment: "")
}
