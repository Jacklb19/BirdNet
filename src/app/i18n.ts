import { defineMessages } from '../i18n/defineMessages';

/** Application shell: document metadata, navigation, the live player and page-level fallbacks. */
export const appMessages = defineMessages({
  es: {
    name: 'Trino',
    documentTitle: 'Trino — Reconoce las aves por su canto',
    description: 'Sal a caminar: Trino reconoce las aves por su canto en tu teléfono, sin conexión, y las deja en tu mapa y en tu álbum.',
    skipToContent: 'Saltar al contenido',
    navLabel: 'Secciones',
    nav: { listen: 'Escuchar', log: 'Bitácora', map: 'Mapa', sites: 'Sitios', account: 'Cuenta' },
    accountButton: 'Cuenta y ajustes',
    live: {
      region: 'Escucha en curso',
      singingNow: (name: string) => `${name} canta ahora`,
      waiting: 'Atento a nuevos cantos',
      preparing: 'Preparando el modelo…',
      listening: (elapsed: string) => `Escuchando · ${elapsed}`,
      stop: 'Detener la escucha',
      open: 'Ir a Escuchar',
    },
    pageError: 'Esta sección no se pudo abrir. Recarga la página para intentarlo de nuevo.',
    reload: 'Recargar',
  },
  en: {
    name: 'Trino',
    documentTitle: 'Trino — Know the birds by their song',
    description: 'Go for a walk: Trino recognizes birds by their song on your phone, offline, and puts them on your map and in your album.',
    skipToContent: 'Skip to content',
    navLabel: 'Sections',
    nav: { listen: 'Listen', log: 'Log', map: 'Map', sites: 'Sites', account: 'Account' },
    accountButton: 'Account and settings',
    live: {
      region: 'Listening in progress',
      singingNow: (name: string) => `${name} is singing`,
      waiting: 'Waiting for the next song',
      preparing: 'Preparing the model…',
      listening: (elapsed: string) => `Listening · ${elapsed}`,
      stop: 'Stop listening',
      open: 'Go to Listen',
    },
    pageError: 'This section could not be opened. Reload the page to try again.',
    reload: 'Reload',
  },
});
