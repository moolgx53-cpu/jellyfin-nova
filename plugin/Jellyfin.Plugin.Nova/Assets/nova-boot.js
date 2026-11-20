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
        if (!ENABLE_SPOTLIGHT) return;
        if (document.getElementById('nova-spotlight-layout-style')) return;
        var head = document.head || document.documentElement;
        if (!head) return;

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
        var scheduleMount = function () {
            if (timer) return;
            timer = setTimeout(function () {
                timer = null;
                mountSpotlightIframe();
            }, 60);
        };

        var obs = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
                    scheduleMount();
                    return;
                }
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });

        window.addEventListener('hashchange', scheduleMount, { passive: true });
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } catch (e) { }
})();
