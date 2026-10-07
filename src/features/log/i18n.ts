import { defineMessages } from '../../i18n/defineMessages';

/** Texts of the log feature: the field log and the detail of one detection. */
export const logMessages = defineMessages({
  es: {
    title: 'Bitácora',
    today: {
      summary: (detections: string, species: string) => `Hoy: ${detections} de ${species}`,
      detections: { one: (count: string) => `${count} canto`, other: (count: string) => `${count} cantos` },
      species: { one: (count: string) => `${count} especie`, other: (count: string) => `${count} especies` },
      none: 'Hoy aún no hay detecciones.',
    },
    sync: {
      waitingOffline: {
        one: (count: string) => `${count} espera conexión. Se subirá sola.`,
        other: (count: string) => `${count} esperan conexión. Se subirán solas.`,
      },
      failed: {
        one: (count: string) => `${count} no se pudo subir.`,
        other: (count: string) => `${count} no se pudieron subir.`,
      },
      needsAccount: {
        one: (count: string) => `${count} se guarda solo en el teléfono hasta que la asocies a tu cuenta.`,
        other: (count: string) => `${count} se guardan solo en el teléfono hasta que las asocies a tu cuenta.`,
      },
      needsSignIn: {
        one: (count: string) => `${count} se subirá cuando inicies sesión con la cuenta con que se guardó.`,
        other: (count: string) => `${count} se subirán cuando inicies sesión con la cuenta con que se guardaron.`,
      },
      noLocation: {
        one: (count: string) => `${count} no tiene ubicación y se queda en el teléfono.`,
        other: (count: string) => `${count} no tienen ubicación y se quedan en el teléfono.`,
      },
      retrying: 'Reintentando…',
      goToAccount: 'Ir a Cuenta',
    },
    filters: {
      label: 'Filtrar la bitácora',
      options: { all: 'Todas', toVerify: 'Por verificar', notUploaded: 'Sin subir' },
      empty: {
        all: 'No hay registros.',
        toVerify: 'No hay registros por verificar.',
        notUploaded: 'Todos los registros están subidos.',
      },
    },
    days: { today: 'Hoy', yesterday: 'Ayer' },
    showMore: 'Mostrar más',
    empty: {
      title: 'Aún no hay registros',
      text: 'Lo que el teléfono identifique mientras escuchas aparecerá aquí, agrupado por día.',
      action: 'Empezar a escuchar',
    },
    loadError: 'No se pudo leer la bitácora guardada en el teléfono.',
    detail: {
      back: 'Volver a la Bitácora',
      explanation: {
        confirmed: {
          range: (threshold: string) => `El modelo del teléfono está muy seguro (confianza de ${threshold} o más). No hace falta verificarla.`,
          plain: 'El modelo del teléfono estaba muy seguro al registrarla. No hace falta verificarla.',
        },
        provisional: {
          range: (low: string, high: string) => `El modelo del teléfono no está del todo seguro (confianza entre ${low} y ${high}). Tómala como probable mientras siga por verificar.`,
          plain: 'El modelo del teléfono no estaba del todo seguro al registrarla. Tómala como probable mientras siga por verificar.',
        },
      },
      fragment: {
        play: (duration: string) => `Escuchar el fragmento guardado (${duration})`,
        pause: 'Pausar el fragmento',
        error: 'No se pudo reproducir el fragmento.',
      },
      facts: {
        when: 'Cuándo',
        where: 'Dónde',
        upload: 'Estado',
      },
      when: {
        today: (time: string) => `Hoy, ${time}`,
        yesterday: (time: string) => `Ayer, ${time}`,
      },
      where: {
        site: (site: string, size: string) => `${site} · ~${size}`,
        cell: (size: string) => `Zona aproximada de ~${size}`,
        none: 'No se registró la ubicación',
      },
      upload: {
        cloud: 'Subida a la nube',
        waitingOffline: 'Esperando conexión',
        waitingOnline: 'Pendiente de subir',
        phoneOnly: 'Guardada solo en el teléfono',
      },
      uploadReason: {
        needsAccount: 'Se subirá cuando asocies los registros del teléfono a tu cuenta.',
        needsSignIn: 'Se subirá cuando inicies sesión con la cuenta con que se guardó.',
        noLocation: 'Se registró sin ubicación, por eso no se sube al mapa compartido.',
      },
      notFound: {
        title: 'Registro no encontrado',
        text: 'Este registro no está guardado en este teléfono.',
      },
    },
  },
  en: {
    title: 'Log',
    today: {
      summary: (detections: string, species: string) => `Today: ${detections} of ${species}`,
      detections: { one: (count: string) => `${count} song`, other: (count: string) => `${count} songs` },
      species: { one: (count: string) => `${count} species`, other: (count: string) => `${count} species` },
      none: 'No detections yet today.',
    },
    sync: {
      waitingOffline: {
        one: (count: string) => `${count} is waiting for a connection. It will upload on its own.`,
        other: (count: string) => `${count} are waiting for a connection. They will upload on their own.`,
      },
      failed: {
        one: (count: string) => `${count} could not be uploaded.`,
        other: (count: string) => `${count} could not be uploaded.`,
      },
      needsAccount: {
        one: (count: string) => `${count} stays on this phone until you link it to your account.`,
        other: (count: string) => `${count} stay on this phone until you link them to your account.`,
      },
      needsSignIn: {
        one: (count: string) => `${count} will upload when you sign in to the account it was saved with.`,
        other: (count: string) => `${count} will upload when you sign in to the account they were saved with.`,
      },
      noLocation: {
        one: (count: string) => `${count} has no location and stays on this phone.`,
        other: (count: string) => `${count} have no location and stay on this phone.`,
      },
      retrying: 'Trying again…',
      goToAccount: 'Go to Account',
    },
    filters: {
      label: 'Filter the log',
      options: { all: 'All', toVerify: 'To verify', notUploaded: 'Not uploaded' },
      empty: {
        all: 'There are no records.',
        toVerify: 'There are no records to verify.',
        notUploaded: 'Every record is uploaded.',
      },
    },
    days: { today: 'Today', yesterday: 'Yesterday' },
    showMore: 'Show more',
    empty: {
      title: 'No records yet',
      text: 'What the phone identifies while you listen will appear here, grouped by day.',
      action: 'Start listening',
    },
    loadError: 'The log kept on this phone could not be read.',
    detail: {
      back: 'Back to the log',
      explanation: {
        confirmed: {
          range: (threshold: string) => `The phone's model is very sure (confidence of ${threshold} or more). It does not need checking.`,
          plain: "The phone's model was very sure when it was recorded. It does not need checking.",
        },
        provisional: {
          range: (low: string, high: string) => `The phone's model is not entirely sure (confidence between ${low} and ${high}). Treat it as likely while it is still unverified.`,
          plain: "The phone's model was not entirely sure when it was recorded. Treat it as likely while it is still unverified.",
        },
      },
      fragment: {
        play: (duration: string) => `Play the saved fragment (${duration})`,
        pause: 'Pause the fragment',
        error: 'The fragment could not be played.',
      },
      facts: {
        when: 'When',
        where: 'Where',
        upload: 'Status',
      },
      when: {
        today: (time: string) => `Today, ${time}`,
        yesterday: (time: string) => `Yesterday, ${time}`,
      },
      where: {
        site: (site: string, size: string) => `${site} · ~${size}`,
        cell: (size: string) => `Approximate area of ~${size}`,
        none: 'No location was recorded',
      },
      upload: {
        cloud: 'Uploaded to the cloud',
        waitingOffline: 'Waiting for a connection',
        waitingOnline: 'Waiting to upload',
        phoneOnly: 'Kept only on this phone',
      },
      uploadReason: {
        needsAccount: 'It will upload once you link this phone’s records to your account.',
        needsSignIn: 'It will upload when you sign in to the account it was saved with.',
        noLocation: 'It was recorded without a location, so it is not uploaded to the shared map.',
      },
      notFound: {
        title: 'Record not found',
        text: 'This record is not stored on this phone.',
      },
    },
  },
});
