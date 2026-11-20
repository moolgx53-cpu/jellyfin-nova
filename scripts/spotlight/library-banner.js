(function () {
	'use strict';

	if (window.__abyssLibraryBannerLoaded) return;
	window.__abyssLibraryBannerLoaded = true;

	let cachedUserViews = null;
	let isRendering = false;

	function getBaseUrl() {
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		if (api && typeof api.serverAddress === 'function') {
			const addr = api.serverAddress();
			if (addr) return addr;
		}
		return window.location.origin;
	}

	function getAuth() {
		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.accessToken === 'function') {
				return { token: api.accessToken(), userId: api.getCurrentUserId() };
			}
		} catch (e) { }
		const token = localStorage.getItem('accessToken') || '';
		let userId = '';
		try {
			const raw = localStorage.getItem('user');
			if (raw) userId = JSON.parse(raw).Id;
		} catch (e) { }
		return { token, userId };
	}

	function isNonLibraryPage() {
		const hash = (window.location.hash || '').toLowerCase();

		// Check hash pattern for details page, home, player, settings, search
		if (
			hash === '' || hash === '#' ||
			hash.includes('home') ||
			hash.includes('details') ||
			hash.includes('item.html') ||
			hash.includes('player') ||
			hash.includes('video') ||
			hash.includes('search') ||
			hash.includes('dashboard') ||
			hash.includes('settings') ||
			hash.includes('preferences')
		) {
			if ((hash.includes('parentid=') || hash.includes('topparentid=')) && !hash.includes('details') && !hash.includes('item.html')) {
				// Valid library view
			} else {
				return true;
			}
		}

		// Check DOM elements for itemPage, detailPage, homePage
		const activePage = document.querySelector('div[data-role="page"]:not(.hide), .pageContainer:not(.hide), .page.is-active');
		if (activePage) {
			if (
				activePage.id === 'indexPage' ||
				activePage.id === 'itemPage' ||
				activePage.classList.contains('homePage') ||
				activePage.classList.contains('itemPage') ||
				activePage.classList.contains('itemDetailPage') ||
				activePage.classList.contains('detailPage') ||
				activePage.querySelector('.itemDetailPage, .detailPageWrapper, .itemDetailContainer')
			) {
				return true;
			}
		}

		return false;
	}

	async function getUserViews() {
		if (cachedUserViews && cachedUserViews.length > 0) return cachedUserViews;
		const { token, userId } = getAuth();
		if (!token || !userId) return [];
		const base = getBaseUrl();
		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getUserViews === 'function') {
				const res = await api.getUserViews({}, userId);
				if (res?.Items?.length) {
					cachedUserViews = res.Items;
					return cachedUserViews;
				}
			}
		} catch (e) { }

		try {
			const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
			const res = await fetch(`${base}/Users/${userId}/Views?api_key=${token}`, { headers });
			if (res.ok) {
				const data = await res.json();
				if (data?.Items?.length) {
					cachedUserViews = data.Items;
					return cachedUserViews;
				}
			}
		} catch (e) { }
		return [];
	}

	function getActivePageContainer() {
		if (isNonLibraryPage()) return null;

		const candidates = document.querySelectorAll(
			'#moviesPage:not(.hide), #tvPage:not(.hide), #itemsPage:not(.hide), #listPage:not(.hide), #musicPage:not(.hide), #audiobooksPage:not(.hide), div[data-role="page"].libraryPage:not(.hide), .pageContainer.libraryPage:not(.hide), div[data-role="page"]:not(.hide)'
		);

		for (const el of candidates) {
			if (el.id === 'indexPage' || el.id === 'itemPage' || el.classList.contains('homePage') || el.classList.contains('itemDetailPage') || el.classList.contains('detailPage')) continue;
			if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.classList.contains('is-active')) {
				return el;
			}
		}
		return null;
	}

	async function resolveParentId(container) {
		const hash = window.location.hash || '';

		let match = hash.match(/parentId=([a-f0-9]+)/i) || hash.match(/topParentId=([a-f0-9]+)/i);
		if (match) return match[1];

		match = window.location.search.match(/parentId=([a-f0-9]+)/i) || window.location.search.match(/topParentId=([a-f0-9]+)/i);
		if (match) return match[1];

		try {
			const p = window.Emby?.Page?.params || window.top?.Emby?.Page?.params;
			if (p?.parentId) return p.parentId;
			if (p?.topParentId) return p.topParentId;
			if (p?.id) return p.id;
		} catch (e) { }

		if (container) {
			const page = container.closest('[data-role="page"], .pageContainer, .libraryPage') || container;
			if (page.getAttribute('data-parentid')) return page.getAttribute('data-parentid');
			if (page.getAttribute('data-topparentid')) return page.getAttribute('data-topparentid');
			const child = page.querySelector('[data-parentid]');
			if (child && child.getAttribute('data-parentid')) return child.getAttribute('data-parentid');
		}

		const views = await getUserViews();
		if (views.length) {
			if (hash.includes('movies.html')) {
				const movieLib = views.find(v => v.CollectionType === 'movies') || views[0];
				if (movieLib) return movieLib.Id;
			}
			if (hash.includes('tv.html')) {
				const tvLib = views.find(v => v.CollectionType === 'tvshows') || views[0];
				if (tvLib) return tvLib.Id;
			}
			const pageTitleEl = document.querySelector('.pageTitle, .headerTitle, h1');
			if (pageTitleEl) {
				const titleText = pageTitleEl.textContent.trim().toLowerCase();
				const matchLib = views.find(v => v.Name.toLowerCase() === titleText);
				if (matchLib) return matchLib.Id;
			}
		}

		return null;
	}

	async function updateLibraryBannerState() {
		if (isNonLibraryPage()) {
			document.querySelectorAll('.library-hero-banner').forEach(b => b.remove());
			return;
		}

		const container = getActivePageContainer();
		if (!container) {
			document.querySelectorAll('.library-hero-banner').forEach(b => b.remove());
			return;
		}

		const parentId = await resolveParentId(container);
		if (!parentId) return;

		const allBanners = Array.from(document.querySelectorAll('.library-hero-banner'));
		if (allBanners.length > 0) {
			const primaryBanner = allBanners[0];
			if (primaryBanner.getAttribute('data-parent-id') === parentId && container.contains(primaryBanner)) {
				allBanners.slice(1).forEach(b => b.remove());
				return;
			} else {
				allBanners.forEach(b => b.remove());
			}
		}

		if (isRendering) return;
		isRendering = true;

		try {
			document.querySelectorAll('.library-hero-banner').forEach(b => b.remove());

			const { token, userId } = getAuth();
			if (!token || !userId) return;
			const base = getBaseUrl();

			const [libraryMeta, items] = await Promise.all([
				fetchLibraryDetails(parentId, base, token, userId),
				fetchLibraryItems(parentId, base, token, userId)
			]);

			if (!items || !items.length) return;

			const currentContainer = getActivePageContainer();
			if (!currentContainer) return;

			const libraryName = libraryMeta?.Name || 'COLLECTION';

			const banner = document.createElement('div');
			banner.id = 'library-hero-banner';
			banner.className = 'library-hero-banner';
			banner.setAttribute('data-parent-id', parentId);

			const topItem = items.find(i => i.BackdropImageTags?.length || i.ParentBackdropImageTags?.length) || items[0];
			const backdropUrl = getImageUrl(topItem, 'Backdrop', base, token);

			const backdropDiv = document.createElement('div');
			backdropDiv.className = 'library-hero-backdrop';
			backdropDiv.innerHTML = `<img src="${backdropUrl}" alt="" onError="this.style.display='none'" />`;

			const overlayDiv = document.createElement('div');
			overlayDiv.className = 'library-hero-overlay';

			const haloDiv = document.createElement('div');
			haloDiv.className = 'library-ambient-halo';

			const marqueeWrap = document.createElement('div');
			marqueeWrap.className = 'library-marquee-wrap';

			const marqueeTrack = document.createElement('div');
			marqueeTrack.className = 'library-marquee-track';

			const displayItems = [...items, ...items];
			displayItems.forEach((item, idx) => {
				const card = document.createElement('div');
				card.className = `library-marquee-card ${idx % 2 === 0 ? 'rot-neg' : 'rot-pos'}`;
				const imgUrl = getImageUrl(item, 'Primary', base, token);

				card.innerHTML = `
					<img src="${imgUrl}" alt="${escapeHtml(item.Name)}" loading="lazy" onError="this.style.display='none'" />
				`;

				marqueeTrack.appendChild(card);
			});

			marqueeWrap.appendChild(marqueeTrack);

			const contentDiv = document.createElement('div');
			contentDiv.className = 'library-hero-content';
			contentDiv.innerHTML = `
				<h1 class="library-hero-title">${escapeHtml(libraryName)}</h1>
			`;

			banner.appendChild(backdropDiv);
			banner.appendChild(overlayDiv);
			banner.appendChild(haloDiv);
			banner.appendChild(marqueeWrap);
			banner.appendChild(contentDiv);

			// Strict final cleanup before insertion to ensure only one banner exists
			document.querySelectorAll('.library-hero-banner').forEach(b => b.remove());
			currentContainer.insertBefore(banner, currentContainer.firstChild);

			if ('IntersectionObserver' in window) {
				const io = new IntersectionObserver((entries) => {
					for (const entry of entries) {
						banner.classList.toggle('is-paused', !entry.isIntersecting);
					}
				}, { threshold: 0.02 });
				io.observe(banner);
			}
		} catch (err) {
			console.warn('[Library Banner] error:', err);
		} finally {
			isRendering = false;
		}
	}

	const libraryCache = new Map();

	async function fetchLibraryDetails(parentId, base, token, userId) {
		const cacheKey = `meta_${parentId}`;
		if (libraryCache.has(cacheKey)) return libraryCache.get(cacheKey);

		const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItem === 'function') {
				const item = await api.getItem(userId, parentId);
				if (item) {
					libraryCache.set(cacheKey, item);
					return item;
				}
			}
		} catch (e) { }

		try {
			const res = await fetch(`${base}/Users/${userId}/Items/${parentId}?api_key=${token}`, { headers });
			if (res.ok) {
				const data = await res.json();
				if (data) {
					libraryCache.set(cacheKey, data);
					return data;
				}
			}
		} catch (e) { }

		return null;
	}

	async function fetchLibraryItems(parentId, base, token, userId) {
		const cacheKey = `items_${parentId}`;
		if (libraryCache.has(cacheKey)) return libraryCache.get(cacheKey);

		const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
		const FIELDS = 'PrimaryImageAspectRatio,Overview,CommunityRating,DateCreated,ImageTags,BackdropImageTags,ParentBackdropImageTags,SeriesPrimaryImageTag,AlbumPrimaryImageTag';
		const ITEM_TYPES = 'Movie,Series,MusicAlbum,AudioBook,Audio,Video,Folder,MusicVideo,Book,BoxSet';

		try {
			const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
			if (api && typeof api.getItems === 'function') {
				let d = await api.getItems(userId, {
					ParentId: parentId,
					Recursive: true,
					Limit: 10,
					IncludeItemTypes: ITEM_TYPES,
					SortBy: 'DateCreated',
					SortOrder: 'Descending',
					Fields: FIELDS
				});
				let items = Array.isArray(d) ? d : (d?.Items || []);
				if (!items.length) {
					d = await api.getItems(userId, {
						ParentId: parentId,
						Recursive: true,
						Limit: 10,
						SortBy: 'DateCreated',
						SortOrder: 'Descending',
						Fields: FIELDS
					});
					items = Array.isArray(d) ? d : (d?.Items || []);
				}
				if (items.length) {
					libraryCache.set(cacheKey, items);
					return items;
				}
			}
		} catch (e) { }

		try {
			let res = await fetch(`${base}/Users/${userId}/Items?ParentId=${parentId}&Limit=10&Recursive=true&SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=${ITEM_TYPES}&Fields=${FIELDS}&api_key=${token}`, { headers });
			if (res.ok) {
				const data = await res.json();
				let items = Array.isArray(data) ? data : (data?.Items || []);
				if (!items.length) {
					const resFallback = await fetch(`${base}/Users/${userId}/Items?ParentId=${parentId}&Limit=10&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Fields=${FIELDS}&api_key=${token}`, { headers });
					if (resFallback.ok) {
						const dataFallback = await resFallback.json();
						items = Array.isArray(dataFallback) ? dataFallback : (dataFallback?.Items || []);
					}
				}
				if (items.length) {
					libraryCache.set(cacheKey, items);
					return items;
				}
			}
		} catch (e) { }

		return [];
	}

	function getImageUrl(item, type, base, token) {
		const api = window.ApiClient || window.parent?.ApiClient || window.top?.ApiClient;
		const isBackdrop = type === 'Backdrop';
		const width = isBackdrop ? 640 : 220;
		const quality = isBackdrop ? 72 : 78;
		if (api && typeof api.getScaledImageUrl === 'function') {
			return api.getScaledImageUrl(item.Id, { type: type, quality: quality, fillWidth: width });
		}
		const tag = item.ImageTags?.[type] || (type === 'Primary' ? item.SeriesPrimaryImageTag : null);
		const tagParam = tag ? `&tag=${tag}` : '';
		const tokenParam = token ? `&api_key=${token}` : '';
		return `${base}/Items/${item.Id}/Images/${type}?quality=${quality}&fillWidth=${width}${tagParam}${tokenParam}`;
	}

	function escapeHtml(str) {
		return String(str || '').replace(/[&<>"']/g, c => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
		}[c]));
	}

	// Efficient debounced triggers
	let debounceTimer = null;
	function debouncedUpdate() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(updateLibraryBannerState, 60);
	}

	document.addEventListener('viewshow', debouncedUpdate);
	document.addEventListener('pageshow', debouncedUpdate);
	document.addEventListener('apiclientready', debouncedUpdate);
	document.addEventListener('DOMContentLoaded', debouncedUpdate);
	window.addEventListener('hashchange', debouncedUpdate);
	window.addEventListener('load', debouncedUpdate);

	// Efficient observer targeting page containers only
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.type === 'attributes' && m.attributeName === 'class') {
				if (m.target.classList && (m.target.classList.contains('page') || m.target.classList.contains('mainAnimatedPages'))) {
					debouncedUpdate();
					break;
				}
			}
		}
	});
	observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

})();
