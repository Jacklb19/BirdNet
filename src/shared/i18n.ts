import { defineMessages } from '../i18n/defineMessages';

/** Texts shared by several features: verification states, periods, generic actions and errors. */
export const commonMessages = defineMessages({
  es: {
    status: { confirmed: 'Muy probable', provisional: 'Por verificar', verified: 'Confirmada por una persona', corrected: 'Corregida por una persona', discarded: 'Descartada' },
    periods: { week: 'Semana', month: 'Mes', year: 'Año', all: 'Todo' },
    confidence: 'Confianza',
    actions: { retry: 'Reintentar', cancel: 'Cancelar', save: 'Guardar', close: 'Cerrar', back: 'Atrás' },
    errors: {
      network: 'No hubo respuesta del servidor. Revisa la conexión e inténtalo de nuevo.',
      offline: 'Sin conexión. Lo que registres se guarda en el teléfono.',
      signInRequired: 'Inicia sesión para ver esta sección.',
    },
    loading: 'Cargando…',
    accountData: {
      loading: 'Leyendo los registros de tu cuenta…',
      error: 'No se pudieron leer los registros de tu cuenta. Se muestra lo disponible en este teléfono.',
      offline: 'Sin conexión: se muestra lo disponible en este teléfono.',
      limited: 'Se muestran los registros más recientes de tu cuenta. Exporta el CSV de la Bitácora para consultar el registro completo.',
    },
    photoCredit: (author: string, license: string) => `Foto: ${author} · ${license}`,
    photoAuthorUnknown: 'Wikimedia Commons',
    noPhoto: (name: string) => `Sin foto de ${name}`,
    absenceCaveat: 'Que un ave no se detecte no significa que no esté.',
    separator: ' · ',
  },
  en: {
    status: { confirmed: 'Very likely', provisional: 'To verify', verified: 'Confirmed by a person', corrected: 'Corrected by a person', discarded: 'Discarded' },
    periods: { week: 'Week', month: 'Month', year: 'Year', all: 'All' },
    confidence: 'Confidence',
    actions: { retry: 'Try again', cancel: 'Cancel', save: 'Save', close: 'Close', back: 'Back' },
    errors: {
      network: 'The server did not answer. Check the connection and try again.',
      offline: 'Offline. What you record is kept on this phone.',
      signInRequired: 'Sign in to see this section.',
    },
    loading: 'Loading…',
    accountData: {
      loading: 'Reading your account records…',
      error: 'Your account records could not be read. Showing what is available on this phone.',
      offline: 'Offline: showing what is available on this phone.',
      limited: 'Showing your most recent account records. Export the Field log CSV to see the full record.',
    },
    photoCredit: (author: string, license: string) => `Photo: ${author} · ${license}`,
    photoAuthorUnknown: 'Wikimedia Commons',
    noPhoto: (name: string) => `No photo of ${name}`,
    absenceCaveat: 'A bird that is not detected may still be there.',
    separator: ' · ',
  },
});
