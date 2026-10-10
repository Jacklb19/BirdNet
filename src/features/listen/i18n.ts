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
    site: {
      label: 'Lugar de la escucha',
      none: 'Sin lugar',
      nearest: 'Lugar más cercano',
      create: 'Sin lugar. Crea uno en Lugares',
      error: 'No se pudo cambiar el lugar. Inténtalo de nuevo.',
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
    context: {
      label: 'Contexto de la escucha',
      zoneSite: (distance: string) => `Zona del lugar · ~${distance}`,
      zoneDevice: (distance: string) => `GPS · ~${distance}`,
      zoneNone: 'Sin ubicación',
      sky: { dawn: 'Alba', day: 'Día', dusk: 'Atardecer', night: 'Noche' },
      region: {
        one: (count: string) => `${count} especie probable aquí esta semana`,
        other: (count: string) => `${count} especies probables aquí esta semana`,
      },
      regionOff: 'Sin filtro por zona',
    },
    noLocation: {
      title: 'Tus aves aún no tienen lugar en el mapa',
      text: (distance: string) => `Con la ubicación activada cada canto queda en el punto donde lo oíste, redondeado a unos ${distance}. Sin ella se guarda en el teléfono y puedes asignarle un lugar después en la Bitácora.`,
      action: 'Usar mi ubicación',
      failed: 'No se pudo guardar la preferencia en este teléfono.',
    },
    recent: { title: 'Tus últimas aves', open: 'Ver el álbum' },
    likely: {
      title: 'Para buscar esta semana',
      open: 'Ver la guía',
      text: 'Las aves más probables de tu zona que aún no has oído, según el modelo geográfico.',
    },
    walk: {
      title: 'Sal a caminar',
      text: (distance: string) => `En modo caminata el mapa dibuja tu recorrido y deja cada ave donde la oíste, a unos ${distance}.`,
      start: 'Empezar caminata',
      failed: 'No se pudo activar la ubicación en este teléfono. Actívala en Ajustes e inténtalo de nuevo.',
    },
    plate: {
      notes: { confidence: 'Confianza', status: 'Estado', windows: 'Ventanas' },
      open: 'Ver la ficha',
    },
    session: {
      open: (name: string) => `Abrir la ficha de ${name}`,
      windows: { one: (count: string) => `${count} ventana`, other: (count: string) => `${count} ventanas` },
    },
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
    site: {
      label: 'Listening place',
      none: 'No place',
      nearest: 'Nearest place',
      create: 'No place. Create one in Places',
      error: 'The place could not be changed. Try again.',
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
    context: {
      label: 'Listening context',
      zoneSite: (distance: string) => `Place area · ~${distance}`,
      zoneDevice: (distance: string) => `GPS · ~${distance}`,
      zoneNone: 'No location',
      sky: { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' },
      region: {
        one: (count: string) => `${count} likely species here this week`,
        other: (count: string) => `${count} likely species here this week`,
      },
      regionOff: 'No area filter',
    },
    noLocation: {
      title: 'Your birds have no place on the map yet',
      text: (distance: string) => `With location on, each song stays where you heard it, rounded to about ${distance}. Without it the song is kept on the phone and you can assign it a place later in the Log.`,
      action: 'Use my location',
      failed: 'The preference could not be saved on this phone.',
    },
    recent: { title: 'Your latest birds', open: 'See the album' },
    likely: {
      title: 'To look for this week',
      open: 'See the guide',
      text: 'The likeliest birds of your area that you have not heard yet, according to the geographic model.',
    },
    walk: {
      title: 'Go for a walk',
      text: (distance: string) => `In walk mode the map draws your path and leaves each bird where you heard it, within about ${distance}.`,
      start: 'Start a walk',
      failed: 'Location could not be turned on for this phone. Turn it on in Settings and try again.',
    },
    plate: {
      notes: { confidence: 'Confidence', status: 'Status', windows: 'Windows' },
      open: 'See the card',
    },
    session: {
      open: (name: string) => `Open the card of ${name}`,
      windows: { one: (count: string) => `${count} window`, other: (count: string) => `${count} windows` },
    },
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
