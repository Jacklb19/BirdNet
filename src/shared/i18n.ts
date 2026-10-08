import { defineMessages } from '../i18n/defineMessages';

/** Texts shared by several features: verification states, periods, generic actions and errors. */
export const commonMessages = defineMessages({
  es: {
    status: { confirmed: 'Confirmada', provisional: 'Por verificar', verified: 'Verificada', corrected: 'Corregida' },
    periods: { week: 'Semana', month: 'Mes', year: 'Año', all: 'Todo' },
    confidence: 'Confianza',
    actions: { retry: 'Reintentar', cancel: 'Cancelar', save: 'Guardar', close: 'Cerrar', back: 'Atrás' },
    errors: {
      network: 'No hubo respuesta del servidor. Revisa la conexión e inténtalo de nuevo.',
      offline: 'Sin conexión. Lo que registres se guarda en el teléfono.',
      signInRequired: 'Inicia sesión para ver esta sección.',
    },
    loading: 'Cargando…',
    photoCredit: (author: string, license: string) => `Foto: ${author} · ${license}`,
    photoAuthorUnknown: 'Wikimedia Commons',
    noPhoto: (name: string) => `Sin foto de ${name}`,
    absenceCaveat: 'Que un ave no se detecte no significa que no esté.',
    separator: ' · ',
  },
  en: {
    status: { confirmed: 'Confirmed', provisional: 'To verify', verified: 'Verified', corrected: 'Corrected' },
    periods: { week: 'Week', month: 'Month', year: 'Year', all: 'All' },
    confidence: 'Confidence',
    actions: { retry: 'Try again', cancel: 'Cancel', save: 'Save', close: 'Close', back: 'Back' },
    errors: {
      network: 'The server did not answer. Check the connection and try again.',
      offline: 'Offline. What you record is kept on this phone.',
      signInRequired: 'Sign in to see this section.',
    },
    loading: 'Loading…',
    photoCredit: (author: string, license: string) => `Photo: ${author} · ${license}`,
    photoAuthorUnknown: 'Wikimedia Commons',
    noPhoto: (name: string) => `No photo of ${name}`,
    absenceCaveat: 'A bird that is not detected may still be there.',
    separator: ' · ',
  },
});
