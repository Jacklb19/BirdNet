import { defineMessages } from '../../i18n/defineMessages';

/** Texts of the listen feature. */
export const listenMessages = defineMessages({
  es: {
    title: 'Escuchar',
    listening: 'Escuchando',
    listenAt: (site: string) => `Escuchar en ${site}`,
    listeningAt: (site: string) => `Escuchando en ${site}`,
    since: (time: string) => `Desde las ${time}`,
    sinceFor: (time: string, duration: string) => `Desde las ${time} · ${duration}`,
    live: 'En vivo',
    site: {
      label: 'Sitio de la escucha',
      none: 'Sin sitio',
      create: 'Sin sitio. Crea uno en Sitios',
      error: 'No se pudo cambiar el sitio. Inténtalo de nuevo.',
    },
    spectrogram: {
      label: (span: string, low: string, high: string) =>
        `Espectrograma en vivo de los últimos ${span}, de ${low} a ${high}. El tramo de color es el último fragmento analizado.`,
      stopped: (low: string, high: string) => `Espectrograma del final de la última escucha, de ${low} a ${high}.`,
      empty: 'Espectrograma vacío: todavía no hay sonido analizado.',
      placeholder: 'El sonido aparecerá aquí',
    },
    list: {
      live: 'Escuchando ahora',
      last: 'Última escucha',
      count: {
        one: (count: string) => `${count} especie`,
        other: (count: string) => `${count} especies`,
      },
      detail: (confidence: string, heard: string) => `${confidence} · ${heard}`,
      heard: {
        now: 'canta ahora',
        moment: 'hace un momento',
        minutes: (count: string) => `hace ${count} min`,
        hours: (count: string) => `hace ${count} h`,
      },
    },
    states: {
      idle: { title: 'Listo para escuchar', text: 'Empieza a escuchar y el teléfono identificará las aves que canten cerca.' },
      preparingModel: { title: 'Preparando el modelo…', text: 'El modelo de identificación se carga en el teléfono; tarda unos segundos.' },
      waitingMicrophone: { title: 'Esperando el micrófono', text: 'Si el navegador lo pide, permite el acceso al micrófono.' },
      waiting: { title: 'Atento a nuevos cantos', text: 'Las especies aparecerán aquí, con su confianza, en cuanto el modelo reconozca un canto.' },
    },
    record: {
      start: 'Empezar a escuchar',
      stop: (elapsed: string) => `Detener · ${elapsed}`,
      stopName: 'Detener la escucha',
      checking: 'Comprobando el modelo…',
      downloading: 'Descargando el modelo…',
      needsModel: 'Descarga el modelo para empezar',
    },
    hero: {
      now: 'Canta ahora',
      last: 'Último canto',
      sentence: (status: string, confidence: string, meaning: string) => `${status} · ${confidence}. ${meaning}`,
      confirmed: 'El modelo del teléfono está muy seguro.',
      provisional: 'El modelo del teléfono no está seguro: tómala como un indicio.',
    },
    model: {
      missingTitle: 'Descarga el modelo para escuchar',
      missingText: (model: string, size: string) =>
        `El modelo de identificación ${model} ocupa ${size}. Se guarda en el teléfono y después funciona sin conexión; mejor descárgalo con Wi-Fi.`,
      missingTextNoSize: 'El modelo de identificación se guarda en el teléfono y después funciona sin conexión; mejor descárgalo con Wi-Fi.',
      download: 'Descargar el modelo',
      offline: 'Necesitas conexión para descargarlo.',
      downloading: 'Descargando el modelo…',
      progress: (received: string, total: string) => `${received} de ${total}`,
      ready: 'Modelo descargado. Ya puedes escuchar, también sin conexión.',
      errorTitle: 'No se pudo preparar el modelo',
      errorText: 'Comprueba la conexión e inténtalo de nuevo.',
    },
    errors: {
      audio: {
        title: 'No se pudo usar el micrófono',
        text: 'Permite el acceso al micrófono en los permisos del navegador para esta página, comprueba que ninguna otra aplicación lo esté usando y vuelve a empezar.',
      },
      model: {
        title: 'No se pudo cargar el modelo',
        text: 'Comprueba la conexión o el modelo descargado en Ajustes y vuelve a empezar.',
      },
      storage: {
        title: 'No queda espacio para guardar detecciones',
        text: 'La escucha se detuvo para no perder registros. Amplía la capacidad de almacenamiento en Ajustes y vuelve a empezar.',
      },
      inference: {
        title: 'El análisis del audio falló',
        text: 'La escucha se detuvo. Vuelve a empezar; si se repite, recarga la página.',
      },
    },
    openSettings: 'Abrir Ajustes',
    privacy: {
      local: 'El audio se analiza en el teléfono y no sale de él.',
      fragments: 'El audio se analiza en el teléfono. Solo salen los fragmentos dudosos, porque lo autorizaste en Ajustes.',
    },
    announce: {
      preparingModel: 'Preparando el modelo',
      waitingMicrophone: 'Esperando el micrófono',
      listening: 'Escuchando',
      stopped: 'Escucha detenida',
      withCount: (status: string, count: string) => `${status}. ${count}`,
    },
  },
  en: {
    title: 'Listen',
    listening: 'Listening',
    listenAt: (site: string) => `Listen at ${site}`,
    listeningAt: (site: string) => `Listening at ${site}`,
    since: (time: string) => `Since ${time}`,
    sinceFor: (time: string, duration: string) => `Since ${time} · ${duration}`,
    live: 'Live',
    site: {
      label: 'Listening site',
      none: 'No site',
      create: 'No site. Create one in Sites',
      error: 'The site could not be changed. Try again.',
    },
    spectrogram: {
      label: (span: string, low: string, high: string) =>
        `Live spectrogram of the last ${span}, from ${low} to ${high}. The colored stretch is the latest analyzed fragment.`,
      stopped: (low: string, high: string) => `Spectrogram of the end of the last session, from ${low} to ${high}.`,
      empty: 'Empty spectrogram: no sound analyzed yet.',
      placeholder: 'Sound will appear here',
    },
    list: {
      live: 'Listening now',
      last: 'Last session',
      count: {
        one: (count: string) => `${count} species`,
        other: (count: string) => `${count} species`,
      },
      detail: (confidence: string, heard: string) => `${confidence} · ${heard}`,
      heard: {
        now: 'singing now',
        moment: 'moments ago',
        minutes: (count: string) => `${count} min ago`,
        hours: (count: string) => `${count} h ago`,
      },
    },
    states: {
      idle: { title: 'Ready to listen', text: 'Start listening and the phone will identify the birds singing nearby.' },
      preparingModel: { title: 'Preparing the model…', text: 'The identification model is loading on the phone; it takes a few seconds.' },
      waitingMicrophone: { title: 'Waiting for the microphone', text: 'If the browser asks, allow access to the microphone.' },
      waiting: { title: 'Listening for new songs', text: 'Species will appear here, with their confidence, as soon as the model recognizes a song.' },
    },
    record: {
      start: 'Start listening',
      stop: (elapsed: string) => `Stop · ${elapsed}`,
      stopName: 'Stop listening',
      checking: 'Checking the model…',
      downloading: 'Downloading the model…',
      needsModel: 'Download the model to start',
    },
    hero: {
      now: 'Singing now',
      last: 'Last heard',
      sentence: (status: string, confidence: string, meaning: string) => `${status} · ${confidence}. ${meaning}`,
      confirmed: 'The phone’s model is very sure.',
      provisional: 'The phone’s model is not sure: take it as a hint.',
    },
    model: {
      missingTitle: 'Download the model to listen',
      missingText: (model: string, size: string) =>
        `The identification model ${model} takes ${size}. It is kept on the phone and then works offline; Wi-Fi is best for the download.`,
      missingTextNoSize: 'The identification model is kept on the phone and then works offline; Wi-Fi is best for the download.',
      download: 'Download the model',
      offline: 'You need a connection to download it.',
      downloading: 'Downloading the model…',
      progress: (received: string, total: string) => `${received} of ${total}`,
      ready: 'Model downloaded. You can listen now, offline too.',
      errorTitle: 'The model could not be prepared',
      errorText: 'Check the connection and try again.',
    },
    errors: {
      audio: {
        title: 'The microphone could not be used',
        text: 'Allow microphone access in the browser’s permissions for this page, check that no other app is using it, and start again.',
      },
      model: {
        title: 'The model could not be loaded',
        text: 'Check the connection or the downloaded model in Settings, then start again.',
      },
      storage: {
        title: 'There is no room left to save detections',
        text: 'Listening stopped so no records are lost. Increase the storage capacity in Settings and start again.',
      },
      inference: {
        title: 'Audio analysis failed',
        text: 'Listening stopped. Start again; if it happens again, reload the page.',
      },
    },
    openSettings: 'Open Settings',
    privacy: {
      local: 'Audio is analyzed on the phone and never leaves it.',
      fragments: 'Audio is analyzed on the phone. Only doubtful fragments leave it, because you allowed it in Settings.',
    },
    announce: {
      preparingModel: 'Preparing the model',
      waitingMicrophone: 'Waiting for the microphone',
      listening: 'Listening',
      stopped: 'Listening stopped',
      withCount: (status: string, count: string) => `${status}. ${count}`,
    },
  },
});
