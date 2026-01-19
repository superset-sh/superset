// Superset Mobile PWA Service Worker
const CACHE_NAME = "superset-mobile-v1";
const STATIC_ASSETS = [
	"/mobile",
	"/manifest.webmanifest",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(STATIC_ASSETS);
		})
	);
	// Activate immediately
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name.startsWith("superset-mobile-") && name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			);
		})
	);
	// Take control of all pages immediately
	self.clients.claim();
});

// Fetch event - network-first strategy for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET requests
	if (event.request.method !== "GET") {
		return;
	}

	// Skip cross-origin requests
	if (url.origin !== self.location.origin) {
		return;
	}

	// API requests: network-first
	if (url.pathname.startsWith("/api/")) {
		event.respondWith(
			fetch(event.request)
				.catch(() => caches.match(event.request))
		);
		return;
	}

	// Mobile routes: network-first with cache fallback
	if (url.pathname.startsWith("/mobile")) {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					// Clone and cache successful responses
					if (response.ok) {
						const responseClone = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, responseClone);
						});
					}
					return response;
				})
				.catch(() => caches.match(event.request))
		);
		return;
	}

	// Static assets: cache-first
	event.respondWith(
		caches.match(event.request).then((cached) => {
			return cached || fetch(event.request);
		})
	);
});

// Listen for messages from the app
self.addEventListener("message", (event) => {
	if (event.data === "skipWaiting") {
		self.skipWaiting();
	}
});
