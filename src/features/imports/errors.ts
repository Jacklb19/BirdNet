export class ImportError extends Error {
  constructor(readonly reason: 'unsupported' | 'short' | 'model' | 'storage' | 'account' | 'busy' | 'metadata') { super('Recording import failed.'); }
}
