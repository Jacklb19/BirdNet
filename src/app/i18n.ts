import { defineMessages } from '../i18n/defineMessages';

/** Application shell: document metadata, navigation, the live player and page-level fallbacks. */
export const appMessages = defineMessages({
  es: {
    name: 'BirdNet',
    edition: 'Local',
    documentTitle: 'BirdNet Local — Monitoreo acústico de aves',
    description: 'Escucha, identifica y registra aves en el teléfono, incluso sin conexión.',
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
    name: 'BirdNet',
    edition: 'Local',
    documentTitle: 'BirdNet Local — Acoustic bird monitoring',
    description: 'Listen to, identify and log birds on your phone, even offline.',
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
