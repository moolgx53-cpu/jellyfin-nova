/**
 * nova-boot.js
 * ---------------------------------------------------------------
 * Boots Jellyfin Nova UI cleanly without modifying jellyfin-web
 * webpack chunks on disk:
 *  - Optionally locks Jellyfin web theme to dark
 *  - Injects responsive .featurediframe CSS rules
 *  - Automatically mounts the Spotlight & Top 10 iframe inside
 *    #indexPage #homeTab and keeps visibility synced with tabs
 * ---------------------------------------------------------------
 */
(function () {
    'use strict';

    var cfg = window.__NOVA_CONFIG__ || {};
    var VER = String(cfg.version || '1.0.0.0');
    var ENABLE_SPOTLIGHT = cfg.enableSpotlight !== false;
    var FORCE_DARK_THEME = cfg.forceDarkTheme !== false;
    var ENABLE_CUSTOM_VIDEO_OSD = cfg.enableCustomVideoOsd !== false;

    function normalizeHexColor(val) {
        var s = String(val || '').trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(s)) return s;
        if (/^[0-9a-f]{6}$/.test(s)) return '#' + s;
        return '#00d26a';
    }

    var ACCENT_COLOR = normalizeHexColor(cfg.accentColor);
    var ACCENT_R = parseInt(ACCENT_COLOR.slice(1, 3), 16);
    var ACCENT_G = parseInt(ACCENT_COLOR.slice(3, 5), 16);
    var ACCENT_B = parseInt(ACCENT_COLOR.slice(5, 7), 16);
    var ACCENT_RGB = ACCENT_R + ', ' + ACCENT_G + ', ' + ACCENT_B;

    var PERF_MODE = String(cfg.performanceMode || 'off').toLowerCase();
    var IS_LITE_MODE = false;
    if (PERF_MODE === 'on') {
        IS_LITE_MODE = true;
    } else if (PERF_MODE === 'auto') {
        try {
            var ua = navigator.userAgent || '';
            var isTvUa = /web0s|webos|tizen|smart-tv|smarttv|appletv|aftb|aftt|aftm|afts|bravia|viera|netcast|xbox|playstation/i.test(ua);
            var lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 3;
            var lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
            var reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            var isTvLayout = Boolean(document.body && document.body.classList.contains('layout-tv'));
            IS_LITE_MODE = isTvUa || lowMem || lowCpu || reducedMotion || isTvLayout;
        } catch (e) { }
    }
    cfg.isLiteMode = IS_LITE_MODE;
    window.__NOVA_CONFIG__ = cfg;

    try {
        var rootEl = document.documentElement;
        rootEl.style.setProperty('--nova-accent', ACCENT_COLOR);
        rootEl.style.setProperty('--nova-accent-rgb', ACCENT_RGB);

        var applyBodyFlags = function () {
            if (!ENABLE_CUSTOM_VIDEO_OSD) {
                rootEl.classList.add('nova-native-osd');
                if (document.body) document.body.classList.add('nova-native-osd');
            }
            if (IS_LITE_MODE) {
                rootEl.classList.add('nova-lite-mode');
                if (document.body) document.body.classList.add('nova-lite-mode');
            }
        };
        applyBodyFlags();
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', applyBodyFlags, { once: true });
        }
    } catch (e) { }

    // 1. Force dark theme (matches Jellyfin Nova glass/pitch-black design)
    if (FORCE_DARK_THEME) {
        try {
            Object.keys(localStorage)
                .filter(function (k) { return k.endsWith('-appTheme'); })
                .forEach(function (k) { localStorage.setItem(k, 'dark'); });

            if (!localStorage.__novaDarkPatched) {
                var origSetItem = localStorage.setItem.bind(localStorage);
                localStorage.setItem = function (key, value) {
                    if (typeof key === 'string' && key.endsWith('-appTheme')) {
                        value = 'dark';
                    }
                    return origSetItem(key, value);
                };
                localStorage.__novaDarkPatched = true;
            }
        } catch (e) { }
    }

    // 2. Inject responsive Spotlight iframe & home layout styles
    function ensureLayoutStyle() {
        var head = document.head || document.documentElement;
        if (!head) return;

        if (ACCENT_COLOR !== '#00d26a' && !document.getElementById('nova-accent-override-style')) {
            var accentStyle = document.createElement('style');
            accentStyle.id = 'nova-accent-override-style';
            accentStyle.textContent =
                ':root { --nova-accent: ' + ACCENT_COLOR + '; --nova-accent-rgb: ' + ACCENT_RGB + '; --abyss-accent-color: ' + ACCENT_COLOR + '; }\n' +
                '.abyss-seekbar-fill, .abyss-seekbar-knob, .abyss-hud-bar-fill, .mdl-slider-background-lower, .sliderKnobInner, .itemProgressBarForeground { background: var(--nova-accent) !important; background-color: var(--nova-accent) !important; }\n' +
                '.abyss-seekbar-knob, .sliderKnobInner { box-shadow: 0 0 10px var(--nova-accent), 0 0 4px var(--nova-accent) !important; }\n' +
                '.abyss-hud-pill .abyss-hud-icon-wrap, .abyss-hud-seek-delta { color: var(--nova-accent) !important; }\n';
            head.appendChild(accentStyle);
        }

        if (IS_LITE_MODE && !document.getElementById('nova-lite-mode-style')) {
            var liteStyle = document.createElement('style');
            liteStyle.id = 'nova-lite-mode-style';
            liteStyle.textContent =
                'html.nova-lite-mode *, html.nova-lite-mode *::before, html.nova-lite-mode *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }\n' +
                'html.nova-lite-mode .library-marquee-track { animation: none !important; }\n' +
                'html.nova-lite-mode .card:hover, html.nova-lite-mode .cardBox, html.nova-lite-mode .cardScalable { transition: none !important; }\n';
            head.appendChild(liteStyle);
        }

        if (!ENABLE_SPOTLIGHT) return;
        if (document.getElementById('nova-spotlight-layout-style')) return;

        var style = document.createElement('style');
        style.id = 'nova-spotlight-layout-style';
        style.textContent =
            '#indexPage.homePage { padding: 0 !important; outline: 0; }\n' +
            '.featurediframe {\n' +
            '  width: 100%; display: block; border: 0; margin: 0; padding: 0;\n' +
            '  height: 840px;\n' +
            '  scrollbar-width: none !important; -ms-overflow-style: none !important;\n' +
            '}\n' +
            '.featurediframe::-webkit-scrollbar { display: none !important; }\n' +
            '@media (min-width: 1400px) { .featurediframe { height: 850px; } }\n' +
            '@media (min-width: 1920px) { .featurediframe { height: 860px; } }\n' +
            '@media (max-width: 1024px) { .featurediframe { height: 740px; } }\n' +
            '@media (max-width: 768px) { .featurediframe { height: 630px; } }\n' +
            '@media (max-width: 600px) { .featurediframe { height: 560px; } }\n' +
            '@media (max-width: 768px) {\n' +
            '  .sectionTabs,\n' +
            '  .headerTabs,\n' +
            '  .emby-tabs,\n' +
            '  .emby-tabs-slider,\n' +
            '  .focuscontainer-x.sectionTabs,\n' +
            '  div[data-role="controlgroup"] {\n' +
            '    display: none !important;\n' +
            '  }\n' +
            '}\n';
        head.appendChild(style);
    }

    // 3. Ensure stylesheets are present even in Desktop/Mobile WebViews
    function ensureAssetsLoaded() {
        var head = document.head || document.documentElement;
        if (!head) return;

        var styles = [
            ['abyss.css', 'ui/abyss.css?v=' + VER],
            ['library-banner.css', 'ui/library-banner.css?v=' + VER],
            ['movie-details.css', 'ui/movie-details.css?v=' + VER]
        ];
        for (var i = 0; i < styles.length; i++) {
            var key = styles[i][0];
            var href = styles[i][1];
            var link = document.querySelector('link[href*="' + key + '"]');
            if (!link) {
                link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                head.appendChild(link);
            }
        }
    }

    // 4. Inject Spotlight iframe into #indexPage #homeTab and keep tab visibility synced
    function mountSpotlightIframe() {
        if (!ENABLE_SPOTLIGHT) return;

        var homeTabs = document.querySelectorAll('#indexPage #homeTab, .homePage #homeTab');
        for (var i = 0; i < homeTabs.length; i++) {
            var homeTab = homeTabs[i];
            var iframe = homeTab.querySelector('iframe.featurediframe');

            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.className = 'featurediframe';
                iframe.setAttribute('src', 'ui/spotlight.html?v=' + VER);
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allowtransparency', 'true');

                var sections = homeTab.querySelector('.sections');
                if (sections && sections.parentNode === homeTab) {
                    homeTab.insertBefore(iframe, sections);
                } else {
                    homeTab.insertBefore(iframe, homeTab.firstChild);
                }
            }

            if (homeTab.dataset.novaTabObserved !== 'true') {
                homeTab.dataset.novaTabObserved = 'true';
                (function (tab, frame) {
                    var parentPage = tab.closest('.page, [data-role="page"]');
                    if (parentPage) {
                        var allTabs = parentPage.querySelectorAll('.tabContent, .pageTabContent');
                        var anyActive = false;
                        for (var j = 0; j < allTabs.length; j++) {
                            if (allTabs[j].classList.contains('is-active')) {
                                anyActive = true;
                                break;
                            }
                        }
                        if (!anyActive) {
                            tab.classList.add('is-active');
                        }
                    }

                    var syncDisplay = function () {
                        var active = tab.classList.contains('is-active');
                        frame.style.display = active ? 'block' : 'none';
                    };

                    syncDisplay();
                    try {
                        new MutationObserver(syncDisplay).observe(tab, {
                            attributes: true,
                            attributeFilter: ['class']
                        });
                    } catch (e) { }
                })(homeTab, iframe);
            }
        }
    }

    function boot() {
        ensureLayoutStyle();
        ensureAssetsLoaded();
        mountSpotlightIframe();
    }

    boot();

    try {
        var timer = null;
        var obs = null;
        var checkAndDisconnectIfBound = function () {
            if (!obs) return;
            var boundTab = document.querySelector('#indexPage #homeTab[data-nova-tab-observed="true"]');
            if (boundTab) {
                obs.disconnect();
                obs = null;
            }
        };

        var scheduleMount = function () {
            if (timer) return;
            timer = setTimeout(function () {
                timer = null;
                mountSpotlightIframe();
                checkAndDisconnectIfBound();
            }, 60);
        };

        obs = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (!m.addedNodes || !m.addedNodes.length) continue;
                var target = m.target;
                if (target && target.nodeType === 1 && target.closest && target.closest('#videoOsdPage, .videoOsdBottom, .videoSubtitles, .videoSubtitlesInner, .itemsContainer, .scrollSlider, .abyss-custom-osd-bar, .abyss-gesture-hud')) {
                    continue;
                }
                for (var j = 0; j < m.addedNodes.length; j++) {
                    if (m.addedNodes[j].nodeType === 1) {
                        scheduleMount();
                        return;
                    }
                }
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        checkAndDisconnectIfBound();

        window.addEventListener('hashchange', scheduleMount, { passive: true });
        document.addEventListener('viewshow', scheduleMount, { passive: true });
        document.addEventListener('pageshow', scheduleMount, { passive: true });
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } catch (e) { }
})();
