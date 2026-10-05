export const CMP_SELECTORS: readonly string[] = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#onetrust-pc-sdk",
  ".onetrust-pc-dark-filter",
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyUnderlay",
  "#CybotCookiebotDialogBodyEdgeMoreLink",
  "#qc-cmp2-container",
  ".qc-cmp2-container",
  ".klaro",
  "#klaro",
  "#truste-consent-track",
  "#truste-consent-overlay",
  ".truste_box_overlay",
  "#didomi-host",
  "#didomi-popup",
  ".didomi-popup-backdrop",
  "#usercentrics-root",
  "[data-testid=uc-root]",
  "#iubenda-cs-banner",
  ".iubenda-cs-overlay",
  "#iubenda-cs",
  ".cky-consent-container",
  ".cky-overlay",
  ".cky-modal",
  ".osano-cm-window",
  ".osano-cm-dialog",
  "#cmplz-cookiebanner-container",
  ".cmplz-cookiebanner",
  "#termly-code-snippet-support",
  "#tarteaucitronRoot",
  "#cookie-law-info-bar",
  ".cli-modal-backdrop",
  "#hs-eu-cookie-confirmation",
  "#hs-eu-dialog",
  "[id^=sp_message_container_]",
  "#sp_privacy_manager_container",
  "[id^=axeptio_]",
  ".axeptio_widget",
  "#cookiescript_injected",
  ".cookiescript_injected",
  "#cookiescript_overlay",
  ".cc-window",
  ".cc-banner",
  ".cc-container",
  "[id*=cookie-banner]",
  "[class*=cookie-banner]",
  "[id*=cookie-consent]",
  "[class*=cookie-consent]",
  "[id*=cookie-notice]",
  "[class*=cookie-notice]",
  "[id*=cookie-popup]",
  "[class*=cookie-popup]",
  "[id*=consent-banner]",
  "[class*=consent-banner]",
  "[id*=gdpr-banner]",
  "[class*=gdpr-banner]",
];

export function buildBannerRemovalScript(
  selectors: readonly string[] = CMP_SELECTORS,
  sweepLifetimeMs = 30_000,
): string {
  return `(() => {
  const SELECTORS = ${JSON.stringify(selectors)};
  const LIFETIME = ${sweepLifetimeMs};
  const ELEMENT_LIMIT = 15000;
  const REMOVE_LIMIT_PER_PASS = 60;
  let removedTotal = 0;
  const validSelectors = SELECTORS.filter((selector) => {
    try { document.querySelector(selector); return true; } catch (e) { return false; }
  });
  const selectorList = validSelectors.join(",");
  const collectAll = () => {
    const out = [];
    const queue = [document];
    let qi = 0;
    let visited = 0;
    while (qi < queue.length) {
      const node = queue[qi++];
      if (!node || typeof node.querySelectorAll !== "function") continue;
      if (selectorList) out.push(...node.querySelectorAll(selectorList));
      const kids = node.querySelectorAll("*");
      for (const k of kids) {
        if (k.shadowRoot) queue.push(k.shadowRoot);
        visited++;
        if (visited >= ELEMENT_LIMIT) return out;
      }
    }
    return out;
  };
  const unlockScroll = () => {
    const body = document.body;
    const html = document.documentElement;
    if (body) {
      ["overflow", "position", "top", "right", "margin-right", "padding-right", "width"].forEach((p) => {
        if (body.style.getPropertyValue(p)) body.style.removeProperty(p);
      });
      body.className = String(body.className).replace(/(^|\\s)(overflow-hidden|overflow-hidden-body|noscroll|no-scroll|modal-open)(?=\\s|$)/g, " ");
    }
    if (html) {
      ["overflow"].forEach((p) => {
        if (html.style.getPropertyValue(p)) html.style.removeProperty(p);
      });
    }
  };
  const sweep = () => {
    if (!document.body) return 0;
    const els = collectAll();
    let removed = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.isConnected) continue;
      try { el.remove(); } catch (e) { continue; }
      removed++;
      if (removed >= REMOVE_LIMIT_PER_PASS) break;
    }
    if (removed > 0) {
      removedTotal += removed;
      unlockScroll();
    }
    return removed;
  };
  let stopped = false;
  let debounceTimer = null;
  sweep();
  const timer = setInterval(() => { if (!stopped) sweep(); }, 300);
  const observer = new MutationObserver(() => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { if (!stopped) sweep(); }, 60);
  });
  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  setTimeout(() => {
    stopped = true;
    clearInterval(timer);
    observer.disconnect();
  }, LIFETIME);
  window.__snapforgeBannerSweep = {
    run: sweep,
    count: () => removedTotal,
  };
})();`;
}

export function buildBannerStyleCss(selectors: readonly string[] = CMP_SELECTORS): string {
  return selectors.map((selector) => `${selector}{display:none!important}`).join("\n");
}
