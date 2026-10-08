require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VoiceAudio'
  s.version        = package['version']
  s.summary        = 'Audio session for Superset voice mode'
  s.description    = 'Owns AVAudioSession while a realtime voice call runs: speaker, Bluetooth, interruptions'
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
