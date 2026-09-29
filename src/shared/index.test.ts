import { describe, it, expect } from 'vitest';
import { SHARED_MODULE_READY } from './index';

describe('shared module', () => {
  it('exporta bandera de módulo listo', () => {
    expect(SHARED_MODULE_READY).toBe(true);
  });
});
