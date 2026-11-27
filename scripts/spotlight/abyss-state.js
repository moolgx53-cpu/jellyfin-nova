/**
 * abyss-state.js
 * ---------------------------------------------------------------
 * Sets helper classes on document.body based on current DOM state.
 * Replaces body:has(...) selectors for compatibility with older
 * smart TVs, WebViews, and browsers without selector recalculation lag.
 * ---------------------------------------------------------------
 */
(function () {
    'use strict';

    // Guard querySelector/querySelectorAll/matches/closest against unsupported :has(...) selectors
    // in Qt5WebEngine (Chromium 83) so third-party plugins (e.g. Jellyfin Enhanced) do not throw
    // thousands of DOMException errors on every frame.
    try {
        var supportsHas = false;
        try {
            document.querySelector(':has(*)');
            supportsHas = true;
        } catch (e) {
            supportsHas = false;
        }
        if (!supportsHas) {
            var emptyNodeList = document.createDocumentFragment().childNodes;
            var sanitizeHasSelector = function (sel) {
                if (typeof sel !== 'string' || sel.indexOf(':has(') === -1) return sel;
                var parts = sel.split(',');
                var valid = [];
                for (var i = 0; i < parts.length; i++) {
                    if (parts[i].indexOf(':has(') === -1) {
                        valid.push(parts[i]);
                    }
                }
                return valid.length ? valid.join(',') : null;
            };

            var wrapQuery = function (proto, method, fallbackVal) {
                if (!proto || typeof proto[method] !== 'function') return;
                var orig = proto[method];
                proto[method] = function (sel) {
                    try {
                        return orig.call(this, sel);
                    } catch (err) {
                        var cleaned = sanitizeHasSelector(sel);
                        if (cleaned) {
                            try { return orig.call(this, cleaned); } catch (e2) { }
                        }
                        return typeof fallbackVal === 'function' ? fallbackVal() : fallbackVal;
                    }
                };
            };

            wrapQuery(Element.prototype, 'querySelector', null);
            wrapQuery(Element.prototype, 'querySelectorAll', function () { return emptyNodeList; });
            wrapQuery(Element.prototype, 'matches', false);
            wrapQuery(Element.prototype, 'closest', null);
            wrapQuery(Document.prototype, 'querySelector', null);
            wrapQuery(Document.prototype, 'querySelectorAll', function () { return emptyNodeList; });
            if (typeof DocumentFragment !== 'undefined') {
                wrapQuery(DocumentFragment.prototype, 'querySelector', null);
                wrapQuery(DocumentFragment.prototype, 'querySelectorAll', function () { return emptyNodeList; });
            }
        }
    } catch (e) { }

    var body = document.body;
    if (!body) return;

    function setVideoState() {
        var hash = (window.location.hash || '').toLowerCase();
        var osd = document.getElementById('videoOsdPage');
        var hasVideoOsd = Boolean(osd && !osd.classList.contains('hide') && osd.style.display !== 'none');
        if (!hasVideoOsd && !hash.includes('video')) {
            body.classList.remove('abyss-video-playing', 'abyss-osd-hidden', 'videoPlayerPage');
            return;
        }
        body.classList.toggle('abyss-video-playing', hasVideoOsd);
    }

    function setItemDetailState() {
        var detail = document.querySelector('#itemDetailPage:not(.hide), .itemDetailPage:not(.hide)');
        body.classList.toggle('abyss-item-detail', Boolean(detail));
    }

    function setThemeLockedState() {
        var hasSelectTheme = Boolean(document.getElementById('selectTheme') || document.getElementById('selectDashboardTheme'));
        body.classList.toggle('abyss-theme-locked', hasSelectTheme);
    }

    function setCollectionFolderState() {
        var hasCollectionFolder = Boolean(document.querySelector('#indexPage:not(.hide) .verticalSection [data-type="CollectionFolder"]'));
        body.classList.toggle('abyss-collection-folder-visible', hasCollectionFolder);
    }

    function setFeaturedIframeState() {
        var hasFeaturedIframe = Boolean(document.querySelector('.featurediframe'));
        body.classList.toggle('abyss-has-featurediframe', hasFeaturedIframe);
    }

    function setHomeVisibleState() {
        var indexPage = document.querySelector('#indexPage.homePage:not(.hide), .homePage:not(.hide)');
        var homeVisible = Boolean(indexPage);
        body.classList.toggle('abyss-home-visible', homeVisible);
    }

    function setNowPlayingState() {
        var nowPlaying = Boolean(document.querySelector('.nowPlayingBar:not(.hide)'));
        body.classList.toggle('abyss-now-playing', nowPlaying);
    }

    function cleanDuplicateBrandingCss() {
        var links = document.querySelectorAll('link[rel="stylesheet"][href*="Branding/Css"], style#cssBranding');
        for (var i = 0; i < links.length; i++) {
            var el = links[i];
            if (el.tagName === 'LINK') {
                el.disabled = true;
                if (el.parentNode) el.parentNode.removeChild(el);
            } else if (el.textContent && el.textContent.indexOf('cdn.jsdelivr.net/gh/AumGupta/abyss-jellyfin') !== -1) {
                el.textContent = '';
            }
        }
    }

    function applyAll() {
        setVideoState();
        setItemDetailState();
        setThemeLockedState();
        setCollectionFolderState();
        setFeaturedIframeState();
        setHomeVisibleState();
        setNowPlayingState();
    }

    var throttleTimer = null;
    function scheduleApply() {
        if (throttleTimer) return;
        throttleTimer = setTimeout(function () {
            throttleTimer = null;
            applyAll();
        }, 120);
    }

    cleanDuplicateBrandingCss();
    setTimeout(cleanDuplicateBrandingCss, 1500);
    applyAll();

    try {
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                var t = m.target;
                if (!t || t.nodeType !== 1) continue;
                if (m.type === 'attributes') {
                    if (t.id === 'indexPage' || t.id === 'videoOsdPage' || t.id === 'itemDetailPage' || t === body || (t.classList && (t.classList.contains('page') || t.classList.contains('nowPlayingBar')))) {
                        scheduleApply();
                        return;
                    }
                    continue;
                }
                if (t.closest && t.closest('.abyss-custom-osd-bar, .abyss-gesture-hud, .abyss-card-trailer-stage, .library-hero-banner, #videoOsdPage, .videoOsdBottom, .videoSubtitles, .videoSubtitlesInner, .nowPlayingBar, .itemsContainer, .scrollSlider, .card')) {
                    continue;
                }
                scheduleApply();
                return;
            }
        });
        observer.observe(body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    } catch (e) { }

    window.addEventListener('hashchange', scheduleApply, { passive: true });
    window.addEventListener('popstate', scheduleApply, { passive: true });
})();
