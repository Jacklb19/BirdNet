import { defineMessages } from '../../i18n/defineMessages';
import type { HomeFeature, HomePromise, HomeStep } from './home.config';

/** Texts of the home page (ADR-15). The model size arrives already formatted. */
export const homeMessages = defineMessages({
  es: {
    signIn: 'Iniciar sesión',
    headline: 'Las aves de tu barrio,',
    headlineAccent: 'por su canto.',
    lede: 'Trino escucha con el micrófono del teléfono, reconoce las aves con el modelo BirdNET sin conexión y anota cada canto con su hora, su zona y qué tan seguro está.',
    start: 'Empezar a escuchar',
    account: 'Iniciar sesión o crear cuenta',
    collageLabel: 'Algunas aves que se oyen en Bogotá',
    note: {
      download: (size: string) => `Al empezar se descarga una sola vez el modelo (${size}). Después funciona sin señal.`,
      downloadUnknownSize: 'Al empezar se descarga una sola vez el modelo. Después funciona sin señal.',
      downloading: 'El modelo se está descargando: después funciona sin señal.',
      ready: 'El modelo ya está en este teléfono: funciona sin señal.',
      unmanaged: 'En esta versión el modelo se carga cuando empiezas a escuchar.',
    },
    howTitle: 'Cómo funciona',
    steps: {
      listen: { title: 'Escucha', text: 'Pulsa una vez y deja el teléfono quieto. Analiza ventanas de 3 segundos sin parar.' },
      identify: { title: 'Reconoce', text: 'BirdNET identifica el canto en el propio teléfono, también sin señal.' },
      record: { title: 'Registra', text: 'Cada ave queda en tu bitácora con su confianza, su hora y su zona aproximada.' },
    } satisfies Record<HomeStep, { title: string; text: string }>,
    featuresTitle: 'Qué puedes hacer',
    features: {
      album: { title: 'Llenar tu álbum', text: 'Cada especie que registras se pega como una calcomanía.' },
      guide: { title: 'Conocer cada ave', text: 'Fichas con foto, descripción y cuándo y dónde la oíste.' },
      map: { title: 'Ver el mapa de todos', text: 'Los cantos de la comunidad, con la foto de cada ave.' },
      sites: { title: 'Seguir tus lugares', text: 'Reloj del coro, especies por sitio y exportación a CSV.' },
    } satisfies Record<HomeFeature, { title: string; text: string }>,
    privacyTitle: 'Tu privacidad',
    promises: {
      audio: 'El audio se analiza en tu teléfono y no se envía a ningún servidor.',
      location: 'Tu posición se redondea a unos 10 m y tú decides si tus cantos se ven en el mapa de todos.',
      account: 'La cuenta es opcional: sin ella todo funciona en el teléfono.',
      offline: 'Funciona sin conexión y sube tus cantos cuando vuelve la señal.',
    } satisfies Record<HomePromise, string>,
    privacyLink: 'Leer la política de privacidad',
    caveat: 'Las detecciones son indicios con su nivel de confianza, no certezas. Que un ave no se detecte no significa que no esté.',
    credits: 'Modelo BirdNET (K. Lisa Yang Center, Cornell Lab of Ornithology) · Nombres de eBird · Fotos y textos de Wikimedia y Wikipedia',
  },
  en: {
    signIn: 'Sign in',
    headline: 'The birds around you,',
    headlineAccent: 'by their song.',
    lede: 'Trino listens through your phone’s microphone, recognizes birds with the BirdNET model offline and logs each song with its time, its area and how sure it is.',
    start: 'Start listening',
    account: 'Sign in or create an account',
    collageLabel: 'Some birds you can hear in Bogotá',
    note: {
      download: (size: string) => `When you start, the model (${size}) downloads once. After that it works without signal.`,
      downloadUnknownSize: 'When you start, the model downloads once. After that it works without signal.',
      downloading: 'The model is downloading: after that it works without signal.',
      ready: 'The model is already on this phone: it works without signal.',
      unmanaged: 'In this version the model loads when you start listening.',
    },
    howTitle: 'How it works',
    steps: {
      listen: { title: 'Listen', text: 'Tap once and keep the phone still. It analyses 3-second windows non-stop.' },
      identify: { title: 'Identify', text: 'BirdNET recognizes the song on the phone itself, even without signal.' },
      record: { title: 'Record', text: 'Each bird goes into your log with its confidence, time and approximate area.' },
    },
    featuresTitle: 'What you can do',
    features: {
      album: { title: 'Fill your album', text: 'Every species you record sticks in like a sticker.' },
      guide: { title: 'Get to know each bird', text: 'Cards with a photo, a description and when and where you heard it.' },
      map: { title: 'See everyone’s map', text: 'The community’s songs, with each bird’s photo.' },
      sites: { title: 'Follow your places', text: 'Chorus clock, species per site and CSV export.' },
    },
    privacyTitle: 'Your privacy',
    promises: {
      audio: 'Audio is analysed on your phone and is not sent to any server.',
      location: 'Your position is rounded to about 10 m and you decide whether your songs show on everyone’s map.',
      account: 'The account is optional: without it everything works on the phone.',
      offline: 'It works offline and uploads your songs when the signal is back.',
    },
    privacyLink: 'Read the privacy policy',
    caveat: 'Detections are hints with a confidence level, not certainties. A bird that is not detected may still be there.',
    credits: 'BirdNET model (K. Lisa Yang Center, Cornell Lab of Ornithology) · Names from eBird · Photos and texts from Wikimedia and Wikipedia',
  },
});
