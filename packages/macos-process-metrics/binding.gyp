{
	"targets": [
		{
			"target_name": "macos_process_metrics",
			"sources": ["src/addon.cc"],
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")"
			],
			"defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
		}
	]
}
