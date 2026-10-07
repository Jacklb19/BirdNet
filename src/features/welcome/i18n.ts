import { defineMessages } from '../../i18n/defineMessages';
import type { WelcomeFeature } from './welcome.config';

/** Texts of the welcome feature. The model size arrives already formatted. */
export const welcomeMessages = defineMessages({
  es: {
    headline: 'Descubre qué aves cantan a tu alrededor',
    featuresLabel: 'Qué hace la app',
    features: {
      offline: 'Funciona sin señal, en el campo',
      privacy: 'El audio no sale de tu teléfono sin tu permiso',
      sites: 'Lleva el registro de tus lugares',
    } satisfies Record<WelcomeFeature, string>,
    start: 'Empezar',
    note: {
      download: (size: string) => `Descargaremos el modelo (${size}) para que funcione sin señal. Mejor con Wi-Fi.`,
      downloadUnknownSize: 'Descargaremos el modelo para que funcione sin señal. Mejor con Wi-Fi.',
      downloading: 'El modelo ya se está descargando para que funcione sin señal.',
      ready: 'El modelo ya está en este teléfono: funciona sin señal.',
      unmanaged: 'En esta versión el modelo se carga cuando empiezas a escuchar.',
    },
  },
  en: {
    headline: 'Discover which birds are singing around you',
    featuresLabel: 'What the app does',
    features: {
      offline: 'Works without signal, out in the field',
      privacy: 'Audio does not leave your phone without your permission',
      sites: 'Keeps a record of your places',
    },
    start: 'Get started',
    note: {
      download: (size: string) => `We will download the model (${size}) so it works without signal. Best on Wi-Fi.`,
      downloadUnknownSize: 'We will download the model so it works without signal. Best on Wi-Fi.',
      downloading: 'The model is already downloading so it works without signal.',
      ready: 'The model is already on this phone: it works without signal.',
      unmanaged: 'In this version the model loads when you start listening.',
    },
  },
});
