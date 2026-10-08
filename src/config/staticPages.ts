/**
 * Plain HTML pages served next to the app (public/). Navigations to them must reach the network, not the app shell
 * the service worker serves for every other path.
 */
export const PRIVACY_PAGE_URL = '/privacy.html';

export const STATIC_PAGES: readonly string[] = Object.freeze([PRIVACY_PAGE_URL]);
