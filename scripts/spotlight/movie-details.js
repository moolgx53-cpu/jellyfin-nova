(function () {
	'use strict';

	if (window.__abyssMovieDetailsLoaded) return;
	window.__abyssMovieDetailsLoaded = true;

	let isEnhancing = false;
	const itemCache = {};

	// Detect runtime environment (Jellyfin Media Player Desktop vs Mobile/Web Browser)
	try {
		const isJMP = !!(window.jmpInfo || (window.api && window.api.player) || (navigator.userAgent && /JellyfinMediaPlayer/i.test(navigator.userAgent)));
		if (isJMP) {
			document.documentElement.classList.add('is-jmp-app');
			document.body.classList.add('is-jmp-app');
		} else {
			document.documentElement.classList.add('is-web-browser');
			document.body.classList.add('is-web-browser');
		}
	} catch (e) { }

	var activeExpandedCardEl = null;

	function collapseActiveHoverTrailer() {
		try {
			if (activeExpandedCardEl && typeof collapseExpandedCard === 'function') {
				collapseExpandedCard(activeExpandedCardEl, true);
			}
			if (typeof clearHoverCardTimers === 'function') {
				clearHoverCardTimers();
			}
		} catch (e) { }
	}

	// Intercept Jellyfin internal Webpack runtime to access playbackManager and router
	let internalPlaybackManager = null;

	function findPlaybackManagerInWebpack(req) {
		if (!req) return null;
		// 1. Search already-loaded cached modules (req.c) first — zero side effects!
		try {
			if (req.c) {
				const cached39738 = req.c[39738];
				if (cached39738 && cached39738.loaded && cached39738.exports) {
					const m39738 = cached39738.exports;
					const cand = m39738?.f || m39738?.default || m39738;
					if (cand && typeof cand.play === 'function') {
						return cand;
					}
				}
				for (const id in req.c) {
					const mod = req.c[id];
					if (!mod || !mod.loaded || !mod.exports) continue;
					const exp = mod.exports;
					const candidates = [exp, exp.default, exp.f, exp.playbackManager, exp.PlaybackManager];
					for (const cand of candidates) {
						if (cand && typeof cand.play === 'function' && (typeof cand.canPlay === 'function' || typeof cand.pause === 'function' || typeof cand.isPlaying === 'function' || typeof cand.getCurrentPlayer === 'function' || typeof cand.getPlaylist === 'function')) {
							return cand;
						}
					}
				}
			}
		} catch (e) { }

		// 2. Direct module lookup for Jellyfin 10.11 ONLY if main bundle (39738 & 86663) is already registered in req.m
		try {
			if (req.m && typeof req.m[39738] === 'function' && typeof req.m[86663] === 'function') {
				const m39738 = req(39738);
				const cand = m39738?.f || m39738?.default || m39738;
				if (cand && typeof cand.play === 'function') {
					return cand;
				}
			}
		} catch (e) {
			if (req.c && req.c[39738] && !req.c[39738].loaded) {
				delete req.c[39738];
			}
		}

		return null;
	}

	function assignPlaybackManagerGlobally(pm) {
		if (pm && typeof pm.play === 'function') {
			// Guard against Jellyfin's native background ThemeMediaPlayer (fullscreen: false, enableRemotePlayers: false, aspectRatio: "cover")
			// which only fires when #/details URLs contain &serverId=... (regular cards/libraries) and not from Spotlight/Top 10.
			// Blocking it on details pages ensures opening a movie from anywhere behaves identically to Spotlight/Top 10
			// (no duplicate .videoPlayerContainer covering .hero-overlay in browser, and no window.api.player hijack in JMP desktop).
			if (!pm.__abyssThemePlayGuarded) {
				pm.__abyssThemePlayGuarded = true;
				const origPlay = pm.play.bind(pm);
				pm.play = function (options) {
					try {
						if (
							options &&
							options.fullscreen === false &&
							options.enableRemotePlayers === false &&
							options.aspectRatio === 'cover'
						) {
							const hash = (window.location.hash || '').toLowerCase();
							if (
								hash.includes('details') ||
								hash.includes('item') ||
								document.querySelector('#itemDetailPage:not(.hide), .itemDetailPage:not(.hide)')
							) {
								return new Promise(() => {});
							}
						}
					} catch (e) { }
					return origPlay(options);
				};
			}

			internalPlaybackManager = pm;
			window.__jellyfinPlaybackManager = pm;
			window.PlaybackManager = pm;
			if (window.top && window.top !== window) {
				try {
					window.top.__jellyfinPlaybackManager = pm;
					window.top.PlaybackManager = pm;
				} catch (e) { }
			}
			if (window.parent && window.parent !== window) {
				try {
					window.parent.__jellyfinPlaybackManager = pm;
					window.parent.PlaybackManager = pm;
				} catch (e) { }
			}
		}
	}

	function hookWebpack() {
		if (window.__webpackRequire || window.__jellyfinRequire) {
			if (!internalPlaybackManager) {
				const pm = findPlaybackManagerInWebpack(window.__webpackRequire || window.__jellyfinRequire);
				if (pm) {
					assignPlaybackManagerGlobally(pm);
				}
			}
			return;
		}
		try {
			const chunk = window.webpackChunk ||
				window.webpackChunkjellyfin_web ||
				self.webpackChunk ||
				self.webpackChunkjellyfin_web ||
				(typeof webpackChunk !== 'undefined' ? webpackChunk : null) ||
				(typeof webpackChunkjellyfin_web !== 'undefined' ? webpackChunkjellyfin_web : null);

			if (chunk && typeof chunk.push === 'function') {
				chunk.push([
					['abyss_hook_' + Math.random().toString(36).slice(2)],
					{},
					function (req) {
						if (req) {
							window.__jellyfinRequire = req;
							window.__webpackRequire = req;
							const pm = findPlaybackManagerInWebpack(req);
							if (pm) {
								assignPlaybackManagerGlobally(pm);
							} else {
								setTimeout(hookWebpack, 400);
								setTimeout(hookWebpack, 1500);
							}
						}
					}
				]);
			}
		} catch (e) { }
	}

	async function resolveItemContextMenuModule() {
		if (window.__abyssItemContextMenu && typeof window.__abyssItemContextMenu.show === 'function') {
			return window.__abyssItemContextMenu;
		}
		hookWebpack();
		const req = window.__webpackRequire || window.__jellyfinRequire || window.__webpack_require__;
		if (!req) return null;

		const scanCache = () => {
			if (!req.c) return null;
			for (const mId in req.c) {
				const mod = req.c[mId];
				if (!mod || !mod.loaded || !mod.exports) continue;
				const exp = mod.exports;
				const candidates = [exp, exp.default, exp.itemContextMenu];
				for (const cand of candidates) {
					if (cand && typeof cand.show === 'function' && (typeof cand.getCommands === 'function' || typeof cand.executeCommand === 'function')) {
						window.__abyssItemContextMenu = cand;
						return cand;
					}
				}
			}
			return null;
		};

		let found = scanCache();
		if (found) return found;

		if (typeof req.e === 'function') {
			try {
				await Promise.all([
					req.e(55802).catch(() => null),
					req.e(40501).catch(() => null),
					req.e(23648).catch(() => null)
				]);
			} catch (e) { }
		}

		try {
			if (req.m && typeof req.m[55802] === 'function') {
				const directMod = req(55802);
				const cand = directMod?.default || directMod;
				if (cand && typeof cand.show === 'function') {
					window.__abyssItemContextMenu = cand;
					return cand;
				}
			}
		} catch (e) {
			if (req.c && req.c[55802] && !req.c[55802].loaded) {
				delete req.c[55802];
			}
		}

		return scanCache();
	}

	function getInternalPlaybackManager() {
		if (internalPlaybackManager && typeof internalPlaybackManager.play === 'function') return internalPlaybackManager;
		if (window.__jellyfinPlaybackManager && typeof window.__jellyfinPlaybackManager.play === 'function') {
			internalPlaybackManager = window.__jellyfinPlaybackManager;
			return internalPlaybackManager;
		}
		if (window.PlaybackManager && typeof window.PlaybackManager.play === 'function') {
			internalPlaybackManager = window.PlaybackManager;
			return internalPlaybackManager;
		}

		hookWebpack();

		try {
			const req = window.__webpackRequire || window.__jellyfinRequire;
			if (req) {
				const pm = findPlaybackManagerInWebpack(req);
				if (pm) {
					assignPlaybackManagerGlobally(pm);
					return internalPlaybackManager;
				}
			}
		} catch (e) { }

		const globalCandidates = [
			window.playbackManager,
			window.PlaybackManager,
			window.parent?.playbackManager,
			window.parent?.PlaybackManager,
			window.top?.playbackManager,
			window.top?.PlaybackManager,
			window.Emby?.playbackManager,
			window.Emby?.PlaybackManager,
			window.appRouter?.playbackManager,
			(window.Emby?.Page && window.Emby.Page.playbackManager)
		];

		for (const cand of globalCandidates) {
			if (cand && typeof cand.play === 'function') {
				assignPlaybackManagerGlobally(cand);
				return cand;
			}
		}

		return null;
	}

	hookWebpack();

	function getBaseUrl() {
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		if (api && typeof api.serverAddress === 'function') {
			const addr = api.serverAddress();
			if (addr) return addr;
		}
		return window.location.origin;
	}

	function getAuth() {
		let token = '';
		let userId = '';
		let serverId = '';

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api) {
				if (typeof api.accessToken === 'function') token = api.accessToken() || '';
				if (!token && api._accessToken) token = api._accessToken;

				if (typeof api.getCurrentUserId === 'function') userId = api.getCurrentUserId() || '';
				if (!userId && api._currentUserId) userId = api._currentUserId;

				if (typeof api.serverId === 'function') serverId = api.serverId() || '';
				if (!serverId && api._serverId) serverId = api._serverId;
				if (!serverId && typeof api.serverInfo === 'function') serverId = api.serverInfo()?.Id || '';
			}
		} catch (e) { }

		if (!token) {
			token = localStorage.getItem('accessToken') || localStorage.getItem('api_key') || '';
		}

		if (!userId) {
			try {
				const rawUser = localStorage.getItem('user') || localStorage.getItem('emby_user');
				if (rawUser) userId = JSON.parse(rawUser).Id || JSON.parse(rawUser).id;
			} catch (e) { }
		}

		if (!serverId || !userId || !token) {
			try {
				const rawCreds = localStorage.getItem('jellyfin_credentials');
				if (rawCreds) {
					const creds = JSON.parse(rawCreds);
					if (creds?.Servers?.[0]) {
						token = token || creds.Servers[0].AccessToken;
						userId = userId || creds.Servers[0].UserId;
						serverId = serverId || creds.Servers[0].Id;
					}
				}
			} catch (e) { }
		}

		return { token, userId, serverId };
	}

	function getActiveItemPage() {
		const hash = (window.location.hash || '').toLowerCase();
		if (
			!hash.includes('details') &&
			!hash.includes('item') &&
			!hash.includes('id=')
		) {
			return null;
		}

		// Never hijack list pages, libraries, search, or settings
		if (hash.includes('list.html') || hash.includes('items.html') || hash.includes('parentid=') || hash.includes('search') || hash.includes('settings') || hash.includes('livetv') || hash.includes('wizard')) {
			return null;
		}

		const specificPage = document.querySelector('#itemDetailPage:not(.hide), #itemPage:not(.hide), .itemDetailPage:not(.hide), .detailPage:not(.hide)');
		if (specificPage) return specificPage;

		const candidates = document.querySelectorAll('div[data-role="page"]:not(.hide), .pageContainer:not(.hide)');
		for (const page of candidates) {
			if (page.id === 'indexPage' || page.id === 'listPage' || page.id === 'itemsPage' || page.id === 'searchPage' || page.classList.contains('homePage') || page.classList.contains('libraryPage')) continue;
			if (page.classList.contains('itemDetailPage') || page.id === 'itemDetailPage') return page;
		}
		return null;
	}

	function resolveItemId() {
		const hash = window.location.hash || '';
		let match = hash.match(/id=([^&]+)/i);
		if (match) return match[1];

		match = window.location.search.match(/id=([^&]+)/i);
		if (match) return match[1];

		try {
			const p = window.Emby?.Page?.params || window.top?.Emby?.Page?.params;
			if (p?.id) return p.id;
		} catch (e) { }

		const page = document.querySelector('#itemDetailPage, #itemPage, .itemDetailPage, div[data-role="page"]:not(.hide)');
		if (page) {
			if (page.getAttribute('data-itemid')) return page.getAttribute('data-itemid');
			if (page.getAttribute('data-id')) return page.getAttribute('data-id');
		}

		return null;
	}

	function syncPreCheck() {
		// No-op: theme classes are applied only when custom layout is constructed
	}

	async function fetchItemDetails(itemId, bypassCache = false) {
		if (!bypassCache) {
			try {
				const current = window.Emby?.Page?.currentItem || window.top?.Emby?.Page?.currentItem;
				if (current && (current.Id === itemId || current.id === itemId)) {
					itemCache[itemId] = current;
					return current;
				}
			} catch (e) { }

			if (itemCache[itemId]) return itemCache[itemId];
		}

		const { token, userId } = getAuth();
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItem === 'function') {
				const item = await api.getItem(userId, itemId);
				if (item) {
					itemCache[itemId] = item;
					return item;
				}
			}
		} catch (e) { }

		if (token && userId) {
			try {
				const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
				const res = await fetch(`${base}/Users/${userId}/Items/${itemId}?api_key=${token}`, { headers });
				if (res.ok) {
					const item = await res.json();
					itemCache[itemId] = item;
					return item;
				}
			} catch (e) { }

			try {
				const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
				const res = await fetch(`${base}/Items/${itemId}?api_key=${token}`, { headers });
				if (res.ok) {
					const item = await res.json();
					itemCache[itemId] = item;
					return item;
				}
			} catch (e) { }
		}

		return null;
	}

	async function fetchSimilarMovies(itemId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getSimilarItems === 'function') {
				const res = await api.getSimilarItems(itemId, { Limit: 10, UserId: userId });
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		try {
			const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
			const res = await fetch(`${base}/Items/${itemId}/Similar?UserId=${userId}&Limit=10&api_key=${token}`, { headers });
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data.Items || []);
			}
		} catch (e) { }

		return [];
	}

	const liveRatingCache = {};
	const OMDB_KEYS = ['b7da8d63', 'c8ef58ed', '35285496', 'trilogy', 'fa0303b7', '72bc447a', '94101e4a', 'cb4713a5', '82920253', '59345229', 'a39a9558', '2b62d3a9'];
	const TMDB_KEYS = ['15d2ea6d0dc1d476efbca3ecc9292b9a', 'b0b533e49e29a9e32a67e4e0ae2b1e2a', 'c1894d03e913a52199b51909772d1f97'];
	const deadOmdbKeys = new Set();
	const deadTmdbKeys = new Set();

	function normalizeImdbId(rawId) {
		if (!rawId) return null;
		let str = String(rawId).trim();
		if (str.startsWith('tt')) return str;
		if (/^\d+$/.test(str)) {
			return `tt${str.padStart(7, '0')}`;
		}
		return `tt${str}`;
	}

	async function fetchLiveImdbRating(item) {
		if (!item) return null;

		let rawImdbId = item.ProviderIds?.Imdb || item.ProviderIds?.imdb || item.ProviderIds?.IMDB;
		let tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
		const englishTitle = item.OriginalTitle || item.Name;
		const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : '');
		const isMovie = (item.Type === 'Movie' || item.MediaType === 'Video');

		let cleanImdbId = normalizeImdbId(rawImdbId);
		const cacheKey = `v5_${cleanImdbId || tmdbId || `${englishTitle}_${year}`}`;
		if (liveRatingCache[cacheKey]) return liveRatingCache[cacheKey];

		// Stage 1: Resolve IMDb ID from TMDb external_ids if missing
		if (!cleanImdbId && tmdbId) {
			for (const key of TMDB_KEYS) {
				if (deadTmdbKeys.has(key)) continue;
				try {
					const endpoint = isMovie ? `movie/${tmdbId}` : `tv/${tmdbId}`;
					const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/external_ids?api_key=${key}`);
					if (res.status === 401 || res.status === 403 || res.status === 429) {
						deadTmdbKeys.add(key);
						continue;
					}
					if (res.ok) {
						const extData = await res.json();
						if (extData && extData.imdb_id) {
							cleanImdbId = normalizeImdbId(extData.imdb_id);
						}
						break;
					}
					if (res.status === 404) break;
				} catch (e) { }
			}
		}

		// Stage 3: Query OMDb API with clean IMDb ID + type
		if (cleanImdbId) {
			for (const key of OMDB_KEYS) {
				if (deadOmdbKeys.has(key)) continue;
				try {
					const typeParam = isMovie ? '&type=movie' : '&type=series';
					const res = await fetch(`https://www.omdbapi.com/?i=${cleanImdbId}${typeParam}&apikey=${key}`);
					if (res.status === 401 || res.status === 403 || res.status === 429) {
						deadOmdbKeys.add(key);
						continue;
					}
					if (res.ok) {
						const data = await res.json();
						if (data && data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
							const val = parseFloat(data.imdbRating).toFixed(1);
							liveRatingCache[cacheKey] = { score: val, source: 'IMDb' };
							return liveRatingCache[cacheKey];
						}
						const errMsg = String(data?.Error || '').toLowerCase();
						if (errMsg.includes('limit') || errMsg.includes('key')) {
							deadOmdbKeys.add(key);
							continue;
						}
						break;
					}
				} catch (e) { }
			}
		}

		// Stage 4: Query OMDb by English Title & Year with strict type parameter
		if (englishTitle) {
			for (const key of OMDB_KEYS) {
				if (deadOmdbKeys.has(key)) continue;
				try {
					const typeParam = isMovie ? '&type=movie' : '&type=series';
					const url = `https://www.omdbapi.com/?t=${encodeURIComponent(englishTitle)}${year ? `&y=${year}` : ''}${typeParam}&apikey=${key}`;
					const res = await fetch(url);
					if (res.status === 401 || res.status === 403 || res.status === 429) {
						deadOmdbKeys.add(key);
						continue;
					}
					if (res.ok) {
						const data = await res.json();
						if (data && data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
							const val = parseFloat(data.imdbRating).toFixed(1);
							liveRatingCache[cacheKey] = { score: val, source: 'IMDb' };
							return liveRatingCache[cacheKey];
						}
						const errMsg = String(data?.Error || '').toLowerCase();
						if (errMsg.includes('limit') || errMsg.includes('key')) {
							deadOmdbKeys.add(key);
							continue;
						}
						break;
					}
				} catch (e) { }
			}
		}

		// Stage 5: TMDb API vote_average (Label accurately as TMDb)
		if (tmdbId) {
			for (const key of TMDB_KEYS) {
				if (deadTmdbKeys.has(key)) continue;
				try {
					const endpoint = isMovie ? `movie/${tmdbId}` : `tv/${tmdbId}`;
					const res = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${key}`);
					if (res.status === 401 || res.status === 403 || res.status === 429) {
						deadTmdbKeys.add(key);
						continue;
					}
					if (res.ok) {
						const data = await res.json();
						if (data && typeof data.vote_average === 'number' && data.vote_average > 0) {
							const val = data.vote_average.toFixed(1);
							liveRatingCache[cacheKey] = { score: val, source: 'TMDb' };
							return liveRatingCache[cacheKey];
						}
						break;
					}
					if (res.status === 404) break;
				} catch (e) { }
			}
		}

		// Stage 6: Jellyfin CommunityRating
		if (typeof item.CommunityRating === 'number' && item.CommunityRating > 0) {
			return { score: item.CommunityRating.toFixed(1), source: 'TMDb' };
		}

		return null;
	}

	function getImageUrl(item, type, base, token) {
		if (!item || !item.Id) return '';
		const tag = item.ImageTags?.[type] ||
			(type === 'Primary' ? (item.SeriesPrimaryImageTag || item.PrimaryImageTag) : null) ||
			(type === 'Logo' ? (item.ParentLogoImageTag || item.SeriesLogoImageTag || item.ImageTags?.Logo) : null) ||
			(type === 'Backdrop' ? (item.BackdropImageTags?.[0] || item.ParentBackdropImageTags?.[0] || item.ImageTags?.Backdrop) : null);

		const tagParam = tag ? `&tag=${tag}` : '';

		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		if (tag && api && typeof api.getScaledImageUrl === 'function') {
			try {
				const u = api.getScaledImageUrl(item.Id, { type: type, quality: 85, fillWidth: type === 'Backdrop' ? 1400 : (type === 'Logo' ? 500 : 400), tag: tag });
				if (u) return u;
			} catch (e) { }
		}

		if (tag || type === 'Primary' || (type === 'Backdrop' && (item.BackdropImageTags?.length || item.ParentBackdropImageTags?.length))) {
			return `${base}/Items/${item.Id}/Images/${type}?quality=85&fillWidth=${type === 'Backdrop' ? 1400 : (type === 'Logo' ? 500 : 400)}${tagParam}&api_key=${token}`;
		}
		return '';
	}

	function getStrictBackdropUrls(item, base, token) {
		if (!item || !item.Id) return [];
		const urls = [];
		const authSuffix = token ? `&api_key=${token}` : '';
		if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length) {
			item.BackdropImageTags.forEach((tag, idx) => {
				urls.push(`${base}/Items/${item.Id}/Images/Backdrop/${idx}?quality=90&fillWidth=1400&tag=${tag}${authSuffix}`);
			});
		} else if (item.ImageTags?.Backdrop) {
			urls.push(`${base}/Items/${item.Id}/Images/Backdrop?quality=90&fillWidth=1400&tag=${item.ImageTags.Backdrop}${authSuffix}`);
		} else if (Array.isArray(item.ParentBackdropImageTags) && item.ParentBackdropImageTags.length) {
			const parentId = item.ParentBackdropItemId || item.SeriesId || item.Id;
			item.ParentBackdropImageTags.forEach((tag, idx) => {
				urls.push(`${base}/Items/${parentId}/Images/Backdrop/${idx}?quality=90&fillWidth=1400&tag=${tag}${authSuffix}`);
			});
		}
		return urls;
	}

	function getBackdropUrls(item, base, token) {
		const urls = getStrictBackdropUrls(item, base, token);
		const authSuffix = token ? `&api_key=${token}` : '';
		if (item?.ImageTags?.Thumb) {
			urls.push(`${base}/Items/${item.Id}/Images/Thumb?quality=90&fillWidth=1400&tag=${item.ImageTags.Thumb}${authSuffix}`);
		}
		if (urls.length === 0 && item?.ImageTags?.Primary) {
			urls.push(`${base}/Items/${item.Id}/Images/Primary?quality=90&fillWidth=1400&tag=${item.ImageTags.Primary}${authSuffix}`);
		}
		return urls;
	}

	async function fetchMovieBackdropsOnly(item, base, token) {
		const localBackdrops = getStrictBackdropUrls(item, base, token);
		if (localBackdrops.length > 0) return localBackdrops;

		const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
		if (tmdbId) {
			const isMovie = (item.Type === 'Movie' || item.MediaType === 'Video');
			const endpoint = isMovie ? `movie/${tmdbId}` : `tv/${tmdbId}`;
			for (const key of TMDB_KEYS) {
				if (deadTmdbKeys.has(key)) continue;
				try {
					const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/images?api_key=${key}`);
					if (res.status === 401 || res.status === 403 || res.status === 429) {
						deadTmdbKeys.add(key);
						continue;
					}
					if (res.ok) {
						const data = await res.json();
						if (data && data.backdrops && data.backdrops.length > 0) {
							return data.backdrops.map(b => `https://image.tmdb.org/t/p/w1280${b.file_path}`);
						}
						break;
					}
					if (res.status === 404) break;
				} catch (e) { }
			}
		}

		const singleBackdrop = getImageUrl(item, 'Backdrop', base, token);
		return singleBackdrop ? [singleBackdrop] : [];
	}

	function pickDailyBackdropFromList(backdrops, item) {
		if (!backdrops || !backdrops.length) return null;
		if (backdrops.length === 1) return backdrops[0];

		// Calculate 24-hour day index (rotates every 24 hours)
		const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

		// Generate hash from item ID to pick different random backdrops for each movie
		let itemIdHash = 0;
		const itemIdStr = String(item?.Id || '');
		for (let i = 0; i < itemIdStr.length; i++) {
			itemIdHash = ((itemIdHash << 5) - itemIdHash) + itemIdStr.charCodeAt(i);
			itemIdHash |= 0;
		}

		const selectedIndex = Math.abs(itemIdHash + dayIndex) % backdrops.length;
		return backdrops[selectedIndex];
	}

	function getInitialDailyBackdropUrl(item, base, token) {
		const strictBackdrops = getStrictBackdropUrls(item, base, token);
		if (strictBackdrops.length > 0) {
			return pickDailyBackdropFromList(strictBackdrops, item);
		}
		return getImageUrl(item, 'Backdrop', base, token) || getImageUrl(item, 'Primary', base, token) || '';
	}

	async function getDailyRandomBackdropUrl(item, base, token) {
		const backdrops = await fetchMovieBackdropsOnly(item, base, token);
		if (!backdrops || !backdrops.length) {
			return `${base}/Items/${item.Id}/Images/Backdrop?quality=85&fillWidth=1400${token ? `&api_key=${token}` : ''}`;
		}
		return pickDailyBackdropFromList(backdrops, item);
	}

	function openGalleryLightbox(urls, startIndex) {
		if (!urls || !urls.length) return;
		let currentIndex = startIndex || 0;

		document.querySelectorAll('.movie-gallery-modal').forEach(m => m.remove());

		const modal = document.createElement('div');
		modal.className = 'movie-gallery-modal';

		modal.innerHTML = `
			<div class="gallery-modal-close" id="gallery-modal-close" title="Close">✕</div>
			${urls.length > 1 ? `<div class="gallery-modal-btn gallery-modal-prev" id="gallery-modal-prev">❮</div>` : ''}
			${urls.length > 1 ? `<div class="gallery-modal-btn gallery-modal-next" id="gallery-modal-next">❯</div>` : ''}
			<div class="gallery-modal-img-wrap">
				<img id="gallery-modal-img" src="${urls[currentIndex]}" alt="" />
			</div>
		`;

		document.body.appendChild(modal);

		// Push history state so mobile phone back gesture/button closes lightbox cleanly
		let historyPushed = false;
		try {
			window.history.pushState({ abyssGalleryOpen: true }, '', window.location.href);
			historyPushed = true;
		} catch (e) { }

		let isClosed = false;
		const closeModal = (shouldPopHistory = false) => {
			if (isClosed) return;
			isClosed = true;
			modal.style.opacity = '0';
			modal.style.transition = 'opacity 0.2s ease';
			setTimeout(() => modal.remove(), 200);

			document.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('popstate', handlePopState);

			if (shouldPopHistory && historyPushed) {
				try { window.history.back(); } catch (e) { }
			}
		};

		const handlePopState = () => {
			closeModal(false);
		};

		const updateImg = () => {
			const img = modal.querySelector('#gallery-modal-img');
			if (img) img.src = urls[currentIndex];
		};

		modal.querySelector('#gallery-modal-close').addEventListener('click', () => closeModal(true));
		modal.addEventListener('click', (e) => {
			if (e.target === modal || e.target.classList.contains('gallery-modal-img-wrap')) {
				closeModal(true);
			}
		});

		const prevBtn = modal.querySelector('#gallery-modal-prev');
		const nextBtn = modal.querySelector('#gallery-modal-next');
		if (prevBtn) {
			prevBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				currentIndex = (currentIndex - 1 + urls.length) % urls.length;
				updateImg();
			});
		}
		if (nextBtn) {
			nextBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				currentIndex = (currentIndex + 1) % urls.length;
				updateImg();
			});
		}

		// Touch swipe left/right gesture handler for mobile
		let touchStartX = 0;
		let touchStartY = 0;
		modal.addEventListener('touchstart', (e) => {
			if (e.touches && e.touches.length === 1) {
				touchStartX = e.touches[0].clientX;
				touchStartY = e.touches[0].clientY;
			}
		}, { passive: true });

		modal.addEventListener('touchend', (e) => {
			if (e.changedTouches && e.changedTouches.length === 1 && urls.length > 1) {
				const deltaX = e.changedTouches[0].clientX - touchStartX;
				const deltaY = e.changedTouches[0].clientY - touchStartY;

				if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
					if (deltaX < 0) {
						// Swipe left -> Next image
						currentIndex = (currentIndex + 1) % urls.length;
					} else {
						// Swipe right -> Previous image
						currentIndex = (currentIndex - 1 + urls.length) % urls.length;
					}
					updateImg();
				}
			}
		}, { passive: true });

		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				closeModal(true);
			} else if (e.key === 'ArrowLeft' && urls.length > 1) {
				currentIndex = (currentIndex - 1 + urls.length) % urls.length;
				updateImg();
			} else if (e.key === 'ArrowRight' && urls.length > 1) {
				currentIndex = (currentIndex + 1) % urls.length;
				updateImg();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		window.addEventListener('popstate', handlePopState);
	}

	function escapeHtml(str) {
		return String(str || '').replace(/[&<>"']/g, c => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
		}[c]));
	}

	async function playMediaItem(target, options = {}) {
		stopHeroThemeMedia();
		const id = (typeof target === 'object' && target !== null) ? (target.Id || target.id) : target;
		if (!id) return;

		const { token, userId, serverId } = getAuth();
		let item = (typeof target === 'object' && target !== null && (target.Id || target.id)) ? target : null;
		if (!item && itemCache[id]) item = itemCache[id];
		if (!item) {
			try {
				item = await fetchItemDetails(id);
			} catch (e) { }
		}

		if (item) {
			if (!item.Id) item.Id = id;
			if (!item.ServerId && serverId) item.ServerId = serverId;
		}

		const startPos = options.startPositionTicks !== undefined
			? options.startPositionTicks
			: (item?.UserData?.PlaybackPositionTicks || 0);
		const isShuffle = !!options.shuffle;
		const effectiveServerId = (item && item.ServerId) || serverId || '';

		// 1. Try playbackManager (Webpack captured or Global)
		const pm = getInternalPlaybackManager();
		if (pm && typeof pm.play === 'function') {
			try {
				const playParams = {
					ids: [id],
					startPositionTicks: startPos,
					fullscreen: true,
					shuffle: isShuffle
				};
				if (effectiveServerId) {
					playParams.serverId = effectiveServerId;
				}
				if (item && Array.isArray(item.MediaSources) && item.MediaSources.length > 0) {
					playParams.items = [item];
				}
				collapseActiveHoverTrailer();
				const res = pm.play(playParams);
				if (res && typeof res.then === 'function') await res;
				return;
			} catch (err) {
				console.warn('[PlayMediaItem] pm.play with full params failed, trying fallback params:', err);
				try {
					const res = pm.play({
						ids: [id],
						serverId: effectiveServerId,
						startPositionTicks: startPos,
						fullscreen: true
					});
					if (res && typeof res.then === 'function') await res;
					return;
				} catch (e2) {
					console.warn('[PlayMediaItem] pm.play fallback failed:', e2);
				}
			}
		}

		// 2. Fallback: Jellyfin itemShortcuts / card click strictly scoped to data-id="${id}"
		// NEVER search document for generic [data-action="resume"]!
		try {
			const scopedCards = document.querySelectorAll(`[data-id="${id}"]`);
			for (const card of scopedCards) {
				const playBtn = card.querySelector('[data-action="resume"], [data-action="play"], .btnPlay, .cardImageContainer, .cardContent');
				if (playBtn) {
					playBtn.click();
					return;
				}
			}
		} catch (e) { }

		// 3. Fallback: Item details page Play button strictly IF on this item's page
		try {
			const activeItemId = resolveItemId();
			if (activeItemId === id) {
				const activePage = getActiveItemPage();
				if (activePage) {
					const pagePlayBtn = activePage.querySelector('[data-action="resume"], .btnResume, [data-action="play"], .btnPlay, .btnPlayMedia');
					if (pagePlayBtn && pagePlayBtn.id !== 'movie-exact-hero-play' && pagePlayBtn.id !== 'movie-btn-play' && !pagePlayBtn.classList.contains('hero-play-btn')) {
						pagePlayBtn.click();
						return;
					}
				}
			}
		} catch (e) { }

		// 4. Fallback: appRouter invokeItem or showItem
		try {
			const router = window.appRouter || window.parent?.appRouter || window.top?.appRouter;
			if (router) {
				if (typeof router.invokeItem === 'function') {
					router.invokeItem(id);
					return;
				}
				if (typeof router.play === 'function') {
					router.play(id);
					return;
				}
			}
		} catch (e) { }

		// 5. Safe Fallback: Navigate to item details page
		window.location.hash = `#/details?id=${id}${effectiveServerId ? `&serverId=${effectiveServerId}` : ''}`;
	}
	window.__abyssPlayMediaItem = playMediaItem;
	if (window.top && window.top !== window) {
		try {
			window.top.__abyssPlayMediaItem = playMediaItem;
		} catch (e) { }
	}
	if (window.parent && window.parent !== window) {
		try {
			window.parent.__abyssPlayMediaItem = playMediaItem;
		} catch (e) { }
	}

	let isContextMenuActive = false;

	async function openItemContextMenu(targetItem, triggerElement, event) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === 'function') {
				event.stopImmediatePropagation();
			}
		}

		if (isContextMenuActive) return;
		isContextMenuActive = true;
		setTimeout(() => { isContextMenuActive = false; }, 600);

		// Remove any lingering duplicate action sheet
		document.querySelectorAll('.actionsheetContainer, .actionSheetScroller, .actionSheetContainer').forEach(el => {
			try { el.remove(); } catch (e) { }
		});

		const id = (typeof targetItem === 'object' && targetItem !== null) ? (targetItem.Id || targetItem.id) : targetItem;
		let fullItem = (typeof targetItem === 'object' && targetItem !== null && targetItem.Type) ? targetItem : null;

		if (!fullItem && id) {
			fullItem = await fetchItemDetails(id).catch(() => null) || { Id: id };
		}

		// 1. Try dynamic Webpack itemContextMenu module resolution
		try {
			const menuMod = await resolveItemContextMenuModule();
			const showFn = menuMod?.show || menuMod?.default?.show;
			if (typeof showFn === 'function') {
				const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
				let currentUser = null;
				if (api && typeof api.getCurrentUser === 'function') {
					currentUser = await api.getCurrentUser().catch(() => null);
				}

				const targetPosEl = triggerElement || event?.target || document.body;
				showFn({
					item: fullItem || { Id: id },
					user: currentUser,
					positionTo: targetPosEl,
					play: true,
					queue: true
				});
				return;
			}
		} catch (err) {
			console.warn('[openItemContextMenu] webpack show error:', err);
		}

		// 2. Try window global context menu handlers
		try {
			const ctx = window.itemContextMenu || window.Emby?.Page?.itemContextMenu || window.parent?.itemContextMenu;
			if (ctx && typeof ctx.show === 'function') {
				ctx.show({
					item: fullItem || { Id: id },
					positionTo: triggerElement || event?.target
				});
				return;
			}
		} catch (e) { }
	}

	let isJmpMpvHeroPlaying = false;
	let jmpMpvSignalConnections = [];

	function cleanupNativeBackgroundThemePlayer() {
		// Ensure PlaybackManager.play guard is active
		getInternalPlaybackManager();
		if (isVideoOsdPageActive()) return;

		const strayContainers = document.querySelectorAll('.videoPlayerContainer');
		if (strayContainers.length > 0) {
			try {
				const pm = getInternalPlaybackManager();
				if (pm && typeof pm.isPlaying === 'function' && pm.isPlaying() && typeof pm.stop === 'function') {
					pm.stop();
				}
			} catch (e) { }
			strayContainers.forEach(el => {
				try {
					el.querySelectorAll('video').forEach(v => {
						try {
							v.pause();
							v.removeAttribute('src');
							v.load();
						} catch (err) { }
					});
					el.remove();
				} catch (e) { }
			});
			if (!isJmpMpvHeroPlaying) {
				document.documentElement.classList.remove('transparentDocument');
			}
		}
	}

	function stopHeroThemeMedia(container) {
		// 1. Clean up JMP Desktop MPV (hardware accelerated preview)
		if (isJmpMpvHeroPlaying || document.documentElement.classList.contains('jmp-hero-mpv-active')) {
			isJmpMpvHeroPlaying = false;
			if (window.api && window.api.player) {
				try {
					window.api.player.stop();
					window.api.player.userCommand('set loop-file no');
					window.api.player.userCommand('set panscan 0');
					window.api.player.userCommand('set video-align-y 0');
					window.api.player.userCommand('set mute no');
					window.api.player.setMuted(false);
				} catch (e) { }

				jmpMpvSignalConnections.forEach(conn => {
					if (conn.timer) clearTimeout(conn.timer);
					if (conn.io) {
						try { conn.io.disconnect(); } catch (e) { }
					}
					if (conn.signal && conn.fn) {
						try { conn.signal.disconnect(conn.fn); } catch (e) { }
					}
				});
				jmpMpvSignalConnections = [];
			}
			document.documentElement.classList.remove('jmp-hero-mpv-active', 'transparentDocument');
			const allHeroImgs = document.querySelectorAll('.hero-backdrop-img');
			allHeroImgs.forEach(img => {
				img.classList.remove('hero-backdrop-fade-out');
				img.style.opacity = '1';
			});
		}

		// 2. Clean up standard HTML5 <video> elements
		const root = container || document;
		root.querySelectorAll('.hero-theme-video, .hero-theme-iframe').forEach(el => {
			try {
				if (el.tagName === 'IFRAME') {
					el.remove();
				} else {
					el.pause();
					el.removeAttribute('src');
					el.load();
					el.remove();
				}
			} catch (e) { }
		});
	}

	function cleanUpCustomMovieLayout(page) {
		if (page) {
			stopHeroThemeMedia(page);
			page.classList.remove('is-movie-item-page', 'is-person-item-page', 'is-collection-item-page', 'is-series-item-page', 'is-season-item-page', 'is-episode-item-page');
			page.classList.add('is-not-movie');
			page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
		}
		document.body.classList.remove('has-custom-movie-layout');
	}

	function isThemeVideosEnabled() {
		try {
			if (localStorage.getItem('abyss_disable_theme_videos') === 'true') {
				return false;
			}
		} catch (e) { }
		return true;
	}

	window.__abyssThemeVideoCache = window.__abyssThemeVideoCache || {};

	async function fetchThemeVideo(itemId) {
		if (!itemId) return null;
		if (window.__abyssThemeVideoCache[itemId] !== undefined) {
			return window.__abyssThemeVideoCache[itemId];
		}

		const { token, userId } = getAuth();
		const base = getBaseUrl();
		const headers = token ? { 'X-Emby-Token': token, 'Authorization': `MediaBrowser Client="Jellyfin Web", Token="${token}"`, 'Accept': 'application/json' } : { 'Accept': 'application/json' };
		const authQuery = token ? `api_key=${token}` : '';

		// 1. ApiClient methods (Fastest path - single request, caches both hit and miss)
		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api) {
				if (typeof api.getThemeMedia === 'function' && userId) {
					const res = await api.getThemeMedia(userId, itemId, true);
					if (res) {
						const vItems = res?.ThemeVideosResult?.Items || res?.Items || [];
						window.__abyssThemeVideoCache[itemId] = vItems[0] || null;
						return window.__abyssThemeVideoCache[itemId];
					}
				}
				if (typeof api.getThemeVideos === 'function') {
					const res = await api.getThemeVideos(itemId);
					if (res) {
						const vItems = Array.isArray(res) ? res : (res?.Items || res?.ThemeVideosResult?.Items || []);
						window.__abyssThemeVideoCache[itemId] = vItems[0] || null;
						return window.__abyssThemeVideoCache[itemId];
					}
				}
			}
		} catch (e) { }

		// 2. Single direct HTTP endpoint fallback if ApiClient unavailable or failed
		const endpoint = userId
			? `${base}/Users/${userId}/Items/${itemId}/ThemeMedia?InheritFromParent=true&${authQuery}`
			: `${base}/Items/${itemId}/ThemeMedia?InheritFromParent=true&${authQuery}`;

		try {
			const res = await fetch(endpoint, { headers });
			if (res.ok) {
				const data = await res.json();
				const list = data?.ThemeVideosResult?.Items || (Array.isArray(data?.Items) ? data.Items : (Array.isArray(data) ? data : []));
				window.__abyssThemeVideoCache[itemId] = list[0] || null;
				return window.__abyssThemeVideoCache[itemId];
			}
		} catch (err) { }

		window.__abyssThemeVideoCache[itemId] = null;
		return null;
	}

	function getThemeVideoStreamUrl(themeVideoItem, forceTranscode = false) {
		if (!themeVideoItem || !themeVideoItem.Id) return null;
		const { token } = getAuth();
		const base = getBaseUrl();
		const authParam = token ? `&api_key=${token}` : '';

		const mediaSource = themeVideoItem.MediaSources?.[0];
		const videoStream = mediaSource?.MediaStreams?.find(s => s.Type === 'Video');
		const codec = (videoStream?.Codec || '').toLowerCase();
		const container = (themeVideoItem.Container || mediaSource?.Container || themeVideoItem.Path || '').toLowerCase();

		const testVid = document.createElement('video');
		const canPlayH264 = Boolean(testVid.canPlayType('video/mp4; codecs="avc1.42E01E"'));
		const isHevc = codec.includes('hevc') || codec.includes('h265');
		const canPlayHevc = isHevc
			? Boolean(testVid.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') || testVid.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'))
			: true;
		const isUnsupportedContainer = /\.(mkv|avi|ts|wmv|flv)$/i.test(container) || /^(mkv|matroska|avi|mpegts|wmv)$/i.test(container);
		const isAlreadyWebm = /webm/i.test(container);

		if (forceTranscode || !canPlayH264 || (isHevc && !canPlayHevc) || isUnsupportedContainer) {
			if (canPlayH264) {
				return `${base}/Videos/${themeVideoItem.Id}/stream.mp4?VideoCodec=h264&AudioCodec=aac&VideoBitRate=4000000&MaxWidth=1280${authParam}`;
			}
			if (!isAlreadyWebm) {
				return `${base}/Videos/${themeVideoItem.Id}/stream.webm?VideoCodec=vp8&AudioCodec=vorbis&VideoBitRate=1200000&MaxWidth=854${authParam}`;
			}
		}

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getVideoStreamUrl === 'function') {
				const u = api.getVideoStreamUrl(themeVideoItem.Id, { static: true });
				if (u) return u;
			}
		} catch (e) { }

		return `${base}/Videos/${themeVideoItem.Id}/stream?static=true${authParam}`;
	}

	function initHeroThemeVideo(customWrap, themeVideoItem, item) {
		if (!customWrap || !customWrap.isConnected || !themeVideoItem) return;
		if (isVideoOsdPageActive() || document.querySelector('.abyss-trailer-player-overlay')) return;
		cleanupNativeBackgroundThemePlayer();

		const { token } = getAuth();
		const base = getBaseUrl();
		const isJmpDesktop = Boolean(window.api && window.api.player);
		const heroImg = customWrap.querySelector('.hero-backdrop-img');

		if (isJmpDesktop) {
			// --- JELLYFIN MEDIA PLAYER DESKTOP (Native libmpv GPU Hardware Accelerated) ---
			// Plays local backdrop.mp4 with 0% CPU transcoding, 24fps silky smooth, instant start!
			stopHeroThemeMedia();

			const streamUrl = `${base}/Videos/${themeVideoItem.Id}/stream?static=true&api_key=${encodeURIComponent(token || '')}`;
			const player = window.api.player;

			isJmpMpvHeroPlaying = true;

			try {
				const streamdata = {
					type: 'video',
					headers: { 'User-Agent': 'JellyfinMediaPlayer' },
					metadata: themeVideoItem || item || {},
					media: {}
				};
				player.setMuted(true);
				player.userCommand('set mute yes');
				player.userCommand('set loop-file no');
				player.userCommand('set panscan 1.0');
				player.userCommand('set video-align-y -1.0');
				player.load(
					streamUrl,
					{ startMilliseconds: 0, autoplay: true },
					streamdata,
					'#1',
					'',
					() => {}
				);
			} catch (e) {
				console.warn('[JMP Hero MPV] load failed:', e);
			}

			const cleanupJmpConnections = () => {
				jmpMpvSignalConnections.forEach(conn => {
					if (conn.timer) clearTimeout(conn.timer);
					if (conn.io) {
						try { conn.io.disconnect(); } catch (e) { }
					}
					if (conn.signal && conn.fn) {
						try { conn.signal.disconnect(conn.fn); } catch (e) { }
					}
				});
				jmpMpvSignalConnections = [];
			};

			const onPlaying = () => {
				if (!isJmpMpvHeroPlaying || !customWrap.isConnected || isVideoOsdPageActive() || document.querySelector('.abyss-trailer-player-overlay')) {
					stopHeroThemeMedia();
					return;
				}
				try {
					player.setMuted(true);
					player.userCommand('set mute yes');
				} catch (e) { }
				document.documentElement.classList.add('jmp-hero-mpv-active', 'transparentDocument');
				if (heroImg) {
					heroImg.classList.add('hero-backdrop-fade-out');
				}
			};

			const onFinished = () => {
				if (!isJmpMpvHeroPlaying) return;
				isJmpMpvHeroPlaying = false;
				cleanupJmpConnections();
				try {
					player.stop();
					player.userCommand('set panscan 0');
					player.userCommand('set video-align-y 0');
					player.userCommand('set mute no');
					player.setMuted(false);
				} catch (e) { }
				document.documentElement.classList.remove('jmp-hero-mpv-active', 'transparentDocument');
				if (heroImg) {
					heroImg.classList.remove('hero-backdrop-fade-out');
					heroImg.style.opacity = '1';
				}
			};

			const heroSection = customWrap.querySelector('.hero-section');
			if (heroSection && 'IntersectionObserver' in window) {
				const io = new IntersectionObserver((entries) => {
					for (const entry of entries) {
						if (!isJmpMpvHeroPlaying || !customWrap.isConnected) {
							io.disconnect();
							return;
						}
						if (!entry.isIntersecting) {
							document.documentElement.classList.remove('jmp-hero-mpv-active', 'transparentDocument');
							if (heroImg) {
								heroImg.classList.remove('hero-backdrop-fade-out');
								heroImg.style.opacity = '1';
							}
							try { player.pause(); } catch (e) { }
						} else if (!isVideoOsdPageActive() && !document.querySelector('.abyss-trailer-player-overlay')) {
							document.documentElement.classList.add('jmp-hero-mpv-active', 'transparentDocument');
							if (heroImg) {
								heroImg.classList.add('hero-backdrop-fade-out');
							}
							try {
								player.setMuted(true);
								player.userCommand('set mute yes');
								player.play();
							} catch (e) { }
						}
					}
				}, { threshold: 0.15 });
				io.observe(heroSection);
				jmpMpvSignalConnections.push({ io });
			}

			const timer = setTimeout(onPlaying, 500);

			try {
				player.playing.connect(onPlaying);
				jmpMpvSignalConnections.push({ signal: player.playing, fn: onPlaying, timer });
			} catch (e) {
				jmpMpvSignalConnections.push({ timer });
				onPlaying();
			}

			try {
				player.finished.connect(onFinished);
				jmpMpvSignalConnections.push({ signal: player.finished, fn: onFinished });
			} catch (e) { }

			return;
		}

		// --- STANDARD WEB BROWSER & MOBILE (Chrome, Edge, Firefox, Safari, Android/iOS) ---
		const themeVideoUrl = getThemeVideoStreamUrl(themeVideoItem);
		if (!themeVideoUrl) return;

		const heroContainer = customWrap.querySelector('.hero-section .hero-bg-container, .hero-section > div:first-child');
		if (!heroContainer) return;

		let video = heroContainer.querySelector('video.hero-theme-video');
		if (!video) {
			video = document.createElement('video');
			video.className = 'hero-theme-video';
			video.autoplay = true;
			video.loop = false;
			video.muted = true;
			video.defaultMuted = true;
			video.playsInline = true;
			video.preload = 'auto';
			video.setAttribute('muted', '');
			video.setAttribute('playsinline', '');
			video.setAttribute('autoplay', '');
			video.removeAttribute('loop');
			video.src = themeVideoUrl;
			heroContainer.insertBefore(video, heroContainer.firstChild);
		} else {
			video.loop = false;
			video.removeAttribute('loop');
			video.src = themeVideoUrl;
		}

		video.muted = true;
		video.defaultMuted = true;

		const showVideo = () => {
			if (!video.isConnected || isVideoOsdPageActive() || document.querySelector('.abyss-trailer-player-overlay')) return;
			video.style.display = 'block';
			video.style.opacity = '1';
			if (video.paused && !video.ended) {
				video.play().catch(() => {});
			}
		};

		video.addEventListener('canplay', showVideo);
		video.addEventListener('playing', showVideo);
		video.addEventListener('loadeddata', showVideo);
		video.addEventListener('ended', () => {
			video.style.transition = 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
			video.style.opacity = '0';
			setTimeout(() => {
				if (video && video.parentNode) {
					video.style.display = 'none';
				}
			}, 900);
		});
		video.addEventListener('error', () => {
			if (!video.dataset.retriedTranscode) {
				video.dataset.retriedTranscode = 'true';
				const fallbackUrl = getThemeVideoStreamUrl(themeVideoItem, true);
				if (fallbackUrl && fallbackUrl !== video.src) {
					video.src = fallbackUrl;
					video.play().catch(() => {});
					return;
				}
			}
			video.style.opacity = '0';
			video.style.display = 'none';
		});

		const playPromise = video.play();
		if (playPromise !== undefined) {
			playPromise.then(showVideo).catch(() => {});
		}
	}

	function appendSimilarMoviesSection(customWrap, similarItems, base, token) {
		if (!customWrap || !similarItems || !similarItems.length) return;
		if (customWrap.querySelector('.similar-movies-section')) return;

		const similarSec = document.createElement('section');
		similarSec.className = 'similar-movies-section';

		let similarCardsHtml = '';
		similarItems.slice(0, 5).forEach(sim => {
			const simPoster = getImageUrl(sim, 'Primary', base, token);
			const simYear = sim.ProductionYear || '';
			const simRating = (typeof sim.CommunityRating === 'number' && sim.CommunityRating > 0)
				? sim.CommunityRating.toFixed(1)
				: (typeof sim.CriticRating === 'number' && sim.CriticRating > 0
					? (sim.CriticRating / 10).toFixed(1)
					: 'N/A');
			similarCardsHtml += `
				<a href="#/details?id=${sim.Id}" class="similar-item-card">
					<div class="similar-poster-wrap">
						<img src="${simPoster}" alt="${escapeHtml(sim.Name)}" loading="lazy" onError="this.style.display='none'" />
					</div>
					<div>
						<h4 class="similar-title-text">${escapeHtml(sim.Name)}</h4>
						<div class="similar-sub-info">
							<span>${simYear}</span> • <span style="color:#eab308;">★ ${simRating}</span>
						</div>
					</div>
				</a>
			`;
		});

		similarSec.innerHTML = `
			<div class="similar-header-flex">
				<h3 class="section-heading" style="margin:0;">Similar Movies</h3>
			</div>
			<div class="similar-grid">
				${similarCardsHtml}
			</div>
		`;

		customWrap.appendChild(similarSec);
	}

	async function fetchPersonMovies(personId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItems === 'function') {
				const res = await api.getItems(userId, {
					PersonIds: personId,
					IncludeItemTypes: 'Movie,Series',
					Recursive: true,
					SortBy: 'PremiereDate,SortName',
					SortOrder: 'Descending',
					Limit: 20
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		try {
			const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
			const url = `${base}/Users/${userId}/Items?PersonIds=${personId}&IncludeItemTypes=Movie,Series&Recursive=true&SortBy=PremiereDate,SortName&SortOrder=Descending&Limit=20&api_key=${token}`;
			const res = await fetch(url, { headers });
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data.Items || []);
			}
		} catch (e) { }

		return [];
	}

	function formatBirthDate(birthDateStr, deathDateStr) {
		if (!birthDateStr) return 'N/A';
		try {
			const birthDate = new Date(birthDateStr);
			if (isNaN(birthDate.getTime())) return 'N/A';

			const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
			const month = monthNames[birthDate.getMonth()];
			const day = birthDate.getDate();
			const year = birthDate.getFullYear();

			let ageStr = '';
			if (deathDateStr) {
				const deathDate = new Date(deathDateStr);
				if (!isNaN(deathDate.getTime())) {
					const age = deathDate.getFullYear() - year;
					ageStr = ` (Died at ${age})`;
				}
			} else {
				const now = new Date();
				let age = now.getFullYear() - year;
				const m = now.getMonth() - birthDate.getMonth();
				if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
					age--;
				}
				if (age > 0 && age < 120) {
					ageStr = ` (${age} years old)`;
				}
			}
			return `${month} ${day}, ${year}${ageStr}`;
		} catch (e) {
			return 'N/A';
		}
	}

	function getPersonImageUrl(item, base, token) {
		if (!item || !item.Id) return '';
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;

		const tag = item.PrimaryImageTag || item.ImageTags?.Primary || item.SeriesPrimaryImageTag || '';

		if (api) {
			try {
				if (typeof api.getImageUrl === 'function') {
					const url = api.getImageUrl(item.Id, { type: 'Primary', quality: 90, fillWidth: 1000 });
					if (url) return url;
				}
			} catch (e) { }

			try {
				if (typeof api.getScaledImageUrl === 'function') {
					const url = api.getScaledImageUrl(item.Id, { type: 'Primary', quality: 90, fillWidth: 1000 });
					if (url) return url;
				}
			} catch (e) { }
		}

		const tagParam = tag ? `&tag=${tag}` : '';
		if (token) {
			return `${base}/Items/${item.Id}/Images/Primary?quality=90&fillWidth=1000${tagParam}&api_key=${token}`;
		}
		return `${base}/Items/${item.Id}/Images/Primary?quality=90&fillWidth=1000${tagParam}`;
	}

	const personRoleCache = {};

	async function detectPersonRoleFromJellyfin(personId, personName) {
		if (!personId) return null;
		if (personRoleCache[personId]) return personRoleCache[personId];

		const { token, userId } = getAuth();
		if (!token || !userId) return null;
		const base = getBaseUrl();

		try {
			// Fetch movies this person appeared in, with People field included
			const url = `${base}/Users/${userId}/Items?PersonIds=${personId}&IncludeItemTypes=Movie,Series&Recursive=true&Fields=People&SortBy=PremiereDate&SortOrder=Descending&Limit=5&api_key=${token}`;
			const res = await fetch(url, { headers: { 'X-Emby-Token': token, 'Accept': 'application/json' } });
			if (!res.ok) return null;

			const data = await res.json();
			const items = data?.Items || [];

			// Check the People array of each movie to find this person's Type
			const typeCounts = {};
			for (const movie of items) {
				if (!movie.People || !Array.isArray(movie.People)) continue;
				for (const p of movie.People) {
					if (p.Id === personId || (personName && p.Name === personName)) {
						const pType = (p.Type || '').trim();
						if (pType) {
							typeCounts[pType] = (typeCounts[pType] || 0) + 1;
						}
					}
				}
			}

			// Determine primary role: prioritize Director > Writer > Producer > Actor
			const rolePriority = ['Director', 'Writer', 'Producer', 'Composer', 'Creator', 'Actor', 'GuestStar'];
			let bestRole = null;

			// First check: if person is Director or Writer in ANY movie, that's their primary role
			for (const priorityRole of rolePriority) {
				if (typeCounts[priorityRole]) {
					bestRole = priorityRole;
					break;
				}
			}

			// If no priority match, take the most frequent type
			if (!bestRole) {
				let maxCount = 0;
				for (const [type, count] of Object.entries(typeCounts)) {
					if (count > maxCount) {
						maxCount = count;
						bestRole = type;
					}
				}
			}

			if (bestRole) {
				personRoleCache[personId] = bestRole.toUpperCase();
				return bestRole.toUpperCase();
			}
		} catch (e) {
			console.warn('[Movie Details] Error detecting person role from Jellyfin:', e);
		}
		return null;
	}

	async function fetchTmdbPersonDetails(tmdbId) {
		if (!tmdbId) return null;
		if (personRoleCache['tmdb_' + tmdbId]) return personRoleCache['tmdb_' + tmdbId];

		for (const key of TMDB_KEYS) {
			try {
				const res = await fetch(`https://api.themoviedb.org/3/person/${tmdbId}?api_key=${key}`);
				if (res.ok) {
					const data = await res.json();
					personRoleCache['tmdb_' + tmdbId] = data;
					return data;
				}
			} catch (e) { }
		}
		return null;
	}

	function classifyRoleLabel(roleStr) {
		if (!roleStr) return null;
		const r = roleStr.toLowerCase();
		if (r.includes('director') || r.includes('directing')) return 'DIRECTOR';
		if (r.includes('writer') || r.includes('writing') || r.includes('screenplay')) return 'WRITER';
		if (r.includes('composer') || r.includes('music') || r.includes('sound')) return 'COMPOSER';
		if (r.includes('producer') || r.includes('production')) return 'PRODUCER';
		if (r.includes('cinematograph') || r.includes('camera')) return 'CINEMATOGRAPHER';
		if (r.includes('editor') || r.includes('editing')) return 'EDITOR';
		if (r.includes('creator')) return 'CREATOR';
		if (r.includes('actress')) return 'ACTRESS';
		if (r.includes('actor') || r.includes('acting') || r.includes('gueststar')) return 'ACTOR';
		return null;
	}

	async function getPersonRoleNameAsync(item, itemId) {
		if (!item && !itemId) return 'ACTOR';

		// 1. BEST SOURCE: Jellyfin's own People arrays from movies
		const jellyfinRole = await detectPersonRoleFromJellyfin(itemId, item?.Name);
		if (jellyfinRole) {
			const classified = classifyRoleLabel(jellyfinRole);
			if (classified) return classified;
		}

		// 2. TMDb known_for_department (fallback)
		const tmdbId = item?.ProviderIds?.Tmdb || item?.ProviderIds?.tmdb || item?.ProviderIds?.TMDB;
		if (tmdbId) {
			const tmdbData = await fetchTmdbPersonDetails(tmdbId);
			if (tmdbData?.known_for_department) {
				const classified = classifyRoleLabel(tmdbData.known_for_department);
				if (classified) return classified;
			}
		}

		// 3. Biography keyword detection (last resort)
		const overview = (item?.Overview || '').toLowerCase();
		if (overview.includes('director') || overview.includes('directed')) return 'DIRECTOR';
		if (overview.includes('screenwriter') || overview.includes('playwright') || overview.includes('writer')) return 'WRITER';
		if (overview.includes('composer') || overview.includes('musician')) return 'COMPOSER';
		if (overview.includes('producer')) return 'PRODUCER';
		if (overview.includes('cinematographer')) return 'CINEMATOGRAPHER';
		if (overview.includes('actress')) return 'ACTRESS';
		if (overview.includes('actor')) return 'ACTOR';

		return 'ACTOR';
	}

	function openJellyfinTrailerPlayer(item, youtubeId, searchFallback) {
		const existingPlayer = document.body.querySelector('.abyss-trailer-player-overlay');
		if (existingPlayer) existingPlayer.remove();

		const playerOverlay = document.createElement('div');
		playerOverlay.className = 'abyss-trailer-player-overlay';
		playerOverlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background-color: #000000;
			z-index: 99999999;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		`;

		const currentOrigin = window.location.origin || 'http://localhost';
		let srcUrl = '';
		let rawYtUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '';

		if (youtubeId) {
			srcUrl = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1&enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(currentOrigin)}`;
		} else if (searchFallback) {
			const q = encodeURIComponent(searchFallback);
			srcUrl = `https://www.youtube.com/embed?listType=search&list=${q}&autoplay=1&origin=${encodeURIComponent(currentOrigin)}`;
			rawYtUrl = `https://www.youtube.com/results?search_query=${q}`;
		}

		const itemName = item?.Name || 'Movie';
		playerOverlay.innerHTML = `
			<div style="position:absolute;top:0;left:0;right:0;height:60px;background:linear-gradient(to bottom, rgba(0,0,0,0.9), transparent);z-index:10;display:flex;align-items:center;padding:0 16px;gap:12px;pointer-events:auto;">
				<button type="button" class="abyss-trailer-back-btn" style="background:rgba(255,255,255,0.15);border:none;color:#ffffff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:background 0.2s ease;" title="Back">
					<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"></path></svg>
				</button>
				<div style="flex:1;color:#ffffff;font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,0.8);">
					${escapeHtml(itemName)} - Official Trailer
				</div>
				${rawYtUrl ? `<a href="${rawYtUrl}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.7);font-size:12px;text-decoration:none;background:rgba(255,255,255,0.1);padding:6px 12px;border-radius:20px;backdrop-filter:blur(8px);display:flex;align-items:center;gap:4px;" title="Open in YouTube if video is restricted">
					<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 .6-.03 1.29-.1 2.09-.06.8-.15 1.43-.28 1.9-.16.58-.47 1.05-.93 1.42-.46.37-.98.58-1.57.64-.8.07-1.77.1-2.92.1H7.8c-1.15 0-2.12-.03-2.92-.1-.59-.06-1.11-.27-1.57-.64-.46-.37-.77-.84-.93-1.42-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-.6.03-1.29.1-2.09.06-.8.15-1.43.28-1.9.16-.58.47-1.05.93-1.42.46-.37.98-.58 1.57-.64.8-.07 1.77-.1 2.92-.1h8.4c1.15 0 2.12.03 2.92.1.59.06 1.11.27 1.57.64.46.37.77.84.93 1.42z"></path></svg>
					YouTube
				</a>` : ''}
			</div>
			<div style="flex:1;width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;background:#000;">
				<iframe 
					src="${srcUrl}" 
					style="width:100%;height:100%;border:none;" 
					allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope" 
					referrerpolicy="strict-origin-when-cross-origin"
					allowfullscreen>
				</iframe>
			</div>
		`;

		document.body.appendChild(playerOverlay);
		document.body.classList.add('is-video-playing');

		// Push history state so mobile phone back gesture/button closes modal instead of leaving page
		let historyPushed = false;
		try {
			window.history.pushState({ abyssTrailerOpen: true }, '', window.location.href);
			historyPushed = true;
		} catch (e) { }

		let isClosed = false;
		const closePlayer = (shouldPopHistory = false) => {
			if (isClosed) return;
			isClosed = true;

			playerOverlay.style.opacity = '0';
			playerOverlay.style.transition = 'opacity 0.2s ease';
			setTimeout(() => {
				playerOverlay.remove();
				document.body.classList.remove('is-video-playing');
			}, 200);

			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('popstate', handlePopState);

			if (shouldPopHistory && historyPushed) {
				try {
					window.history.back();
				} catch (e) { }
			}
		};

		const handlePopState = () => {
			closePlayer(false);
		};

		const backBtn = playerOverlay.querySelector('.abyss-trailer-back-btn');
		if (backBtn) {
			backBtn.addEventListener('click', () => closePlayer(true));
		}

		const handleKeyDown = (e) => {
			if (e.key === 'Escape' || e.key === 'BackSpace') {
				closePlayer(true);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('popstate', handlePopState);
	}

	async function playTrailer(itemId, item, page) {
		stopHeroThemeMedia();
		const { token, userId } = getAuth();
		const base = getBaseUrl();
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;

		// 1. Try Local Trailers via Jellyfin ApiClient play()
		if (token && userId) {
			try {
				const res = await fetch(`${base}/Users/${userId}/Items/${itemId}/LocalTrailers?api_key=${token}`);
				if (res.ok) {
					const trailers = await res.json();
					if (trailers && trailers.length) {
						if (api && typeof api.play === 'function') {
							api.play({ ids: [trailers[0].Id] });
							return;
						}
						const pm = window.PlaybackManager || window.parent?.PlaybackManager || window.top?.PlaybackManager;
						if (pm && typeof pm.play === 'function') {
							pm.play({ ids: [trailers[0].Id] });
							return;
						}
					}
				}
			} catch (e) { }
		}

		// 2. Extract Remote Trailer URL
		let trailerUrl = '';
		if (item?.RemoteTrailers && item.RemoteTrailers.length > 0) {
			trailerUrl = item.RemoteTrailers[0].Url || '';
		}

		if (!trailerUrl && token && userId) {
			try {
				const res = await fetch(`${base}/Users/${userId}/Items/${itemId}?api_key=${token}`);
				if (res.ok) {
					const fullItem = await res.json();
					if (fullItem?.RemoteTrailers && fullItem.RemoteTrailers.length > 0) {
						trailerUrl = fullItem.RemoteTrailers[0].Url || '';
					}
				}
			} catch (e) { }
		}

		// 3. Extract YouTube ID
		let youtubeId = '';
		if (trailerUrl) {
			const ytMatch = trailerUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
			if (ytMatch && ytMatch[1]) {
				youtubeId = ytMatch[1];
			}
		}

		// 4. Open in built-in Jellyfin player overlay (No external redirects, no popup tabs)
		if (youtubeId) {
			openJellyfinTrailerPlayer(item, youtubeId);
		} else {
			const titleName = item?.Name || 'Movie';
			const year = item?.ProductionYear || '';
			openJellyfinTrailerPlayer(item, null, `${titleName} ${year} Trailer`);
		}
	}

	window.__abyssFavoriteCache = window.__abyssFavoriteCache || {};

	async function sendFavoriteApiRequest(itemId, newFav) {
		if (!itemId) return false;

		const { token, userId } = getAuth();
		const base = getBaseUrl();
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;

		if (api && userId) {
			try {
				if (newFav && typeof api.markFavorite === 'function') {
					await api.markFavorite(userId, itemId);
					return true;
				} else if (!newFav && typeof api.unmarkFavorite === 'function') {
					await api.unmarkFavorite(userId, itemId);
					return true;
				} else if (typeof api.updateFavoriteStatus === 'function') {
					await api.updateFavoriteStatus(userId, itemId, newFav);
					return true;
				}
			} catch (e) {
				console.warn('[Abyss Favorite] ApiClient error, falling back to fetch:', e);
			}
		}

		if (token && userId) {
			try {
				const method = newFav ? 'POST' : 'DELETE';
				const url = `${base}/Users/${userId}/FavoriteItems/${itemId}?api_key=${encodeURIComponent(token)}`;
				const res = await fetch(url, {
					method,
					headers: {
						'X-Emby-Token': token,
						'X-MediaBrowser-Token': token,
						'Authorization': `MediaBrowser Client="Jellyfin Web", Device="Web", DeviceId="Web", Version="10.8.0", Token="${token}"`,
						'Content-Type': 'application/json'
					}
				});
				return res.ok;
			} catch (e) {
				console.error('[Abyss Favorite] Fetch error:', e);
			}
		}
		return false;
	}

	function syncAllFavoriteUI(itemId, newFav) {
		if (!itemId) return;

		window.__abyssFavoriteCache[itemId] = newFav;
		try { sessionStorage.setItem('abyss_fav_' + itemId, newFav ? 'true' : 'false'); } catch (e) { }

		if (itemCache[itemId] && itemCache[itemId].UserData) {
			itemCache[itemId].UserData.IsFavorite = newFav;
		}

		try {
			const current = window.Emby?.Page?.currentItem || window.top?.Emby?.Page?.currentItem;
			if (current && (current.Id === itemId || current.id === itemId) && current.UserData) {
				current.UserData.IsFavorite = newFav;
			}
		} catch (e) { }

		// 1. Movie Details Page Custom Buttons (Synchronous Instant Binding)
		const favStr = newFav ? 'true' : 'false';
		const detailsBtns = document.querySelectorAll('#movie-btn-fav, .movie-btn-fav, [data-movie-id="' + itemId + '"] #movie-btn-fav');
		detailsBtns.forEach(btn => {
			if (btn.getAttribute('data-is-fav') === favStr && btn.classList.contains('is-fav') === Boolean(newFav)) return;
			btn.setAttribute('data-is-fav', favStr);
			btn.classList.toggle('is-fav', newFav);
			btn.style.setProperty('color', newFav ? '#ef4444' : '#ffffff', 'important');
			btn.style.setProperty('background', 'rgba(255, 255, 255, 0.1)', 'important');
			btn.style.setProperty('border-color', 'transparent', 'important');
			btn.style.setProperty('box-shadow', 'none', 'important');

			const svgIcon = btn.querySelector('svg');
			if (svgIcon) {
				svgIcon.setAttribute('fill', newFav ? '#ef4444' : 'none');
				svgIcon.setAttribute('stroke', newFav ? '#ef4444' : 'currentColor');
				svgIcon.style.setProperty('fill', newFav ? '#ef4444' : 'none', 'important');
				svgIcon.style.setProperty('stroke', newFav ? '#ef4444' : 'currentColor', 'important');
			}

			const textSpan = btn.querySelector('.btn-text');
			if (textSpan) {
				textSpan.innerText = newFav ? 'Favorited' : 'Add to Favorites';
			}
		});

		// 2. Video Player Bar Favorite Buttons (Synchronous Instant Binding)
		const playerBtns = document.querySelectorAll('.abyss-custom-osd-bar .abyss-btn-fav, .abyss-btn-fav');
		playerBtns.forEach(btn => {
			if (btn.classList.contains('is-favorite') === Boolean(newFav) && btn.dataset.syncedFav === favStr) return;
			btn.dataset.syncedFav = favStr;
			btn.classList.toggle('is-favorite', newFav);
			const svg = btn.querySelector('svg');
			if (svg) {
				svg.setAttribute('fill', newFav ? '#e50914' : 'currentColor');
				svg.style.setProperty('fill', newFav ? '#e50914' : 'currentColor', 'important');
				svg.style.setProperty('color', newFav ? '#e50914' : 'currentColor', 'important');
			}
		});

		// 3. Native Jellyfin Buttons (visual sync only, no click firing)
		const nativeBtns = document.querySelectorAll('#videoOsdPage .btnFavorite, .videoOsdHeader .btnFavorite, .videoOsdBottom .btnFavorite, .itemDetailPage .btnFavorite, #movieDetailsPage .btnFavorite');
		nativeBtns.forEach(btn => {
			if (!btn.classList.contains('abyss-btn-fav') && btn.id !== 'movie-btn-fav') {
				if (btn.getAttribute('data-isfavorite') === favStr) return;
				btn.classList.toggle('is-favorite', newFav);
				btn.setAttribute('data-isfavorite', favStr);
			}
		});
	}

	function enforceInstantFavoriteBinding() {
		if (document.hidden) return;
		const isRelevantPage = Boolean(
			document.querySelector('#videoOsdPage:not(.hide), .videoOsdPage:not(.hide), #itemDetailPage:not(.hide), .itemDetailPage:not(.hide), #movieDetailsPage:not(.hide)')
		);
		if (!isRelevantPage) return;

		const itemId = window.__abyssCurrentPlayingMovieId || resolveItemId() || (window.appRouter?.currentRouteInfo?.params?.id);
		if (!itemId) return;

		let isFav = window.__abyssFavoriteCache[itemId];
		if (isFav === undefined) {
			try {
				const sess = sessionStorage.getItem('abyss_fav_' + itemId);
				if (sess !== null) isFav = (sess === 'true');
			} catch (e) { }
		}

		if (isFav !== undefined) {
			syncAllFavoriteUI(itemId, isFav);
		}
	}

	if (!window.__abyssFavBindingInterval) {
		window.__abyssFavBindingInterval = setInterval(enforceInstantFavoriteBinding, 1000);
	}

	async function toggleFavorite(itemId, item, favBtn, page) {
		if (!itemId) itemId = window.__abyssCurrentPlayingMovieId;
		if (!itemId) return;

		const targetBtn = favBtn || (page ? page.querySelector('#movie-btn-fav') : document.querySelector('#movie-btn-fav'));
		const currentIsFav = window.__abyssFavoriteCache[itemId] !== undefined ?
			window.__abyssFavoriteCache[itemId] :
			(targetBtn ? (targetBtn.getAttribute('data-is-fav') === 'true' || targetBtn.classList.contains('is-fav')) : (item?.UserData?.IsFavorite || false));

		const newFav = !currentIsFav;

		if (item && item.UserData) {
			item.UserData.IsFavorite = newFav;
		}

		// 1. Synchronize UI instantly across the entire application
		syncAllFavoriteUI(itemId, newFav);

		// 2. Send single idempotent API call to Jellyfin Server
		await sendFavoriteApiRequest(itemId, newFav);
	}

	async function togglePlayed(itemId, item, playedBtn, page) {
		const targetBtn = playedBtn || page.querySelector('#movie-btn-played');
		const currentIsPlayed = targetBtn ? (targetBtn.getAttribute('data-is-played') === 'true' || targetBtn.classList.contains('is-played')) : (item.UserData?.Played || false);
		const newPlayed = !currentIsPlayed;

		if (item.UserData) {
			item.UserData.Played = newPlayed;
		}

		// Update all played buttons on page immediately
		const allPlayedBtns = page.querySelectorAll('#movie-btn-played, .movie-btn-played');
		allPlayedBtns.forEach(btn => {
			btn.setAttribute('data-is-played', newPlayed ? 'true' : 'false');
			btn.classList.toggle('is-played', newPlayed);
			btn.style.color = newPlayed ? '#22c55e' : '#ffffff';
			btn.style.background = 'rgba(255, 255, 255, 0.1)';
			btn.style.borderColor = 'transparent';
			btn.style.boxShadow = 'none';

			const svgIcon = btn.querySelector('svg');
			if (svgIcon) {
				svgIcon.setAttribute('fill', 'none');
			}

			const textSpan = btn.querySelector('.btn-text');
			if (textSpan) {
				textSpan.innerText = newPlayed ? 'Played' : 'Mark as Played';
			}
		});

		// Trigger native button if present
		const nativePlayedBtn = page.querySelector('.btnPlayed, button[data-action="played"], .btnTogglePlayed, .headerRight .btnPlayed');
		if (nativePlayedBtn) {
			try { nativePlayedBtn.click(); } catch (e) { }
		}

		// API Call
		const { token, userId } = getAuth();
		const base = getBaseUrl();
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;

		if (api) {
			try {
				if (newPlayed && typeof api.markPlayed === 'function') {
					await api.markPlayed(userId, itemId);
					return;
				} else if (!newPlayed && typeof api.markUnplayed === 'function') {
					await api.markUnplayed(userId, itemId);
					return;
				}
			} catch (e) { }
		}

		if (token && userId) {
			try {
				const method = newPlayed ? 'POST' : 'DELETE';
				await fetch(`${base}/Users/${userId}/PlayedItems/${itemId}?api_key=${token}`, { method });
			} catch (e) { }
		}
	}

	async function getCurrentUser() {
		try {
			const pageUser = window.Emby?.Page?.currentUser || window.top?.Emby?.Page?.currentUser;
			if (pageUser && pageUser.Policy) return pageUser;
		} catch (e) { }

		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		if (api) {
			try {
				if (typeof api.getCurrentUser === 'function') {
					const user = await api.getCurrentUser();
					if (user && user.Policy) return user;
				}
			} catch (e) { }

			try {
				const { token, userId } = getAuth();
				if (token && userId) {
					const base = getBaseUrl();
					const res = await fetch(`${base}/Users/${userId}?api_key=${token}`);
					if (res.ok) {
						const user = await res.json();
						if (user && user.Policy) return user;
					}
				}
			} catch (e) { }
		}

		return {
			Id: getAuth().userId,
			Policy: {
				IsAdministrator: true,
				EnableCollectionManagement: true,
				EnableLiveTvManagement: true,
				EnableContentDownloading: true
			}
		};
	}

	function getWebpackRequire() {
		hookWebpack();
		return window.__webpack_require__ || window.__webpackRequire || window.__jellyfinRequire || null;
	}

	async function showMovieContextMenu(targetBtn, item, e) {
		if (!item || !item.Id) return;

		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		const serverId = item.ServerId || (api && typeof api.serverId === 'function' ? api.serverId() : null);
		if (serverId) item.ServerId = serverId;

		const user = await getCurrentUser();

		const options = {
			item: item,
			user: user,
			items: [item],
			positionTo: targetBtn,
			serverId: serverId,
			edit: false,
			editImages: true,
			editSubtitles: true,
			share: false,
			play: false,
			queue: false,
			buttons: e?.button || 0,
			position: 'below'
		};

		// 1. Try dynamic Webpack itemContextMenu module resolution
		try {
			const ctxModule = await resolveItemContextMenuModule();
			if (ctxModule && typeof ctxModule.show === 'function') {
				ctxModule.show(options);
				return;
			} else if (ctxModule && typeof ctxModule.default?.show === 'function') {
				ctxModule.default.show(options);
				return;
			}
		} catch (err) {
			console.warn('[Movie Details] Webpack contextMenu require error:', err);
		}

		// 2. Try global itemContextMenu or Emby.Page
		const globalCtx = window.itemContextMenu ||
			window.Emby?.Page?.itemContextMenu ||
			window.Emby?.ItemContextMenu ||
			window.parent?.itemContextMenu ||
			window.top?.itemContextMenu;

		if (globalCtx && typeof globalCtx.show === 'function') {
			try {
				globalCtx.show(options);
				return;
			} catch (err) { }
		}

		// 3. Fallback: trigger native more commands button on active page
		const activePage = getActiveItemPage() || document;
		const nativeMenuBtn = activePage.querySelector('.btnMoreCommands, button[data-action="menu"]:not(#movie-btn-more):not(#series-btn-more):not(#collection-btn-more)');
		if (nativeMenuBtn) {
			try {
				nativeMenuBtn.click();
			} catch (err) { }
		}
	}

	async function renderPersonCustomLayout(page, item, itemId) {
		const { token } = getAuth();
		const base = getBaseUrl();

		let bgUrl = getPersonImageUrl(item, base, token);

		// Name formatting
		const nameParts = (item.Name || '').trim().split(' ');
		const firstName = nameParts[0] || '';
		const lastName = nameParts.slice(1).join(' ') || '';
		const nameHtml = lastName ? `${escapeHtml(firstName)}<br>${escapeHtml(lastName)}` : escapeHtml(firstName);

		// Overview / Bio
		const overview = item.Overview || 'No biography available for this person.';
		const hasLongBio = overview.length > 250;

		// Birth Date & Age
		const birthStr = formatBirthDate(item.PremiereDate || item.BirthDate, item.EndDate || item.DeathDate);

		// Place of birth
		const placeOfBirth = item.PlaceOfBirth || 'N/A';

		// Detect role from Jellyfin People arrays (most reliable source)
		const roleName = await getPersonRoleNameAsync(item, itemId);
		const knownFor = roleName === 'ACTRESS' || roleName === 'ACTOR' ? 'Acting' : roleName === 'DIRECTOR' ? 'Directing' : roleName === 'WRITER' ? 'Writing' : roleName === 'COMPOSER' ? 'Music' : roleName === 'PRODUCER' ? 'Producing' : 'Acting';

		// External Databases (IMDb, TMDB)
		let dbLinks = [];
		if (item.ProviderIds) {
			if (item.ProviderIds.Imdb) {
				dbLinks.push(`<a href="https://www.imdb.com/name/${item.ProviderIds.Imdb}" target="_blank" rel="noopener" style="color:#e5e7eb;text-decoration:underline;">IMDb</a>`);
			}
			if (item.ProviderIds.Tmdb) {
				dbLinks.push(`<a href="https://www.themoviedb.org/person/${item.ProviderIds.Tmdb}" target="_blank" rel="noopener" style="color:#e5e7eb;text-decoration:underline;">TMDB</a>`);
			}
		}
		const dbHtml = dbLinks.length ? dbLinks.join(', ') : 'IMDb, TMDB';

		// Favorite status
		const isFav = item.UserData?.IsFavorite || false;

		// Movies grid fetching
		const movies = await fetchPersonMovies(itemId);
		let moviesGridHtml = '';
		if (movies.length) {
			movies.forEach(m => {
				const mPoster = getImageUrl(m, 'Backdrop', base, token) || getImageUrl(m, 'Primary', base, token);
				const mYear = m.ProductionYear || (m.PremiereDate ? new Date(m.PremiereDate).getFullYear() : '');
				moviesGridHtml += `
					<div class="person-movie-card group" data-movie-id="${m.Id}">
						<div class="person-card-img-wrap">
							<img src="${mPoster}" alt="${escapeHtml(m.Name)}" class="person-card-img" onError="this.style.backgroundColor='#1a1a1a'" />
							<div class="person-card-overlay">
								<span>Play Movie</span>
							</div>
						</div>
						<h3 class="person-card-title">${escapeHtml(m.Name)}</h3>
						<p class="person-card-year">${mYear}</p>
					</div>
				`;
			});
		} else {
			moviesGridHtml = `<p style="color:#9ca3af;font-size:14px;grid-column:span 5;">No movies found for this person.</p>`;
		}

		// Wrapper element
		const customWrap = document.createElement('div');
		customWrap.className = 'person-custom-wrapper';

		customWrap.innerHTML = `
			<!-- Hero Image Background (With Black & White Grayscale Filter + Vignette Overlay) -->
			<div class="person-hero-bg">
				${bgUrl ? `<img src="${bgUrl}" alt="${escapeHtml(item.Name)}" class="person-hero-img" />` : ''}
				<div class="person-gradient-overlay"></div>
				<div class="person-bottom-gradient"></div>
			</div>

			<!-- Hero Content -->
			<section class="person-hero-content">
				<div class="person-left-col">
					<!-- Name -->
					<div class="person-name-wrap">
						<h1 class="person-name-title">${nameHtml}</h1>
						<div class="person-role-row">
							<span class="person-role-badge">${escapeHtml(roleName)}</span>
							<div class="person-role-line"></div>
						</div>
					</div>

					<!-- Bio -->
					<div class="person-bio-wrap ${hasLongBio ? 'is-truncated' : ''}" id="person-bio-box">
						<p class="person-bio-text">${escapeHtml(overview)}</p>
					</div>
					${hasLongBio ? `
						<button class="person-read-more-btn" id="person-read-more-btn" type="button">
							<span>Read more</span>
							<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transition:transform 0.3s ease;"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
						</button>
					` : ''}

					<!-- Info Grid -->
					<div class="person-info-grid">
						<div class="info-label">Born</div>
						<div class="info-val">${birthStr}</div>

						<div class="info-label">Birth Place</div>
						<div class="info-val">${escapeHtml(placeOfBirth)}</div>

						<div class="info-label">Known For</div>
						<div class="info-val">${escapeHtml(knownFor)}</div>

						<div class="info-label">Databases</div>
						<div class="info-val">${dbHtml}</div>

						<div class="info-label">Also Known As</div>
						<div class="info-val">${escapeHtml(item.Name)}</div>
					</div>
				</div>

				<!-- Floating Action Buttons over Image -->
				<div class="person-right-actions">
					<div class="person-action-btns">
						<button id="person-btn-fav" class="person-action-btn ${isFav ? 'is-fav' : ''}" type="button" title="${isFav ? 'Remove Favorite' : 'Add to Favorites'}">
							<svg width="20" height="20" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
						</button>
						<button id="person-btn-more" class="person-action-btn itemAction" type="button" data-action="menu" data-id="${itemId}" data-type="Person" data-serverid="${item.ServerId || ''}" title="More Options">
							<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
						</button>
					</div>
				</div>
			</section>

			<!-- Movies Section -->
			<section class="person-movies-section">
				<div class="person-movies-header">
					<div class="flex-row">
						<h2>Movies</h2>
						<div class="person-red-bar"></div>
					</div>
				</div>
				<div class="person-movies-grid" id="person-movies-grid">
					${moviesGridHtml}
				</div>
			</section>
		`;

		page.appendChild(customWrap);

		// Event Bindings
		const readMoreBtn = customWrap.querySelector('#person-read-more-btn');
		if (readMoreBtn) {
			readMoreBtn.addEventListener('click', () => {
				const bioBox = customWrap.querySelector('#person-bio-box');
				if (bioBox) {
					const isTruncated = bioBox.classList.contains('is-truncated');
					if (isTruncated) {
						bioBox.classList.remove('is-truncated');
						readMoreBtn.querySelector('span').textContent = 'Read less';
						readMoreBtn.querySelector('svg').style.transform = 'rotate(180deg)';
					} else {
						bioBox.classList.add('is-truncated');
						readMoreBtn.querySelector('span').textContent = 'Read more';
						readMoreBtn.querySelector('svg').style.transform = 'rotate(0deg)';
					}
				}
			});
		}

		const favBtn = customWrap.querySelector('#person-btn-fav');
		if (favBtn) {
			favBtn.addEventListener('click', async () => {
				await toggleFavorite(itemId, item, favBtn, page);
				const isFavNow = item.UserData?.IsFavorite;
				favBtn.classList.toggle('is-fav', !!isFavNow);
				const svgIcon = favBtn.querySelector('svg');
				if (svgIcon) svgIcon.setAttribute('fill', isFavNow ? 'currentColor' : 'none');
			});
		}

		// 100% Bulletproof 3-Dots Button Handler
		const moreBtn = customWrap.querySelector('#person-btn-more');
		if (moreBtn) {
			moreBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await showMovieContextMenu(moreBtn, item, e);
			});
		}

		// Movie card clicks
		customWrap.querySelectorAll('.person-movie-card').forEach(card => {
			card.addEventListener('click', () => {
				const movieId = card.getAttribute('data-movie-id');
				if (movieId) {
					window.location.hash = `#/details?id=${movieId}`;
				}
			});
		});
	}

	async function fetchCollectionItems(collectionId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItems === 'function') {
				const res = await api.getItems(userId, {
					ParentId: collectionId,
					SortBy: 'PremiereDate,ProductionYear,SortName',
					SortOrder: 'Ascending',
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,Genres,People,CommunityRating,CriticRating,OfficialRating,RunTimeTicks,ProductionYear,UserData,Taglines,Studios,ProviderIds,RemoteTrailers'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		try {
			const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
			const url = `${base}/Users/${userId}/Items?ParentId=${collectionId}&SortBy=PremiereDate,ProductionYear,SortName&SortOrder=Ascending&Fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,Genres,People,CommunityRating,CriticRating,OfficialRating,RunTimeTicks,ProductionYear,UserData,Taglines,Studios,ProviderIds,RemoteTrailers&api_key=${token}`;
			const res = await fetch(url, { headers });
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data.Items || []);
			}
		} catch (e) { }

		return [];
	}

	async function renderCollectionCustomLayout(page, item, itemId) {
		const { token, userId } = getAuth();
		const base = getBaseUrl();

		// Fetch all movies in this collection
		const movies = await fetchCollectionItems(itemId);
		const movieCount = movies.length || item.ChildCount || 0;

		// Extract Year Span
		const years = movies.map(m => m.ProductionYear || (m.PremiereDate ? new Date(m.PremiereDate).getFullYear() : null)).filter(Boolean);
		let yearSpan = item.ProductionYear ? String(item.ProductionYear) : '';
		if (years.length > 0) {
			const minYear = Math.min(...years);
			const maxYear = Math.max(...years);
			yearSpan = minYear === maxYear ? String(minYear) : `${minYear} - ${maxYear}`;
		}

		// Calculate Total Runtime
		const totalTicks = movies.reduce((sum, m) => sum + (m.RunTimeTicks || 0), 0);
		let runtimeStr = '';
		if (totalTicks > 0) {
			const totalMinutes = Math.floor(totalTicks / (10000 * 1000 * 60));
			const hours = Math.floor(totalMinutes / 60);
			const mins = totalMinutes % 60;
			runtimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
		}

		// Calculate Average Rating
		let rating = 'N/A';
		if (typeof item.CommunityRating === 'number' && item.CommunityRating > 0) {
			rating = item.CommunityRating.toFixed(1);
		} else {
			const validRatings = movies.map(m => m.CommunityRating).filter(r => typeof r === 'number' && r > 0);
			if (validRatings.length) {
				const avg = validRatings.reduce((a, b) => a + b, 0) / validRatings.length;
				rating = avg.toFixed(1);
			}
		}

		// Official Rating (e.g. R, PG-13)
		const officialRating = item.OfficialRating || (movies.find(m => m.OfficialRating)?.OfficialRating) || '';

		// Genres
		const genreList = (item.Genres && item.Genres.length)
			? item.Genres
			: Array.from(new Set(movies.flatMap(m => m.Genres || [])));
		const genres = genreList.join(', ');

		// Overview & Tagline
		const overview = item.Overview || (movies.length ? `A complete collection featuring ${movies.length} films.` : 'No collection storyline available.');
		const tagline = item.Taglines?.[0] || '';

		// Studios
		const studioList = (item.Studios && item.Studios.length)
			? item.Studios.map(s => s.Name)
			: Array.from(new Set(movies.flatMap(m => (m.Studios || []).map(s => s.Name))));
		const studios = studioList.join(', ') || 'N/A';

		// Favorite & Played status
		let isFav = item.UserData?.IsFavorite || false;
		if (itemId && window.__abyssFavoriteCache && window.__abyssFavoriteCache[itemId] !== undefined) {
			isFav = window.__abyssFavoriteCache[itemId];
			if (item.UserData) item.UserData.IsFavorite = isFav;
		}

		const watchedCount = movies.filter(m => m.UserData?.Played).length;
		const isAllPlayed = movieCount > 0 && watchedCount === movieCount;

		// Images
		let posterUrl = getImageUrl(item, 'Primary', base, token);
		if (!posterUrl && movies.length) {
			posterUrl = getImageUrl(movies[0], 'Primary', base, token);
		}

		let logoUrl = getImageUrl(item, 'Logo', base, token);
		if (!logoUrl && movies.length) {
			logoUrl = getImageUrl(movies[0], 'Logo', base, token);
		}
		const hasLogoImage = Boolean(item.ImageTags?.Logo || item.HasLogo || item.ParentLogoImageTag || (movies[0] && (movies[0].ImageTags?.Logo || movies[0].HasLogo)));

		let backdropUrl = getImageUrl(item, 'Backdrop', base, token);
		if (!backdropUrl && item.BackdropImageTags && item.BackdropImageTags.length) {
			backdropUrl = `${base}/Items/${item.Id}/Images/Backdrop/0?quality=90&fillWidth=1400&tag=${item.BackdropImageTags[0]}&api_key=${token}`;
		}
		if (!backdropUrl && movies.length) {
			for (const m of movies) {
				const mBg = getImageUrl(m, 'Backdrop', base, token);
				if (mBg) {
					backdropUrl = mBg;
					break;
				}
			}
		}
		if (!backdropUrl) {
			backdropUrl = posterUrl;
		}

		// Aggregate photo gallery backdrops
		let galleryPhotoUrls = getBackdropUrls(item, base, token);
		if (galleryPhotoUrls.length < 4) {
			movies.forEach(m => {
				const mBackdrops = getBackdropUrls(m, base, token);
				mBackdrops.forEach(bUrl => {
					if (!galleryPhotoUrls.includes(bUrl)) galleryPhotoUrls.push(bUrl);
				});
			});
		}
		if (!galleryPhotoUrls.length && backdropUrl) {
			galleryPhotoUrls.push(backdropUrl);
		}

		// Aggregate Cast & Directors across collection
		const allPeople = movies.flatMap(m => m.People || []);
		const directorMap = {};
		const actorMap = {};

		allPeople.forEach(p => {
			if (p.Type === 'Director') {
				directorMap[p.Name] = p;
			} else if (p.Type === 'Actor') {
				if (!actorMap[p.Name]) {
					actorMap[p.Name] = { person: p, count: 1 };
				} else {
					actorMap[p.Name].count++;
				}
			}
		});

		const distinctDirectors = Object.values(directorMap);
		let directorsHtml = 'N/A';
		if (distinctDirectors.length) {
			directorsHtml = distinctDirectors.map(p => {
				const href = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				return `<a href="${href}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(p.Name)}</a>`;
			}).join(', ');
		}

		const sortedActors = Object.values(actorMap)
			.sort((a, b) => b.count - a.count)
			.map(a => a.person);
		const primaryCast = sortedActors.slice(0, 4);
		const extraCast = sortedActors.slice(4, 16);

		// Wrapper element
		const customWrap = document.createElement('div');
		customWrap.className = 'movie-custom-wrapper collection-custom-wrapper';

		// Hero Section HTML
		let heroHtml = `
			<section class="hero-section collection-hero-section">
				<div style="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;z-index:0;">
					<img src="${backdropUrl}" style="width:100%;height:100%;object-fit:cover;" alt="" />
					<div class="hero-overlay"></div>
				</div>
				<div style="position:relative;z-index:10;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:80px;">
					<button class="hero-play-btn" id="collection-exact-hero-play" title="Play Collection">
						<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
					</button>
					<div class="collection-hero-badge">
						<span>COLLECTION • ${movieCount} ${movieCount === 1 ? 'FILM' : 'FILMS'}${yearSpan ? ` • ${yearSpan}` : ''}</span>
					</div>
				</div>
			</section>
		`;

		// Primary Cast HTML
		let castItemsHtml = '';
		if (primaryCast.length) {
			primaryCast.forEach(p => {
				const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const roleName = p.Role || p.Character || p.RoleName || 'Cast';
				castItemsHtml += `
					<a href="${personHref}" class="cast-item">
						<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
						<div class="cast-info-col">
							<span class="cast-name-text">${escapeHtml(p.Name)}</span>
							<span class="cast-role-text">${escapeHtml(roleName)}</span>
						</div>
					</a>
				`;
			});
		} else {
			castItemsHtml = `<div class="cast-item"><span class="cast-name-text">N/A</span></div>`;
		}

		// Extra Cast HTML
		let extraCastHtml = '';
		if (extraCast.length) {
			extraCast.forEach(p => {
				const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const roleName = p.Role || p.Character || p.RoleName || '';
				extraCastHtml += `
					<a href="${personHref}" class="cast-item cast-item-horizontal">
						<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
						<div class="cast-info-col">
							<span class="cast-name-text">${escapeHtml(p.Name)}</span>
							${roleName ? `<span class="cast-role-text">${escapeHtml(roleName)}</span>` : ''}
						</div>
					</a>
				`;
			});
		}

		let seeMoreCastHtml = '';
		if (extraCast.length) {
			seeMoreCastHtml = `
				<div class="cast-extra-wrapper" id="collection-cast-extra-container" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease;margin-top:0;">
					<div class="cast-extra-horizontal-grid">
						${extraCastHtml}
					</div>
				</div>
				<button class="see-more-cast-btn" id="collection-cast-see-more-btn" type="button">
					<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="see-more-icon" style="transition:transform 0.3s ease;">
						<path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
					</svg>
					<span class="see-more-text">See more</span>
				</button>
			`;
		}

		// Pure Photo Gallery HTML
		const featuredPhoto = galleryPhotoUrls[0] || backdropUrl;
		const thumb1 = galleryPhotoUrls[1];
		const thumb2 = galleryPhotoUrls[2];
		const remainingCount = galleryPhotoUrls.length - 3;
		const hasMore = galleryPhotoUrls.length > 3;

		let thumbsRowHtml = '';
		if (thumb1) {
			thumbsRowHtml += `<div class="thumb-box" id="collection-gallery-photo-1" title="View Photo"><img src="${thumb1}" alt="" /></div>`;
		}
		if (thumb2) {
			thumbsRowHtml += `<div class="thumb-box" id="collection-gallery-photo-2" title="View Photo"><img src="${thumb2}" alt="" /></div>`;
		}
		if (hasMore && remainingCount > 0) {
			thumbsRowHtml += `<div class="thumb-box-more" id="collection-gallery-photo-more" title="View All Photos">+${remainingCount}</div>`;
		}

		let galleryHtml = `
			<section class="right-col">
				<h3 class="section-heading">Gallery</h3>
				<div class="gallery-featured-photo" id="collection-gallery-photo-main" title="View Photo">
					<img src="${featuredPhoto}" alt="Collection Photo" />
				</div>
				${thumbsRowHtml ? `<div class="gallery-thumbs-row">${thumbsRowHtml}</div>` : ''}
			</section>
		`;

		// Movies in Collection Grid HTML
		let moviesListHtml = '';
		if (movies.length) {
			movies.forEach(m => {
				const mPoster = getImageUrl(m, 'Primary', base, token);
				const mYear = m.ProductionYear || (m.PremiereDate ? new Date(m.PremiereDate).getFullYear() : '');
				const mRating = (typeof m.CommunityRating === 'number' && m.CommunityRating > 0)
					? m.CommunityRating.toFixed(1)
					: 'N/A';
				const mRunTimeTicks = m.RunTimeTicks;
				let mRuntime = '';
				if (mRunTimeTicks) {
					mRuntime = `${Math.floor(mRunTimeTicks / (10000 * 1000 * 60))} min`;
				}
				const isMPlayed = m.UserData?.Played || false;
				const playPercent = (m.UserData?.PlaybackPositionTicks && mRunTimeTicks)
					? Math.min(100, Math.round((m.UserData.PlaybackPositionTicks / mRunTimeTicks) * 100))
					: 0;

				moviesListHtml += `
					<div class="collection-movie-card group" data-movie-id="${m.Id}">
						<div class="collection-card-img-wrap">
							<img src="${mPoster}" alt="${escapeHtml(m.Name)}" class="collection-card-img" loading="lazy" onError="this.style.backgroundColor='#1a1a1a'" />
							<div class="collection-card-overlay">
								<button class="collection-card-play-btn" data-play-movie-id="${m.Id}" type="button" title="Play ${escapeHtml(m.Name)}">
									<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
								</button>
								<span class="collection-card-play-text">Play Movie</span>
							</div>
							${isMPlayed ? `
								<div class="collection-card-played-badge" title="Played">
									<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"></path></svg>
								</div>
							` : ''}
							${playPercent > 0 && !isMPlayed ? `
								<div class="collection-card-progress-bar">
									<div class="collection-card-progress-fill" style="width: ${playPercent}%;"></div>
								</div>
							` : ''}
						</div>
						<div class="collection-card-info">
							<h4 class="collection-card-title" title="${escapeHtml(m.Name)}">${escapeHtml(m.Name)}</h4>
							<div class="collection-card-meta">
								<span>${mYear}</span>
								${mRuntime ? `<span>• ${mRuntime}</span>` : ''}
								${mRating !== 'N/A' ? `<span style="color:#eab308;">★ ${mRating}</span>` : ''}
							</div>
						</div>
					</div>
				`;
			});
		} else {
			moviesListHtml = `<p style="color:#9ca3af;font-size:14px;grid-column:span 4;">No movies found in this collection.</p>`;
		}

		// Main Grid HTML
		let mainGridHtml = `
			<main class="main-content-grid">
				<!-- Left Column: Poster & Native Actions -->
				<aside class="left-col">
					<div class="poster-wrap poster-shadow">
						<img src="${posterUrl}" alt="${escapeHtml(item.Name)}" />
					</div>
					<div class="left-btn-container" style="display:flex;flex-direction:column;gap:8px;">
						<button class="left-btn collection-primary-btn" id="collection-btn-play" type="button" title="Play Collection">
							<svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							<span class="btn-text">Play Collection</span>
						</button>
						<button class="left-btn" id="collection-btn-shuffle" type="button" title="Shuffle Collection">
							<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">Shuffle All</span>
						</button>
						<button class="left-btn" id="collection-btn-trailer" type="button" title="Watch Trailer">
							<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">Watch Trailer</span>
						</button>
						<button class="left-btn ${isFav ? 'is-fav' : ''}" id="collection-btn-fav" data-is-fav="${isFav}" type="button" title="${isFav ? 'Favorited' : 'Add to Favorites'}" style="${isFav ? 'color:#ef4444;' : ''}">
							<svg width="14" height="14" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">${isFav ? 'Favorited' : 'Add to Favorites'}</span>
						</button>
						<button class="left-btn ${isAllPlayed ? 'is-played' : ''}" id="collection-btn-played" data-is-played="${isAllPlayed}" type="button" title="${isAllPlayed ? 'Played' : 'Mark as Played'}" style="${isAllPlayed ? 'color:#22c55e;' : ''}">
							<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path></svg>
							<span class="btn-text">${isAllPlayed ? 'Played' : 'Mark as Played'}</span>
						</button>
						<button class="left-btn itemAction" id="collection-btn-more" type="button" data-action="menu" data-id="${itemId}" data-type="BoxSet" data-serverid="${item.ServerId || ''}" title="More Options">
							<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
							<span class="btn-text">More Options</span>
						</button>
					</div>
				</aside>

				<!-- Center Column: Info & Storyline -->
				<section class="center-col">
					<div class="title-row">
						<div class="movie-logo-title-wrap">
							${hasLogoImage ? `<img src="${logoUrl}" alt="${escapeHtml(item.Name)}" class="movie-logo-img" onError="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';" />` : ''}
							<h2 class="movie-title-text" style="${hasLogoImage ? 'display:none;' : ''}">${escapeHtml(item.Name)}</h2>
						</div>
						${officialRating ? `<span class="rating-badge">${escapeHtml(officialRating)}</span>` : ''}
					</div>
					${tagline ? `<p class="tagline-text">"${escapeHtml(tagline)}"</p>` : ''}

					<div class="meta-row">
						<div class="meta-item" style="color:#ffffff;background:rgba(229,9,20,0.2);border:1px solid rgba(229,9,20,0.5);padding:2px 8px;border-radius:4px;font-weight:600;">
							<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							${movieCount} ${movieCount === 1 ? 'Movie' : 'Movies'}
						</div>
						${runtimeStr ? `
							<div class="meta-item">
								<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
								${runtimeStr}
							</div>
						` : ''}
						${rating !== 'N/A' ? `
							<div class="meta-item" style="color:#eab308;">
								<svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
								IMDb <span class="movie-imdb-score-val">${rating}</span>
							</div>
						` : ''}
						${yearSpan ? `<span>${yearSpan}</span>` : ''}
						${genres ? `<span class="genre-pill">${genres}</span>` : ''}
					</div>

					<div class="details-cast-grid">
						<div>
							<h3 class="section-heading">Collection Details</h3>
							<div style="display:flex;flex-direction:column;gap:12px;">
								<div class="detail-list-row"><span class="detail-list-label">Total Films:</span><span class="detail-list-val">${movieCount}</span></div>
								<div class="detail-list-row"><span class="detail-list-label">Directors:</span><span class="detail-list-val">${directorsHtml}</span></div>
								<div class="detail-list-row"><span class="detail-list-label">Studios:</span><span class="detail-list-val">${escapeHtml(studios)}</span></div>
								<div class="detail-list-row"><span class="detail-list-label">Release Span:</span><span class="detail-list-val">${yearSpan || 'N/A'}</span></div>
								${movieCount > 0 ? `<div class="detail-list-row"><span class="detail-list-label">Watched:</span><span class="detail-list-val" style="color:${watchedCount === movieCount ? '#22c55e' : '#ffffff'};">${watchedCount} of ${movieCount} completed</span></div>` : ''}
							</div>
						</div>

						<div>
							<h3 class="section-heading">Featured Cast</h3>
							<div style="display:flex;flex-direction:column;gap:12px;">
								${castItemsHtml}
							</div>
							${seeMoreCastHtml}
						</div>
					</div>

					<div>
						<h3 class="section-heading">Storyline</h3>
						<p class="storyline-para">${escapeHtml(overview)}</p>
					</div>
				</section>

				<!-- Right Column: Pure Photo Gallery -->
				${galleryHtml}
			</main>
		`;

		// Collection Movies Section HTML
		let moviesSectionHtml = `
			<section class="collection-movies-section">
				<div class="collection-movies-header">
					<div class="collection-movies-title-flex">
						<h2>Movies in Collection</h2>
						<div class="collection-red-bar"></div>
					</div>
					<div class="collection-movies-counter-badge">
						${movieCount} ${movieCount === 1 ? 'Movie' : 'Movies'} • ${watchedCount}/${movieCount} Watched
					</div>
				</div>
				<div class="collection-movies-grid" id="collection-movies-grid">
					${moviesListHtml}
				</div>
			</section>
		`;

		customWrap.innerHTML = heroHtml + mainGridHtml + moviesSectionHtml;

		// Prepend custom wrapper at top of item page
		page.insertBefore(customWrap, page.firstChild);

		// Event Bindings
		const triggerCollectionPlay = async (shuffle = false) => {
			const pm = window.PlaybackManager || window.parent?.PlaybackManager || window.top?.PlaybackManager || window.Emby?.PlaybackManager;
			const movieIds = movies.map(m => m.Id);

			let startIdx = 0;
			if (!shuffle && movies.length) {
				const firstUnplayed = movies.findIndex(m => !m.UserData?.Played);
				if (firstUnplayed !== -1) startIdx = firstUnplayed;
			}

			if (pm && typeof pm.play === 'function') {
				try {
					if (shuffle) {
						await pm.play({
							items: movies,
							ids: movieIds,
							shuffle: true
						});
					} else {
						const orderedItems = [...movies.slice(startIdx), ...movies.slice(0, startIdx)];
						const orderedIds = [...movieIds.slice(startIdx), ...movieIds.slice(0, startIdx)];
						await pm.play({
							items: orderedItems,
							ids: orderedIds,
							startPositionTicks: orderedItems[0]?.UserData?.PlaybackPositionTicks || 0
						});
					}
					return;
				} catch (e) {
					console.warn('[Collection Details] pm.play error:', e);
				}
			}

			const nativeBtn = shuffle
				? page.querySelector('.mainDetailButtons .btnShuffle, button[data-action="shuffle"]')
				: page.querySelector('.mainDetailButtons .btnPlay, .btnPlayMedia, .btnPlay, button[data-action="play"]');

			if (nativeBtn) {
				try {
					nativeBtn.click();
					return;
				} catch (e) { }
			}

			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.play === 'function') {
				try {
					api.play({ ids: movieIds.length ? movieIds : [itemId], shuffle });
					return;
				} catch (e) { }
			}
		};

		// Hero Play Button
		const heroPlayBtn = customWrap.querySelector('#collection-exact-hero-play');
		if (heroPlayBtn) heroPlayBtn.addEventListener('click', () => triggerCollectionPlay(false));

		// Left Play Button
		const leftPlayBtn = customWrap.querySelector('#collection-btn-play');
		if (leftPlayBtn) leftPlayBtn.addEventListener('click', () => triggerCollectionPlay(false));

		// Left Shuffle Button
		const leftShuffleBtn = customWrap.querySelector('#collection-btn-shuffle');
		if (leftShuffleBtn) leftShuffleBtn.addEventListener('click', () => triggerCollectionPlay(true));

		// Trailer Button
		const trailerBtn = customWrap.querySelector('#collection-btn-trailer');
		if (trailerBtn) {
			trailerBtn.addEventListener('click', () => {
				const firstMovieWithTrailer = movies.find(m => m.RemoteTrailers && m.RemoteTrailers.length > 0);
				if (firstMovieWithTrailer) {
					playTrailer(firstMovieWithTrailer.Id, firstMovieWithTrailer, page);
				} else {
					playTrailer(itemId, item, page);
				}
			});
		}

		// Favorite Button
		const favBtn = customWrap.querySelector('#collection-btn-fav');
		if (favBtn) {
			favBtn.addEventListener('click', async () => {
				await toggleFavorite(itemId, item, favBtn, page);
				const isFavNow = item.UserData?.IsFavorite;
				favBtn.classList.toggle('is-fav', !!isFavNow);
				favBtn.setAttribute('data-is-fav', isFavNow ? 'true' : 'false');
				favBtn.style.color = isFavNow ? '#ef4444' : '#ffffff';
				const svgIcon = favBtn.querySelector('svg');
				if (svgIcon) {
					svgIcon.setAttribute('fill', isFavNow ? '#ef4444' : 'none');
					svgIcon.setAttribute('stroke', isFavNow ? '#ef4444' : 'currentColor');
				}
				const textSpan = favBtn.querySelector('.btn-text');
				if (textSpan) textSpan.innerText = isFavNow ? 'Favorited' : 'Add to Favorites';
			});
		}

		// Played Button
		const playedBtn = customWrap.querySelector('#collection-btn-played');
		if (playedBtn) {
			playedBtn.addEventListener('click', async () => {
				await togglePlayed(itemId, item, playedBtn, page);
				const newPlayed = item.UserData?.Played;
				movies.forEach(m => {
					if (m.UserData) m.UserData.Played = newPlayed;
				});
				playedBtn.classList.toggle('is-played', !!newPlayed);
				playedBtn.setAttribute('data-is-played', newPlayed ? 'true' : 'false');
				playedBtn.style.color = newPlayed ? '#22c55e' : '#ffffff';
				const textSpan = playedBtn.querySelector('.btn-text');
				if (textSpan) textSpan.innerText = newPlayed ? 'Played' : 'Mark as Played';
			});
		}

		// 3-Dots More Menu
		const moreBtn = customWrap.querySelector('#collection-btn-more');
		if (moreBtn) {
			moreBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await showMovieContextMenu(moreBtn, item, e);
			});
		}

		// See More Cast Toggle
		const seeMoreCastBtn = customWrap.querySelector('#collection-cast-see-more-btn');
		const extraCastBox = customWrap.querySelector('#collection-cast-extra-container');
		if (seeMoreCastBtn && extraCastBox) {
			let isCastExpanded = false;
			seeMoreCastBtn.addEventListener('click', () => {
				isCastExpanded = !isCastExpanded;
				const textSpan = seeMoreCastBtn.querySelector('.see-more-text');
				const iconSvg = seeMoreCastBtn.querySelector('.see-more-icon');
				if (isCastExpanded) {
					extraCastBox.style.maxHeight = `${extraCastBox.scrollHeight + 30}px`;
					extraCastBox.style.opacity = '1';
					extraCastBox.style.marginTop = '8px';
					if (textSpan) textSpan.innerText = 'See less';
					if (iconSvg) iconSvg.style.transform = 'rotate(180deg)';
				} else {
					extraCastBox.style.maxHeight = '0';
					extraCastBox.style.opacity = '0';
					extraCastBox.style.marginTop = '0';
					if (textSpan) textSpan.innerText = 'See more';
					if (iconSvg) iconSvg.style.transform = 'rotate(0deg)';
				}
			});
		}

		// Gallery Lightbox Handlers
		const photoMain = customWrap.querySelector('#collection-gallery-photo-main');
		const photo1 = customWrap.querySelector('#collection-gallery-photo-1');
		const photo2 = customWrap.querySelector('#collection-gallery-photo-2');
		const photoMore = customWrap.querySelector('#collection-gallery-photo-more');

		if (photoMain) photoMain.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));
		if (photo1) photo1.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 1 % galleryPhotoUrls.length));
		if (photo2) photo2.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 2 % galleryPhotoUrls.length));
		if (photoMore) photoMore.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));

		// Movie card clicks
		customWrap.querySelectorAll('.collection-movie-card').forEach(card => {
			const mId = card.getAttribute('data-movie-id');
			card.addEventListener('click', (e) => {
				if (e.target.closest('.collection-card-play-btn')) return;
				if (mId) window.location.hash = `#/details?id=${mId}`;
			});

			const cardPlayBtn = card.querySelector('.collection-card-play-btn');
			if (cardPlayBtn) {
				cardPlayBtn.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const targetMovie = movies.find(m => m.Id === mId) || { Id: mId };
					await playMediaItem(targetMovie);
				});
			}
		});
	}

	async function fetchSeriesSeasons(seriesId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getSeasons === 'function') {
				const res = await api.getSeasons(seriesId, {
					userId: userId,
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,UserData,Taglines,AirDays,PremiereDate,ProductionYear'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
			if (api && typeof api.getItems === 'function') {
				const res = await api.getItems(userId, {
					ParentId: seriesId,
					IncludeItemTypes: 'Season',
					SortBy: 'SortName,IndexNumber',
					SortOrder: 'Ascending',
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,UserData,Taglines,AirDays,PremiereDate,ProductionYear'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		try {
			const res = await fetch(`${base}/Shows/${seriesId}/Seasons?userId=${userId}&Fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,UserData,Taglines,AirDays,PremiereDate,ProductionYear&api_key=${token}`);
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data?.Items || []);
			}
		} catch (e) { }

		return [];
	}

	async function fetchSeriesNextUp(seriesId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return null;
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getNextUpEpisodes === 'function') {
				const res = await api.getNextUpEpisodes({
					SeriesId: seriesId,
					UserId: userId,
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,UserData,Taglines,RunTimeTicks,MediaSources'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items[0];
			}
		} catch (e) { }

		try {
			const res = await fetch(`${base}/Shows/NextUp?SeriesId=${seriesId}&UserId=${userId}&Fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,UserData,Taglines,RunTimeTicks,MediaSources&api_key=${token}`);
			if (res.ok) {
				const data = await res.json();
				const items = Array.isArray(data) ? data : (data?.Items || []);
				if (items.length) return items[0];
			}
		} catch (e) { }

		return null;
	}

	async function fetchSeriesEpisodes(seriesId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItems === 'function') {
				const res = await api.getItems(userId, {
					ParentId: seriesId,
					IncludeItemTypes: 'Episode',
					Recursive: true,
					Fields: 'UserData,ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,Taglines,RunTimeTicks,IndexNumber,ParentIndexNumber,SeasonId'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		try {
			const res = await fetch(`${base}/Users/${userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Episode&Recursive=true&Fields=UserData,ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,Overview,Taglines,RunTimeTicks,IndexNumber,ParentIndexNumber,SeasonId&api_key=${token}`);
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data?.Items || []);
			}
		} catch (e) { }

		return [];
	}

	async function fetchSeasonEpisodes(seasonId, seriesId) {
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getEpisodes === 'function' && seriesId) {
				const res = await api.getEpisodes(seriesId, {
					seasonId: seasonId,
					userId: userId,
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Overview,PrimaryImageTag,UserData,RunTimeTicks,IndexNumber,ParentIndexNumber,CommunityRating,CriticRating,PremiereDate,People'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
			if (api && typeof api.getItems === 'function') {
				const res = await api.getItems(userId, {
					ParentId: seasonId,
					IncludeItemTypes: 'Episode',
					SortBy: 'IndexNumber,SortName',
					SortOrder: 'Ascending',
					Fields: 'ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Overview,PrimaryImageTag,UserData,RunTimeTicks,IndexNumber,ParentIndexNumber,CommunityRating,CriticRating,PremiereDate,People'
				});
				const items = Array.isArray(res) ? res : (res?.Items || []);
				if (items.length) return items;
			}
		} catch (e) { }

		if (seriesId) {
			try {
				const res = await fetch(`${base}/Shows/${seriesId}/Episodes?seasonId=${seasonId}&userId=${userId}&Fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Overview,PrimaryImageTag,UserData,RunTimeTicks,IndexNumber,ParentIndexNumber,CommunityRating,CriticRating,PremiereDate,People&api_key=${token}`);
				if (res.ok) {
					const data = await res.json();
					return Array.isArray(data) ? data : (data?.Items || []);
				}
			} catch (e) { }
		}

		try {
			const res = await fetch(`${base}/Users/${userId}/Items?ParentId=${seasonId}&IncludeItemTypes=Episode&SortBy=IndexNumber,SortName&SortOrder=Ascending&Fields=ItemCounts,PrimaryImageAspectRatio,BasicSyncInfo,CanDelete,MediaSourceCount,Overview,PrimaryImageTag,UserData,RunTimeTicks,IndexNumber,ParentIndexNumber,CommunityRating,CriticRating,PremiereDate,People&api_key=${token}`);
			if (res.ok) {
				const data = await res.json();
				return Array.isArray(data) ? data : (data?.Items || []);
			}
		} catch (e) { }

		return [];
	}

	async function renderSeriesCustomLayout(page, item, itemId) {
		const { token, userId } = getAuth();
		const base = getBaseUrl();

		const [seasons, nextUp, allEpisodes] = await Promise.all([
			fetchSeriesSeasons(itemId),
			fetchSeriesNextUp(itemId),
			fetchSeriesEpisodes(itemId)
		]);

		const seasonsCount = seasons.length || (item.ChildCount || 1);

		// Calculate Total & Watched Episodes with 100% precision
		let totalEpisodes = 0;
		let watchedEpisodes = 0;

		if (allEpisodes && allEpisodes.length > 0) {
			totalEpisodes = allEpisodes.length;
			watchedEpisodes = allEpisodes.filter(ep => ep.UserData?.Played).length;
		} else {
			seasons.forEach(s => {
				const sCount = s.ChildCount || s.RecursiveItemCount || (s.ItemCounts?.EpisodeCount) || 0;
				totalEpisodes += sCount;
				if (s.UserData?.PlayedPercentage === 100 || s.UserData?.Played) {
					watchedEpisodes += sCount;
				} else if (s.UserData?.UnplayedItemCount !== undefined && sCount > 0) {
					watchedEpisodes += Math.max(0, sCount - s.UserData.UnplayedItemCount);
				}
			});
			if (!totalEpisodes && (item.RecursiveItemCount || item.ItemCounts?.EpisodeCount)) {
				totalEpisodes = item.RecursiveItemCount || item.ItemCounts?.EpisodeCount;
			}
		}

		// Calculate Year Span & Status with 100% precision
		const startYear = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : '');
		const rawStatus = (item.Status || item.SeriesStatus || '').trim();
		const hasEndDate = Boolean(item.EndDate);
		const isEndedByStatus = rawStatus.toLowerCase() === 'ended' || rawStatus.toLowerCase() === 'canceled' || rawStatus.toLowerCase() === 'cancelled';
		const isContinuingByStatus = rawStatus.toLowerCase() === 'continuing' || rawStatus.toLowerCase() === 'returning series' || rawStatus.toLowerCase() === 'in production';

		let status = 'Continuing';
		if (isEndedByStatus || (hasEndDate && !isContinuingByStatus)) {
			status = isEndedByStatus ? (rawStatus.toUpperCase() === 'CANCELED' ? 'Canceled' : 'Ended') : 'Ended';
		} else if (isContinuingByStatus) {
			status = 'Continuing';
		} else if (rawStatus) {
			status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
		} else {
			status = 'Continuing';
		}

		const isContinuing = status.toLowerCase() === 'continuing' || status.toLowerCase() === 'returning series';

		const endYear = item.EndDate ? new Date(item.EndDate).getFullYear() : (!isContinuing ? (startYear || '') : '');
		let yearSpan = '';
		if (startYear) {
			if (isContinuing) {
				yearSpan = `${startYear} - Present`;
			} else if (endYear && endYear !== startYear) {
				yearSpan = `${startYear} - ${endYear}`;
			} else {
				yearSpan = String(startYear);
			}
		}

		// Rating, Overview, Genres, Studios
		const rating = typeof item.CommunityRating === 'number' && item.CommunityRating > 0 ? item.CommunityRating.toFixed(1) : 'N/A';
		const officialRating = item.OfficialRating || '';
		const genres = (item.Genres || []).join(', ');
		const overview = item.Overview || 'No series storyline available.';
		const tagline = item.Taglines?.[0] || '';
		const studios = (item.Studios || []).map(s => s.Name).join(', ') || 'N/A';

		// Air Info
		const airDays = (item.AirDays || []).join(', ');
		const airTime = item.AirTime || '';
		let airInfo = '';
		if (airDays && airTime) airInfo = `${airDays} at ${airTime}`;
		else if (airDays) airInfo = airDays;

		// Favorite & Played status
		let isFav = item.UserData?.IsFavorite || false;
		if (itemId && window.__abyssFavoriteCache && window.__abyssFavoriteCache[itemId] !== undefined) {
			isFav = window.__abyssFavoriteCache[itemId];
			if (item.UserData) item.UserData.IsFavorite = isFav;
		}

		const isPlayed = item.UserData?.Played || (totalEpisodes > 0 && watchedEpisodes >= totalEpisodes);

		// Images
		let posterUrl = getImageUrl(item, 'Primary', base, token);
		if (!posterUrl && seasons.length) posterUrl = getImageUrl(seasons[0], 'Primary', base, token);

		let logoUrl = getImageUrl(item, 'Logo', base, token);
		const hasLogoImage = Boolean(item.ImageTags?.Logo || item.HasLogo || item.ParentLogoImageTag);

		let backdropUrl = getImageUrl(item, 'Backdrop', base, token);
		if (!backdropUrl && item.BackdropImageTags && item.BackdropImageTags.length) {
			backdropUrl = `${base}/Items/${item.Id}/Images/Backdrop/0?quality=90&fillWidth=1400&tag=${item.BackdropImageTags[0]}&api_key=${token}`;
		}
		if (!backdropUrl && seasons.length) {
			for (const s of seasons) {
				const sBg = getImageUrl(s, 'Backdrop', base, token);
				if (sBg) { backdropUrl = sBg; break; }
			}
		}
		if (!backdropUrl) backdropUrl = posterUrl;

		// Photo Gallery Backdrops
		let galleryPhotoUrls = getBackdropUrls(item, base, token);
		if (galleryPhotoUrls.length < 4 && seasons.length) {
			seasons.forEach(s => {
				const sBackdrops = getBackdropUrls(s, base, token);
				sBackdrops.forEach(bUrl => {
					if (bUrl && !galleryPhotoUrls.includes(bUrl)) galleryPhotoUrls.push(bUrl);
				});
			});
		}
		if (!galleryPhotoUrls.length && backdropUrl) galleryPhotoUrls.push(backdropUrl);

		// Cast & Creators
		const allPeople = item.People || [];
		const writers = allPeople.filter(p => p.Type === 'Writer' || p.Type === 'Creator');
		const directors = allPeople.filter(p => p.Type === 'Director' || p.Type === 'Producer' || p.Type === 'ExecutiveProducer');
		const actors = allPeople.filter(p => p.Type === 'Actor');

		let creatorHtml = 'N/A';
		if (writers.length) {
			creatorHtml = writers.slice(0, 3).map(p => {
				const href = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				return `<a href="${href}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(p.Name)}</a>`;
			}).join(', ');
		} else if (directors.length) {
			creatorHtml = directors.slice(0, 3).map(p => {
				const href = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				return `<a href="${href}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(p.Name)}</a>`;
			}).join(', ');
		}

		const primaryCast = actors.slice(0, 4);
		const extraCast = actors.slice(4, 16);

		const themeVideoPromise = isThemeVideosEnabled() ? fetchThemeVideo(itemId) : Promise.resolve(null);

		// Wrapper element
		const customWrap = document.createElement('div');
		customWrap.className = 'movie-custom-wrapper series-custom-wrapper';

		// Hero Section Badge Text
		const epBadgeText = totalEpisodes > 0 ? ` • ${totalEpisodes} ${totalEpisodes === 1 ? 'EPISODE' : 'EPISODES'}` : '';
		const seasonBadgeText = `${seasonsCount} ${seasonsCount === 1 ? 'SEASON' : 'SEASONS'}`;
		const yearBadgeText = yearSpan ? ` • ${yearSpan}` : '';
		const statusBadgeText = status ? ` • ${status.toUpperCase()}` : '';

		// Hero Section HTML
		let heroHtml = `
			<section class="hero-section series-hero-section">
				<div class="hero-bg-container" style="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;z-index:0;overflow:hidden;">
					<img src="${backdropUrl}" class="hero-backdrop-img" style="width:100%;height:100%;object-fit:cover;" alt="" />
					<div class="hero-overlay"></div>
				</div>
				<button class="hero-play-btn" id="series-exact-hero-play" title="${nextUp ? `Play ${escapeHtml(nextUp.Name)}` : 'Play Series'}">
					<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
				</button>
			</section>
		`;

		// Primary Cast HTML
		let castItemsHtml = '';
		if (primaryCast.length) {
			primaryCast.forEach(p => {
				const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const roleName = p.Role || p.Character || p.RoleName || 'Cast';
				castItemsHtml += `
					<a href="${personHref}" class="cast-item">
						<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
						<div class="cast-info-col">
							<span class="cast-name-text">${escapeHtml(p.Name)}</span>
							<span class="cast-role-text">${escapeHtml(roleName)}</span>
						</div>
					</a>
				`;
			});
		} else {
			castItemsHtml = `<div class="cast-item"><span class="cast-name-text">N/A</span></div>`;
		}

		// Extra Cast HTML
		let extraCastHtml = '';
		if (extraCast.length) {
			extraCast.forEach(p => {
				const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const roleName = p.Role || p.Character || p.RoleName || '';
				extraCastHtml += `
					<a href="${personHref}" class="cast-item cast-item-horizontal">
						<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
						<div class="cast-info-col">
							<span class="cast-name-text">${escapeHtml(p.Name)}</span>
							${roleName ? `<span class="cast-role-text">${escapeHtml(roleName)}</span>` : ''}
						</div>
					</a>
				`;
			});
		}

		let seeMoreCastHtml = '';
		if (extraCast.length) {
			seeMoreCastHtml = `
				<div class="cast-extra-wrapper" id="series-cast-extra-container" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease;margin-top:0;">
					<div class="cast-extra-horizontal-grid">
						${extraCastHtml}
					</div>
				</div>
				<button class="see-more-cast-btn" id="series-cast-see-more-btn" type="button">
					<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="see-more-icon" style="transition:transform 0.3s ease;">
						<path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
					</svg>
					<span class="see-more-text">See more</span>
				</button>
			`;
		}

		// Photo Gallery HTML
		const featuredPhoto = galleryPhotoUrls[0] || backdropUrl;
		const thumb1 = galleryPhotoUrls[1];
		const thumb2 = galleryPhotoUrls[2];
		const remainingCount = galleryPhotoUrls.length - 3;
		const hasMore = galleryPhotoUrls.length > 3;

		let thumbsRowHtml = '';
		if (thumb1) {
			thumbsRowHtml += `<div class="thumb-box" id="series-gallery-photo-1" title="View Photo"><img src="${thumb1}" alt="" /></div>`;
		}
		if (thumb2) {
			thumbsRowHtml += `<div class="thumb-box" id="series-gallery-photo-2" title="View Photo"><img src="${thumb2}" alt="" /></div>`;
		}
		if (hasMore && remainingCount > 0) {
			thumbsRowHtml += `<div class="thumb-box-more" id="series-gallery-photo-more" title="View All Photos">+${remainingCount}</div>`;
		}

		// Next Up Episode HTML (if available) - Compact inside Right Column
		let nextUpHtml = '';
		if (nextUp) {
			const epThumbnail = getImageUrl(nextUp, 'Primary', base, token) || backdropUrl;
			const sNum = nextUp.ParentIndexNumber || 1;
			const eNum = nextUp.IndexNumber || 1;
			const epName = nextUp.Name || `Episode ${eNum}`;
			const epTicks = nextUp.RunTimeTicks;
			let epRuntime = '';
			if (epTicks) epRuntime = `${Math.floor(epTicks / (10000 * 1000 * 60))} min`;

			const epProgressPercent = (nextUp.UserData?.PlaybackPositionTicks && epTicks)
				? Math.min(100, Math.round((nextUp.UserData.PlaybackPositionTicks / epTicks) * 100))
				: 0;

			nextUpHtml = `
				<div class="series-right-nextup" id="series-nextup-card-btn" data-nextup-id="${nextUp.Id}" title="Play ${escapeHtml(epName)}">
					<div class="series-right-nextup-header">
						<span class="series-right-nextup-badge">NEXT UP</span>
						<span class="series-right-nextup-epnum">S${sNum}:E${eNum}</span>
						${epRuntime ? `<span class="series-right-nextup-runtime">${epRuntime}</span>` : ''}
					</div>
					<div class="series-right-nextup-body">
						<div class="series-right-nextup-thumb">
							<img src="${epThumbnail}" alt="${escapeHtml(epName)}" onError="this.style.backgroundColor='#1f2937'" />
							<div class="series-right-nextup-play">
								<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							</div>
							${epProgressPercent > 0 ? `
								<div class="collection-card-progress-bar">
									<div class="collection-card-progress-fill" style="width: ${epProgressPercent}%;"></div>
								</div>
							` : ''}
						</div>
						<div class="series-right-nextup-meta">
							<h4 class="series-right-nextup-title">${escapeHtml(epName)}</h4>
							${nextUp.Overview ? `<p class="series-right-nextup-desc">${escapeHtml(nextUp.Overview)}</p>` : ''}
						</div>
					</div>
				</div>
			`;
		}

		let galleryHtml = `
			<section class="right-col">
				<h3 class="section-heading">Gallery</h3>
				<div class="gallery-featured-photo" id="series-gallery-photo-main" title="View Photo">
					<img src="${featuredPhoto}" alt="Series Photo" />
				</div>
				${thumbsRowHtml ? `<div class="gallery-thumbs-row">${thumbsRowHtml}</div>` : ''}
				${nextUpHtml}
			</section>
		`;

		// Seasons Grid HTML
		let seasonsListHtml = '';
		if (seasons.length) {
			seasons.forEach(s => {
				const sPoster = getImageUrl(s, 'Primary', base, token) || posterUrl;
				let sEpCount = s.ChildCount || s.RecursiveItemCount || (s.ItemCounts?.EpisodeCount) || 0;
				let sWatchedCount = 0;

				if (allEpisodes && allEpisodes.length) {
					const seasonEps = allEpisodes.filter(ep => ep.SeasonId === s.Id || (ep.ParentIndexNumber !== undefined && s.IndexNumber !== undefined && ep.ParentIndexNumber === s.IndexNumber));
					if (seasonEps.length) {
						sEpCount = seasonEps.length;
						sWatchedCount = seasonEps.filter(ep => ep.UserData?.Played).length;
					}
				}

				const sYear = s.ProductionYear || (s.PremiereDate ? new Date(s.PremiereDate).getFullYear() : '');
				const isSPlayed = s.UserData?.Played || (s.UserData?.PlayedPercentage === 100) || (sEpCount > 0 && sWatchedCount >= sEpCount);
				const sProgressPercent = s.UserData?.PlayedPercentage || (sEpCount > 0 && sWatchedCount > 0 ? Math.round((sWatchedCount / sEpCount) * 100) : 0);

				seasonsListHtml += `
					<div class="series-season-card group" data-season-id="${s.Id}">
						<div class="series-card-img-wrap">
							<img src="${sPoster}" alt="${escapeHtml(s.Name)}" class="series-card-img" loading="lazy" onError="this.style.backgroundColor='#1a1a1a'" />
							<div class="series-card-overlay">
								<button class="series-card-play-btn" data-play-season-id="${s.Id}" type="button" title="Play ${escapeHtml(s.Name)}">
									<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
								</button>
								<span class="series-card-play-text">Play Season</span>
							</div>
							${isSPlayed ? `
								<div class="series-card-played-badge" title="Played">
									<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"></path></svg>
								</div>
							` : ''}
							${sProgressPercent > 0 && !isSPlayed ? `
								<div class="collection-card-progress-bar">
									<div class="collection-card-progress-fill" style="width: ${sProgressPercent}%;"></div>
								</div>
							` : ''}
						</div>
						<div class="series-card-info">
							<h4 class="series-card-title" title="${escapeHtml(s.Name)}">${escapeHtml(s.Name)}</h4>
							<div class="series-card-meta">
								${sEpCount ? `<span>${sEpCount} ${sEpCount === 1 ? 'Episode' : 'Episodes'}</span>` : ''}
								${sYear ? `<span>• ${sYear}</span>` : ''}
							</div>
						</div>
					</div>
				`;
			});
		} else {
			seasonsListHtml = `<p style="color:#9ca3af;font-size:14px;grid-column:span 4;">No seasons found for this series.</p>`;
		}

		// Main Grid HTML
		let mainGridHtml = `
			<main class="main-content-grid">
				<!-- Left Column: Poster & Action Controls -->
				<aside class="left-col">
					<div class="poster-wrap poster-shadow">
						<img src="${posterUrl}" alt="${escapeHtml(item.Name)}" />
					</div>
					<div class="left-btn-container" style="display:flex;flex-direction:column;gap:8px;">
						<button class="left-btn collection-primary-btn" id="series-btn-play" type="button" title="${nextUp ? 'Resume Next Episode' : 'Play Series'}">
							<svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							<span class="btn-text">${nextUp ? 'Resume Episode' : 'Play Series'}</span>
						</button>
						<button class="left-btn" id="series-btn-shuffle" type="button" title="Shuffle Series">
							<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">Shuffle All</span>
						</button>
						<button class="left-btn" id="series-btn-trailer" type="button" title="Watch Trailer">
							<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">Watch Trailer</span>
						</button>
						<button class="left-btn ${isFav ? 'is-fav' : ''}" id="series-btn-fav" data-is-fav="${isFav}" type="button" title="${isFav ? 'Favorited' : 'Add to Favorites'}" style="${isFav ? 'color:#ef4444;' : ''}">
							<svg width="14" height="14" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
							<span class="btn-text">${isFav ? 'Favorited' : 'Add to Favorites'}</span>
						</button>
						<button class="left-btn ${isPlayed ? 'is-played' : ''}" id="series-btn-played" data-is-played="${isPlayed}" type="button" title="${isPlayed ? 'Played' : 'Mark as Played'}" style="${isPlayed ? 'color:#22c55e;' : ''}">
							<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path></svg>
							<span class="btn-text">${isPlayed ? 'Played' : 'Mark as Played'}</span>
						</button>
						<button class="left-btn itemAction" id="series-btn-more" type="button" data-action="menu" data-id="${itemId}" data-type="Series" data-serverid="${item.ServerId || ''}" title="More Options">
							<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
							<span class="btn-text">More Options</span>
						</button>
					</div>
				</aside>

				<!-- Center Column: Info, Storyline & Cast -->
				<section class="center-col">
					<div class="title-row">
						<div class="movie-logo-title-wrap">
							${hasLogoImage ? `<img src="${logoUrl}" alt="${escapeHtml(item.Name)}" class="movie-logo-img" onError="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';" />` : ''}
							<h2 class="movie-title-text" style="${hasLogoImage ? 'display:none;' : ''}">${escapeHtml(item.Name)}</h2>
						</div>
						${officialRating ? `<span class="rating-badge">${escapeHtml(officialRating)}</span>` : ''}
						<span class="series-status-badge ${isContinuing ? 'status-continuing' : 'status-ended'}">${escapeHtml(status)}</span>
					</div>
					${tagline ? `<p class="tagline-text">"${escapeHtml(tagline)}"</p>` : ''}

					<div class="meta-row">
						${rating !== 'N/A' ? `
							<div class="meta-item" style="color:#ffffff;">
								<svg width="16" height="16" fill="#eab308" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>
								<span style="font-weight:600;color:#eab308;">${rating}</span>
								<span>IMDb</span>
							</div>
						` : ''}
						<div class="meta-item">
							<span>${seasonsCount} ${seasonsCount === 1 ? 'Season' : 'Seasons'}</span>
						</div>
						${totalEpisodes > 0 ? `
							<div class="meta-item">
								<span>${totalEpisodes} ${totalEpisodes === 1 ? 'Episode' : 'Episodes'}</span>
							</div>
						` : ''}
						${yearSpan ? `
							<div class="meta-item">
								<span>${yearSpan}</span>
							</div>
						` : ''}
						${genres ? `
							<div class="meta-item">
								<span class="genre-pill">${escapeHtml(genres)}</span>
							</div>
						` : ''}
					</div>

					<div class="details-cast-grid">
						<!-- Series Details -->
						<div>
							<h3 class="section-heading">Details</h3>
							<div class="detail-list-row">
								<span class="detail-list-label">Creators</span>
								<span class="detail-list-val">${creatorHtml}</span>
							</div>
							<div class="detail-list-row">
								<span class="detail-list-label">Network</span>
								<span class="detail-list-val">${escapeHtml(studios)}</span>
							</div>
							${airInfo ? `
								<div class="detail-list-row">
									<span class="detail-list-label">Airs</span>
									<span class="detail-list-val">${escapeHtml(airInfo)}</span>
								</div>
							` : ''}
							<div class="detail-list-row">
								<span class="detail-list-label">Status</span>
								<span class="detail-list-val">${escapeHtml(status)}</span>
							</div>
						</div>

						<!-- Featured Series Cast -->
						<div>
							<h3 class="section-heading">Cast & Crew</h3>
							<div id="series-cast-primary-container">
								${castItemsHtml}
							</div>
							${seeMoreCastHtml}
						</div>
					</div>

					<!-- Storyline -->
					<div>
						<h3 class="section-heading">Storyline</h3>
						<p class="storyline-para">${escapeHtml(overview)}</p>
					</div>
				</section>

				<!-- Right Column: Gallery -->
				${galleryHtml}
			</main>
		`;

		// Seasons Section HTML
		let seasonsSectionHtml = `
			<section class="series-seasons-section">
				<div class="collection-movies-header">
					<div class="collection-movies-title-flex">
						<div class="collection-red-bar"></div>
						<h2>Seasons</h2>
					</div>
					<div class="collection-movies-counter-badge">
						${seasonsCount} ${seasonsCount === 1 ? 'Season' : 'Seasons'}${totalEpisodes ? ` • ${watchedEpisodes}/${totalEpisodes} ${totalEpisodes === 1 ? 'Episode' : 'Episodes'} Watched` : ''}
					</div>
				</div>
				<div class="series-seasons-grid" id="series-seasons-grid">
					${seasonsListHtml}
				</div>
			</section>
		`;

		customWrap.innerHTML = heroHtml + mainGridHtml + seasonsSectionHtml;

		// Prepend custom wrapper at top of item page
		page.insertBefore(customWrap, page.firstChild);

		themeVideoPromise.then(themeVid => {
			if (themeVid && customWrap.isConnected && !isVideoOsdPageActive() && !document.querySelector('.abyss-trailer-player-overlay')) {
				initHeroThemeVideo(customWrap, themeVid, item);
			}
		});

		// Play Function
		const triggerSeriesPlay = async (shuffle = false) => {
			stopHeroThemeMedia(customWrap);
			if (shuffle) {
				await playMediaItem(itemId, { shuffle: true });
			} else if (nextUp) {
				await playMediaItem(nextUp, { startPositionTicks: nextUp.UserData?.PlaybackPositionTicks || 0 });
			} else {
				await playMediaItem(itemId);
			}
		};

		// Hero Play Button
		const heroPlayBtn = customWrap.querySelector('#series-exact-hero-play');
		if (heroPlayBtn) heroPlayBtn.addEventListener('click', () => triggerSeriesPlay(false));

		// Left Play Button
		const leftPlayBtn = customWrap.querySelector('#series-btn-play');
		if (leftPlayBtn) leftPlayBtn.addEventListener('click', () => triggerSeriesPlay(false));

		// Left Shuffle Button
		const leftShuffleBtn = customWrap.querySelector('#series-btn-shuffle');
		if (leftShuffleBtn) leftShuffleBtn.addEventListener('click', () => triggerSeriesPlay(true));

		// Trailer Button
		const trailerBtn = customWrap.querySelector('#series-btn-trailer');
		if (trailerBtn) {
			trailerBtn.addEventListener('click', () => {
				playTrailer(itemId, item, page);
			});
		}

		// Favorite Button
		const favBtn = customWrap.querySelector('#series-btn-fav');
		if (favBtn) {
			favBtn.addEventListener('click', async () => {
				await toggleFavorite(itemId, item, favBtn, page);
				const isFavNow = item.UserData?.IsFavorite;
				favBtn.classList.toggle('is-fav', !!isFavNow);
				favBtn.setAttribute('data-is-fav', isFavNow ? 'true' : 'false');
				favBtn.style.color = isFavNow ? '#ef4444' : '#ffffff';
				const svgIcon = favBtn.querySelector('svg');
				if (svgIcon) {
					svgIcon.setAttribute('fill', isFavNow ? '#ef4444' : 'none');
					svgIcon.setAttribute('stroke', isFavNow ? '#ef4444' : 'currentColor');
				}
				const textSpan = favBtn.querySelector('.btn-text');
				if (textSpan) textSpan.innerText = isFavNow ? 'Favorited' : 'Add to Favorites';
			});
		}

		// Played Button
		const playedBtn = customWrap.querySelector('#series-btn-played');
		if (playedBtn) {
			playedBtn.addEventListener('click', async () => {
				await togglePlayed(itemId, item, playedBtn, page);
				const newPlayed = item.UserData?.Played;
				seasons.forEach(s => {
					if (s.UserData) s.UserData.Played = newPlayed;
				});
				playedBtn.classList.toggle('is-played', !!newPlayed);
				playedBtn.setAttribute('data-is-played', newPlayed ? 'true' : 'false');
				playedBtn.style.color = newPlayed ? '#22c55e' : '#ffffff';
				const textSpan = playedBtn.querySelector('.btn-text');
				if (textSpan) textSpan.innerText = newPlayed ? 'Played' : 'Mark as Played';
			});
		}

		// 3-Dots More Menu
		const moreBtn = customWrap.querySelector('#series-btn-more');
		if (moreBtn) {
			moreBtn.addEventListener('click', (e) => {
				openItemContextMenu(item, moreBtn, e);
			});
		}

		// Next Up Card Interaction
		const nextUpCard = customWrap.querySelector('#series-nextup-card-btn');
		if (nextUpCard && nextUp) {
			nextUpCard.addEventListener('click', async (e) => {
				e.preventDefault();
				await playMediaItem(nextUp, { startPositionTicks: nextUp.UserData?.PlaybackPositionTicks || 0 });
			});
		}

		// See More Cast Toggle
		const seeMoreCastBtn = customWrap.querySelector('#series-cast-see-more-btn');
		const extraCastBox = customWrap.querySelector('#series-cast-extra-container');
		if (seeMoreCastBtn && extraCastBox) {
			let isCastExpanded = false;
			seeMoreCastBtn.addEventListener('click', () => {
				isCastExpanded = !isCastExpanded;
				const textSpan = seeMoreCastBtn.querySelector('.see-more-text');
				const iconSvg = seeMoreCastBtn.querySelector('.see-more-icon');
				if (isCastExpanded) {
					extraCastBox.style.maxHeight = `${extraCastBox.scrollHeight + 30}px`;
					extraCastBox.style.opacity = '1';
					extraCastBox.style.marginTop = '8px';
					if (textSpan) textSpan.innerText = 'See less';
					if (iconSvg) iconSvg.style.transform = 'rotate(180deg)';
				} else {
					extraCastBox.style.maxHeight = '0';
					extraCastBox.style.opacity = '0';
					extraCastBox.style.marginTop = '0';
					if (textSpan) textSpan.innerText = 'See more';
					if (iconSvg) iconSvg.style.transform = 'rotate(0deg)';
				}
			});
		}

		// Gallery Lightbox Handlers
		const photoMain = customWrap.querySelector('#series-gallery-photo-main');
		const photo1 = customWrap.querySelector('#series-gallery-photo-1');
		const photo2 = customWrap.querySelector('#series-gallery-photo-2');
		const photoMore = customWrap.querySelector('#series-gallery-photo-more');

		if (photoMain) photoMain.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));
		if (photo1) photo1.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 1 % galleryPhotoUrls.length));
		if (photo2) photo2.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 2 % galleryPhotoUrls.length));
		if (photoMore) photoMore.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));

		// Season Card Interactions
		customWrap.querySelectorAll('.series-season-card').forEach(card => {
			const sId = card.getAttribute('data-season-id');
			card.addEventListener('click', (e) => {
				if (e.target.closest('.series-card-play-btn')) return;
				if (sId) window.location.hash = `#/details?id=${sId}`;
			});

			const cardPlayBtn = card.querySelector('.series-card-play-btn');
			if (cardPlayBtn) {
				cardPlayBtn.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const targetSeason = seasons.find(s => s.Id === sId) || { Id: sId };
					await playMediaItem(targetSeason);
				});
			}
		});
	}

	async function renderSeasonCustomLayout(page, item, itemId) {
		const { token, userId } = getAuth();
		const base = getBaseUrl();
		const seriesId = item.SeriesId || item.ParentId || (item.SeriesPrimaryImageTag && item.SeriesId);

		// Fetch parent series, sister seasons, and season episodes concurrently
		const [seriesItem, sisterSeasons, episodes] = await Promise.all([
			seriesId ? fetchItemDetails(seriesId).catch(() => null) : Promise.resolve(null),
			seriesId ? fetchSeriesSeasons(seriesId).catch(() => []) : Promise.resolve([]),
			fetchSeasonEpisodes(itemId, seriesId).catch(() => [])
		]);

		const seasonName = item.Name || (`Season ${item.IndexNumber !== undefined ? item.IndexNumber : 1}`);
		const seriesName = seriesItem?.Name || item.SeriesName || 'TV Series';
		const posterUrl = getImageUrl(item, 'Primary', base, token) || (seriesItem ? getImageUrl(seriesItem, 'Primary', base, token) : '');
		const logoUrl = seriesItem ? getImageUrl(seriesItem, 'Logo', base, token) : null;
		const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : (seriesItem?.ProductionYear || ''));
		const rating = (typeof item.CommunityRating === 'number' && item.CommunityRating > 0)
			? item.CommunityRating.toFixed(1)
			: ((typeof seriesItem?.CommunityRating === 'number' && seriesItem.CommunityRating > 0)
				? seriesItem.CommunityRating.toFixed(1)
				: 'N/A');
		const genres = (seriesItem?.Genres || item.Genres || []).join(', ');
		const overview = item.Overview || seriesItem?.Overview || 'No season storyline available.';

		// Calculate Watched vs Total Episodes
		const totalEpisodes = episodes.length;
		const watchedEpisodes = episodes.filter(ep => ep.UserData?.Played).length;
		const percentWatched = totalEpisodes > 0 ? Math.round((watchedEpisodes / totalEpisodes) * 100) : 0;
		const firstUnplayedEpisode = episodes.find(ep => !ep.UserData?.Played) || episodes[0];

		let isFav = Boolean(item.UserData?.IsFavorite);
		let isPlayed = Boolean(item.UserData?.Played || (totalEpisodes > 0 && watchedEpisodes >= totalEpisodes));

		// Build Custom Wrapper
		const customWrap = document.createElement('div');
		customWrap.className = 'season-custom-wrapper';

		// 1. Season Switcher Navigation Pills HTML
		let seasonPillsHtml = '';
		if (sisterSeasons && sisterSeasons.length > 1) {
			sisterSeasons.forEach(s => {
				const sTitle = s.Name || (`Season ${s.IndexNumber !== undefined ? s.IndexNumber : 1}`);
				const isActive = (s.Id === itemId);
				seasonPillsHtml += `<a href="#/details?id=${s.Id}" class="season-pill-link ${isActive ? 'is-active-season' : ''}">${escapeHtml(sTitle)}</a>`;
			});
		}

		// 2. Header Section HTML
		let headerHtml = `
			<div class="season-header-container">
				<div class="season-left-col">
					<div class="season-poster-wrap">
						<img src="${posterUrl}" alt="${escapeHtml(seasonName)}" class="season-poster-img" onError="this.style.display='none'" />
					</div>
					${totalEpisodes > 0 ? `
						<div class="season-progress-box">
							<div class="season-progress-header">
								<span>PROGRESS</span>
								<span class="season-progress-count">${watchedEpisodes} / ${totalEpisodes} (${percentWatched}%)</span>
							</div>
							<div class="season-progress-track">
								<div class="season-progress-fill" style="width:${percentWatched}%;"></div>
							</div>
						</div>
					` : ''}
				</div>

				<div class="season-right-col">
					${logoUrl ? `
						<div class="season-logo-wrap">
							<img src="${logoUrl}" alt="${escapeHtml(seriesName)}" class="season-logo-img" onError="this.style.display='none'" />
						</div>
					` : `
						<h1 class="season-series-title-text">${escapeHtml(seriesName)}</h1>
					`}

					${seriesId ? `
						<a href="#/details?id=${seriesId}" class="season-series-breadcrumb" title="Back to Series">
							<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
							<span>${escapeHtml(seriesName)}</span>
						</a>
					` : ''}

					<div class="season-meta-row">
						<span class="season-badge-tag">${escapeHtml(seasonName)}</span>
						${year ? `<span>${year}</span>` : ''}
						${rating !== 'N/A' ? `<span class="season-rating-badge">★ ${rating}</span>` : ''}
						${genres ? `<span>• ${escapeHtml(genres)}</span>` : ''}
					</div>

					<p class="season-overview-text">${escapeHtml(overview)}</p>

					<div class="season-actions-toolbar">
						<button class="season-primary-play-btn" id="season-primary-play-btn" title="Play Season">
							<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							<span>${firstUnplayedEpisode ? (firstUnplayedEpisode.UserData?.PlaybackPositionTicks ? `Resume EP ${firstUnplayedEpisode.IndexNumber || 1}` : 'Play Season') : 'Play Season'}</span>
						</button>

						<button class="season-icon-action-btn" id="season-shuffle-btn" title="Shuffle Season">
							<svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"></path></svg>
						</button>

						<button class="season-icon-action-btn ${isPlayed ? 'is-active-played' : ''}" id="season-watched-btn" title="${isPlayed ? 'Mark Unwatched' : 'Mark Watched'}">
							<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>
						</button>

						<button class="season-icon-action-btn ${isFav ? 'is-active-fav' : ''}" id="season-fav-btn" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
							<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
						</button>

						<button class="season-icon-action-btn" id="season-more-btn" title="More Options">
							<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
						</button>
					</div>

					${seasonPillsHtml ? `
						<div class="season-switcher-container">
							<div class="season-switcher-label">SEASONS</div>
							<div class="season-switcher-pills-row">
								${seasonPillsHtml}
							</div>
						</div>
					` : ''}
				</div>
			</div>
		`;

		// 3. Episodes Showcase Section HTML
		let episodesListHtml = '';
		if (episodes && episodes.length > 0) {
			episodes.forEach((ep, idx) => {
				const epIdx = ep.IndexNumber !== undefined ? ep.IndexNumber : (idx + 1);
				const epPad = String(epIdx).padStart(2, '0');
				let epThumb = ep.ImageTags?.Primary ? `${base}/Items/${ep.Id}/Images/Primary?quality=85&fillWidth=440&tag=${ep.ImageTags.Primary}&api_key=${token}` : (posterUrl);
				const epDurationMin = ep.RunTimeTicks ? Math.floor(ep.RunTimeTicks / (10000 * 1000 * 60)) : 0;
				const epDurationStr = epDurationMin > 0 ? `${epDurationMin}m` : '';
				const epRatingStr = (typeof ep.CommunityRating === 'number' && ep.CommunityRating > 0) ? ep.CommunityRating.toFixed(1) : '';
				const epIsPlayed = Boolean(ep.UserData?.Played);
				const epIsFav = Boolean(ep.UserData?.IsFavorite);
				const epPosition = ep.UserData?.PlaybackPositionTicks || 0;
				const epTotalTicks = ep.RunTimeTicks || 0;
				const epProgressPercent = (epTotalTicks > 0 && epPosition > 0 && !epIsPlayed) ? Math.min(100, Math.round((epPosition / epTotalTicks) * 100)) : 0;
				const epOverview = ep.Overview || 'No episode description available.';

				let endsAtStr = '';
				if (epDurationMin > 0) {
					const endTime = new Date(Date.now() + epDurationMin * 60 * 1000);
					endsAtStr = `Ends at ${endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
				}

				episodesListHtml += `
					<div class="episode-card ${epIsPlayed ? 'is-played-card' : ''}" data-episode-id="${ep.Id}">
						<div class="episode-thumb-wrap" title="Play Episode ${epIdx}">
							<img class="episode-thumb-img" src="${epThumb}" alt="${escapeHtml(ep.Name || '')}" loading="lazy" onError="this.style.display='none'" />
							<div class="episode-number-badge">EP ${epPad}</div>
							${epDurationStr ? `<div class="episode-duration-badge">${epDurationStr}</div>` : ''}
							${epIsPlayed ? `
								<div class="episode-played-badge" title="Watched">
									<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>
								</div>
							` : ''}
							<div class="episode-play-overlay">
								<div class="episode-play-circle-btn">
									<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
								</div>
							</div>
							${epProgressPercent > 0 ? `
								<div class="episode-thumb-progress-bar">
									<div class="episode-thumb-progress-fill" style="width:${epProgressPercent}%;"></div>
								</div>
							` : ''}
						</div>

						<div class="episode-info-col">
							<div class="episode-title-row">
								<a href="#/details?id=${ep.Id}" class="episode-title-link" title="${escapeHtml(ep.Name || '')}">
									<h4 class="episode-title-text">${epIdx}. ${escapeHtml(ep.Name || ('Episode ' + epIdx))}</h4>
								</a>
								<div class="episode-sub-meta">
									${epRatingStr ? `<span class="episode-rating-val"><span style="color:#eab308;">★</span> ${epRatingStr}</span>` : ''}
									${endsAtStr ? `<span>• ${endsAtStr}</span>` : ''}
								</div>
							</div>
							<p class="episode-overview-para">${escapeHtml(epOverview)}</p>
						</div>

						<div class="episode-actions-col">
							<button class="episode-btn episode-quick-play-btn" title="Play Episode" data-action="play">
								<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							</button>
							<button class="episode-btn episode-watched-toggle-btn ${epIsPlayed ? 'is-active-played' : ''}" title="${epIsPlayed ? 'Mark Unwatched' : 'Mark Watched'}" data-action="watched">
								<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>
							</button>
							<button class="episode-btn episode-fav-toggle-btn ${epIsFav ? 'is-active-fav' : ''}" title="${epIsFav ? 'Remove Favorite' : 'Favorite'}" data-action="favorite">
								<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
							</button>
							<button class="episode-btn episode-more-toggle-btn" title="More Options" data-action="more">
								<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
							</button>
						</div>
					</div>
				`;
			});
		} else {
			episodesListHtml = `<div style="padding:40px;text-align:center;color:#94a3b8;background:rgba(255,255,255,0.02);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">No episodes available for this season.</div>`;
		}

		let episodesSectionHtml = `
			<section class="season-episodes-section">
				<div class="season-section-header">
					<div class="season-section-title-wrap">
						<div class="season-section-red-bar"></div>
						<h3 class="season-section-heading">Episodes</h3>
					</div>
					<div class="season-episodes-count-badge">${totalEpisodes} ${totalEpisodes === 1 ? 'EPISODE' : 'EPISODES'}</div>
				</div>
				<div class="season-episodes-list">
					${episodesListHtml}
				</div>
			</section>
		`;

		// 4. Cast & Crew Section HTML
		const people = (item.People && item.People.length) ? item.People : (seriesItem?.People || []);
		let castHtml = '';
		if (people.length) {
			let castCardsHtml = '';
			people.slice(0, 16).forEach(p => {
				const pImg = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=150&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const pHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const pRole = p.Role || p.Character || p.Type || 'Cast';
				castCardsHtml += `
					<a href="${pHref}" class="season-cast-card">
						<img class="season-cast-avatar" src="${pImg}" alt="${escapeHtml(p.Name)}" onError="this.style.display='none'" />
						<span class="season-cast-name">${escapeHtml(p.Name)}</span>
						<span class="season-cast-role">${escapeHtml(pRole)}</span>
					</a>
				`;
			});
			castHtml = `
				<section class="season-cast-section">
					<div class="season-section-header">
						<div class="season-section-title-wrap">
							<div class="season-section-red-bar"></div>
							<h3 class="season-section-heading">Cast & Crew</h3>
						</div>
					</div>
					<div class="season-cast-carousel">
						${castCardsHtml}
					</div>
				</section>
			`;
		}

		customWrap.innerHTML = headerHtml + episodesSectionHtml + castHtml;

		// Prepend to page
		page.insertBefore(customWrap, page.firstChild);

		page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-person-item-page', 'is-collection-item-page', 'is-series-item-page');
		page.classList.add('is-season-item-page');
		page.setAttribute('data-enhanced-item-id', itemId);

		// Dismiss any pending Jellyfin spinner
		page.querySelectorAll('.docspinner, .mdl-spinner, .loading, .spinner').forEach(s => {
			s.style.setProperty('display', 'none', 'important');
			s.classList.remove('is-active');
		});

		// Wire Header Action Buttons
		const primaryPlayBtn = customWrap.querySelector('#season-primary-play-btn');
		if (primaryPlayBtn) {
			primaryPlayBtn.addEventListener('click', async () => {
				if (firstUnplayedEpisode) {
					await playMediaItem(firstUnplayedEpisode, { startPositionTicks: firstUnplayedEpisode.UserData?.PlaybackPositionTicks || 0 });
				} else {
					await playMediaItem(itemId);
				}
			});
		}

		const shuffleBtn = customWrap.querySelector('#season-shuffle-btn');
		if (shuffleBtn) {
			shuffleBtn.addEventListener('click', async () => {
				await playMediaItem(itemId, { shuffle: true });
			});
		}

		const seasonFavBtn = customWrap.querySelector('#season-fav-btn');
		if (seasonFavBtn) {
			seasonFavBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const newFav = !isFav;
				isFav = newFav;
				if (newFav) seasonFavBtn.classList.add('is-active-fav');
				else seasonFavBtn.classList.remove('is-active-fav');

				const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
				if (api && typeof api.updateFavoriteStatus === 'function') {
					try { await api.updateFavoriteStatus(userId, itemId, newFav); } catch (err) { }
				}
			});
		}

		const seasonWatchedBtn = customWrap.querySelector('#season-watched-btn');
		if (seasonWatchedBtn) {
			seasonWatchedBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const newPlayed = !isPlayed;
				isPlayed = newPlayed;
				if (newPlayed) seasonWatchedBtn.classList.add('is-active-played');
				else seasonWatchedBtn.classList.remove('is-active-played');

				const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
				if (api) {
					try {
						if (newPlayed && typeof api.markPlayed === 'function') {
							await api.markPlayed(userId, itemId, new Date().toISOString());
						} else if (!newPlayed && typeof api.markUnplayed === 'function') {
							await api.markUnplayed(userId, itemId);
						}
					} catch (err) { }
				}
			});
		}

		const seasonMoreBtn = customWrap.querySelector('#season-more-btn');
		if (seasonMoreBtn) {
			seasonMoreBtn.addEventListener('click', (e) => {
				openItemContextMenu(item, seasonMoreBtn, e);
			});
		}

		// Wire Episode Card Interactions
		customWrap.querySelectorAll('.episode-card').forEach(card => {
			const epId = card.getAttribute('data-episode-id');
			const targetEp = episodes.find(e => e.Id === epId) || { Id: epId };

			const triggerEpPlay = async (e) => {
				if (e && e.target && e.target.closest('.episode-btn, .episode-watched-toggle-btn, .episode-fav-toggle-btn, .episode-more-toggle-btn, .episode-title-link, .episode-title-text, .episode-info-col')) return;
				if (e) {
					e.preventDefault();
					e.stopPropagation();
				}
				await playMediaItem(targetEp, { startPositionTicks: targetEp.UserData?.PlaybackPositionTicks || 0 });
			};

			const navigateToEpisode = (e) => {
				if (e) {
					e.preventDefault();
					e.stopPropagation();
				}
				if (window.appRouter && typeof window.appRouter.showItem === 'function') {
					window.appRouter.showItem(epId);
				} else {
					window.location.hash = `#/details?id=${epId}`;
				}
			};

			const thumbWrap = card.querySelector('.episode-thumb-wrap');
			const titleLink = card.querySelector('.episode-title-link');
			const titleText = card.querySelector('.episode-title-text');
			const infoCol = card.querySelector('.episode-info-col');
			const quickPlayBtn = card.querySelector('.episode-quick-play-btn');

			if (thumbWrap) {
				thumbWrap.style.cursor = 'pointer';
				thumbWrap.addEventListener('click', triggerEpPlay);
			}
			if (quickPlayBtn) {
				quickPlayBtn.addEventListener('click', triggerEpPlay);
			}
			if (titleLink) {
				titleLink.addEventListener('click', navigateToEpisode);
			}
			if (titleText) {
				titleText.addEventListener('click', navigateToEpisode);
			}
			if (infoCol) {
				infoCol.style.cursor = 'pointer';
				infoCol.addEventListener('click', (e) => {
					if (e.target && e.target.closest('a, button, .episode-btn')) return;
					navigateToEpisode(e);
				});
			}

			// Watched toggle
			const watchedBtn = card.querySelector('.episode-watched-toggle-btn');
			if (watchedBtn) {
				watchedBtn.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const wasPlayed = Boolean(targetEp.UserData?.Played);
					const willBePlayed = !wasPlayed;
					if (targetEp.UserData) targetEp.UserData.Played = willBePlayed;

					if (willBePlayed) {
						watchedBtn.classList.add('is-active-played');
						card.classList.add('is-played-card');
					} else {
						watchedBtn.classList.remove('is-active-played');
						card.classList.remove('is-played-card');
					}

					const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
					if (api) {
						try {
							if (willBePlayed && typeof api.markPlayed === 'function') {
								await api.markPlayed(userId, targetEp.Id, new Date().toISOString());
							} else if (!willBePlayed && typeof api.markUnplayed === 'function') {
								await api.markUnplayed(userId, targetEp.Id);
							}
						} catch (err) { }
					}
				});
			}

			// Favorite toggle
			const favBtn = card.querySelector('.episode-fav-toggle-btn');
			if (favBtn) {
				favBtn.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const wasFav = Boolean(targetEp.UserData?.IsFavorite);
					const willBeFav = !wasFav;
					if (targetEp.UserData) targetEp.UserData.IsFavorite = willBeFav;

					if (willBeFav) favBtn.classList.add('is-active-fav');
					else favBtn.classList.remove('is-active-fav');

					const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
					if (api && typeof api.updateFavoriteStatus === 'function') {
						try { await api.updateFavoriteStatus(userId, targetEp.Id, willBeFav); } catch (err) { }
					}
				});
			}

			// More menu toggle
			const moreBtn = card.querySelector('.episode-more-toggle-btn');
			if (moreBtn) {
				moreBtn.addEventListener('click', (e) => {
					openItemContextMenu(targetEp, moreBtn, e);
				});
			}
		});
	}

	async function renderEpisodeCustomLayout(page, item, itemId) {
		const { token, userId } = getAuth();
		const base = getBaseUrl();

		const seriesId = item.SeriesId || item.ParentId;
		const seasonId = item.SeasonId;

		// Fetch parent series and season episodes in parallel
		const [seriesItem, seasonEpisodes] = await Promise.all([
			seriesId ? fetchItemDetails(seriesId).catch(() => null) : Promise.resolve(null),
			(seasonId && seriesId) ? fetchSeasonEpisodes(seasonId, seriesId).catch(() => []) : Promise.resolve([])
		]);

		const epName = item.Name || 'Episode';
		const epIndex = item.IndexNumber !== undefined ? item.IndexNumber : 1;
		const seasonIndex = item.ParentIndexNumber !== undefined ? item.ParentIndexNumber : (item.SeasonName ? item.SeasonName.replace(/\D/g, '') || 1 : 1);
		const seasonTitle = item.SeasonName || `Season ${seasonIndex}`;
		const seriesName = item.SeriesName || seriesItem?.Name || 'TV Series';

		const thumbUrl = getImageUrl(item, 'Primary', base, token) || (seriesItem ? getImageUrl(seriesItem, 'Primary', base, token) : '');
		const logoUrl = seriesItem ? getImageUrl(seriesItem, 'Logo', base, token) : null;

		// Run time and dates
		const durationMin = item.RunTimeTicks ? Math.floor(item.RunTimeTicks / (10000 * 1000 * 60)) : 0;
		const durationStr = durationMin > 0 ? `${durationMin}m` : '';
		const premiereDate = item.PremiereDate ? new Date(item.PremiereDate).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
		const rating = (typeof item.CommunityRating === 'number' && item.CommunityRating > 0)
			? item.CommunityRating.toFixed(1)
			: ((typeof seriesItem?.CommunityRating === 'number' && seriesItem.CommunityRating > 0)
				? seriesItem.CommunityRating.toFixed(1)
				: 'N/A');

		let endsAtStr = '';
		if (durationMin > 0) {
			const endTime = new Date(Date.now() + durationMin * 60 * 1000);
			endsAtStr = `Ends at ${endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
		}

		const overview = item.Overview || 'No description available for this episode.';

		// Media specs extraction
		let videoSpecStr = '';
		let audioSpecStr = '';
		if (item.MediaStreams && item.MediaStreams.length > 0) {
			const videoStream = item.MediaStreams.find(s => s.Type === 'Video');
			if (videoStream) {
				const res = videoStream.Height >= 2160 ? '4K' : (videoStream.Height >= 1080 ? '1080p' : (videoStream.Height >= 720 ? '720p' : 'SD'));
				const codec = (videoStream.Codec || '').toUpperCase();
				const hdr = videoStream.VideoRangeType === 'HDR10' ? 'HDR' : (videoStream.VideoRangeType === 'DOVI' ? 'DV' : '');
				videoSpecStr = `${res} ${codec} ${hdr}`.trim();
			}
			const audioStream = item.MediaStreams.find(s => s.Type === 'Audio');
			if (audioStream) {
				const lang = audioStream.Language ? audioStream.Language.toUpperCase() : '';
				const codec = (audioStream.Codec || '').toUpperCase();
				const channels = audioStream.ChannelLayout ? audioStream.ChannelLayout : (audioStream.Channels === 6 ? '5.1' : (audioStream.Channels === 8 ? '7.1' : 'Stereo'));
				audioSpecStr = `${lang ? `${lang} • ` : ''}${codec} ${channels}`.trim();
			}
		}

		// User playback states
		let isFav = Boolean(item.UserData?.IsFavorite);
		let isPlayed = Boolean(item.UserData?.Played);
		const playbackPosTicks = item.UserData?.PlaybackPositionTicks || 0;
		const totalTicks = item.RunTimeTicks || 0;
		const progressPercent = (totalTicks > 0 && playbackPosTicks > 0 && !isPlayed) ? Math.min(100, Math.round((playbackPosTicks / totalTicks) * 100)) : 0;

		const resumeMin = Math.floor(playbackPosTicks / (10000 * 1000 * 60));
		const resumeSec = Math.floor((playbackPosTicks / (10000 * 1000)) % 60);
		const resumeTimeStr = `${resumeMin}:${String(resumeSec).padStart(2, '0')}`;

		// People: Directors, Writers, Cast
		const allPeople = item.People || [];
		const directors = allPeople.filter(p => (p.Type || '').toLowerCase() === 'director').map(p => p.Name).join(', ');
		const writers = allPeople.filter(p => (p.Type || '').toLowerCase() === 'writer').map(p => p.Name).join(', ');
		const genres = (item.Genres && item.Genres.length) ? item.Genres.join(', ') : (seriesItem?.Genres || []).join(', ');

		// Build Custom Wrapper
		const customWrap = document.createElement('div');
		customWrap.className = 'episode-custom-wrapper';

		// 1. Header Section HTML
		let headerHtml = `
			<div class="episode-header-container">
				<div class="episode-header-left">
					<div class="episode-preview-thumb-wrap" id="episode-hero-thumb" title="Play Episode">
						<img src="${thumbUrl}" alt="${escapeHtml(epName)}" class="episode-preview-img" onError="this.style.display='none'" />
						<div class="episode-play-overlay">
							<div class="episode-play-circle-btn">
								<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							</div>
						</div>
						${progressPercent > 0 ? `
							<div class="episode-thumb-progress-bar">
								<div class="episode-thumb-progress-fill" style="width:${progressPercent}%;"></div>
							</div>
						` : ''}
					</div>

					${(videoSpecStr || audioSpecStr) ? `
						<div class="episode-media-specs-box">
							${videoSpecStr ? `
								<div class="episode-spec-item">
									<span class="episode-spec-label">VIDEO</span>
									<span class="episode-spec-val">${escapeHtml(videoSpecStr)}</span>
								</div>
							` : ''}
							${audioSpecStr ? `
								<div class="episode-spec-item">
									<span class="episode-spec-label">AUDIO</span>
									<span class="episode-spec-val">${escapeHtml(audioSpecStr)}</span>
								</div>
							` : ''}
						</div>
					` : ''}
				</div>

				<div class="episode-header-right">
					${logoUrl ? `
						<div class="episode-series-logo-wrap">
							<img src="${logoUrl}" alt="${escapeHtml(seriesName)}" class="episode-series-logo-img" onError="this.style.display='none'" />
						</div>
					` : `
						<h3 class="episode-series-plain-title">${escapeHtml(seriesName)}</h3>
					`}

					<div class="episode-breadcrumbs-row">
						${seriesId ? `
							<a href="#/details?id=${seriesId}" class="episode-breadcrumb-link">
								<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>
								<span>${escapeHtml(seriesName)}</span>
							</a>
						` : ''}
						${seasonId ? `
							<span class="episode-breadcrumb-sep">/</span>
							<a href="#/details?id=${seasonId}" class="episode-breadcrumb-link">
								<span>${escapeHtml(seasonTitle)}</span>
							</a>
						` : ''}
					</div>

					<h1 class="episode-main-title">${epIndex ? `${epIndex}. ` : ''}${escapeHtml(epName)}</h1>

					<div class="episode-meta-chips-row">
						<span class="episode-tag-badge">${escapeHtml(seasonTitle)} • EP ${String(epIndex).padStart(2, '0')}</span>
						${premiereDate ? `<span>${premiereDate}</span>` : ''}
						${durationStr ? `<span>${durationStr}</span>` : ''}
						${rating !== 'N/A' ? `<span class="episode-rating-badge">★ ${rating}</span>` : ''}
						${endsAtStr ? `<span class="episode-ends-at">${endsAtStr}</span>` : ''}
					</div>

					<div class="episode-actions-toolbar">
						<button class="episode-primary-play-btn" id="ep-page-play-btn" title="Play Episode">
							<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
							<span>${playbackPosTicks > 0 && !isPlayed ? `Resume (${resumeTimeStr})` : 'Play Episode'}</span>
						</button>

						<button class="episode-icon-btn ${isPlayed ? 'is-active-played' : ''}" id="ep-page-watched-btn" title="${isPlayed ? 'Mark Unwatched' : 'Mark Watched'}">
							<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>
						</button>

						<button class="episode-icon-btn ${isFav ? 'is-active-fav' : ''}" id="ep-page-fav-btn" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
							<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
						</button>

						<button class="episode-icon-btn" id="ep-page-more-btn" title="More Options">
							<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
						</button>
					</div>

					<p class="episode-overview-text">${escapeHtml(overview)}</p>

					${(directors || writers || genres) ? `
						<div class="episode-details-meta-grid">
							${directors ? `<div class="ep-meta-entry"><strong>Director:</strong> <span>${escapeHtml(directors)}</span></div>` : ''}
							${writers ? `<div class="ep-meta-entry"><strong>Writer:</strong> <span>${escapeHtml(writers)}</span></div>` : ''}
							${genres ? `<div class="ep-meta-entry"><strong>Genres:</strong> <span>${escapeHtml(genres)}</span></div>` : ''}
						</div>
					` : ''}
				</div>
			</div>
		`;

		// 2. "More from Season X" Horizontal Carousel
		let moreFromSeasonHtml = '';
		if (seasonEpisodes && seasonEpisodes.length > 1) {
			let carouselCardsHtml = '';
			seasonEpisodes.forEach((sEp, idx) => {
				const sEpIdx = sEp.IndexNumber !== undefined ? sEp.IndexNumber : (idx + 1);
				const sEpThumb = sEp.ImageTags?.Primary ? `${base}/Items/${sEp.Id}/Images/Primary?quality=80&fillWidth=340&tag=${sEp.ImageTags.Primary}&api_key=${token}` : thumbUrl;
				const isCurrent = (sEp.Id === itemId);
				const sDurationMin = sEp.RunTimeTicks ? Math.floor(sEp.RunTimeTicks / (10000 * 1000 * 60)) : 0;
				const sDurationStr = sDurationMin > 0 ? `${sDurationMin}m` : '';

				carouselCardsHtml += `
					<a href="#/details?id=${sEp.Id}" class="ep-carousel-card ${isCurrent ? 'is-current-ep' : ''}" title="${escapeHtml(sEp.Name || '')}">
						<div class="ep-carousel-thumb-wrap">
							<img src="${sEpThumb}" alt="${escapeHtml(sEp.Name || '')}" class="ep-carousel-thumb-img" loading="lazy" onError="this.style.display='none'" />
							<div class="ep-carousel-badge">EP ${String(sEpIdx).padStart(2, '0')}</div>
							${sDurationStr ? `<div class="ep-carousel-duration">${sDurationStr}</div>` : ''}
							${isCurrent ? `<div class="ep-carousel-current-tag">NOW VIEWING</div>` : ''}
						</div>
						<div class="ep-carousel-title">${sEpIdx}. ${escapeHtml(sEp.Name || ('Episode ' + sEpIdx))}</div>
					</a>
				`;
			});

			moreFromSeasonHtml = `
				<section class="episode-more-season-section">
					<div class="season-section-header">
						<div class="season-section-title-wrap">
							<div class="season-section-red-bar" style="background:#ffffff;"></div>
							<h3 class="season-section-heading">More from ${escapeHtml(seasonTitle)}</h3>
						</div>
						<div class="episode-carousel-nav-wrap">
							<span class="season-episodes-count-badge">${seasonEpisodes.length} EPISODES</span>
							<div class="episode-carousel-arrows">
								<button type="button" class="episode-carousel-arrow-btn" id="ep-carousel-prev-btn" title="Previous Episodes" aria-label="Previous">
									<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>
								</button>
								<button type="button" class="episode-carousel-arrow-btn" id="ep-carousel-next-btn" title="Next Episodes" aria-label="Next">
									<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>
								</button>
							</div>
						</div>
					</div>
					<div class="episode-carousel-scroller" id="episode-carousel-scroller">
						${carouselCardsHtml}
					</div>
				</section>
			`;
		}

		// 3. Cast & Crew / Guest Stars Section
		let castSectionHtml = '';
		const castPeople = allPeople.length ? allPeople : (seriesItem?.People || []);
		if (castPeople.length) {
			let castCards = '';
			castPeople.slice(0, 16).forEach(p => {
				const pImg = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=150&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
				const pHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
				const pRole = p.Role || p.Character || p.Type || 'Cast';
				castCards += `
					<a href="${pHref}" class="season-cast-card">
						<img class="season-cast-avatar" src="${pImg}" alt="${escapeHtml(p.Name)}" onError="this.style.display='none'" />
						<span class="season-cast-name">${escapeHtml(p.Name)}</span>
						<span class="season-cast-role">${escapeHtml(pRole)}</span>
					</a>
				`;
			});
			castSectionHtml = `
				<section class="season-cast-section" style="max-width:1320px;margin:24px auto 0 auto;padding:0 32px;box-sizing:border-box;">
					<div class="season-section-header">
						<div class="season-section-title-wrap">
							<div class="season-section-red-bar" style="background:#ffffff;"></div>
							<h3 class="season-section-heading">Cast & Crew</h3>
						</div>
					</div>
					<div class="season-cast-carousel" style="display:flex;gap:18px;overflow-x:auto;padding-bottom:12px;scrollbar-width:none;">
						${castCards}
					</div>
				</section>
			`;
		}

		customWrap.innerHTML = `
			${headerHtml}
			${moreFromSeasonHtml}
			${castSectionHtml}
		`;

		page.appendChild(customWrap);

		// Wire Event Listeners
		const playBtn = customWrap.querySelector('#ep-page-play-btn');
		if (playBtn) {
			playBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				await playMediaItem(item, { startPositionTicks: playbackPosTicks });
			});
		}

		const heroThumb = customWrap.querySelector('#episode-hero-thumb');
		if (heroThumb) {
			heroThumb.addEventListener('click', async (e) => {
				e.preventDefault();
				await playMediaItem(item, { startPositionTicks: playbackPosTicks });
			});
		}

		const watchedBtn = customWrap.querySelector('#ep-page-watched-btn');
		if (watchedBtn) {
			watchedBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const newPlayed = !isPlayed;
				isPlayed = newPlayed;
				if (newPlayed) watchedBtn.classList.add('is-active-played');
				else watchedBtn.classList.remove('is-active-played');

				const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
				if (api) {
					try {
						if (newPlayed && typeof api.markPlayed === 'function') {
							await api.markPlayed(userId, itemId, new Date().toISOString());
						} else if (!newPlayed && typeof api.markUnplayed === 'function') {
							await api.markUnplayed(userId, itemId);
						}
					} catch (err) { }
				}
			});
		}

		const favBtn = customWrap.querySelector('#ep-page-fav-btn');
		if (favBtn) {
			favBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const newFav = !isFav;
				isFav = newFav;
				if (newFav) favBtn.classList.add('is-active-fav');
				else favBtn.classList.remove('is-active-fav');

				const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
				if (api && typeof api.updateFavoriteStatus === 'function') {
					try { await api.updateFavoriteStatus(userId, itemId, newFav); } catch (err) { }
				}
			});
		}

		const moreBtn = customWrap.querySelector('#ep-page-more-btn');
		if (moreBtn) {
			moreBtn.addEventListener('click', (e) => {
				openItemContextMenu(item, moreBtn, e);
			});
		}

		// Episode Carousel Arrows & Scroller
		const carouselScroller = customWrap.querySelector('#episode-carousel-scroller');
		const prevBtn = customWrap.querySelector('#ep-carousel-prev-btn');
		const nextBtn = customWrap.querySelector('#ep-carousel-next-btn');

		if (carouselScroller && prevBtn && nextBtn) {
			prevBtn.addEventListener('click', (e) => {
				e.preventDefault();
				carouselScroller.scrollBy({ left: -480, behavior: 'smooth' });
			});
			nextBtn.addEventListener('click', (e) => {
				e.preventDefault();
				carouselScroller.scrollBy({ left: 480, behavior: 'smooth' });
			});

			// Auto scroll to current episode on load
			const currentCard = carouselScroller.querySelector('.ep-carousel-card.is-current-ep');
			if (currentCard) {
				setTimeout(() => {
					const offset = currentCard.offsetLeft - 40;
					if (offset > 0) {
						carouselScroller.scrollTo({ left: offset, behavior: 'smooth' });
					}
				}, 250);
			}
		}
	}

	async function enhanceMovieDetailsPage(bypassCache = false) {
		syncPreCheck();

		const page = getActiveItemPage();
		if (!page) return;
		cleanupNativeBackgroundThemePlayer();

		const itemId = resolveItemId();
		if (!itemId) {
			cleanUpCustomMovieLayout(page);
			return;
		}

		const shouldBypass = bypassCache === true;

		if (!shouldBypass && page.getAttribute('data-enhanced-item-id') === itemId &&
			(page.querySelector('.movie-custom-wrapper') || page.querySelector('.person-custom-wrapper') || page.querySelector('.collection-custom-wrapper') || page.querySelector('.series-custom-wrapper') || page.querySelector('.season-custom-wrapper') || page.querySelector('.episode-custom-wrapper'))) {
			return;
		}

		if (isEnhancing) return;
		isEnhancing = true;

		try {
			if (shouldBypass && itemId) {
				delete itemCache[itemId];
			}
			const item = await fetchItemDetails(itemId, shouldBypass);
			if (!item) {
				cleanUpCustomMovieLayout(page);
				page.removeAttribute('data-enhanced-item-id');
				return;
			}

			const itemType = (item?.Type || item?.ItemType || page.getAttribute('data-itemtype') || page.getAttribute('data-type') || '').toLowerCase();

			if (itemType === 'person') {
				// PERSON / ACTOR ITEM
				page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
				await renderPersonCustomLayout(page, item, itemId);
				page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-collection-item-page', 'is-series-item-page', 'is-season-item-page', 'is-episode-item-page');
				page.classList.add('is-person-item-page');
				page.setAttribute('data-enhanced-item-id', itemId);
				return;
			}

			if (itemType === 'boxset' || itemType === 'boxsetitem' || itemType === 'collection') {
				// COLLECTION / BOXSET ITEM
				page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
				await renderCollectionCustomLayout(page, item, itemId);
				page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-person-item-page', 'is-series-item-page', 'is-season-item-page', 'is-episode-item-page');
				page.classList.add('is-collection-item-page');
				page.setAttribute('data-enhanced-item-id', itemId);
				return;
			}

			if (itemType === 'series' || itemType === 'tvshow' || itemType === 'show') {
				// TV SERIES ITEM
				page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
				await renderSeriesCustomLayout(page, item, itemId);
				page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-person-item-page', 'is-collection-item-page', 'is-season-item-page', 'is-episode-item-page');
				page.classList.add('is-series-item-page');
				page.setAttribute('data-enhanced-item-id', itemId);
				return;
			}

			if (itemType === 'season' || itemType === 'seasonitem') {
				// TV SEASON ITEM (EPISODES LIST)
				page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
				await renderSeasonCustomLayout(page, item, itemId);
				page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-person-item-page', 'is-collection-item-page', 'is-series-item-page', 'is-episode-item-page');
				page.classList.add('is-season-item-page');
				page.setAttribute('data-enhanced-item-id', itemId);
				return;
			}

			if (itemType === 'episode' || itemType === 'episodeitem') {
				// TV EPISODE ITEM
				page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());
				await renderEpisodeCustomLayout(page, item, itemId);
				page.classList.remove('is-not-movie', 'is-movie-item-page', 'is-person-item-page', 'is-collection-item-page', 'is-series-item-page', 'is-season-item-page');
				page.classList.add('is-episode-item-page');
				page.setAttribute('data-enhanced-item-id', itemId);
				return;
			}

			if (itemType !== 'movie' && itemType !== 'movieitem') {
				cleanUpCustomMovieLayout(page);
				page.removeAttribute('data-enhanced-item-id');
				return;
			}

			// MOVIE ITEM
			page.querySelectorAll('.movie-custom-wrapper, .person-custom-wrapper, .collection-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper').forEach(el => el.remove());

			const { token } = getAuth();
			const base = getBaseUrl();

			const posterUrl = getImageUrl(item, 'Primary', base, token);
			let backdropUrl = getInitialDailyBackdropUrl(item, base, token);
			if (!backdropUrl) backdropUrl = posterUrl;

			const logoUrl = getImageUrl(item, 'Logo', base, token);
			const hasLogoImage = Boolean(item.ImageTags?.Logo || item.HasLogo || item.ParentLogoImageTag || item.SeriesLogoImageTag || !item.ImageTags);
			const galleryPhotoUrls = getBackdropUrls(item, base, token);

			const year = item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : '2016');
			const rating = (typeof item.CommunityRating === 'number' && item.CommunityRating > 0)
				? item.CommunityRating.toFixed(1)
				: (typeof item.CriticRating === 'number' && item.CriticRating > 0
					? (item.CriticRating / 10).toFixed(1)
					: 'N/A');
			const runTimeTicks = item.RunTimeTicks;
			let runtimeStr = '128 min';
			if (runTimeTicks) {
				const minutes = Math.floor(runTimeTicks / (10000 * 1000 * 60));
				runtimeStr = `${minutes} min`;
			}

			const genres = (item.Genres || ['Drama', 'Romance']).join(', ');
			const tagline = item.Taglines?.[0] || '';
			const overview = item.Overview || 'No storyline available.';

			// People / Cast / Directors / Writers / Studios
			const people = item.People || [];

			const directorPeople = people.filter(p => p.Type === 'Director');
			const writerPeople = people.filter(p => p.Type === 'Writer');

			let directorsHtml = 'N/A';
			if (directorPeople.length) {
				directorsHtml = directorPeople.map(p => {
					const href = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
					return `<a href="${href}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(p.Name)}</a>`;
				}).join(', ');
			}

			let writersHtml = 'N/A';
			if (writerPeople.length) {
				writersHtml = writerPeople.map(p => {
					const href = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
					return `<a href="${href}" style="color:#ffffff;text-decoration:underline;">${escapeHtml(p.Name)}</a>`;
				}).join(', ');
			}

			const studios = (item.Studios || []).map(s => s.Name).join(', ') || 'USA';

			const allActors = people.filter(p => p.Type === 'Actor');
			const primaryCast = allActors.slice(0, 4);
			const extraCast = allActors.slice(4);

			if (itemId && item && item.Type !== 'Person') {
				window.__abyssCurrentPlayingMovieId = itemId;
				try { sessionStorage.setItem('abyss_current_playing_movie_id', itemId); } catch (e) { }
			}

			let isFav = item.UserData?.IsFavorite || false;
			if (itemId && window.__abyssFavoriteCache && window.__abyssFavoriteCache[itemId] !== undefined) {
				isFav = window.__abyssFavoriteCache[itemId];
				if (item.UserData) item.UserData.IsFavorite = isFav;
			}
			const isPlayed = item.UserData?.Played || false;

			// Parallel non-blocking background promises
			const themeVideoPromise = isThemeVideosEnabled() ? fetchThemeVideo(itemId) : Promise.resolve(null);
			const similarPromise = fetchSimilarMovies(itemId);

			// Build Custom Movie Layout Container Wrapper
			const customWrap = document.createElement('div');
			customWrap.className = 'movie-custom-wrapper';

			// Hero Section HTML (loads image immediately; video mounts dynamically via initHeroThemeVideo once themeVideoPromise resolves)
			let heroHtml = `
				<section class="hero-section">
					<div class="hero-bg-container" style="position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;z-index:0;overflow:hidden;">
						<img src="${backdropUrl}" class="hero-backdrop-img" style="width:100%;height:100%;object-fit:cover;" alt="" />
						<div class="hero-overlay"></div>
					</div>
					<div style="position:relative;z-index:10;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:80px;">
						<button class="hero-play-btn" id="movie-exact-hero-play" title="Play Movie">
							<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
						</button>
					</div>
				</section>
			`;

			// Primary Cast HTML (Linked to Person Details Page)
			let castItemsHtml = '';
			if (primaryCast.length) {
				primaryCast.forEach(p => {
					const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
					const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
					const roleName = p.Role || p.Character || p.RoleName || '';
					castItemsHtml += `
						<a href="${personHref}" class="cast-item">
							<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
							<div class="cast-info-col">
								<span class="cast-name-text">${escapeHtml(p.Name)}</span>
								${roleName ? `<span class="cast-role-text">${escapeHtml(roleName)}</span>` : ''}
							</div>
						</a>
					`;
				});
			} else {
				castItemsHtml = `
					<div class="cast-item"><span class="cast-name-text">N/A</span></div>
				`;
			}

			// Extra Cast Horizontal Grid HTML (Linked to Person Details Page)
			let extraCastHtml = '';
			if (extraCast.length) {
				extraCast.forEach(p => {
					const pImgTag = p.PrimaryImageTag ? `${base}/Items/${p.Id}/Images/Primary?quality=80&fillWidth=100&tag=${p.PrimaryImageTag}&api_key=${token}` : '';
					const personHref = p.Id ? `#/details?id=${p.Id}` : 'javascript:void(0)';
					const roleName = p.Role || p.Character || p.RoleName || '';
					extraCastHtml += `
						<a href="${personHref}" class="cast-item cast-item-horizontal">
							<img class="cast-img" src="${pImgTag}" alt="${escapeHtml(p.Name)}" onError="this.style.backgroundColor='#374151'" />
							<div class="cast-info-col">
								<span class="cast-name-text">${escapeHtml(p.Name)}</span>
								${roleName ? `<span class="cast-role-text">${escapeHtml(roleName)}</span>` : ''}
							</div>
						</a>
					`;
				});
			}

			let seeMoreCastHtml = '';
			if (extraCast.length) {
				seeMoreCastHtml = `
					<div class="cast-extra-wrapper" id="cast-extra-container" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin-top 0.3s ease;margin-top:0;">
						<div class="cast-extra-horizontal-grid">
							${extraCastHtml}
						</div>
					</div>
					<button class="see-more-cast-btn" id="cast-see-more-btn" type="button">
						<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" class="see-more-icon" style="transition:transform 0.3s ease;">
							<path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
						</svg>
						<span class="see-more-text">See more</span>
					</button>
				`;
			}

			// Pure Photo Gallery HTML
			const featuredPhoto = galleryPhotoUrls[0] || backdropUrl;
			const thumb1 = galleryPhotoUrls[1];
			const thumb2 = galleryPhotoUrls[2];
			const remainingCount = galleryPhotoUrls.length - 3;
			const hasMore = galleryPhotoUrls.length > 3;

			let thumbsRowHtml = '';
			if (thumb1) {
				thumbsRowHtml += `<div class="thumb-box" id="gallery-photo-1" title="View Movie Photo"><img src="${thumb1}" alt="" /></div>`;
			}
			if (thumb2) {
				thumbsRowHtml += `<div class="thumb-box" id="gallery-photo-2" title="View Movie Photo"><img src="${thumb2}" alt="" /></div>`;
			}
			if (hasMore && remainingCount > 0) {
				thumbsRowHtml += `<div class="thumb-box-more" id="gallery-photo-more" title="View All Photos">+${remainingCount}</div>`;
			}

			let galleryHtml = `
				<section class="right-col">
					<h3 class="section-heading">Gallery</h3>
					<div class="gallery-featured-photo" id="gallery-photo-main" title="View Movie Photo">
						<img src="${featuredPhoto}" alt="Movie Photo" />
					</div>
					${thumbsRowHtml ? `<div class="gallery-thumbs-row">${thumbsRowHtml}</div>` : ''}
				</section>
			`;

			// Main Content Grid HTML (Includes 3-Dots Menu Button)
			let mainGridHtml = `
				<main class="main-content-grid">
					<!-- Left Column: Poster & Native Actions -->
					<aside class="left-col">
						<div class="poster-wrap poster-shadow">
							<img src="${posterUrl}" alt="${escapeHtml(item.Name)}" />
						</div>
						<div class="left-btn-container" style="display:flex;flex-direction:column;gap:8px;">
							<button class="left-btn collection-primary-btn" id="movie-btn-play" type="button" title="${(item.UserData?.PlaybackPositionTicks || 0) > 0 ? 'Resume Movie' : 'Play Movie'}">
								<svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
								<span class="btn-text">${(item.UserData?.PlaybackPositionTicks || 0) > 0 ? 'Resume' : 'Play Movie'}</span>
							</button>
							<button class="left-btn" id="movie-btn-trailer" type="button" title="Watch Trailer">
								<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
								<span class="btn-text">Watch Trailer</span>
							</button>
							<button class="left-btn ${isFav ? 'is-fav' : ''}" id="movie-btn-fav" data-is-fav="${isFav}" type="button" title="${isFav ? 'Favorited' : 'Add to Favorites'}" style="${isFav ? 'color:#ef4444;' : ''}">
								<svg width="14" height="14" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
								<span class="btn-text">${isFav ? 'Favorited' : 'Add to Favorites'}</span>
							</button>
							<button class="left-btn ${isPlayed ? 'is-played' : ''}" id="movie-btn-played" data-is-played="${isPlayed}" type="button" title="${isPlayed ? 'Played' : 'Mark as Played'}" style="${isPlayed ? 'color:#22c55e;' : ''}">
								<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path></svg>
								<span class="btn-text">${isPlayed ? 'Played' : 'Mark as Played'}</span>
							</button>
							<button class="left-btn itemAction" id="movie-btn-more" type="button" data-action="menu" data-id="${itemId}" data-type="${item.Type || 'Movie'}" data-serverid="${item.ServerId || ''}" title="More Options">
								<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
								<span class="btn-text">More Options</span>
							</button>
						</div>
					</aside>

					<!-- Center Column: Info & Storyline -->
					<section class="center-col">
						<div class="title-row">
							<div class="movie-logo-title-wrap">
								${hasLogoImage ? `<img src="${logoUrl}" alt="${escapeHtml(item.Name)}" class="movie-logo-img" onError="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';" />` : ''}
								<h2 class="movie-title-text" style="${hasLogoImage ? 'display:none;' : ''}">${escapeHtml(item.Name)}</h2>
							</div>
							${item.OfficialRating ? `<span class="rating-badge">${escapeHtml(item.OfficialRating)}</span>` : ''}
						</div>
						${tagline ? `<p class="tagline-text">"${escapeHtml(tagline)}"</p>` : ''}

						<div class="meta-row">
							<div class="meta-item">
								<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
								${runtimeStr}
							</div>
							<div class="meta-item" style="color:#eab308;">
								<svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
								IMDb <span class="movie-imdb-score-val">${rating}</span>
							</div>
							<span>${year}</span>
							${genres ? `<span class="genre-pill">${genres}</span>` : ''}
						</div>

						<div class="details-cast-grid">
							<div>
								<h3 class="section-heading">Details</h3>
								<div style="display:flex;flex-direction:column;gap:12px;">
									<div class="detail-list-row"><span class="detail-list-label">Director:</span><span class="detail-list-val">${directorsHtml}</span></div>
									<div class="detail-list-row"><span class="detail-list-label">Writers:</span><span class="detail-list-val">${writersHtml}</span></div>
									<div class="detail-list-row"><span class="detail-list-label">Country:</span><span class="detail-list-val">${escapeHtml(studios)}</span></div>
									<div class="detail-list-row"><span class="detail-list-label">Release Date:</span><span class="detail-list-val">${year}</span></div>
								</div>
							</div>

							<div>
								<h3 class="section-heading">Cast</h3>
								<div style="display:flex;flex-direction:column;gap:12px;">
									${castItemsHtml}
								</div>
								${seeMoreCastHtml}
							</div>
						</div>

						<div>
							<h3 class="section-heading">Storyline</h3>
							<p class="storyline-para">${escapeHtml(overview)}</p>
						</div>
					</section>

					<!-- Right Column: Pure Photo Gallery -->
					${galleryHtml}
				</main>
			`;

			customWrap.innerHTML = heroHtml + mainGridHtml;

			// Prepend custom wrapper at top of item page immediately!
			page.insertBefore(customWrap, page.firstChild);

			page.classList.remove('is-not-movie', 'is-person-item-page', 'is-collection-item-page', 'is-series-item-page');
			page.classList.add('is-movie-item-page');
			page.setAttribute('data-enhanced-item-id', itemId);

			// Mount theme video as soon as background promise resolves
			themeVideoPromise.then(themeVid => {
				if (themeVid && customWrap.isConnected && !isVideoOsdPageActive() && !document.querySelector('.abyss-trailer-player-overlay')) {
					initHeroThemeVideo(customWrap, themeVid, item);
				}
			});

			// Append similar movies section as soon as background promise resolves
			similarPromise.then(similarItems => {
				if (similarItems && similarItems.length && customWrap.isConnected) {
					appendSimilarMoviesSection(customWrap, similarItems, base, token);
				}
			});

			fetchLiveImdbRating(item).then(resObj => {
				if (resObj && resObj.score) {
					const scoreSpan = customWrap.querySelector('.movie-imdb-score-val');
					const labelSpan = customWrap.querySelector('.movie-imdb-label-text');
					if (scoreSpan) scoreSpan.textContent = resObj.score;
					if (labelSpan && resObj.source) labelSpan.textContent = resObj.source;
				}
			});

			if (getStrictBackdropUrls(item, base, token).length === 0) {
				getDailyRandomBackdropUrl(item, base, token).then(bgUrl => {
					if (!bgUrl || bgUrl === backdropUrl || !customWrap.isConnected) return;
					if (isJmpMpvHeroPlaying || customWrap.querySelector('video.hero-theme-video')) return;
					const preImg = new Image();
					preImg.onload = () => {
						if (!customWrap.isConnected || isJmpMpvHeroPlaying || customWrap.querySelector('video.hero-theme-video')) return;
						const heroImg = customWrap.querySelector('.hero-section img.hero-backdrop-img, .hero-section img');
						if (heroImg) heroImg.src = bgUrl;
					};
					preImg.src = bgUrl;
				});
			}

			// See More / See Less Cast Toggle Handler
			const seeMoreBtn = customWrap.querySelector('#cast-see-more-btn');
			const extraContainer = customWrap.querySelector('#cast-extra-container');
			if (seeMoreBtn && extraContainer) {
				let isExpanded = false;
				seeMoreBtn.addEventListener('click', () => {
					isExpanded = !isExpanded;
					const textSpan = seeMoreBtn.querySelector('.see-more-text');
					const iconSvg = seeMoreBtn.querySelector('.see-more-icon');

					if (isExpanded) {
						extraContainer.style.maxHeight = `${extraContainer.scrollHeight + 30}px`;
						extraContainer.style.opacity = '1';
						extraContainer.style.marginTop = '8px';
						if (textSpan) textSpan.innerText = 'See less';
						if (iconSvg) iconSvg.style.transform = 'rotate(180deg)';
					} else {
						extraContainer.style.maxHeight = '0';
						extraContainer.style.opacity = '0';
						extraContainer.style.marginTop = '0';
						if (textSpan) textSpan.innerText = 'See more';
						if (iconSvg) iconSvg.style.transform = 'rotate(0deg)';
					}
				});
			}

			// Bind Actions
			const triggerPlay = async () => {
				stopHeroThemeMedia(customWrap);
				await playMediaItem(item, { startPositionTicks: item.UserData?.PlaybackPositionTicks || 0 });
			};

			const heroPlayBtn = customWrap.querySelector('#movie-exact-hero-play');
			if (heroPlayBtn) heroPlayBtn.addEventListener('click', triggerPlay);

			const leftPlayBtn = customWrap.querySelector('#movie-btn-play');
			if (leftPlayBtn) leftPlayBtn.addEventListener('click', triggerPlay);

			// Gallery Photo Click Handlers (Lightbox Modal Preview)
			const photoMain = customWrap.querySelector('#gallery-photo-main');
			const photo1 = customWrap.querySelector('#gallery-photo-1');
			const photo2 = customWrap.querySelector('#gallery-photo-2');
			const photoMore = customWrap.querySelector('#gallery-photo-more');

			if (photoMain) photoMain.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));
			if (photo1) photo1.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 1 % galleryPhotoUrls.length));
			if (photo2) photo2.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 2 % galleryPhotoUrls.length));
			if (photoMore) photoMore.addEventListener('click', () => openGalleryLightbox(galleryPhotoUrls, 0));

			// Native Action Buttons
			const trailerBtn = customWrap.querySelector('#movie-btn-trailer');
			const favBtn = customWrap.querySelector('#movie-btn-fav');
			const playedBtn = customWrap.querySelector('#movie-btn-played');
			const moreBtn = customWrap.querySelector('#movie-btn-more');

			if (trailerBtn) {
				trailerBtn.addEventListener('click', () => {
					stopHeroThemeMedia(customWrap);
					playTrailer(itemId, item, page);
				});
			}

			if (favBtn) {
				favBtn.addEventListener('click', () => toggleFavorite(itemId, item, favBtn, page));
			}

			if (playedBtn) {
				playedBtn.addEventListener('click', () => togglePlayed(itemId, item, playedBtn, page));
			}

			if (moreBtn) {
				moreBtn.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					await showMovieContextMenu(moreBtn, item, e);
				});
			}

		} catch (err) {
			console.warn('[Movie Details] Error enhancing page:', err);
		} finally {
			isEnhancing = false;
		}
	}

	function isVideoPlayerActive() {
		if (isVideoOsdPageActive()) return true;
		const hash = (window.location.hash || '').toLowerCase();
		if (hash.includes('video') || hash.includes('player') || hash.includes('videoosd')) return true;
		if (document.querySelector('#videoOsdPage:not(.hide), .videoOsdPage:not(.hide), .videoPlayerContainer, .abyss-trailer-player-overlay')) return true;
		return false;
	}

	// Mobile Header 3-Dots Overflow Menu Handler
	function setupMobileHeaderMenu() {
		const headerRight = document.querySelector('.headerRight');
		let popupContainer = document.body.querySelector('.abyss-mobile-header-popup');
		const moreBtn = headerRight ? headerRight.querySelector('.abyss-header-more-btn') : document.querySelector('.abyss-header-more-btn');

		// DESKTOP MODE (width > 800px) or Video Player Active
		if (window.innerWidth > 800 || isVideoPlayerActive()) {
			closeMobileHeaderMenu();

			// Move buttons back to .headerRight on Desktop
			if (popupContainer && headerRight) {
				const movedButtons = Array.from(popupContainer.querySelectorAll('.headerButton:not(.abyss-header-more-btn)'));
				movedButtons.forEach(child => {
					if (!headerRight.contains(child)) {
						headerRight.appendChild(child);
					}
				});
			}

			// Hide 3-dots button on Desktop
			if (moreBtn) {
				moreBtn.style.setProperty('display', 'none', 'important');
			}
			return;
		}

		// MOBILE MODE (width <= 800px)
		if (!headerRight) return;

		if (!popupContainer) {
			popupContainer = document.createElement('div');
			popupContainer.className = 'abyss-mobile-header-popup';
			document.body.appendChild(popupContainer);
		}

		// Move header buttons into popupContainer on Mobile
		const buttons = Array.from(headerRight.querySelectorAll('.headerButton:not(.abyss-header-more-btn)'));
		buttons.forEach(child => {
			if (!popupContainer.contains(child)) {
				popupContainer.appendChild(child);
			}
		});

		// Bind auto-close listener on inner buttons
		popupContainer.querySelectorAll('.headerButton').forEach(btn => {
			if (!btn.dataset.abyssCloseBound) {
				btn.dataset.abyssCloseBound = 'true';
				btn.addEventListener('click', () => {
					setTimeout(() => {
						closeMobileHeaderMenu();
					}, 150);
				});
			}
		});

		// Create 3-dots button if not present
		let activeMoreBtn = headerRight.querySelector('.abyss-header-more-btn');
		if (!activeMoreBtn) {
			activeMoreBtn = document.createElement('button');
			activeMoreBtn.className = 'headerButton headerButton-right abyss-header-more-btn paper-icon-button-light';
			activeMoreBtn.id = 'abyssHeaderMoreBtn';
			activeMoreBtn.type = 'button';
			activeMoreBtn.setAttribute('aria-label', 'More options');
			activeMoreBtn.style.cssText = 'background: transparent !important; border: none !important; box-shadow: none !important; outline: none !important;';
			activeMoreBtn.innerHTML = '<span class="material-icons" style="font-family: \'Material Icons Round\', \'Material Icons\', sans-serif;">more_vert</span>';

			activeMoreBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const isOpen = document.body.classList.contains('abyss-mobile-menu-open');
				if (isOpen) {
					closeMobileHeaderMenu();
				} else {
					const rect = activeMoreBtn.getBoundingClientRect();
					popupContainer.style.top = (rect.bottom + 8) + 'px';
					popupContainer.style.right = Math.max(12, window.innerWidth - rect.right) + 'px';
					document.body.classList.add('abyss-mobile-menu-open');
					headerRight.classList.add('abyss-mobile-menu-open');
				}
			});

			headerRight.appendChild(activeMoreBtn);
		} else {
			activeMoreBtn.style.removeProperty('display');
			if (document.body.classList.contains('abyss-mobile-menu-open')) {
				const rect = activeMoreBtn.getBoundingClientRect();
				popupContainer.style.top = (rect.bottom + 8) + 'px';
				popupContainer.style.right = Math.max(12, window.innerWidth - rect.right) + 'px';
			}
		}
	}

	function closeMobileHeaderMenu() {
		if (document.body.classList.contains('abyss-mobile-menu-open')) {
			document.body.classList.remove('abyss-mobile-menu-open');
			const headerRight = document.querySelector('.headerRight');
			if (headerRight) headerRight.classList.remove('abyss-mobile-menu-open');
			const moreBtn = document.querySelector('.abyss-header-more-btn');
			if (moreBtn) moreBtn.blur();
		}
	}

	if (!window.__abyssHeaderMenuTouchListenerAdded) {
		window.__abyssHeaderMenuTouchListenerAdded = true;

		const handleGlobalTouchOrClick = (e) => {
			if (!document.body.classList.contains('abyss-mobile-menu-open')) return;

			const popupContainer = document.body.querySelector('.abyss-mobile-header-popup');
			const moreBtn = document.querySelector('.abyss-header-more-btn');

			if (moreBtn && (moreBtn === e.target || moreBtn.contains(e.target))) {
				return;
			}

			if (popupContainer && popupContainer.contains(e.target)) {
				return;
			}

			closeMobileHeaderMenu();
		};

		document.addEventListener('pointerdown', handleGlobalTouchOrClick, { passive: true });
		document.addEventListener('touchstart', handleGlobalTouchOrClick, { passive: true });
		document.addEventListener('click', handleGlobalTouchOrClick, { passive: true });
		window.addEventListener('resize', setupMobileHeaderMenu, { passive: true });
	}

	let playerToastTimer = null;
	function showPlayerToastHUD(iconSvg, text) {
		let pillHUD = document.getElementById('abyss-gesture-hud');
		if (!pillHUD) {
			pillHUD = document.createElement('div');
			pillHUD.id = 'abyss-gesture-hud';
			pillHUD.className = 'abyss-gesture-hud';
			pillHUD.innerHTML = `<div class="abyss-hud-pill" id="abyss-hud-pill-content"></div>`;
			document.body.appendChild(pillHUD);
		}
		const pillContent = document.getElementById('abyss-hud-pill-content');
		if (!pillContent || !pillHUD) return;
		clearTimeout(playerToastTimer);
		pillContent.innerHTML = `
			${iconSvg ? `<div class="abyss-hud-icon-wrap">${iconSvg}</div>` : ''}
			<div class="abyss-hud-val-text">${text}</div>
		`;
		pillHUD.classList.add('abyss-hud-visible');
		playerToastTimer = setTimeout(() => {
			pillHUD.classList.remove('abyss-hud-visible');
		}, 1100);
	}

	function dispatchNativeButtonClick(btn, anchorBtn) {
		if (!btn) return false;
		try {
			btn.classList.remove('hide');
			btn.disabled = false;
			btn.removeAttribute('disabled');

			let origGetRect = null;
			if (anchorBtn && typeof anchorBtn.getBoundingClientRect === 'function') {
				const rect = anchorBtn.getBoundingClientRect();
				origGetRect = Object.prototype.hasOwnProperty.call(btn, 'getBoundingClientRect') ? btn.getBoundingClientRect : null;
				btn.getBoundingClientRect = () => anchorBtn.getBoundingClientRect();
				btn.style.setProperty('position', 'fixed', 'important');
				btn.style.setProperty('left', rect.left + 'px', 'important');
				btn.style.setProperty('top', rect.top + 'px', 'important');
				btn.style.setProperty('width', rect.width + 'px', 'important');
				btn.style.setProperty('height', rect.height + 'px', 'important');
				btn.style.setProperty('opacity', '0', 'important');
				btn.style.setProperty('pointer-events', 'none', 'important');
				btn.style.setProperty('z-index', '-1', 'important');
				setTimeout(() => {
					try {
						if (origGetRect) btn.getBoundingClientRect = origGetRect;
						else delete btn.getBoundingClientRect;
						btn.style.removeProperty('position');
						btn.style.removeProperty('left');
						btn.style.removeProperty('top');
						btn.style.removeProperty('width');
						btn.style.removeProperty('height');
						btn.style.removeProperty('opacity');
						btn.style.removeProperty('pointer-events');
						btn.style.removeProperty('z-index');
					} catch (e) { }
				}, 600);
			}

			// Dispatch pointerdown/mousedown first so Jellyfin's Edge/Firefox capture guard (Fe) records btn as active target M
			try {
				if (window.PointerEvent) {
					btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
				}
				btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
			} catch (e) { }

			btn.click();

			try {
				if (window.PointerEvent) {
					btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
				}
				btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
			} catch (e) { }

			return true;
		} catch (e) { }
		return false;
	}

	function clickNativePlayerButton(selectors, anchorBtn) {
		for (const sel of selectors) {
			const btn = document.querySelector(sel);
			if (btn && dispatchNativeButtonClick(btn, anchorBtn)) {
				return true;
			}
		}
		return false;
	}

	let lastMenuTriggerTime = 0;
	function triggerNativeMenu(selectors, anchorBtn) {
		const now = Date.now();
		if (now - lastMenuTriggerTime < 350) return true;
		lastMenuTriggerTime = now;

		for (const sel of selectors) {
			const btn = document.querySelector(sel);
			if (btn && dispatchNativeButtonClick(btn, anchorBtn)) {
				return true;
			}
		}
		return false;
	}

	function togglePlayPauseAction(e) {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		const pm = getInternalPlaybackManager();
		const v = getMainPlayerVideo();
		if (pm) {
			if (typeof pm.playPause === 'function') {
				pm.playPause();
				return;
			}
			if (typeof pm.paused === 'function') {
				if (pm.paused()) {
					if (typeof pm.unpause === 'function') pm.unpause();
					else if (typeof pm.play === 'function') pm.play();
					else if (v) v.play().catch(() => {});
				} else {
					if (typeof pm.pause === 'function') pm.pause();
					else if (v) v.pause();
				}
				return;
			}
		}
		if (v) {
			if (v.paused) v.play().catch(() => {});
			else v.pause();
			return;
		}
		clickNativePlayerButton(['#videoOsdPage .btnPause', '.videoOsdBottom .btnPause', '.btnPause']);
	}

	function getPlayerCurrentItem() {
		try {
			const pm = getInternalPlaybackManager();
			if (pm) {
				const player = (typeof pm.getCurrentPlayer === 'function' ? pm.getCurrentPlayer() : null) ||
					(typeof pm.getPlayer === 'function' ? pm.getPlayer() : null) ||
					pm._currentPlayer;
				let item = null;
				if (player && typeof pm.currentItem === 'function') {
					item = pm.currentItem(player);
				}
				if (!item && player?.currentItem) item = player.currentItem;
				if (!item && typeof pm.getCurrentItem === 'function') {
					item = player ? pm.getCurrentItem(player) : pm.getCurrentItem();
				}
				if (item) return item;
			}
		} catch (e) { }

		try {
			const mc = window.MediaController || window.parent?.MediaController || window.top?.MediaController;
			if (mc && typeof mc.currentItem === 'function') {
				const item = mc.currentItem();
				if (item) return item;
			}
		} catch (e) { }

		return null;
	}

	function getPlayerCurrentItemId() {
		// 1. Try PlaybackManager item (strictly exclude Person/Director items)
		try {
			const item = getPlayerCurrentItem();
			if (item && item.Id && item.Type !== 'Person' && item.Type !== 'Director') return item.Id;
		} catch (e) { }

		// 2. Try global session storage / memory saved from movie details page or play button click
		if (window.__abyssCurrentPlayingMovieId) return window.__abyssCurrentPlayingMovieId;
		try {
			const sessId = sessionStorage.getItem('abyss_current_playing_movie_id');
			if (sessId) return sessId;
		} catch (e) { }

		// 3. Try AppRouter current route (excluding Person items)
		try {
			const router = window.appRouter || window.parent?.appRouter || window.top?.appRouter;
			const route = router?.currentRouteInfo;
			const view = route?.route?.view || route?.view;
			const item = view?.controller?.currentItem || view?.controller?.item || view?.currentItem || view?.item;
			if (item && item.Id && item.Type !== 'Person' && item.Type !== 'Director') return item.Id;
		} catch (e) { }

		// 4. Try video OSD title links ONLY
		try {
			const titleLink = document.querySelector('.videoOsdTitle a[href*="id="], .videoOsdParentTitle a[href*="id="], .videoOsdHeader .title a[href*="id="]');
			if (titleLink) {
				const href = titleLink.getAttribute('href') || '';
				const match = href.match(/[?&]id=([^&]+)/i);
				if (match && match[1]) return match[1];
			}
		} catch (e) { }

		// 5. Try native btnFavorite button data attribute in video player
		try {
			const nativeFav = document.querySelector('#videoOsdPage .btnFavorite[data-id], .videoOsdHeader .btnFavorite[data-id], .videoOsdBottom .btnFavorite[data-id]');
			if (nativeFav) {
				const id = nativeFav.getAttribute('data-id');
				if (id && id.length > 10) return id;
			}
		} catch (e) { }

		return null;
	}

	window.__abyssFavoriteCache = window.__abyssFavoriteCache || {};

	async function togglePlayerFavorite(customBar) {
		const nativeRatingBtn = document.querySelector('#videoOsdPage .btnUserRating, #videoOsdPage .btnFavorite, .btnUserRating, .btnFavorite');
		if (nativeRatingBtn) {
			try {
				nativeRatingBtn.click();
			} catch (e) {}
		}

		const favBtn = customBar ? customBar.querySelector('.abyss-btn-fav') : document.querySelector('.abyss-btn-fav');
		const itemId = getPlayerCurrentItemId() || nativeRatingBtn?.getAttribute('data-id');
		if (!itemId) return;

		const currentIsFav = window.__abyssFavoriteCache[itemId] !== undefined ?
			window.__abyssFavoriteCache[itemId] :
			(favBtn ? favBtn.classList.contains('is-favorite') : false);

		const newFav = !currentIsFav;
		window.__abyssFavoriteCache[itemId] = newFav;

		if (favBtn) {
			favBtn.classList.toggle('is-favorite', newFav);
			const svg = favBtn.querySelector('svg');
			if (svg) {
				svg.setAttribute('fill', newFav ? '#e50914' : 'currentColor');
				svg.style.color = newFav ? '#e50914' : 'currentColor';
			}
		}

		// 1. Show Toast Feedback
		let pillHUD = document.getElementById('abyss-gesture-hud');
		if (!pillHUD) {
			pillHUD = document.createElement('div');
			pillHUD.id = 'abyss-gesture-hud';
			pillHUD.className = 'abyss-gesture-hud';
			pillHUD.innerHTML = `<div class="abyss-hud-pill" id="abyss-hud-pill-content"></div>`;
			document.body.appendChild(pillHUD);
		}
		const pillContent = document.getElementById('abyss-hud-pill-content');
		if (pillContent && pillHUD) {
			const iconColor = newFav ? '#e50914' : '#ffffff';
			pillContent.innerHTML = `
				<div class="abyss-hud-icon-wrap">
					<svg viewBox="0 0 24 24" style="fill:${iconColor}; width:22px; height:22px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
				</div>
				<div class="abyss-hud-val-text">${newFav ? 'Added to Favorites' : 'Removed from Favorites'}</div>
			`;
			pillHUD.classList.add('abyss-hud-visible');
			setTimeout(() => pillHUD.classList.remove('abyss-hud-visible'), 1200);
		}

		// 2. Synchronize UI instantly across the entire application
		syncAllFavoriteUI(itemId, newFav);

		// 3. Send single idempotent API call to Jellyfin Server
		await sendFavoriteApiRequest(itemId, newFav);
	}

	function syncPlayerFavorite(customBar) {
		if (!customBar) return;
		const favBtn = customBar.querySelector('.abyss-btn-fav');
		if (!favBtn) return;

		// Respect session override if set by user click
		if (customBar.dataset.overrideFav !== undefined) {
			const isFavOverride = customBar.dataset.overrideFav === 'true';
			favBtn.classList.toggle('is-favorite', isFavOverride);
			const svg = favBtn.querySelector('svg');
			if (svg) {
				svg.setAttribute('fill', isFavOverride ? '#e50914' : 'currentColor');
				svg.style.color = isFavOverride ? '#e50914' : 'currentColor';
			}
			return;
		}

		const itemId = getPlayerCurrentItemId();
		const item = getPlayerCurrentItem();
		const nativeFavBtn = document.querySelector('#videoOsdPage .btnFavorite, .videoOsdHeader .btnFavorite, .videoOsdBottom .btnFavorite, .btnFavoriteToggle, #videoOsdPage .btnUserRating, .btnUserRating');

		let isFav = false;
		if (itemId && window.__abyssFavoriteCache[itemId] !== undefined) {
			isFav = window.__abyssFavoriteCache[itemId];
		} else if (item && item.UserData) {
			isFav = !!item.UserData.IsFavorite;
		} else if (itemId && itemCache[itemId] && itemCache[itemId].UserData) {
			isFav = !!itemCache[itemId].UserData.IsFavorite;
		} else if (nativeFavBtn) {
			isFav = nativeFavBtn.classList.contains('is-favorite') ||
				nativeFavBtn.getAttribute('data-isfavorite') === 'true' ||
				!!nativeFavBtn.querySelector('.ratingButton-icon-on') ||
				nativeFavBtn.classList.contains('ratingButton-active') ||
				nativeFavBtn.classList.contains('ratingbutton-withrating');
		}

		favBtn.classList.toggle('is-favorite', isFav);
		const svg = favBtn.querySelector('svg');
		if (svg) {
			svg.setAttribute('fill', isFav ? '#e50914' : 'currentColor');
			svg.style.color = isFav ? '#e50914' : 'currentColor';
		}
	}

	let isDraggingSeek = false;
	let isDraggingVol = false;
	let lastManualSeekTime = 0;
	let pendingSeekTargetTicks = null;
	let lastNonZeroVolPct = 100;
	let seekCommitTimer = null;
	let seekInFlightWaitTimer = null;
	let lastRawSeekExecTime = 0;
	let seekSessionActive = false;
	let seekSessionWasPlaying = false;
	let accumulatedSeekDeltaSecs = 0;

	window.addEventListener('pointerup', () => { isDraggingSeek = false; isDraggingVol = false; }, { passive: true });
	window.addEventListener('mouseup', () => { isDraggingSeek = false; isDraggingVol = false; }, { passive: true });
	window.addEventListener('touchend', () => { isDraggingSeek = false; isDraggingVol = false; }, { passive: true });

	const formatTime = (secs) => {
		if (!Number.isFinite(secs) || secs < 0) return '0:00';
		const totalSecs = Math.floor(secs);
		const h = Math.floor(totalSecs / 3600);
		const m = Math.floor((totalSecs % 3600) / 60);
		const s = totalSecs % 60;
		if (h > 0) {
			return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
		}
		return `${m}:${s < 10 ? '0' : ''}${s}`;
	};

	let boundVideoEl = null;

	function getMainPlayerVideo() {
		return document.querySelector('#videoOsdPage video, .videoOsdPage video, video.htmlvideoplayer, .videoPlayerContainer video') ||
			document.querySelector('video:not(.abyss-card-trailer-video):not(#abyss-theme-video-player):not(.hero-theme-video)');
	}

	function isVideoOsdPageActive() {
		const osdPage = document.getElementById('videoOsdPage') || document.querySelector('.videoOsdPage');
		if (osdPage) return !osdPage.classList.contains('hide');
		const osdBottom = document.querySelector('.videoOsdBottom:not(.hide)');
		return Boolean(osdBottom);
	}

	function isVideoOsdCurrentlyHidden() {
		const osdBottom = document.querySelector('#videoOsdPage .videoOsdBottom, .videoOsdBottom');
		if (osdBottom) {
			return osdBottom.classList.contains('videoOsdBottom-hidden') ||
				osdBottom.classList.contains('osd-hidden') ||
				osdBottom.classList.contains('hide');
		}
		return document.body.classList.contains('abyss-osd-hidden');
	}

	let syntheticMouseCoordToggle = false;
	function wakeUpVideoOsd() {
		if (!isVideoOsdPageActive()) return;

		// 1. Trigger Jellyfin's native playback-video OSD controller c() via synthetic mouse pointermove (>10px delta)
		try {
			syntheticMouseCoordToggle = !syntheticMouseCoordToggle;
			const x1 = syntheticMouseCoordToggle ? 120 : 220;
			const y1 = syntheticMouseCoordToggle ? 120 : 220;
			const x2 = x1 + 45;
			const y2 = y1 + 45;
			if (typeof PointerEvent === 'function') {
				document.dispatchEvent(new PointerEvent('pointermove', {
					bubbles: true, cancelable: true, pointerType: 'mouse',
					clientX: x1, clientY: y1, screenX: x1, screenY: y1
				}));
				document.dispatchEvent(new PointerEvent('pointermove', {
					bubbles: true, cancelable: true, pointerType: 'mouse',
					clientX: x2, clientY: y2, screenX: x2, screenY: y2
				}));
			} else {
				document.dispatchEvent(new MouseEvent('mousemove', {
					bubbles: true, cancelable: true,
					clientX: x1, clientY: y1, screenX: x1, screenY: y1
				}));
				document.dispatchEvent(new MouseEvent('mousemove', {
					bubbles: true, cancelable: true,
					clientX: x2, clientY: y2, screenX: x2, screenY: y2
				}));
			}
		} catch (e) { }

		// 2. Ensure DOM classes are immediately unhidden for both bottom OSD and top header
		const osdBottoms = document.querySelectorAll('#videoOsdPage .videoOsdBottom, .videoOsdBottom, .videoOsdBottom-maincontrols');
		osdBottoms.forEach(el => {
			el.classList.remove('videoOsdBottom-hidden', 'osd-hidden', 'hide');
		});
		const headers = document.querySelectorAll('.skinHeader, #videoOsdPage .videoOsdHeader, .videoOsdHeader');
		headers.forEach(el => {
			el.classList.remove('osdHeader-hidden', 'hide');
		});
		document.body.classList.remove('abyss-osd-hidden');

		syncOsdHeaderVisibility();
		scheduleOsdSync();
	}

	function isVideoCurrentlyPlaying() {
		const v = getMainPlayerVideo();
		if (v) return !v.paused && !v.ended;
		const pm = getInternalPlaybackManager();
		if (pm && typeof pm.paused === 'function') return !pm.paused();
		return true;
	}

	function getPlayerVolumeState() {
		const pm = getInternalPlaybackManager();
		const v = getMainPlayerVideo();
		let volPct = 100;
		let isMuted = false;

		if (pm && typeof pm.getVolume === 'function') {
			isMuted = Boolean(typeof pm.isMuted === 'function' && pm.isMuted());
			const rawVol = Number(pm.getVolume());
			if (Number.isFinite(rawVol)) {
				volPct = Math.max(0, Math.min(100, Math.round(rawVol)));
			}
		} else if (v) {
			isMuted = Boolean(v.muted);
			const rawV = Math.max(0, Math.min(1, Number(v.volume) ?? 1));
			// Jellyfin htmlVideoPlayer uses cubic curve: v.volume = (pct / 100)^3
			volPct = Math.max(0, Math.min(100, Math.round(100 * Math.pow(rawV, 1 / 3))));
		}

		if (volPct > 0 && !isMuted) {
			lastNonZeroVolPct = volPct;
		}
		return { volPct: isMuted ? 0 : volPct, rawVolPct: volPct, isMuted };
	}

	function applyVolumeUIPct(customBar, pct, isMuted) {
		const bar = customBar || document.querySelector('.abyss-custom-osd-bar');
		if (!bar) return;
		const refs = getCustomBarRefs(bar);
		const effectivePct = isMuted ? 0 : Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
		if (refs) {
			refs._lastVolPct = effectivePct;
			refs._lastMuted = Boolean(isMuted || effectivePct === 0);
			if (refs.volFill) refs.volFill.style.width = effectivePct + '%';
			if (refs.volKnob) refs.volKnob.style.left = effectivePct + '%';
			if (refs.volInput) refs.volInput.value = String(effectivePct);
		} else {
			const volFill = bar.querySelector('.abyss-vol-fill');
			const volKnob = bar.querySelector('.abyss-vol-knob');
			const volInput = bar.querySelector('.abyss-vol-input');
			if (volFill) volFill.style.width = effectivePct + '%';
			if (volKnob) volKnob.style.left = effectivePct + '%';
			if (volInput) volInput.value = String(effectivePct);
		}
		updateVolumeButtonIcon(bar, effectivePct, isMuted || effectivePct === 0);
	}

	function getVolumeToastIconSvg(pct, isMuted) {
		if (isMuted || pct <= 0) {
			return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
		}
		if (pct < 50) {
			return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`;
		}
		return `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
	}

	function setPlayerVolumePct(pct, showHud = false, customBar = null) {
		const clampedPct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
		const isMuted = clampedPct <= 0;
		if (clampedPct > 0) {
			lastNonZeroVolPct = clampedPct;
		}

		const pm = getInternalPlaybackManager();
		const v = getMainPlayerVideo();

		// Use PlaybackManager.setVolume(0..100) as primary so Jellyfin's cubic curve (v.volume = (pct/100)^3)
		// and getVolume() round-trip with 100% 1-to-1 accuracy.
		if (pm && typeof pm.setVolume === 'function') {
			try {
				if (typeof pm.setMute === 'function') pm.setMute(isMuted);
				pm.setVolume(clampedPct);
			} catch (e) { }
		} else if (v) {
			v.volume = Math.pow(clampedPct / 100, 3);
			v.muted = isMuted;
		}

		if (v && v.muted !== isMuted) {
			v.muted = isMuted;
		}

		applyVolumeUIPct(customBar, clampedPct, isMuted);

		if (showHud) {
			showPlayerToastHUD(getVolumeToastIconSvg(clampedPct, isMuted), isMuted ? 'Muted (0%)' : `${clampedPct}%`);
		}
	}

	function getPlayerTiming() {
		const pm = getInternalPlaybackManager();
		const v = getMainPlayerVideo();
		let curTicks = 0;
		let durTicks = 0;
		let isTranscodeWithOffset = false;

		if (pm) {
			const player = (typeof pm.getCurrentPlayer === 'function' ? pm.getCurrentPlayer() : null) ||
				(typeof pm.getPlayer === 'function' ? pm.getPlayer() : null) ||
				pm._currentPlayer;
			try {
				if (typeof pm.duration === 'function') {
					durTicks = Number(player ? pm.duration(player) : pm.duration()) || 0;
				}
			} catch (e) { }
			if (!(durTicks > 0)) {
				const item = getPlayerCurrentItem();
				if (item && item.RunTimeTicks) {
					durTicks = Number(item.RunTimeTicks) || 0;
				}
			}

			try {
				const playMethod = (typeof pm.playMethod === 'function') ? pm.playMethod(player) : null;
				if (playMethod === 'Transcode') {
					isTranscodeWithOffset = true;
				}
				if (player && typeof pm.getCurrentTicks === 'function') {
					const t = Number(pm.getCurrentTicks(player));
					if (Number.isFinite(t) && t >= 0) {
						curTicks = t;
					}
				} else if (typeof pm.currentTime === 'function') {
					// In Jellyfin PlaybackManager, pm.currentTime(player) returns milliseconds (ticks / 1e4)
					const ms = Number(player ? pm.currentTime(player) : pm.currentTime());
					if (Number.isFinite(ms) && ms >= 0) {
						curTicks = Math.round(ms * 10000);
					}
				} else if (player && typeof player.currentTime === 'function') {
					const ms = Number(player.currentTime());
					if (Number.isFinite(ms) && ms >= 0) {
						curTicks = Math.round(ms * 10000);
					}
				}
			} catch (e) { }
		}

		if (v) {
			if (!(durTicks > 0) && Number.isFinite(v.duration) && v.duration > 0) {
				durTicks = Math.round(v.duration * 10000000);
			}
			// For direct-playing HTML5 video, v.currentTime is always more up-to-date than htmlVideoPlayer's cached timeupdate variable
			if (Number.isFinite(v.currentTime) && v.currentTime >= 0 && (!isTranscodeWithOffset || !(curTicks > 0))) {
				curTicks = Math.round(v.currentTime * 10000000);
			}
		}

		if (pendingSeekTargetTicks !== null) {
			const elapsed = Date.now() - lastManualSeekTime;
			const vTicks = (v && Number.isFinite(v.currentTime)) ? Math.round(v.currentTime * 10000000) : curTicks;
			const isSettled = !seekCommitTimer && !seekInFlightWaitTimer && (!v || !v.seeking) && Math.abs(vTicks - pendingSeekTargetTicks) <= 15000000 && elapsed > 250;
			if (!isSettled && (seekCommitTimer !== null || seekInFlightWaitTimer !== null || elapsed < 2200)) {
				curTicks = pendingSeekTargetTicks;
			} else {
				pendingSeekTargetTicks = null;
			}
		}

		const curSecs = curTicks / 10000000;
		const durSecs = durTicks / 10000000;
		const pct = durTicks > 0 ? Math.max(0, Math.min(100, (curTicks / durTicks) * 100)) : 0;
		return { curTicks, durTicks, curSecs, durSecs, pct };
	}

	function updateVolumeButtonIcon(customBar, volPct, isMuted) {
		if (!customBar) return;
		const volBtn = customBar.querySelector('.abyss-btn-vol');
		if (!volBtn) return;
		const muted = isMuted || volPct <= 0;
		const desiredState = muted ? 'muted' : (volPct < 50 ? 'low' : 'high');
		if (volBtn.dataset.iconState === desiredState) return;
		volBtn.dataset.iconState = desiredState;
		if (muted) {
			volBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
		} else if (volPct < 50) {
			volBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`;
		} else {
			volBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
		}
	}

	function getCustomBarRefs(customBar) {
		if (!customBar) return null;
		if (!customBar._refs) {
			customBar._refs = {
				timeCurr: customBar.querySelector('.abyss-time-curr'),
				timeRem: customBar.querySelector('.abyss-time-rem'),
				fill: customBar.querySelector('.abyss-seekbar-fill'),
				knob: customBar.querySelector('.abyss-seekbar-knob'),
				seekInput: customBar.querySelector('.abyss-seekbar-input'),
				playIcon: customBar.querySelector('.abyss-icon-play'),
				pauseIcon: customBar.querySelector('.abyss-icon-pause'),
				volFill: customBar.querySelector('.abyss-vol-fill'),
				volKnob: customBar.querySelector('.abyss-vol-knob'),
				volInput: customBar.querySelector('.abyss-vol-input'),
				volBtn: customBar.querySelector('.abyss-btn-vol'),
				nativeStartTime: null,
				nativeEndTime: null,
				nativeSlider: null,
				nativePause: null
			};
		}
		return customBar._refs;
	}

	let isOsdSyncScheduled = false;
	function scheduleOsdSync() {
		if (isOsdSyncScheduled) return;
		isOsdSyncScheduled = true;
		requestAnimationFrame(() => {
			isOsdSyncScheduled = false;
			syncCustomOsdBarState();
		});
	}

	function syncCustomOsdBarState() {
		const customBar = document.querySelector('.abyss-custom-osd-bar');
		if (!customBar) return;
		const refs = getCustomBarRefs(customBar);
		if (!refs) return;

		const pm = getInternalPlaybackManager();
		const v = boundVideoEl || getMainPlayerVideo();

		// 1. Time & Seek sync
		if (!isDraggingSeek) {
			const { curSecs, durSecs, pct } = getPlayerTiming();
			if (durSecs > 0) {
				const curTimeText = formatTime(curSecs);
				const remTimeText = '-' + formatTime(Math.max(0, durSecs - curSecs));
				if (refs.timeCurr && refs.timeCurr._lastVal !== curTimeText) {
					refs.timeCurr.textContent = curTimeText;
					refs.timeCurr._lastVal = curTimeText;
				}
				if (refs.timeRem && refs.timeRem._lastVal !== remTimeText) {
					refs.timeRem.textContent = remTimeText;
					refs.timeRem._lastVal = remTimeText;
				}
				const pctFixed = Math.round(pct * 10) / 10;
				if (refs.fill && refs.fill._lastPct !== pctFixed) {
					refs.fill.style.width = pctFixed + '%';
					refs.fill._lastPct = pctFixed;
				}
				if (refs.knob && refs.knob._lastPct !== pctFixed) {
					refs.knob.style.left = pctFixed + '%';
					refs.knob._lastPct = pctFixed;
				}
				if (refs.seekInput && document.activeElement !== refs.seekInput && refs.seekInput._lastPct !== pctFixed) {
					refs.seekInput.value = pctFixed;
					refs.seekInput._lastPct = pctFixed;
				}
			} else {
				if (!refs.nativeStartTime || !refs.nativeStartTime.isConnected) {
					refs.nativeStartTime = document.querySelector('#videoOsdPage .startTimeText, #videoOsdPage .osdPositionText, .videoOsdBottom .osdPositionText');
				}
				if (!refs.nativeEndTime || !refs.nativeEndTime.isConnected) {
					refs.nativeEndTime = document.querySelector('#videoOsdPage .endTimeText, #videoOsdPage .osdDurationText, .videoOsdBottom .osdDurationText');
				}
				if (!refs.nativeSlider || !refs.nativeSlider.isConnected) {
					refs.nativeSlider = document.querySelector('#videoOsdPage .osdPositionSlider, .videoOsdBottom .osdPositionSlider');
				}
				if (refs.nativeStartTime && refs.nativeStartTime.textContent && refs.timeCurr) {
					const txt = refs.nativeStartTime.textContent.trim();
					if (refs.timeCurr._lastVal !== txt) {
						refs.timeCurr.textContent = txt;
						refs.timeCurr._lastVal = txt;
					}
				}
				if (refs.nativeEndTime && refs.nativeEndTime.textContent && refs.timeRem) {
					const txt = refs.nativeEndTime.textContent.trim();
					if (refs.timeRem._lastVal !== txt) {
						refs.timeRem.textContent = txt;
						refs.timeRem._lastVal = txt;
					}
				}
				if (refs.nativeSlider && !isNaN(parseFloat(refs.nativeSlider.value))) {
					const sPct = parseFloat(refs.nativeSlider.value);
					if (refs.fill && refs.fill._lastPct !== sPct) {
						refs.fill.style.width = sPct + '%';
						refs.fill._lastPct = sPct;
					}
					if (refs.knob && refs.knob._lastPct !== sPct) {
						refs.knob.style.left = sPct + '%';
						refs.knob._lastPct = sPct;
					}
					if (refs.seekInput && document.activeElement !== refs.seekInput && refs.seekInput._lastPct !== sPct) {
						refs.seekInput.value = sPct;
						refs.seekInput._lastPct = sPct;
					}
				}
			}
		}

		// 2. Play/Pause state sync
		let isPaused = false;
		if (pm && typeof pm.paused === 'function') {
			isPaused = Boolean(pm.paused());
		} else if (v) {
			isPaused = Boolean(v.paused);
		} else {
			if (!refs.nativePause || !refs.nativePause.isConnected) {
				refs.nativePause = document.querySelector('#videoOsdPage .btnPause, .videoOsdBottom .btnPause');
			}
			if (refs.nativePause) {
				isPaused = refs.nativePause.querySelector('.play, .play_arrow') !== null || refs.nativePause.classList.contains('btnPlay');
			}
		}
		if (refs.playIcon && refs.pauseIcon && refs._lastPaused !== isPaused) {
			refs._lastPaused = isPaused;
			refs.playIcon.style.display = isPaused ? 'inline-block' : 'none';
			refs.pauseIcon.style.display = isPaused ? 'none' : 'inline-block';
		}

		// 3. Volume sync (lightweight cached check, cubic-curve accurate)
		if (!isDraggingVol) {
			const { volPct, isMuted } = getPlayerVolumeState();
			const roundedVol = Math.round(volPct);
			if (refs._lastVolPct !== roundedVol || refs._lastMuted !== isMuted) {
				applyVolumeUIPct(customBar, roundedVol, isMuted);
			}
		}
	}

	let jmpSyncInterval = null;
	function startJmpSyncLoop() {
		if (jmpSyncInterval) return;
		jmpSyncInterval = setInterval(() => {
			if (!isVideoOsdPageActive()) {
				clearInterval(jmpSyncInterval);
				jmpSyncInterval = null;
				return;
			}
			scheduleOsdSync();
		}, 350);
	}

	function bindVideoEvents() {
		const isJmpNativeOnly = Boolean(window.api && window.api.player) && !getMainPlayerVideo();
		if (isJmpNativeOnly) {
			startJmpSyncLoop();
		} else if (jmpSyncInterval) {
			clearInterval(jmpSyncInterval);
			jmpSyncInterval = null;
		}

		const v = getMainPlayerVideo();
		if (!v) {
			boundVideoEl = null;
			scheduleOsdSync();
			return;
		}
		if (boundVideoEl === v) return;
		boundVideoEl = v;

		v.addEventListener('timeupdate', scheduleOsdSync, { passive: true });
		v.addEventListener('play', scheduleOsdSync, { passive: true });
		v.addEventListener('pause', scheduleOsdSync, { passive: true });
		v.addEventListener('playing', scheduleOsdSync, { passive: true });
		v.addEventListener('seeking', scheduleOsdSync, { passive: true });
		v.addEventListener('seeked', () => {
			scheduleOsdSync();
			if (seekSessionWasPlaying) {
				ensurePlaybackResumesAfterSeek();
			}
		}, { passive: true });
		v.addEventListener('waiting', scheduleOsdSync, { passive: true });
		v.addEventListener('canplay', () => {
			scheduleOsdSync();
			if (seekSessionWasPlaying) {
				ensurePlaybackResumesAfterSeek();
			}
		}, { passive: true });
		v.addEventListener('volumechange', scheduleOsdSync, { passive: true });
		v.addEventListener('durationchange', scheduleOsdSync, { passive: true });
		v.addEventListener('loadedmetadata', scheduleOsdSync, { passive: true });

		scheduleOsdSync();
	}

	function applyImmediateSeekBarUI(targetTicks, durTicks) {
		const customBar = document.querySelector('.abyss-custom-osd-bar');
		if (!customBar || !(durTicks > 0)) return;
		const refs = getCustomBarRefs(customBar);
		if (!refs) return;
		const clampedTicks = Math.max(0, Math.min(durTicks, targetTicks));
		const pct = (clampedTicks / durTicks) * 100;
		const curSecs = clampedTicks / 10000000;
		const durSecs = durTicks / 10000000;

		const curTimeText = formatTime(curSecs);
		const remTimeText = '-' + formatTime(Math.max(0, durSecs - curSecs));
		const pctFixed = Math.round(pct * 10) / 10;

		if (refs.timeCurr) refs.timeCurr.textContent = curTimeText;
		if (refs.timeRem) refs.timeRem.textContent = remTimeText;
		if (refs.fill) refs.fill.style.width = pctFixed + '%';
		if (refs.knob) refs.knob.style.left = pctFixed + '%';
		if (refs.seekInput) refs.seekInput.value = pctFixed;
	}

	let resumeAfterSeekTimer1 = null;
	let resumeAfterSeekTimer2 = null;
	function ensurePlaybackResumesAfterSeek() {
		clearTimeout(resumeAfterSeekTimer1);
		clearTimeout(resumeAfterSeekTimer2);

		const attemptResume = (isFinalAttempt) => {
			if (!isVideoOsdPageActive()) {
				seekSessionActive = false;
				seekSessionWasPlaying = false;
				return;
			}
			const v = getMainPlayerVideo();
			const pm = getInternalPlaybackManager();
			if (seekSessionWasPlaying) {
				if (v && v.paused && !v.ended && !v.seeking) {
					const playPromise = v.play();
					if (playPromise && typeof playPromise.catch === 'function') {
						playPromise.catch(() => {
							if (pm && typeof pm.unpause === 'function') {
								try { pm.unpause(); } catch (e) { }
							}
						});
					}
				} else if (!v && pm && typeof pm.paused === 'function' && pm.paused()) {
					if (typeof pm.unpause === 'function') {
						try { pm.unpause(); } catch (e) { }
					}
				}
			}
			if (isFinalAttempt && !seekCommitTimer && !seekInFlightWaitTimer) {
				seekSessionActive = false;
				seekSessionWasPlaying = false;
				accumulatedSeekDeltaSecs = 0;
			}
			scheduleOsdSync();
		};

		resumeAfterSeekTimer1 = setTimeout(() => attemptResume(false), 90);
		resumeAfterSeekTimer2 = setTimeout(() => attemptResume(true), 420);
	}

	function executeRawPlayerSeek(targetTicks) {
		const v = getMainPlayerVideo();
		const pm = getInternalPlaybackManager();
		lastRawSeekExecTime = Date.now();
		lastManualSeekTime = lastRawSeekExecTime;
		pendingSeekTargetTicks = targetTicks;

		if (pm && typeof pm.seek === 'function') {
			try {
				pm.seek(targetTicks);
			} catch (e) {
				if (v && Number.isFinite(v.duration) && v.duration > 0) {
					v.currentTime = Math.max(0, Math.min(v.duration, targetTicks / 10000000));
				}
			}
		} else if (v) {
			const targetSecs = targetTicks / 10000000;
			const maxDur = (Number.isFinite(v.duration) && v.duration > 0) ? v.duration : 999999;
			v.currentTime = Math.max(0, Math.min(maxDur, targetSecs));
		}

		ensurePlaybackResumesAfterSeek();
	}

	function commitPlayerSeek(targetTicks, debounceMs = 0) {
		if (!seekSessionActive) {
			seekSessionActive = true;
			seekSessionWasPlaying = isVideoCurrentlyPlaying();
		}
		lastManualSeekTime = Date.now();
		pendingSeekTargetTicks = targetTicks;

		clearTimeout(seekCommitTimer);
		clearTimeout(seekInFlightWaitTimer);
		seekCommitTimer = null;
		seekInFlightWaitTimer = null;

		const runOrQueue = () => {
			seekCommitTimer = null;
			const v = getMainPlayerVideo();
			const targetToApply = pendingSeekTargetTicks !== null ? pendingSeekTargetTicks : targetTicks;

			// If the browser video element is still actively seeking from an earlier request (<450ms ago),
			// wait briefly for it to settle so we don't stack overlapping HTTP Range requests and stall the decoder.
			if (v && v.seeking && (Date.now() - lastRawSeekExecTime) < 450) {
				const onFinishedPrevSeek = () => {
					clearTimeout(seekInFlightWaitTimer);
					seekInFlightWaitTimer = null;
					v.removeEventListener('seeked', onFinishedPrevSeek);
					const latestTarget = pendingSeekTargetTicks !== null ? pendingSeekTargetTicks : targetToApply;
					executeRawPlayerSeek(latestTarget);
				};
				v.addEventListener('seeked', onFinishedPrevSeek, { once: true, passive: true });
				seekInFlightWaitTimer = setTimeout(() => {
					seekInFlightWaitTimer = null;
					v.removeEventListener('seeked', onFinishedPrevSeek);
					const latestTarget = pendingSeekTargetTicks !== null ? pendingSeekTargetTicks : targetToApply;
					executeRawPlayerSeek(latestTarget);
				}, 280);
				return;
			}

			executeRawPlayerSeek(targetToApply);
		};

		if (debounceMs > 0) {
			seekCommitTimer = setTimeout(runOrQueue, debounceMs);
		} else {
			runOrQueue();
		}
	}

	function doSeek(pct) {
		const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
		const v = getMainPlayerVideo();
		const pm = getInternalPlaybackManager();
		const { durTicks } = getPlayerTiming();

		if (durTicks > 0) {
			const targetTicks = Math.round((clamped / 100) * durTicks);
			lastManualSeekTime = Date.now();
			pendingSeekTargetTicks = targetTicks;
			applyImmediateSeekBarUI(targetTicks, durTicks);
			commitPlayerSeek(targetTicks, 0);
			return;
		}

		if (pm && typeof pm.seekPercent === 'function') {
			lastManualSeekTime = Date.now();
			pm.seekPercent(clamped);
			ensurePlaybackResumesAfterSeek();
			return;
		}

		if (v && Number.isFinite(v.duration) && v.duration > 0) {
			v.currentTime = (clamped / 100) * v.duration;
			ensurePlaybackResumesAfterSeek();
		}
	}

	function doSeekDelta(deltaSecs) {
		const now = Date.now();
		if (!seekSessionActive) {
			seekSessionActive = true;
			seekSessionWasPlaying = isVideoCurrentlyPlaying();
			accumulatedSeekDeltaSecs = 0;
		} else if ((now - lastManualSeekTime) > 600 || (accumulatedSeekDeltaSecs !== 0 && Math.sign(deltaSecs) !== Math.sign(accumulatedSeekDeltaSecs))) {
			accumulatedSeekDeltaSecs = 0;
		}
		accumulatedSeekDeltaSecs += deltaSecs;

		const deltaTicks = Math.round(deltaSecs * 10000000);
		const { curTicks, durTicks } = getPlayerTiming();

		const maxTicks = durTicks > 0 ? durTicks : 999999999999;
		const targetTicks = Math.max(0, Math.min(maxTicks, curTicks + deltaTicks));
		lastManualSeekTime = Date.now();
		pendingSeekTargetTicks = targetTicks;

		if (durTicks > 0) {
			applyImmediateSeekBarUI(targetTicks, durTicks);
		}

		const displayDelta = accumulatedSeekDeltaSecs || deltaSecs;
		const sign = displayDelta >= 0 ? '+' : '';
		const iconSvg = displayDelta >= 0
			? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>'
			: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>';
		showPlayerToastHUD(iconSvg, sign + Math.round(displayDelta) + 's (' + formatTime(targetTicks / 10000000) + ')');

		// Coalesce rapid consecutive skip button clicks (110ms) into a single clean stream seek
		commitPlayerSeek(targetTicks, 110);
	}

	function syncOsdHeaderVisibility() {
		const mainHeader = document.querySelector('.skinHeader');
		if (!isVideoOsdPageActive()) {
			if (document.body.classList.contains('abyss-video-playing')) {
				document.body.classList.remove('abyss-video-playing');
			}
			if (document.body.classList.contains('abyss-osd-hidden')) {
				document.body.classList.remove('abyss-osd-hidden');
			}
			if (document.body.classList.contains('videoPlayerPage')) {
				document.body.classList.remove('videoPlayerPage');
			}
			if (document.body.classList.contains('is-video-playing') && !document.querySelector('.abyss-trailer-player-overlay')) {
				document.body.classList.remove('is-video-playing');
			}
			if (mainHeader) {
				if (mainHeader.classList.contains('osdHeader')) mainHeader.classList.remove('osdHeader');
				if (mainHeader.classList.contains('osdHeader-hidden')) mainHeader.classList.remove('osdHeader-hidden');
				if (mainHeader.classList.contains('hide')) mainHeader.classList.remove('hide');
			}
			return;
		}

		if (!document.body.classList.contains('abyss-video-playing')) {
			document.body.classList.add('abyss-video-playing');
		}

		const osdBottom = document.querySelector('#videoOsdPage .videoOsdBottom, .videoOsdBottom');
		const isBottomHidden = Boolean(
			osdBottom && (
				osdBottom.classList.contains('videoOsdBottom-hidden') ||
				osdBottom.classList.contains('osd-hidden') ||
				osdBottom.classList.contains('hide')
			)
		);
		const isHeaderHidden = Boolean(
			mainHeader && mainHeader.classList.contains('osdHeader-hidden')
		);
		const shouldHideHeader = osdBottom ? isBottomHidden : isHeaderHidden;

		if (document.body.classList.contains('abyss-osd-hidden') !== shouldHideHeader) {
			document.body.classList.toggle('abyss-osd-hidden', shouldHideHeader);
		}

		if (mainHeader) {
			if (!mainHeader.classList.contains('osdHeader')) {
				mainHeader.classList.add('osdHeader');
			}
			if (shouldHideHeader) {
				if (!mainHeader.classList.contains('osdHeader-hidden')) {
					mainHeader.classList.add('osdHeader-hidden');
				}
			} else {
				if (mainHeader.classList.contains('osdHeader-hidden')) {
					mainHeader.classList.remove('osdHeader-hidden');
				}
				if (mainHeader.classList.contains('hide')) {
					mainHeader.classList.remove('hide');
				}
			}
		}

		if (shouldHideHeader) {
			closeMobileHeaderMenu();
		}
	}

	function applyExactVideoPlayerDesign() {
		const active = isVideoOsdPageActive();
		syncOsdHeaderVisibility();
		if (!active) return;

		// Ensure any background hero theme video/audio is completely stopped while the main player is active
		if (document.querySelector('.hero-theme-video, .hero-theme-iframe') || isJmpMpvHeroPlaying) {
			stopHeroThemeMedia();
		}

		const osdBottom = document.querySelector('.videoOsdBottom, #videoOsdPage .videoOsdBottom, .videoOsBottom');
		if (!osdBottom) return;

		let customBar = osdBottom.querySelector('.abyss-custom-osd-bar');
		if (customBar) {
			bindVideoEvents();
			return;
		}

		if (!customBar) {
			customBar = document.createElement('div');
			customBar.className = 'abyss-custom-osd-bar';
			customBar.innerHTML = `
				<div class="abyss-seekbar-container">
					<span class="abyss-time-curr">0:00</span>
					<div class="abyss-seekbar-track">
						<div class="abyss-seekbar-fill" style="width: 0%;"></div>
						<div class="abyss-seekbar-knob" style="left: 0%;"></div>
						<input type="range" class="abyss-seekbar-input" min="0" max="100" value="0" step="0.1">
					</div>
					<span class="abyss-time-rem">-0:00</span>
				</div>
				<div class="abyss-controls-row">
					<div class="abyss-grp-left">
						<button class="abyss-btn abyss-btn-fav" type="button" title="Favorite">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-sub" type="button" title="Subtitles">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-aud" type="button" title="Audio">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-vol" type="button" title="Volume">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
						</button>
						<div class="abyss-vol-slider-wrap" title="Scroll or drag to adjust volume">
							<div class="abyss-vol-fill" style="width: 100%;"></div>
							<div class="abyss-vol-knob" style="left: 100%;"></div>
							<input type="range" class="abyss-vol-input" min="0" max="100" step="1" value="100">
						</div>
					</div>
					<div class="abyss-grp-center">
						<button class="abyss-btn abyss-btn-prev" type="button" title="Previous">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-rew" type="button" title="Rewind 10s">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-fastrew" type="button" title="Fast Rewind 30s">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
						</button>
						<button class="abyss-btn-playpause-circle" type="button" title="Play/Pause">
							<svg class="abyss-icon-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
							<svg class="abyss-icon-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-fastfwd" type="button" title="Fast Forward 30s">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-fwd" type="button" title="Forward 10s">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-next" type="button" title="Next">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
						</button>
					</div>
					<div class="abyss-grp-right">
						<button class="abyss-btn abyss-btn-pip" type="button" title="Picture in Picture">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-aspect" type="button" title="Aspect Ratio">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-fs" type="button" title="Fullscreen">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
						</button>
						<button class="abyss-btn abyss-btn-sett" type="button" title="Settings">
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
						</button>
					</div>
				</div>
			`;

			const osdControls = osdBottom.querySelector('.osdControls') || osdBottom;
			osdControls.appendChild(customBar);

			const vid = () => getMainPlayerVideo();

			// Play / Pause Toggle
			customBar.querySelector('.abyss-btn-playpause-circle').addEventListener('click', togglePlayPauseAction);

			const seekInput = customBar.querySelector('.abyss-seekbar-input');
			const fill = customBar.querySelector('.abyss-seekbar-fill');
			const knob = customBar.querySelector('.abyss-seekbar-knob');
			const timeCurr = customBar.querySelector('.abyss-time-curr');
			const timeRem = customBar.querySelector('.abyss-time-rem');

			const updateSeekUI = (valPct) => {
				const clamped = Math.max(0, Math.min(100, Number(valPct) || 0));
				if (fill) fill.style.width = clamped + '%';
				if (knob) knob.style.left = clamped + '%';
				if (seekInput) seekInput.value = clamped;
				const { durSecs } = getPlayerTiming();
				if (durSecs > 0) {
					const targetSecs = (clamped / 100) * durSecs;
					if (timeCurr) timeCurr.textContent = formatTime(targetSecs);
					if (timeRem) timeRem.textContent = '-' + formatTime(Math.max(0, durSecs - targetSecs));
				}
			};

			if (seekInput && !seekInput.dataset.bound) {
				seekInput.dataset.bound = 'true';
				let lastSeekCommitTime = 0;

				const onSeekStart = () => {
					if (!seekSessionActive) {
						seekSessionActive = true;
						seekSessionWasPlaying = isVideoCurrentlyPlaying();
					}
					isDraggingSeek = true;
				};

				const onSeekMove = (e) => {
					isDraggingSeek = true;
					const val = parseFloat(e.target.value);
					updateSeekUI(val);
				};

				const onSeekEnd = () => {
					const now = Date.now();
					isDraggingSeek = false;
					if (typeof seekInput.blur === 'function') seekInput.blur();
					if (now - lastSeekCommitTime < 150) return;
					lastSeekCommitTime = now;
					const val = parseFloat(seekInput.value);
					updateSeekUI(val);
					doSeek(val);
				};

				seekInput.addEventListener('pointerdown', onSeekStart);
				seekInput.addEventListener('mousedown', onSeekStart);
				seekInput.addEventListener('touchstart', onSeekStart, { passive: true });

				seekInput.addEventListener('input', onSeekMove);
				seekInput.addEventListener('change', onSeekEnd);
				seekInput.addEventListener('pointerup', onSeekEnd);
				seekInput.addEventListener('mouseup', onSeekEnd);
				seekInput.addEventListener('touchend', onSeekEnd);
			}

			// Volume Slider: 1%-step precision + exact pointer coordinate tracking + mouse wheel scrolling
			const volWrap = customBar.querySelector('.abyss-vol-slider-wrap');
			const volInput = customBar.querySelector('.abyss-vol-input');
			const btnVol = customBar.querySelector('.abyss-btn-vol');

			const computeVolPctFromClientX = (clientX) => {
				if (!volWrap) return null;
				const rect = volWrap.getBoundingClientRect();
				if (!(rect.width > 0)) return null;
				const rawRatio = (clientX - rect.left) / rect.width;
				return Math.max(0, Math.min(100, Math.round(rawRatio * 100)));
			};

			if (volWrap && !volWrap.dataset.bound) {
				volWrap.dataset.bound = 'true';
				let activeVolPointerId = null;

				const applyPointerVolume = (clientX, showHud = true) => {
					const pct = computeVolPctFromClientX(clientX);
					if (pct === null) return;
					setPlayerVolumePct(pct, showHud, customBar);
				};

				volWrap.addEventListener('pointerdown', (e) => {
					if (e.button !== undefined && e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					isDraggingVol = true;
					activeVolPointerId = e.pointerId;
					if (typeof volWrap.setPointerCapture === 'function') {
						try { volWrap.setPointerCapture(e.pointerId); } catch (err) { }
					}
					applyPointerVolume(e.clientX, true);
				});

				volWrap.addEventListener('pointermove', (e) => {
					if (!isDraggingVol) return;
					if (activeVolPointerId !== null && e.pointerId !== activeVolPointerId) return;
					e.preventDefault();
					e.stopPropagation();
					applyPointerVolume(e.clientX, true);
				});

				const finishVolPointer = (e) => {
					if (!isDraggingVol) return;
					if (activeVolPointerId !== null && e.pointerId !== undefined && e.pointerId !== activeVolPointerId) return;
					if (activeVolPointerId !== null && typeof volWrap.releasePointerCapture === 'function') {
						try { volWrap.releasePointerCapture(activeVolPointerId); } catch (err) { }
					}
					activeVolPointerId = null;
					isDraggingVol = false;
					if (volInput && typeof volInput.blur === 'function') volInput.blur();
				};

				volWrap.addEventListener('pointerup', finishVolPointer);
				volWrap.addEventListener('pointercancel', finishVolPointer);

				// Fallback native range input listener (e.g. keyboard accessibility or synthetic input events)
				if (volInput) {
					volInput.addEventListener('input', (e) => {
						e.stopPropagation();
						const rawVal = parseFloat(e.target.value);
						if (!Number.isFinite(rawVal)) return;
						const pct = rawVal <= 1 && e.target.max === '1' ? Math.round(rawVal * 100) : Math.round(rawVal);
						setPlayerVolumePct(pct, true, customBar);
					});
					volInput.addEventListener('change', (e) => {
						e.stopPropagation();
						isDraggingVol = false;
						if (typeof volInput.blur === 'function') volInput.blur();
					});
				}

				// Mouse wheel scrolling on volume slider AND volume button
				const onVolumeWheel = (e) => {
					e.preventDefault();
					e.stopPropagation();
					const deltaY = e.deltaY !== undefined ? e.deltaY : -(e.wheelDelta || 0);
					if (deltaY === 0) return;
					const step = deltaY < 0 ? 5 : -5;
					const { volPct, isMuted } = getPlayerVolumeState();
					const basePct = isMuted ? 0 : volPct;
					const nextPct = Math.max(0, Math.min(100, basePct + step));
					setPlayerVolumePct(nextPct, true, customBar);
				};

				volWrap.addEventListener('wheel', onVolumeWheel, { passive: false });
				if (btnVol) {
					btnVol.addEventListener('wheel', onVolumeWheel, { passive: false });
				}
			}

			// Left Group Actions
			const btnSub = customBar.querySelector('.abyss-btn-sub');
			btnSub.addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				triggerNativeMenu(['#videoOsdPage .btnSubtitles', '.videoOsdBottom .btnSubtitles', '.btnSubtitles', '.btnAudioSubtitles', '[data-action="subtitles"]', '.btnSubtitleSettings', '.videoOsdHeader .btnSubtitles'], btnSub);
			});

			const btnAud = customBar.querySelector('.abyss-btn-aud');
			btnAud.addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				triggerNativeMenu(['#videoOsdPage .btnAudio', '.videoOsdBottom .btnAudio', '.btnAudio', '.btnAudioTracks', '[data-action="audio"]', '.videoOsdHeader .btnAudio'], btnAud);
			});

			if (btnVol) {
				btnVol.addEventListener('click', (e) => {
					e.preventDefault(); e.stopPropagation();
					const v = vid();
					const pm = getInternalPlaybackManager();
					const { volPct, rawVolPct, isMuted } = getPlayerVolumeState();
					const currentlyMuted = isMuted || volPct <= 0;

					if (currentlyMuted) {
						const restorePct = (lastNonZeroVolPct > 0 ? lastNonZeroVolPct : (rawVolPct > 0 ? rawVolPct : 100));
						setPlayerVolumePct(restorePct, true, customBar);
					} else {
						if (volPct > 0) lastNonZeroVolPct = volPct;
						if (pm && typeof pm.setMute === 'function') {
							try { pm.setMute(true); } catch (err) { }
						}
						if (v) v.muted = true;
						applyVolumeUIPct(customBar, 0, true);
						showPlayerToastHUD(getVolumeToastIconSvg(0, true), 'Muted');
					}
				});
			}

			// Center Group Actions
			customBar.querySelector('.abyss-btn-prev').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				const pm = getInternalPlaybackManager();
				const nativePrevTrack = document.querySelector('#videoOsdPage .btnPreviousTrack:not(.hide):not([disabled])');
				if (nativePrevTrack || (pm && typeof pm.getCurrentPlaylistIndex === 'function' && pm.getCurrentPlaylistIndex() > 0)) {
					if (pm && typeof pm.previousTrack === 'function') {
						pm.previousTrack();
						return;
					}
					if (clickNativePlayerButton(['#videoOsdPage .btnPreviousTrack', '.btnPreviousTrack'])) return;
				}
				const item = getPlayerCurrentItem();
				if (item && Array.isArray(item.Chapters) && item.Chapters.length > 1 && pm && typeof pm.previousChapter === 'function') {
					pm.previousChapter();
					showPlayerToastHUD(`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`, 'Previous Chapter');
					return;
				}
				doSeek(0);
				showPlayerToastHUD(`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`, 'Restart (0:00)');
			});

			customBar.querySelector('.abyss-btn-rew').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				doSeekDelta(-10);
			});

			customBar.querySelector('.abyss-btn-fastrew').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				doSeekDelta(-30);
			});

			customBar.querySelector('.abyss-btn-fastfwd').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				doSeekDelta(30);
			});

			customBar.querySelector('.abyss-btn-fwd').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				doSeekDelta(10);
			});

			customBar.querySelector('.abyss-btn-next').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				const pm = getInternalPlaybackManager();
				const nativeNextTrack = document.querySelector('#videoOsdPage .btnNextTrack:not(.hide):not([disabled])');
				if (nativeNextTrack) {
					if (pm && typeof pm.nextTrack === 'function') {
						pm.nextTrack();
						return;
					}
					if (clickNativePlayerButton(['#videoOsdPage .btnNextTrack', '.btnNextTrack'])) return;
				}
				const item = getPlayerCurrentItem();
				if (item && Array.isArray(item.Chapters) && item.Chapters.length > 1 && pm && typeof pm.nextChapter === 'function') {
					pm.nextChapter();
					showPlayerToastHUD(`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`, 'Next Chapter');
					return;
				}
				doSeekDelta(60);
			});

			// Right Group Actions: Minimize / Picture in Picture
			customBar.querySelector('.abyss-btn-pip').addEventListener('click', async (e) => {
				e.preventDefault(); e.stopPropagation();
				const v = vid();
				const pm = getInternalPlaybackManager();

				if (document.pictureInPictureElement) {
					try { await document.exitPictureInPicture(); return; } catch (err) {}
				}
				if (v && typeof v.requestPictureInPicture === 'function') {
					try { await v.requestPictureInPicture(); return; } catch (err) {}
				}
				if (v && typeof v.webkitSetPresentationMode === 'function') {
					try {
						const nextMode = v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
						v.webkitSetPresentationMode(nextMode);
						return;
					} catch (err) {}
				}

				const nativeClicked = clickNativePlayerButton(['#videoOsdPage .btnPip:not(.hide)', '.videoOsdHeader .btnPip:not(.hide)', '.btnPip:not(.hide)']);
				if (nativeClicked) return;

				if (pm && typeof pm.togglePictureInPicture === 'function') {
					try {
						const player = (typeof pm.getCurrentPlayer === 'function' ? pm.getCurrentPlayer() : null) || pm._currentPlayer;
						pm.togglePictureInPicture(player);
						return;
					} catch (err) {}
				}
			});

			const aspectModes = [
				{ id: 'auto', css: 'contain', label: 'Aspect Ratio: Fit (Auto)' },
				{ id: 'cover', css: 'cover', label: 'Aspect Ratio: Cover (Zoom)' },
				{ id: 'fill', css: 'fill', label: 'Aspect Ratio: Fill (Stretch)' }
			];
			let currentAspectIndex = 0;

			const btnAspect = customBar.querySelector('.abyss-btn-aspect');
			btnAspect.addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				const pm = getInternalPlaybackManager();
				const v = vid();

				if (pm && typeof pm.getAspectRatio === 'function') {
					const curId = pm.getAspectRatio();
					const foundIdx = aspectModes.findIndex(m => m.id === curId);
					if (foundIdx !== -1) currentAspectIndex = foundIdx;
				} else if (v) {
					const curAttr = v.getAttribute('data-abyss-aspect') || 'contain';
					const foundIdx = aspectModes.findIndex(m => m.css === curAttr);
					if (foundIdx !== -1) currentAspectIndex = foundIdx;
				}

				currentAspectIndex = (currentAspectIndex + 1) % aspectModes.length;
				const nextMode = aspectModes[currentAspectIndex];

				if (pm && typeof pm.setAspectRatio === 'function') {
					try { pm.setAspectRatio(nextMode.id); } catch (err) {}
				}
				if (v) {
					v.setAttribute('data-abyss-aspect', nextMode.css);
					v.style.setProperty('object-fit', nextMode.css, 'important');
				}

				showPlayerToastHUD(
					`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>`,
					nextMode.label
				);
			});

			customBar.querySelector('.abyss-btn-fs').addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();

				// 1. Try native Jellyfin fullscreen button
				const nativeClicked = clickNativePlayerButton([
					'#videoOsdPage .btnFullscreen',
					'.videoOsdBottom .btnFullscreen',
					'.btnFullscreen',
					'.btnToggleFullscreen',
					'button[data-action="fullscreen"]',
					'.videoOsdHeader .btnFullscreen'
				]);
				if (nativeClicked) return;

				// 2. Try Jellyfin internal playback manager
				const pm = getInternalPlaybackManager();
				if (pm && typeof pm.toggleFullscreen === 'function') {
					try {
						pm.toggleFullscreen();
						return;
					} catch (err) {}
				}

				// 3. Fallback to document-level fullscreen (never isolate #videoOsdPage as video element is outside it)
				if (document.fullscreenElement || document.webkitFullscreenElement) {
					const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
					if (exitFn) exitFn.call(document).catch(() => {});
				} else {
					const docEl = document.documentElement;
					const reqFn = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
					if (reqFn) reqFn.call(docEl).catch(() => {});
				}
			});

			const btnSett = customBar.querySelector('.abyss-btn-sett');
			btnSett.addEventListener('click', (e) => {
				e.preventDefault(); e.stopPropagation();
				triggerNativeMenu(['#videoOsdPage .btnVideoOsdSettings', '.videoOsdBottom .btnVideoOsdSettings', '.btnVideoOsdSettings', '.btnSettings', '.btnOsdSettings', '[data-action="settings"]', '#videoOsdPage .btnSettings', '.videoOsdHeader .btnSettings'], btnSett);
			});
		}

		// Hide volume slider only on true small-screen mobile devices (keep visible on desktop/laptops)
		const volWrapEl = customBar.querySelector('.abyss-vol-slider-wrap');
		if (volWrapEl) {
			if (detectMobileMode() && window.innerWidth <= 768) {
				volWrapEl.style.setProperty('display', 'none', 'important');
			} else {
				volWrapEl.style.removeProperty('display');
			}
		}

		// Ensure Favorite click and state sync run
		const favBtn = customBar.querySelector('.abyss-btn-fav');
		if (favBtn && !favBtn.dataset.bound) {
			favBtn.dataset.bound = 'true';
			favBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				togglePlayerFavorite(customBar);
			};
		}
		syncPlayerFavorite(customBar);

		// Bind frame-accurate video element listeners
		bindVideoEvents();
	}

	function applyCompactTopHeader() {
		syncOsdHeaderVisibility();
		const mainHeader = document.querySelector('.skinHeader');
		if (mainHeader) {
			mainHeader.style.removeProperty('transform');
			mainHeader.style.removeProperty('transform-origin');
		}
		if (!isVideoOsdPageActive()) {
			return;
		}

		const titleEls = document.querySelectorAll('#videoOsdPage .osdTitle, #videoOsdPage .headerTitle, .videoOsdHeader .osdTitle, .skinHeader.osdHeader .pageTitle');
		titleEls.forEach(el => {
			el.style.setProperty('font-size', '14px', 'important');
		});
	}

	let __abyssBrightnessVal = 1.0;
	let __abyssDocTouchWakeupBound = false;

	function initMobileVideoGestures() {
		if (!isVideoOsdPageActive()) return;

		// Document-level capture fallback so touching ANYWHERE on the screen (including .videoPlayerContainer or <video>)
		// while the video player is active and OSD is hidden wakes up the OSD bar and header.
		if (!__abyssDocTouchWakeupBound) {
			__abyssDocTouchWakeupBound = true;
			const onDocVideoWakeup = (e) => {
				if (!isVideoOsdPageActive()) return;
				if (!isVideoOsdCurrentlyHidden()) return;
				const target = e.target;
				if (target && target.closest && target.closest('button, input, select, a, .abyss-custom-osd-bar, .dialog, .actionSheet')) {
					return;
				}
				wakeUpVideoOsd();
			};
			document.addEventListener('touchstart', onDocVideoWakeup, { capture: true, passive: true });
			document.addEventListener('pointerdown', (e) => {
				if (e.pointerType === 'touch' || e.pointerType === 'pen' || window.innerWidth <= 900) {
					onDocVideoWakeup(e);
				}
			}, { capture: true, passive: true });
			document.addEventListener('click', (e) => {
				if (window.innerWidth <= 900 || ('ontouchstart' in window)) {
					onDocVideoWakeup(e);
				}
			}, { capture: true, passive: true });
		}

		const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 768);
		if (!isTouch) return;

		const videoContainer = document.querySelector('#videoOsdPage, .videoOsdPage');
		const video = () => getMainPlayerVideo();
		if (!videoContainer) return;

		if (videoContainer.dataset.abyssGesturesActive === 'true') return;
		videoContainer.dataset.abyssGesturesActive = 'true';

		let hud = document.getElementById('abyss-gesture-hud');
		if (!hud) {
			hud = document.createElement('div');
			hud.id = 'abyss-gesture-hud';
			hud.className = 'abyss-gesture-hud';
			hud.innerHTML = `<div class="abyss-hud-pill" id="abyss-hud-pill-content"></div>`;
			document.body.appendChild(hud);
		}

		let rippleContainer = document.getElementById('abyss-gesture-ripple-container');
		if (!rippleContainer) {
			rippleContainer = document.createElement('div');
			rippleContainer.id = 'abyss-gesture-ripple-container';
			rippleContainer.className = 'abyss-gesture-ripple-container';
			rippleContainer.innerHTML = `
					<div class="abyss-ripple-circle-box abyss-ripple-left-pos" id="abyss-ripple-left">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
						<span>-10s</span>
					</div>
					<div class="abyss-ripple-circle-box abyss-ripple-right-pos" id="abyss-ripple-right">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
						<span>+10s</span>
					</div>
				`;
			document.body.appendChild(rippleContainer);
		}

		const pillContent = document.getElementById('abyss-hud-pill-content');
		const rippleLeft = document.getElementById('abyss-ripple-left');
		const rippleRight = document.getElementById('abyss-ripple-right');

		let startX = 0, startY = 0;
		let initialVolPct = 100;
		let initialBright = __abyssBrightnessVal;
		let initialTime = 0;
		let currentSeekTargetTime = null;
		let singleTapWakeTimer = null;

		let gestureType = null;
		let isSwiping = false;
		let hudTimeout = null;

		let lastTapTime = 0;
		let lastTapX = 0;
		let lastTapY = 0;

		let isGestureDoubleTap = false;
		let resetDoubleTapTimer = null;

		const isInteractiveTarget = (target) => {
			if (!target) return false;
			return !!target.closest('button, input, select, a, .abyss-custom-osd-bar, .videoOsdHeader, .headerTop, .paper-icon-button-light');
		};

		const blockDblClickIfGesture = (e) => {
			if (isGestureDoubleTap) {
				e.preventDefault();
				e.stopPropagation();
				if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
				isGestureDoubleTap = false;
			}
		};

		videoContainer.addEventListener('dblclick', blockDblClickIfGesture, true);
		const vEl = video();
		if (vEl) vEl.addEventListener('dblclick', blockDblClickIfGesture, true);

		const showPillHUD = (html) => {
			clearTimeout(hudTimeout);
			pillContent.innerHTML = html;
			hud.classList.add('abyss-hud-visible');
			hudTimeout = setTimeout(() => {
				hud.classList.remove('abyss-hud-visible');
			}, 900);
		};

		const showVolumeHUD = (pct, isMuted) => {
			const p = Math.max(0, Math.min(100, Math.round(pct)));
			const iconSvg = isMuted || p === 0
				? `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`
				: (p < 50
					? `<svg viewBox="0 0 24 24"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`
					: `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L9 9H5zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`);

			showPillHUD(`
					<div class="abyss-hud-icon-wrap">${iconSvg}</div>
					<div class="abyss-hud-bar-bg"><div class="abyss-hud-bar-fill" style="width:${p}%;"></div></div>
					<div class="abyss-hud-val-text">${p}%</div>
				`);
		};

		const showBrightnessHUD = (pct) => {
			const p = Math.max(0, Math.min(100, Math.round(pct)));
			const iconSvg = `<svg viewBox="0 0 24 24"><path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`;

			showPillHUD(`
					<div class="abyss-hud-icon-wrap">${iconSvg}</div>
					<div class="abyss-hud-bar-bg"><div class="abyss-hud-bar-fill" style="width:${p}%;"></div></div>
					<div class="abyss-hud-val-text">${p}%</div>
				`);
		};

		const showSeekHUD = (targetTime, deltaSecs, duration) => {
			const sign = deltaSecs >= 0 ? '+' : '';
			const iconSvg = deltaSecs >= 0
				? `<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`
				: `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`;

			showPillHUD(`
					<div class="abyss-hud-icon-wrap">${iconSvg}</div>
					<div class="abyss-hud-seek-info">
						<span>${formatTime(targetTime)}</span>
						<span style="opacity:0.6;">/</span>
						<span style="opacity:0.8;">${formatTime(duration)}</span>
						<span class="abyss-hud-seek-delta">(${sign}${Math.round(deltaSecs)}s)</span>
					</div>
				`);
		};

		const triggerRipple = (side) => {
			const ripple = side === 'left' ? rippleLeft : rippleRight;
			if (!ripple) return;
			ripple.classList.remove('abyss-ripple-active');
			void ripple.offsetWidth;
			ripple.classList.add('abyss-ripple-active');
			setTimeout(() => {
				ripple.classList.remove('abyss-ripple-active');
			}, 450);
		};

		videoContainer.addEventListener('touchstart', (e) => {
			if (e.touches.length !== 1) return;
			if (isInteractiveTarget(e.target)) return;

			// Always ensure OSD wakes up when user touches the video screen while OSD is hidden
			if (isVideoOsdCurrentlyHidden()) {
				wakeUpVideoOsd();
			}

			const touch = e.touches[0];
			const v = video();
			const pm = getInternalPlaybackManager();
			const { curSecs } = getPlayerTiming();

			startX = touch.clientX;
			startY = touch.clientY;

			const volState = getPlayerVolumeState();
			initialVolPct = volState.isMuted ? 0 : volState.volPct;
			initialBright = __abyssBrightnessVal;
			initialTime = curSecs > 0 ? curSecs : ((v && Number.isFinite(v.currentTime) && v.currentTime > 0) ? v.currentTime : 0);
			currentSeekTargetTime = null;

			gestureType = null;
			isSwiping = false;
			clearTimeout(singleTapWakeTimer);

			const now = Date.now();
			const timeDiff = now - lastTapTime;
			const distDiff = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

			if (timeDiff < 320 && distDiff < 50) {
				isGestureDoubleTap = true;
				clearTimeout(resetDoubleTapTimer);
				resetDoubleTapTimer = setTimeout(() => { isGestureDoubleTap = false; }, 400);

				const rect = videoContainer.getBoundingClientRect();
				const relX = touch.clientX - rect.left;
				if (relX < rect.width * 0.35) {
					doSeekDelta(-10);
					triggerRipple('left');
					lastTapTime = 0;
					return;
				} else if (relX > rect.width * 0.65) {
					doSeekDelta(10);
					triggerRipple('right');
					lastTapTime = 0;
					return;
				} else {
					// Center double tap -> Toggle Play / Pause
					togglePlayPauseAction();
					const isPaused = (pm && typeof pm.paused === 'function') ? Boolean(pm.paused()) : (v ? v.paused : false);
					showPillHUD(`<div class="abyss-hud-icon-wrap">${isPaused ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>'}</div><div class="abyss-hud-val-text">${isPaused ? 'Pause' : 'Play'}</div>`);
					lastTapTime = 0;
					return;
				}
			}
			lastTapTime = now;
			lastTapX = touch.clientX;
			lastTapY = touch.clientY;
		}, { passive: true });

		videoContainer.addEventListener('touchmove', (e) => {
			if (e.touches.length !== 1) return;
			if (isInteractiveTarget(e.target)) return;

			const touch = e.touches[0];
			const deltaX = touch.clientX - startX;
			const deltaY = touch.clientY - startY;

			const rect = videoContainer.getBoundingClientRect();
			const relX = startX - rect.left;
			const v = video();

			if (!gestureType) {
				if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
					gestureType = relX > rect.width * 0.5 ? 'vol' : 'bright';
					isSwiping = true;
				} else if (Math.abs(deltaX) > 20 && Math.abs(deltaX) > Math.abs(deltaY)) {
					gestureType = 'seek';
					isSwiping = true;
				}
			}

			if (!isSwiping) return;

			if (gestureType === 'vol') {
				const changePct = (-deltaY / (rect.height || 300)) * 140;
				const newVolPct = Math.max(0, Math.min(100, Math.round(initialVolPct + changePct)));
				setPlayerVolumePct(newVolPct, false);
				showVolumeHUD(newVolPct, newVolPct === 0);
			} else if (gestureType === 'bright') {
				const change = (-deltaY / (rect.height || 300)) * 1.4;
				const newBright = Math.max(0.3, Math.min(1.8, initialBright + change));
				__abyssBrightnessVal = newBright;
				if (v) {
					v.style.setProperty('filter', `brightness(${newBright})`, 'important');
				}
				showBrightnessHUD(((newBright - 0.3) / 1.5) * 100);
			} else if (gestureType === 'seek') {
				const { durSecs, durTicks } = getPlayerTiming();
				const duration = durSecs > 0 ? durSecs : ((v && Number.isFinite(v.duration) && v.duration > 0) ? v.duration : 0);
				const deltaSecs = Math.round(deltaX * 0.35);
				const targetTime = Math.max(0, Math.min(duration || 999999, initialTime + deltaSecs));
				currentSeekTargetTime = targetTime;
				if (durTicks > 0) {
					applyImmediateSeekBarUI(Math.round(targetTime * 10000000), durTicks);
				}
				showSeekHUD(targetTime, targetTime - initialTime, duration || 0);
			}
		}, { passive: true });

		videoContainer.addEventListener('touchend', () => {
			if (gestureType === 'seek' && currentSeekTargetTime !== null) {
				const { durTicks } = getPlayerTiming();
				const targetTicks = Math.round(currentSeekTargetTime * 10000000);
				lastManualSeekTime = Date.now();
				pendingSeekTargetTicks = targetTicks;
				if (durTicks > 0) {
					applyImmediateSeekBarUI(targetTicks, durTicks);
				}
				commitPlayerSeek(targetTicks, 0);
			} else if (!isSwiping && !isGestureDoubleTap && isVideoOsdCurrentlyHidden()) {
				wakeUpVideoOsd();
			}

			gestureType = null;
			isSwiping = false;
			currentSeekTargetTime = null;
		}, { passive: true });
	}

	function detectMobileMode() {
		const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
		const isCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
		const isSmallScreen = window.innerWidth <= 900;
		const isMobile = isMobileUA || isSmallScreen || (isCoarsePointer && window.innerWidth <= 1024);
		if (isMobile) {
			document.body.classList.add('is-mobile-device');
		} else {
			document.body.classList.remove('is-mobile-device');
		}
		return isMobile;
	}

	function syncPageFavoriteButtons() {
		const itemId = window.__abyssCurrentPlayingMovieId ||
			(window.appRouter?.currentRouteInfo?.params?.id) ||
			(new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '').get('id'));

		if (itemId && window.__abyssFavoriteCache && window.__abyssFavoriteCache[itemId] !== undefined) {
			const isFav = window.__abyssFavoriteCache[itemId];
			const favBtns = document.querySelectorAll('#movie-btn-fav, .movie-btn-fav');
			favBtns.forEach(btn => {
				btn.setAttribute('data-is-fav', isFav ? 'true' : 'false');
				btn.classList.toggle('is-fav', isFav);
				btn.style.color = isFav ? '#ef4444' : '#ffffff';
				const svgIcon = btn.querySelector('svg');
				if (svgIcon) {
					svgIcon.setAttribute('fill', isFav ? '#ef4444' : 'none');
					svgIcon.setAttribute('stroke', isFav ? '#ef4444' : 'currentColor');
				}
				const textSpan = btn.querySelector('.btn-text');
				if (textSpan) {
					textSpan.innerText = isFav ? 'Favorited' : 'Add to Favorites';
				}
			});
		}
	}

	let lastIsHomeState = null;
	function syncHomeBackButton() {
		const activePage = document.querySelector('#indexPage:not(.hide), .homePage:not(.hide), #indexPage.pageContainer-active, .homePage.pageContainer-active, div[data-role="page"].homePage:not(.hide), div[data-type="home"]:not(.hide)');
		const isHomeRoute = (window.location.hash === '#/home.html' || window.location.hash === '#/index.html' || window.location.hash === '#/' || window.location.hash === '' || window.location.hash.startsWith('#/home')) ||
			(window.appRouter?.currentRouteInfo?.path === '/home.html' || window.appRouter?.currentRouteInfo?.name === 'home');

		const isHome = !!activePage || isHomeRoute;
		if (lastIsHomeState === isHome) return;
		lastIsHomeState = isHome;

		document.body.classList.toggle('is-home-page', isHome);
	}

	function runGlobalEnhancements() {
		detectMobileMode();
		setupMobileHeaderMenu();
		applyExactVideoPlayerDesign();
		applyCompactTopHeader();
		initMobileVideoGestures();
		syncPageFavoriteButtons();
		syncHomeBackButton();
	}

	// Global Capture Phase Delegation for Favorite Button
	document.addEventListener('click', (e) => {
		const btn = e.target.closest('#movie-btn-fav, .movie-btn-fav');
		if (btn) {
			e.preventDefault();
			e.stopPropagation();
			const itemId = window.__abyssCurrentPlayingMovieId ||
				(window.appRouter?.currentRouteInfo?.params?.id) ||
				(new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '').get('id'));
			if (itemId) {
				toggleFavorite(itemId, itemCache[itemId] || {}, btn, document);
			}
		}
	}, true);

	// Efficient debounced enhancer trigger
	let enhanceDebounceTimer = null;
	let pendingBypassCache = false;
	function triggerEnhance(bypassCache = false) {
		if (bypassCache === true) pendingBypassCache = true;
		clearTimeout(enhanceDebounceTimer);
		enhanceDebounceTimer = setTimeout(() => {
			const shouldBypass = pendingBypassCache;
			pendingBypassCache = false;
			enhanceMovieDetailsPage(shouldBypass);
			runGlobalEnhancements();
		}, 30);
	}

	// Safe Non-Blocking Event Listeners
	document.addEventListener('viewshow', () => triggerEnhance());
	document.addEventListener('pageshow', () => triggerEnhance());
	document.addEventListener('apiclientready', () => triggerEnhance());
	document.addEventListener('DOMContentLoaded', () => triggerEnhance());

	window.addEventListener('hashchange', () => {
		if (!window.location.hash.includes('details')) {
			stopHeroThemeMedia();
		}
		triggerEnhance();
		syncPageFavoriteButtons();
		setTimeout(triggerEnhance, 120);
	});

	window.addEventListener('load', () => {
		triggerEnhance();
		setTimeout(triggerEnhance, 200);
	});

	const abyssScriptEl = document.currentScript || document.querySelector('script[src*="movie-details.js"]');
	const abyssVersionMatch = (abyssScriptEl?.getAttribute('src') || '').match(/[?&]v=([^&#]+)/);
	let abyssAssetVersion = abyssVersionMatch ? abyssVersionMatch[1] : '';

	let spotlightIframeIo = null;
	if ('IntersectionObserver' in window) {
		spotlightIframeIo = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				try {
					const win = entry.target?.contentWindow;
					if (win) {
						win.postMessage({ type: 'abyss-spotlight-visibility', visible: entry.isIntersecting }, '*');
					}
				} catch (e) { }
			}
		}, { threshold: 0.02 });
	}

	function syncSpotlightIframeVersion() {
		const activeHomePage = document.querySelector('#indexPage:not(.hide), .homePage:not(.hide)');
		if (activeHomePage) {
			const tabs = activeHomePage.querySelectorAll('.tabContent, .pageTabContent');
			const hasActiveTab = Array.from(tabs).some(t => t.classList.contains('is-active'));
			if (!hasActiveTab && tabs.length > 0) {
				tabs[0].classList.add('is-active');
			}
		}
		const iframes = document.querySelectorAll('iframe.featurediframe');
		iframes.forEach(iframe => {
			if (spotlightIframeIo && !iframe._abyssIoObserved) {
				iframe._abyssIoObserved = true;
				spotlightIframeIo.observe(iframe);
			}
			if (abyssAssetVersion) {
				const currentSrc = iframe.getAttribute('src') || '';
				const expectedSrc = `ui/spotlight.html?v=${abyssAssetVersion}`;
				if (currentSrc.includes('spotlight.html') && currentSrc !== expectedSrc) {
					iframe.setAttribute('src', expectedSrc);
				}
			}
			const ownerPage = iframe.closest('.page, [data-role="page"]');
			const ownerTab = iframe.closest('.tabContent, .pageTabContent');
			const isOwnerHidden = Boolean(
				(ownerPage && ownerPage.classList.contains('hide')) ||
				(ownerTab && !ownerTab.classList.contains('is-active'))
			);
			// Hide spotlight iframe layer only when its own parent page/tab is hidden
			if (isOwnerHidden) {
				if (iframe.style.visibility !== 'hidden') {
					iframe.style.visibility = 'hidden';
					iframe.style.pointerEvents = 'none';
					try { iframe.contentWindow?.postMessage({ type: 'abyss-spotlight-visibility', visible: false }, '*'); } catch (e) { }
				}
			} else {
				if (iframe.style.display === 'none') {
					iframe.style.display = 'block';
				}
				if (iframe.style.visibility === 'hidden' || iframe.style.pointerEvents === 'none') {
					iframe.style.visibility = '';
					iframe.style.pointerEvents = '';
					try { iframe.contentWindow?.postMessage({ type: 'abyss-spotlight-visibility', visible: true }, '*'); } catch (e) { }
				}
			}
		});
	}

	// Automatic cache-sync & duplicate-CSS cleanup for Jellyfin Desktop/Mobile Apps
	async function checkAndApplyLiveVersionUpdate() {
		try {
			// 1. Strip duplicate external CDN Branding/Css immediately if present
			document.querySelectorAll('link[rel="stylesheet"][href*="Branding/Css"], style#cssBranding').forEach(el => {
				if (el.tagName === 'LINK') {
					el.disabled = true;
					el.remove();
				} else if (el.textContent && el.textContent.includes('cdn.jsdelivr.net/gh/AumGupta/abyss-jellyfin')) {
					el.textContent = '';
				}
			});

			// 2. Sync server in-memory BrandingOptions once so /Branding/Css stops serving external CDN CSS
			if (!sessionStorage.getItem('abyss_branding_cleaned')) {
				const { token } = getAuth();
				const base = getBaseUrl();
				if (token && base) {
					sessionStorage.setItem('abyss_branding_cleaned', '1');
					fetch(`${base}/Branding/Configuration`, {
						headers: { 'X-Emby-Token': token, 'Accept': 'application/json' }
					}).then(r => r.ok ? r.json() : null).then(cfg => {
						if (cfg && typeof cfg.CustomCss === 'string' && cfg.CustomCss.includes('cdn.jsdelivr.net/gh/AumGupta/abyss-jellyfin')) {
							cfg.CustomCss = cfg.CustomCss.replace(/@import\s+url\(['"]?https:\/\/cdn\.jsdelivr\.net\/gh\/AumGupta\/abyss-jellyfin[^)]+\)\s*;?/gi, '').trim();
							fetch(`${base}/System/Configuration/branding`, {
								method: 'POST',
								headers: { 'X-Emby-Token': token, 'Content-Type': 'application/json' },
								body: JSON.stringify(cfg)
							}).catch(() => {});
						}
					}).catch(() => {});
				}
			}

			// 3. Check live ui/version.json to hot-update Jellyfin App WebView assets
			const res = await fetch(`ui/version.json?t=${Date.now()}`, { cache: 'no-store' });
			if (!res.ok) return;
			const data = await res.json();
			const liveVersion = String(data?.version || '').trim();
			if (!liveVersion) return;

			// Hot-swap CSS stylesheets and Spotlight iframe immediately
			const cssSelectors = [
				['link[href*="abyss.css"]', 'ui/abyss.css'],
				['link[href*="library-banner.css"]', 'ui/library-banner.css'],
				['link[href*="movie-details.css"]', 'ui/movie-details.css']
			];
			cssSelectors.forEach(([sel, baseHref]) => {
				const link = document.querySelector(sel);
				const expected = `${baseHref}?v=${liveVersion}`;
				if (link && link.getAttribute('href') !== expected) {
					link.setAttribute('href', expected);
				}
			});

			if (abyssAssetVersion && abyssAssetVersion !== liveVersion) {
				abyssAssetVersion = liveVersion;
				syncSpotlightIframeVersion();
				const lastReloadedVer = sessionStorage.getItem('abyss_ver_reloaded');
				if (lastReloadedVer !== liveVersion && !isVideoOsdPageActive()) {
					sessionStorage.setItem('abyss_ver_reloaded', liveVersion);
					window.location.reload();
				}
			} else if (!abyssAssetVersion) {
				abyssAssetVersion = liveVersion;
				syncSpotlightIframeVersion();
			}
		} catch (e) { }
	}

	setTimeout(checkAndApplyLiveVersionUpdate, 800);
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) checkAndApplyLiveVersionUpdate();
	});

	// Unified reactive page & dialog observer for seamless SPA navigation
	let videoInitTimer = null;
	const mainPageObserver = new MutationObserver((mutations) => {
		let shouldTriggerPage = false;
		let shouldInitVideo = false;
		let shouldRefreshAfterDialog = false;
		let shouldSyncSpotlight = false;

		for (const m of mutations) {
			if (m.type === 'childList') {
				if (m.removedNodes && m.removedNodes.length) {
					for (const node of m.removedNodes) {
						if (node.nodeType === 1) {
							const isDialog = node.classList?.contains('dialogContainer') ||
								node.classList?.contains('editImagesDialog') ||
								node.classList?.contains('dialog') ||
								node.querySelector?.('.editImagesDialog');
							if (isDialog) {
								shouldRefreshAfterDialog = true;
							}
						}
					}
				}
				if (m.addedNodes && m.addedNodes.length) {
					if (m.target && m.target.closest && m.target.closest('.itemsContainer, .card, .scrollSlider, .library-hero-banner, .abyss-custom-osd-bar, .abyss-gesture-hud, .movie-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper, .person-custom-wrapper')) {
						continue;
					}
					for (const node of m.addedNodes) {
						if (node.nodeType === 1) {
							if (node.classList?.contains('card') || node.classList?.contains('abyss-card-trailer-stage')) {
								continue;
							}
							if (node.tagName === 'VIDEO' || node.id === 'videoOsdPage' || node.classList?.contains('videoOsdBottom') || node.querySelector?.('#videoOsdPage, .videoOsdBottom, video.htmlvideoplayer')) {
								shouldInitVideo = true;
							}
							if (node.id === 'itemDetailPage' || node.classList?.contains('page') || node.classList?.contains('itemDetailPage') || node.querySelector?.('#itemDetailPage, .itemDetailPage')) {
								shouldTriggerPage = true;
							}
							if (node.classList?.contains('featurediframe') || node.id === 'indexPage' || node.id === 'homeTab' || node.querySelector?.('iframe.featurediframe')) {
								shouldSyncSpotlight = true;
							}
						}
					}
				}
			} else if (m.type === 'attributes') {
				if (m.target.id === 'itemDetailPage' || m.target.classList?.contains('itemDetailPage')) {
					shouldTriggerPage = true;
				} else if (m.target.id === 'indexPage' || m.target.id === 'homeTab') {
					shouldSyncSpotlight = true;
				} else if (m.target.id === 'videoOsdPage') {
					shouldInitVideo = true;
					syncOsdHeaderVisibility();
				} else if (m.target.classList?.contains('videoOsdBottom') || m.target.classList?.contains('skinHeader')) {
					syncOsdHeaderVisibility();
				}
			}
		}

		if (shouldSyncSpotlight) {
			syncSpotlightIframeVersion();
		}
		if (shouldInitVideo) {
			if (!videoInitTimer) {
				videoInitTimer = setTimeout(() => {
					videoInitTimer = null;
					applyExactVideoPlayerDesign();
					initMobileVideoGestures();
				}, 60);
			}
		}
		if (shouldRefreshAfterDialog) {
			setTimeout(() => {
				triggerEnhance(true);
			}, 400);
		} else if (shouldTriggerPage) {
			triggerEnhance();
		}
	});

	mainPageObserver.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class', 'data-itemid']
	});

	// Global item update listeners
	const events = window.Events || window.parent?.Events || window.top?.Events;
	if (events && typeof events.on === 'function') {
		try {
			events.on('itemupdated', () => triggerEnhance(true));
		} catch (e) { }
	}
	// Lightweight fallback video playback watcher (skips when tab is hidden or not on video player)
	setInterval(() => {
		if (document.hidden) return;
		if (isVideoOsdPageActive()) {
			applyExactVideoPlayerDesign();
			initMobileVideoGestures();
		} else if (document.body.classList.contains('abyss-video-playing') || document.body.classList.contains('abyss-osd-hidden')) {
			syncOsdHeaderVisibility();
		}
	}, 1000);

	// =========================================================================
	// 2-SECOND HOVER CARD MORPH (PORTRAIT 2:3 -> WIDE 16:9 TRAILER PREVIEW)
	// =========================================================================
	const cardTrailerDataCache = new Map();
	let hoveredCardEl = null;
	activeExpandedCardEl = null;
	let hoverPrefetchTimer = null;
	let hoverExpandTimer = null;
	let cardTrailerMuted = true;

	function extractCardItemId(card) {
		if (!card) return null;
		const directId = card.getAttribute('data-id') || card.getAttribute('data-itemid');
		if (directId && /^[0-9a-fA-F]{32}$/.test(directId)) return directId;

		const childWithId = card.querySelector('[data-id], [data-itemid]');
		if (childWithId) {
			const cid = childWithId.getAttribute('data-id') || childWithId.getAttribute('data-itemid');
			if (cid && /^[0-9a-fA-F]{32}$/.test(cid)) return cid;
		}

		const imgContainer = card.querySelector('.cardImageContainer, img');
		if (imgContainer) {
			const bg = imgContainer.style?.backgroundImage || imgContainer.getAttribute('src') || '';
			const m = bg.match(/\/Items\/([0-9a-fA-F]{32})\/Images\//i);
			if (m && m[1]) return m[1];
		}
		return null;
	}

	function isEligiblePortraitCard(card) {
		if (!card || !card.isConnected) return false;
		if (card.closest('#castContent, #guestCastContent, .person-custom-wrapper, .movie-custom-wrapper, .series-custom-wrapper, .season-custom-wrapper, .episode-custom-wrapper')) {
			return false;
		}
		const itemType = (card.getAttribute('data-type') || '').toLowerCase();
		if (
			itemType === 'person' ||
			itemType === 'collectionfolder' ||
			itemType === 'userview' ||
			itemType === 'folder' ||
			itemType === 'musicalbum' ||
			itemType === 'musicartist' ||
			itemType === 'audio' ||
			itemType === 'photo'
		) {
			return false;
		}
		const scalable = card.querySelector('.cardScalable');
		if (!scalable || scalable.offsetWidth < 60 || scalable.offsetHeight < 80) return false;
		const isPortraitClass = card.classList.contains('portraitCard') || card.classList.contains('overflowPortraitCard');
		const isPortraitRatio = scalable.offsetHeight > scalable.offsetWidth * 1.12;
		if (!isPortraitClass && !isPortraitRatio) return false;
		return Boolean(extractCardItemId(card));
	}

	async function resolveCardTrailerData(itemId) {
		if (!itemId) return null;
		if (cardTrailerDataCache.has(itemId)) {
			return cardTrailerDataCache.get(itemId);
		}

		const pendingPromise = (async () => {
			const { token, userId } = getAuth();
			const base = getBaseUrl();
			const headers = token ? { 'X-Emby-Token': token, 'Accept': 'application/json' } : { 'Accept': 'application/json' };
			const tokenParam = token ? `&api_key=${encodeURIComponent(token)}` : '';

			let item = itemCache[itemId] || null;
			if (!item) {
				item = await fetchItemDetails(itemId);
			}

			// 1. Build Backdrop & Logo URLs (avoid format=webp to prevent Jellyfin Skia multi-frame decode errors)
			const primaryFallbackUrl = `${base}/Items/${itemId}/Images/Primary?fillWidth=720&quality=80${tokenParam}`;
			let backdropUrl = primaryFallbackUrl;
			if (item) {
				if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
					backdropUrl = `${base}/Items/${itemId}/Images/Backdrop/0?fillWidth=720&quality=80&tag=${item.BackdropImageTags[0]}${tokenParam}`;
				} else if (item.ParentBackdropImageTags && item.ParentBackdropImageTags.length > 0) {
					const parentBId = item.ParentBackdropItemId || item.SeriesId || itemId;
					backdropUrl = `${base}/Items/${parentBId}/Images/Backdrop/0?fillWidth=720&quality=80&tag=${item.ParentBackdropImageTags[0]}${tokenParam}`;
				}
			}

			let logoUrl = null;
			if (item?.ImageTags?.Logo) {
				logoUrl = `${base}/Items/${itemId}/Images/Logo?fillWidth=300&quality=85&tag=${item.ImageTags.Logo}${tokenParam}`;
			} else if (item?.ParentLogoImageTag) {
				const parentLId = item.ParentLogoItemId || item.SeriesId || itemId;
				logoUrl = `${base}/Items/${parentLId}/Images/Logo?fillWidth=300&quality=85&tag=${item.ParentLogoImageTag}${tokenParam}`;
			}

			// Preload backdrop image into RAM before the 2s mark (fallback to Primary on error)
			const preImg = new Image();
			preImg.onerror = () => { backdropUrl = primaryFallbackUrl; };
			preImg.src = backdropUrl;
			if (logoUrl) {
				const preLogo = new Image();
				preLogo.src = logoUrl;
			}

			// 2. Check Local Trailers first (fast single endpoint, only if HTML5 video supports MP4 H.264)
			const canPlayMp4 = Boolean(document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'));
			let streamUrl = null;
			if (token && userId && canPlayMp4) {
				try {
					const localRes = await fetch(`${base}/Users/${userId}/Items/${itemId}/LocalTrailers?api_key=${encodeURIComponent(token)}`, { headers });
					if (localRes.ok) {
						const localTrailers = await localRes.json();
						if (Array.isArray(localTrailers) && localTrailers.length > 0 && localTrailers[0].Id) {
							streamUrl = getThemeVideoStreamUrl(localTrailers[0]);
						}
					}
				} catch (e) { }
			}

			// 3. Extract YouTube ID from RemoteTrailers
			let youtubeId = '';
			if (!streamUrl && item?.RemoteTrailers && item.RemoteTrailers.length > 0) {
				const rUrl = item.RemoteTrailers[0].Url || '';
				const ytMatch = rUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
				if (ytMatch && ytMatch[1]) {
					youtubeId = ytMatch[1];
				}
			}

			// 4. Fallback: Query TMDB /videos for official YouTube Trailer
			if (!streamUrl && !youtubeId && item) {
				const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TMDB;
				if (tmdbId) {
					const isSeries = item.Type === 'Series';
					const endpoint = isSeries ? `tv/${tmdbId}` : `movie/${tmdbId}`;
					for (const key of TMDB_KEYS) {
						if (deadTmdbKeys.has(key)) continue;
						try {
							const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/videos?api_key=${key}`);
							if (res.status === 401 || res.status === 403 || res.status === 429) {
								deadTmdbKeys.add(key);
								continue;
							}
							if (res.ok) {
								const data = await res.json();
								const vids = (data?.results || []).filter(v => v.site === 'YouTube' && v.key);
								const best =
									vids.find(v => v.type === 'Trailer' && v.official) ||
									vids.find(v => v.type === 'Trailer') ||
									vids.find(v => v.type === 'Teaser') ||
									vids[0];
								if (best?.key) {
									youtubeId = best.key;
								}
								break;
							}
							if (res.status === 404) break;
						} catch (e) { }
					}
				}
			}

			const result = {
				itemId,
				name: item?.Name || '',
				backdropUrl,
				logoUrl,
				streamUrl,
				youtubeId
			};
			cardTrailerDataCache.set(itemId, result);
			return result;
		})();

		cardTrailerDataCache.set(itemId, pendingPromise);
		return pendingPromise;
	}

	function destroyCardTrailerMedia(card) {
		if (!card) return;
		const stage = card.querySelector('.abyss-card-trailer-stage');
		if (!stage) return;

		const video = stage.querySelector('video');
		if (video) {
			try {
				video.pause();
				video.removeAttribute('src');
				video.load();
				video.remove();
			} catch (e) { }
		}

		// Remove iframe directly without mutating iframe.src while attached (mutating .src pushes a browser history entry!)
		const iframe = stage.querySelector('iframe');
		if (iframe) {
			try {
				iframe.remove();
			} catch (e) { }
		}
	}

	function collapseExpandedCard(card, immediate = false) {
		if (!card) return;
		if (activeExpandedCardEl === card) {
			activeExpandedCardEl = null;
			document.body.classList.remove('abyss-has-expanded-card');
		}
		if (card._abyssCollapseCleanupTimer) {
			clearTimeout(card._abyssCollapseCleanupTimer);
			card._abyssCollapseCleanupTimer = null;
		}

		// Immediately free video/iframe decoder & audio without touching window.history
		destroyCardTrailerMedia(card);

		const scalable = card.querySelector('.cardScalable');
		const cardBox = card.querySelector('.cardBox');
		const geom = card._abyssMorphGeom;

		card.classList.remove('abyss-card-expanded');

		const resetCardDom = () => {
			card.classList.remove('abyss-card-morph-active', 'abyss-card-grid-morph');
			card.style.width = '';
			card.style.height = '';
			card.style.marginLeft = '';
			if (cardBox) {
				cardBox.style.width = '';
				cardBox.style.left = '';
				cardBox.style.top = '';
				cardBox.style.margin = '';
				cardBox.style.transform = '';
			}
			if (scalable) {
				scalable.style.width = '';
				scalable.style.height = '';
				scalable.style.transform = '';
			}
			const stage = card.querySelector('.abyss-card-trailer-stage');
			if (stage) stage.remove();
			delete card._abyssMorphGeom;
		};

		if (immediate) {
			resetCardDom();
			return;
		}

		if (geom && scalable) {
			if (!geom.isGridWrap) {
				card.style.width = `${geom.portraitCardWidth}px`;
				card.style.marginLeft = '0px';
			}
			if (cardBox) {
				cardBox.style.width = `${geom.portraitScalableWidth}px`;
				cardBox.style.transform = 'translateX(0px)';
			}
			scalable.style.width = `${geom.portraitScalableWidth}px`;
			scalable.style.transform = 'translateX(0px)';
		}

		card._abyssCollapseCleanupTimer = setTimeout(() => {
			card._abyssCollapseCleanupTimer = null;
			if (card.classList.contains('abyss-card-expanded')) return;
			resetCardDom();
		}, 540);
	}

	function setCardTrailerMuteState(stage, muted) {
		cardTrailerMuted = muted;
		const muteBtn = stage.querySelector('.abyss-card-trailer-mute-btn');
		if (muteBtn) {
			muteBtn.innerHTML = muted
				? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`
				: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
			muteBtn.title = muted ? 'Unmute Trailer' : 'Mute Trailer';
		}

		const video = stage.querySelector('video');
		if (video) {
			video.muted = muted;
		}

		const iframe = stage.querySelector('iframe');
		if (iframe && iframe.contentWindow) {
			try {
				const func = muted ? 'mute' : 'unMute';
				iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
				if (!muted) {
					iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
				}
			} catch (e) { }
		}
	}

	async function expandCardWithTrailer(card, itemId) {
		if (!card || !card.isConnected || hoveredCardEl !== card || document.hidden) return;
		if (document.body.classList.contains('abyss-video-playing') || document.querySelector('#videoOsdPage:not(.hide)')) return;

		if (activeExpandedCardEl && activeExpandedCardEl !== card) {
			collapseExpandedCard(activeExpandedCardEl);
		}

		const scalable = card.querySelector('.cardScalable');
		const cardBox = card.querySelector('.cardBox');
		if (!scalable) return;

		if (card._abyssCollapseCleanupTimer) {
			clearTimeout(card._abyssCollapseCleanupTimer);
			card._abyssCollapseCleanupTimer = null;
		}

		const container = card.closest('.itemsContainer');
		const containerStyle = container ? window.getComputedStyle(container) : null;
		const isGridWrap = Boolean(
			container && (
				container.classList.contains('vertical-wrap') ||
				(containerStyle && (
					containerStyle.flexWrap === 'wrap' ||
					containerStyle.flexWrap === 'wrap-reverse' ||
					containerStyle.display.includes('grid')
				))
			)
		);

		// Measure initial portrait dimensions once (before any style mutations)
		const cardRect = card.getBoundingClientRect();
		const boxRect = cardBox ? cardBox.getBoundingClientRect() : null;
		const geom = card._abyssMorphGeom || {
			portraitCardWidth: card.offsetWidth,
			portraitCardHeight: cardRect.height,
			portraitScalableWidth: scalable.offsetWidth,
			portraitScalableHeight: scalable.offsetHeight,
			boxOffsetLeft: boxRect ? (boxRect.left - cardRect.left) : 0,
			boxOffsetTop: boxRect ? (boxRect.top - cardRect.top) : 0,
			isGridWrap
		};
		card._abyssMorphGeom = geom;

		const marginH = Math.max(0, geom.portraitCardWidth - geom.portraitScalableWidth);
		const targetScalableWidth = Math.min(
			Math.round(geom.portraitScalableHeight * (16 / 9)),
			Math.round(window.innerWidth * 0.72)
		);
		const targetCardWidth = targetScalableWidth + marginH;
		const deltaWidth = Math.max(0, targetScalableWidth - geom.portraitScalableWidth);

		const rect = scalable.getBoundingClientRect();
		const viewportW = window.innerWidth;

		// Lock explicit starting dimensions at t = 0 so transition starts from exact current pixels
		card.classList.add('abyss-card-morph-active');
		if (geom.isGridWrap) {
			// Take cardBox out of flex/grid flow so expanding to 16:9 NEVER shifts or wraps neighboring cards
			card.classList.add('abyss-card-grid-morph');
			card.style.height = `${geom.portraitCardHeight}px`;
			if (cardBox) {
				cardBox.style.left = `${geom.boxOffsetLeft}px`;
				cardBox.style.top = `${geom.boxOffsetTop}px`;
				cardBox.style.margin = '0';
				cardBox.style.width = `${geom.portraitScalableWidth}px`;
				cardBox.style.transform = 'translateX(0px)';
			}
		} else {
			card.style.width = `${geom.portraitCardWidth}px`;
			card.style.marginLeft = '0px';
			if (cardBox) {
				cardBox.style.width = `${geom.portraitScalableWidth}px`;
				cardBox.style.transform = 'translateX(0px)';
			}
		}
		scalable.style.width = `${geom.portraitScalableWidth}px`;
		scalable.style.height = `${geom.portraitScalableHeight}px`;
		scalable.style.transform = 'translateX(0px)';

		// Build lightweight stage inside .cardScalable
		const oldStage = scalable.querySelector('.abyss-card-trailer-stage');
		if (oldStage) oldStage.remove();

		const stage = document.createElement('div');
		stage.className = 'abyss-card-trailer-stage';
		stage.innerHTML = `
			<img class="abyss-card-trailer-backdrop" alt="" />
			<div class="abyss-card-trailer-video-wrap"></div>
			<div class="abyss-card-trailer-bar">
				<div class="abyss-card-trailer-brand" style="display:flex;align-items:flex-end;min-width:0;flex:1;"></div>
				<div class="abyss-card-trailer-actions">
					<button type="button" class="abyss-card-trailer-btn is-play" title="Play">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
					</button>
					<button type="button" class="abyss-card-trailer-btn abyss-card-trailer-mute-btn" title="Unmute Trailer"></button>
				</div>
			</div>
		`;
		scalable.appendChild(stage);
		setCardTrailerMuteState(stage, cardTrailerMuted);

		// Stage click handlers
		const playQuickBtn = stage.querySelector('.abyss-card-trailer-btn.is-play');
		if (playQuickBtn) {
			playQuickBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				collapseExpandedCard(card, true);
				const cachedItem = itemCache[itemId] || (await fetchItemDetails(itemId));
				await playMediaItem(cachedItem || itemId);
			});
		}

		const muteBtn = stage.querySelector('.abyss-card-trailer-mute-btn');
		if (muteBtn) {
			muteBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				setCardTrailerMuteState(stage, !cardTrailerMuted);
			});
		}

		stage.addEventListener('click', (e) => {
			if (e.target.closest('.abyss-card-trailer-actions')) return;
			e.preventDefault();
			e.stopPropagation();
			collapseExpandedCard(card, true);

			// Use Jellyfin's native card link element so internal router history and Back button work seamlessly
			const nativeLink = card.querySelector('.cardOverlayContainer[data-action="link"], .cardImageContainer.itemAction, a.itemAction[data-action="link"], .cardText-first a.itemAction');
			if (nativeLink) {
				nativeLink.click();
				return;
			}
			const serverId = card.getAttribute('data-serverid') || (window.ApiClient && typeof window.ApiClient.serverId === 'function' ? window.ApiClient.serverId() : '');
			window.location.hash = serverId ? `#/details?id=${itemId}&serverId=${serverId}` : `#/details?id=${itemId}`;
		});

		// Force synchronous style flush so browser registers t = 0 state
		void card.offsetWidth;

		activeExpandedCardEl = card;
		document.body.classList.add('abyss-has-expanded-card');

		// Trigger 60fps morph to 16:9 widescreen dimensions
		requestAnimationFrame(() => {
			if (activeExpandedCardEl !== card || !card.isConnected) return;
			card.classList.add('abyss-card-expanded');
			scalable.style.width = `${targetScalableWidth}px`;
			if (cardBox) {
				cardBox.style.width = `${targetScalableWidth}px`;
			}

			const rightSafeEdge = geom.isGridWrap ? (viewportW - 44) : (viewportW - 24);
			const overflowRight = Math.max(0, (rect.left + targetScalableWidth) - rightSafeEdge);
			const maxLeftShift = Math.max(0, rect.left - 24);

			if (!geom.isGridWrap) {
				const clampedShift = Math.min(overflowRight, maxLeftShift, deltaWidth);
				card.style.width = `${targetCardWidth}px`;
				if (clampedShift > 0) {
					card.style.marginLeft = `-${Math.round(clampedShift)}px`;
				}
			} else {
				const centeredShift = Math.round(deltaWidth / 2);
				const gridShift = Math.min(deltaWidth, Math.max(overflowRight, Math.min(centeredShift, maxLeftShift)));
				if (gridShift > 0) {
					if (cardBox) {
						cardBox.style.transform = `translateX(-${Math.round(gridShift)}px)`;
					} else {
						scalable.style.transform = `translateX(-${Math.round(gridShift)}px)`;
					}
				}
			}
		});

		// Populate backdrop, logo & start trailer playback
		const data = await resolveCardTrailerData(itemId);
		if (!data || activeExpandedCardEl !== card || !stage.isConnected) return;

		const backdropImg = stage.querySelector('.abyss-card-trailer-backdrop');
		if (backdropImg && data.backdropUrl) {
			backdropImg.src = data.backdropUrl;
		}

		const brandEl = stage.querySelector('.abyss-card-trailer-brand');
		if (brandEl) {
			if (data.logoUrl) {
				brandEl.innerHTML = `<img class="abyss-card-trailer-logo" src="${data.logoUrl}" alt="${escapeHtml(data.name)}" />`;
			} else {
				brandEl.innerHTML = `<div class="abyss-card-trailer-title">${escapeHtml(data.name)}</div>`;
			}
		}

		const videoWrap = stage.querySelector('.abyss-card-trailer-video-wrap');
		if (!videoWrap) return;

		if (data.streamUrl) {
			const vid = document.createElement('video');
			vid.className = 'abyss-card-trailer-video';
			vid.src = data.streamUrl;
			vid.autoplay = true;
			vid.loop = true;
			vid.muted = cardTrailerMuted;
			vid.playsInline = true;
			vid.setAttribute('playsinline', '');
			if (cardTrailerMuted) vid.setAttribute('muted', '');

			vid.addEventListener('playing', () => {
				if (videoWrap.isConnected) videoWrap.classList.add('is-playing');
			}, { once: true });

			videoWrap.appendChild(vid);
			vid.play().catch(() => {
				vid.muted = true;
				setCardTrailerMuteState(stage, true);
				vid.play().catch(() => { });
			});
		} else if (data.youtubeId) {
			const origin = encodeURIComponent(window.location.origin || 'http://localhost');
			const iframe = document.createElement('iframe');
			iframe.className = 'abyss-card-trailer-iframe';
			iframe.allow = 'autoplay; encrypted-media';
			iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
			iframe.src = `https://www.youtube.com/embed/${data.youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&loop=1&playlist=${data.youtubeId}&enablejsapi=1&origin=${origin}`;
			videoWrap.appendChild(iframe);

			iframe.addEventListener('load', () => {
				setTimeout(() => {
					if (!stage.isConnected || activeExpandedCardEl !== card) return;
					videoWrap.classList.add('is-playing');
					if (!cardTrailerMuted) {
						setCardTrailerMuteState(stage, false);
					}
				}, 550);
			}, { once: true });
		}
	}

	function clearHoverCardTimers() {
		if (hoverPrefetchTimer) {
			clearTimeout(hoverPrefetchTimer);
			hoverPrefetchTimer = null;
		}
		if (hoverExpandTimer) {
			clearTimeout(hoverExpandTimer);
			hoverExpandTimer = null;
		}
	}

	function initHoverCardTrailerSystem() {
		document.addEventListener('pointerover', (e) => {
			if (e.pointerType === 'touch') return;
			const card = e.target?.closest?.('.card');
			if (card === hoveredCardEl) return;

			clearHoverCardTimers();

			if (activeExpandedCardEl && activeExpandedCardEl !== card) {
				collapseExpandedCard(activeExpandedCardEl);
			}

			if (!card || !isEligiblePortraitCard(card)) {
				hoveredCardEl = null;
				return;
			}

			hoveredCardEl = card;
			const itemId = extractCardItemId(card);
			if (!itemId) return;

			// Prefetch trailer metadata & preload backdrop at 700ms so 2000ms expansion is instant
			hoverPrefetchTimer = setTimeout(() => {
				if (hoveredCardEl === card && !document.hidden) {
					resolveCardTrailerData(itemId).catch(() => { });
				}
			}, 700);

			// Morph portrait card into wide 16:9 trailer card after exact 2000ms hover
			hoverExpandTimer = setTimeout(() => {
				if (hoveredCardEl === card && !document.hidden) {
					expandCardWithTrailer(card, itemId);
				}
			}, 2000);
		}, { passive: true });

		document.addEventListener('pointerout', (e) => {
			if (!hoveredCardEl) return;
			const related = e.relatedTarget;
			if (related && hoveredCardEl.contains(related)) return;

			const leavingCard = hoveredCardEl;
			setTimeout(() => {
				if (leavingCard.isConnected && leavingCard.matches(':hover')) return;
				if (hoveredCardEl === leavingCard) {
					hoveredCardEl = null;
					clearHoverCardTimers();
				}
				if (activeExpandedCardEl === leavingCard) {
					collapseExpandedCard(leavingCard);
				}
			}, 35);
		}, { passive: true });

		// Collapse immediately on page navigation or tab switch to free resources
		let lastNonDetailHash = '#/home.html';
		const updateLastNonDetailHash = () => {
			const h = window.location.hash || '';
			if (h && !h.startsWith('#/details') && !h.startsWith('#!/details') && !h.startsWith('#/video')) {
				lastNonDetailHash = h;
			}
		};
		updateLastNonDetailHash();

		window.addEventListener('hashchange', () => {
			updateLastNonDetailHash();
			clearHoverCardTimers();
			hoveredCardEl = null;
			if (activeExpandedCardEl) collapseExpandedCard(activeExpandedCardEl, true);
		});

		// Ensure Top Back Button (.headerBackButton) and Home Button (.headerHomeButton) always work
		// even if a third-party trailer iframe touched session history or left appRouter.promiseShow pending
		document.addEventListener('click', (e) => {
			const homeBtn = e.target?.closest?.('.headerHomeButton, button[data-action="home"]');
			if (homeBtn) {
				try {
					if (window.appRouter && window.appRouter.promiseShow) {
						window.appRouter.promiseShow = null;
					}
				} catch (err) { }
				const hashBefore = window.location.hash || '';
				setTimeout(() => {
					if (window.location.hash === hashBefore && (hashBefore.startsWith('#/details') || hashBefore.startsWith('#!/details'))) {
						window.location.hash = '#/home';
					}
					syncSpotlightIframeVersion();
				}, 110);
				return;
			}
			const backBtn = e.target?.closest?.('.headerBackButton, .headerButton-back, button[data-action="back"]');
			if (!backBtn) return;
			const hashBefore = window.location.hash || '';
			if (!hashBefore.startsWith('#/details') && !hashBefore.startsWith('#!/details')) return;
			setTimeout(() => {
				if (window.location.hash === hashBefore) {
					try {
						if (window.appRouter && window.appRouter.promiseShow) {
							window.appRouter.promiseShow = null;
						}
					} catch (err) { }
					window.location.hash = lastNonDetailHash || '#/home.html';
				}
				syncSpotlightIframeVersion();
			}, 110);
		}, true);

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				clearHoverCardTimers();
				hoveredCardEl = null;
				if (activeExpandedCardEl) collapseExpandedCard(activeExpandedCardEl);
			}
		});
	}

	// Initial trigger
	initHoverCardTrailerSystem();
	syncSpotlightIframeVersion();
	triggerEnhance();

})();

