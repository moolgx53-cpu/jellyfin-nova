"use strict";
(self.webpackChunk = self.webpackChunk || []).push([[8372], {
  5939: function (a, e, t) {
    t.r(e);
    e.default = `
<div id="indexPage" style="outline:0;padding:0!important" data-role="page" data-dom-cache="true"
  class="page homePage libraryPage allLibraryPage backdropPage pageWithAbsoluteTabs withTabs"
  data-backdroptype="movie,series,book">

  <link rel="stylesheet" href="ui/library-banner.css?v=1794000600">
  <script src="ui/library-banner.js?v=1794000600" defer></script>

  <style>
    .featurediframe {
      width: 100%; display: block; border: 0; margin: 0; padding: 0;
      height: 840px;
      scrollbar-width: none !important; -ms-overflow-style: none !important;
    }
    .featurediframe::-webkit-scrollbar { display: none !important; }
    @media (min-width: 1400px) {
      .featurediframe { height: 850px; }
    }
    @media (min-width: 1920px) {
      .featurediframe { height: 860px; }
    }
    @media (max-width: 1024px) {
      .featurediframe { height: 740px; }
    }
    @media (max-width: 768px) {
      .featurediframe { height: 630px; }
    }
    @media (max-width: 600px) {
      .featurediframe { height: 560px; }
    }
    @media (max-width: 768px) {
      .sectionTabs,
      .headerTabs,
      .emby-tabs,
      .emby-tabs-slider,
      .focuscontainer-x.sectionTabs,
      div[data-role="controlgroup"] {
        display: none !important;
      }
    }
  </style>

  <div class="tabContent pageTabContent is-active" id="homeTab" data-index="0">
    <iframe class="featurediframe" src="ui/spotlight.html?v=1794000600"></iframe>
    <div class="sections"></div>
  </div>

  <div class="tabContent pageTabContent" id="favoritesTab" data-index="1">
    <div class="sections"></div>
  </div>

</div>`;
  }
}]);

// Force dark theme
(function () {
  try {
    Object.keys(localStorage)
      .filter(k => k.endsWith('-appTheme'))
      .forEach(k => localStorage.setItem(k, 'dark'));

    const _setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      if (key.endsWith('-appTheme')) value = 'dark';
      _setItem(key, value);
    };
  } catch (e) {}
})();

// Ensure all Abyss stylesheets & scripts are loaded in Jellyfin Desktop/Mobile Apps
(function () {
  const VER = "1794000600";

  function ensureAssetLoaded() {
    const head = document.head || document.documentElement;
    const body = document.body || document.documentElement;
    if (!head) return;

    const styles = [
      ["abyss.css", `ui/abyss.css?v=${VER}`],
      ["library-banner.css", `ui/library-banner.css?v=${VER}`],
      ["movie-details.css", `ui/movie-details.css?v=${VER}`]
    ];
    styles.forEach(([key, href]) => {
      let link = document.querySelector(`link[href*="${key}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        head.appendChild(link);
      } else if (link.getAttribute("href") !== href) {
        link.setAttribute("href", href);
      }
    });

    const scripts = [
      ["abyss-state.js", `ui/abyss-state.js?v=${VER}`],
      ["library-banner.js", `ui/library-banner.js?v=${VER}`],
      ["movie-details.js", `ui/movie-details.js?v=${VER}`]
    ];
    scripts.forEach(([key, src]) => {
      if (!document.querySelector(`script[src*="${key}"]`)) {
        const s = document.createElement("script");
        s.src = src;
        s.defer = true;
        body.appendChild(s);
      }
    });
  }

  function bindHomeTabObserver() {
    const homeTabs = document.querySelectorAll('#indexPage #homeTab, .homePage #homeTab, [id="homeTab"]');
    let boundAny = false;
    homeTabs.forEach(homeTab => {
      boundAny = true;
      if (homeTab.dataset.abyssTabObserved === "true") return;
      const iframe = homeTab.querySelector(".featurediframe");
      if (!iframe) return;

      homeTab.dataset.abyssTabObserved = "true";
      const parentPage = homeTab.closest('.page, [data-role="page"]');
      if (parentPage) {
        const allTabs = parentPage.querySelectorAll('.tabContent, .pageTabContent');
        const anyActive = Array.from(allTabs).some(t => t.classList.contains('is-active'));
        if (!anyActive) {
          homeTab.classList.add('is-active');
        }
      }
      const syncDisplay = () => {
        const active = homeTab.classList.contains("is-active");
        iframe.style.display = active ? "block" : "none";
      };
      syncDisplay();
      new MutationObserver(syncDisplay).observe(homeTab, {
        attributes: true,
        attributeFilter: ["class"]
      });
    });
    return boundAny;
  }

  ensureAssetLoaded();
  bindHomeTabObserver();
  const bootObs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) {
        bindHomeTabObserver();
        break;
      }
    }
  });
  bootObs.observe(document.documentElement, { childList: true, subtree: true });
})();
