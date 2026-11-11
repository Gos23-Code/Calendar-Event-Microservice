import { INTERNAL_API_KEY_HEADER, getInternalApiKey, isValidInternalApiKey } from '../internalApiKey';
import { MissingEnvError } from '../../config/env';

describe('isValidInternalApiKey', () => {
  it('acepta la clave correcta', () => {
    expect(isValidInternalApiKey('secreto-123', 'secreto-123')).toBe(true);
  });

  it('rechaza una clave incorrecta de igual largo', () => {
    expect(isValidInternalApiKey('secreto-124', 'secreto-123')).toBe(false);
  });

  it('rechaza una clave de distinto largo', () => {
    expect(isValidInternalApiKey('corta', 'secreto-123')).toBe(false);
  });

  it('rechaza ausencia de header', () => {
    expect(isValidInternalApiKey(null, 'secreto-123')).toBe(false);
    expect(isValidInternalApiKey(undefined, 'secreto-123')).toBe(false);
    expect(isValidInternalApiKey('', 'secreto-123')).toBe(false);
  });

  it('el header esperado es x-internal-api-key', () => {
    expect(INTERNAL_API_KEY_HEADER).toBe('x-internal-api-key');
  });
});

describe('getInternalApiKey', () => {
  it('devuelve la clave cuando está definida', () => {
    expect(getInternalApiKey({ INTERNAL_API_KEY: 'abc' })).toBe('abc');
  });

  it('falla si no está definida (arranque)', () => {
    expect(() => getInternalApiKey({})).toThrow(MissingEnvError);
  });

  it('falla si tiene espacios al inicio o al final', () => {
    expect(() => getInternalApiKey({ INTERNAL_API_KEY: ' abc' })).toThrow(/espacios/);
    expect(() => getInternalApiKey({ INTERNAL_API_KEY: 'abc ' })).toThrow(/espacios/);
  });
});
