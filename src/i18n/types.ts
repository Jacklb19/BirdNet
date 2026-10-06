/**
 * Type definitions for internationalization (i18n).
 */

export type Locale = 'es' | 'en';

export interface TranslationSchema {
  field: {
    capture: string;
    diagnostics: string;
    fieldListening: string;
    sessionStatus: string;
    modelPending: string;
    modelReady: string;
    localProcessing: string;
    developmentTools: string;
  };
  app: {
    title: string;
    subtitle: string;
    navAria: string;
    navCapture: string;
    navDiagnostics: string;
    navSettings: string;
  };
  privacy: {
    title: string;
    description: string;
  };
  capture: {
    panelAria: string;
    statusIdle: string;
    statusRequesting: string;
    statusListening: string;
    statusPaused: string;
    statusError: string;
    startListening: string;
    stopListening: string;
    inputLevel: string;
    rmsLabel: string;
    rmsAria: string;
    peakLabel: string;
    melSpectrogram: string;
    spectrogramEmpty: string;
    spectrogramMelUpper: string;
    spectrogramWindowPrefix: string;
    sessionMetrics: string;
    sampleRate: string;
    windowsCount: string;
    spectrogramLatency: string;
  };
  modelDownload: {
    title: string;
    buttonDownload: string;
    buttonDownloaded: string;
    downloading: string;
    wifiRecommendation: string;
    sizeLabel: string;
    cachedStatus: string;
    missingWarning: string;
  };
  inference: {
    resultsTitle: string;
    noDetections: string;
    indicativeNotice: string;
    scientificName: string;
    commonName: string;
    confidence: string;
    statusLabel: string;
    confirmedLocal: string;
    provisional: string;
    loadingModel: string;
    downloadNotice: string;
    modelError: string;
    audioError: string;
    processingError: string;
    inferenceLatency: string;
    endToEndLatency: string;
    droppedWindows: string;
    sessionOnly: string;
  };
  diagnostics: {
    title: string;
    description: string;
    capabilitiesTitle: string;
    reactivityTitle: string;
    testsCount: string;
    runTests: string;
    statusSupported: string;
    statusUnsupported: string;
    capabilities: {
      crossOriginIsolatedName: string;
      crossOriginIsolatedDesc: string;
      webWorkerName: string;
      webWorkerDesc: string;
      webAssemblyName: string;
      webAssemblyDesc: string;
      sharedArrayBufferName: string;
      sharedArrayBufferDesc: string;
    };
  };
  settings: {
    title: string;
    subtitle: string;
    themeLabel: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    languageLabel: string;
    langEs: string;
    langEn: string;
    savedNotice: string;
    storageError: string;
  };
}

export type TranslationKey = string;
