import { defineMessages } from '../../i18n/defineMessages';
import type { HomeCardPart, HomeMapPoint, HomePromise, HomeSection, HomeStep } from './home.config';

/** Texts of the home page (ADR-15, ADR-24). Sizes and distances arrive already formatted. */
export const homeMessages = defineMessages({
  es: {
    navLabel: 'Secciones de la página',
    nav: { guide: 'La guía', how: 'Cómo funciona', map: 'El mapa', privacy: 'Privacidad' } satisfies Record<HomeSection, string>,
    signIn: 'Iniciar sesión',
    open: 'Abrir Trino',
    title: 'Trino reconoce las aves por su canto.',
    lede: 'Sales a caminar con el teléfono encendido. Trino escucha, reconoce cada ave sin conexión y la deja en tu mapa y en tu álbum.',
    firstDownload: (size: string) => `La primera vez descarga ${size} para funcionar sin señal.`,
    scene: {
      label: 'Ejemplo de una caminata: cinco aves quedan pegadas a lo largo del camino',
      now: 'Canta ahora',
      example: 'Ejemplo',
    },
    album: {
      title: 'Tu álbum',
      page: 'Aves de Bogotá',
      found: (found: string, total: string) => `${found} de ${total} en esta página`,
      toFind: 'Por descubrir',
      cardTitle: 'Y cada ave tiene su ficha',
      cardText: 'También las que aún no has oído, para saber qué buscar.',
    },
    how: {
      title: 'Cómo funciona',
      steps: {
        listen: { title: 'Escucha', text: 'Pulsas una vez. El audio se analiza en tu teléfono y no se guarda.' },
        identify: { title: 'Reconoce', text: 'Trino identifica el canto y te dice qué tan seguro está.' },
        collect: { title: 'Colecciona', text: 'Cada ave va a tu álbum y a tu mapa, con su hora y su lugar.' },
      } satisfies Record<HomeStep, { title: string; text: string }>,
    },
    guide: {
      parts: {
        about: { title: 'Qué ave es', text: 'Descripción de Wikipedia, familia y estado de conservación.' },
        range: { title: 'Dónde vive', text: 'Mapa de su distribución con registros de GBIF.' },
        when: { title: 'Cuándo la oyes', text: 'Tus registros por hora y por lugar.' },
      } satisfies Record<HomeCardPart, { title: string; text: string }>,
    },
    map: {
      title: 'El mapa',
      text: 'Sales a caminar con Trino abierto y el mapa se va llenando detrás de ti.',
      points: {
        pins: 'Cada ave queda en el punto donde la oíste.',
        territories: 'Cada zona que recorres toma el color del ave que más oíste en ella.',
        sharing: 'El recorrido se guarda solo en tu teléfono, y tú decides si tus aves aparecen en el mapa de todos, sin tu nombre.',
      } satisfies Record<HomeMapPoint, string>,
      sceneCaption: 'Ejemplo de un barrio a medio explorar',
    },
    privacy: {
      title: 'Privacidad',
      promises: {
        audio: 'El audio se analiza en tu teléfono y no se envía a ningún servidor.',
        account: 'La cuenta es opcional: sin ella todo funciona en el teléfono.',
        offline: 'Funciona sin conexión y sube tus cantos cuando vuelve la señal.',
      } satisfies Record<Exclude<HomePromise, 'location'>, string>,
      location: (distance: string) => `Tu posición se redondea a unos ${distance} y tú decides si tus cantos se ven en el mapa de todos.`,
      link: 'Leer la política de privacidad',
    },
    caveat: 'Las detecciones son indicios con su nivel de confianza, no certezas. Que un ave no se detecte no significa que no esté.',
    credits: 'Modelo BirdNET (K. Lisa Yang Center, Cornell Lab of Ornithology) · Nombres de eBird · Fotos y textos de Wikimedia y Wikipedia · Distribución de GBIF',
  },
  en: {
    navLabel: 'Sections of the page',
    nav: { guide: 'The guide', how: 'How it works', map: 'The map', privacy: 'Privacy' },
    signIn: 'Sign in',
    open: 'Open Trino',
    title: 'Trino recognizes birds by their song.',
    lede: 'You go for a walk with the phone on. Trino listens, recognizes each bird offline and puts it on your map and in your album.',
    firstDownload: (size: string) => `The first time it downloads ${size} so it works without signal.`,
    scene: {
      label: 'Example of a walk: five birds are pinned along the path',
      now: 'Singing now',
      example: 'Example',
    },
    album: {
      title: 'Your album',
      page: 'Birds of Bogotá',
      found: (found: string, total: string) => `${found} of ${total} on this page`,
      toFind: 'To find',
      cardTitle: 'And every bird has its card',
      cardText: 'Also the ones you have not heard yet, so you know what to look for.',
    },
    how: {
      title: 'How it works',
      steps: {
        listen: { title: 'Listen', text: 'You tap once. Audio is analysed on your phone and is not kept.' },
        identify: { title: 'Identify', text: 'Trino recognizes the song and tells you how sure it is.' },
        collect: { title: 'Collect', text: 'Each bird goes to your album and your map, with its time and place.' },
      },
    },
    guide: {
      parts: {
        about: { title: 'Which bird it is', text: 'Description from Wikipedia, family and conservation status.' },
        range: { title: 'Where it lives', text: 'Range map with records from GBIF.' },
        when: { title: 'When you hear it', text: 'Your records by hour and by place.' },
      },
    },
    map: {
      title: 'The map',
      text: 'You go for a walk with Trino open and the map fills in behind you.',
      points: {
        pins: 'Each bird stays at the spot where you heard it.',
        territories: 'Each area you cover takes the color of the bird you heard most in it.',
        sharing: 'The path is kept only on your phone, and you decide whether your birds appear on everyone’s map, without your name.',
      },
      sceneCaption: 'Example of a half-explored neighbourhood',
    },
    privacy: {
      title: 'Privacy',
      promises: {
        audio: 'Audio is analysed on your phone and is not sent to any server.',
        account: 'The account is optional: without it everything works on the phone.',
        offline: 'It works offline and uploads your songs when the signal is back.',
      },
      location: (distance: string) => `Your position is rounded to about ${distance} and you decide whether your songs show on everyone’s map.`,
      link: 'Read the privacy policy',
    },
    caveat: 'Detections are hints with a confidence level, not certainties. A bird that is not detected may still be there.',
    credits: 'BirdNET model (K. Lisa Yang Center, Cornell Lab of Ornithology) · Names from eBird · Photos and texts from Wikimedia and Wikipedia · Range from GBIF',
  },
});
