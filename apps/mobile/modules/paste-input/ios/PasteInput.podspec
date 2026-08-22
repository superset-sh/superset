require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PasteInput'
  s.version        = package['version']
  s.summary        = 'Image paste support for the composer text field'
  s.description    = 'Offers Paste in the edit menu for images via the responder chain'
  s.license        = 'MIT'
  s.author         = 'Superset'
  s.homepage       = 'https://superset.sh'
  s.platforms      = { :ios => '26.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/nicksupersetsh/superset.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
