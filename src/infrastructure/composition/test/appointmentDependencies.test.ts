import { MissingEnvError } from '../../config/env';
import {
  createServiceSupabaseClient,
  getAppointmentHttpDeps,
  normalizeSupabaseUrl,
} from '../appointmentDependencies';

describe('normalizeSupabaseUrl', () => {
  it('quita /rest/v1/ de la URL de la API REST', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
  });

  it('quita la barra final y los espacios', () => {
    expect(normalizeSupabaseUrl('  https://abc.supabase.co/  ')).toBe('https://abc.supabase.co');
  });

  it('una URL base no cambia', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co');
  });
});

describe('createServiceSupabaseClient', () => {
  it('falla si falta SUPABASE_SERVICE_ROLE_KEY (no se usa la anon key en el servidor)', () => {
    expect(() =>
      createServiceSupabaseClient({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })
    ).toThrow(MissingEnvError);
  });

  it('crea el cliente con la URL base aunque la variable traiga /rest/v1/', () => {
    const client = createServiceSupabaseClient({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/rest/v1/',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    });
    expect(typeof client.from).toBe('function');
  });
});

describe('getAppointmentHttpDeps', () => {
  it('falla si falta VETERINARY_SERVICE_URL (sin dependencias a medio construir)', () => {
    expect(() =>
      getAppointmentHttpDeps({
        NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        INTERNAL_API_KEY: 'k',
        JWT_JWKS_URL: 'https://user/.well-known/jwks.json',
        JWT_ISSUER: 'myanimalog-user-service',
        JWT_AUDIENCE: 'myanimalog-api',
      })
    ).toThrow(/VETERINARY_SERVICE_URL/);
  });

  it('con todas las variables arma los casos de uso y el autenticador', () => {
    const deps = getAppointmentHttpDeps({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      VETERINARY_SERVICE_URL: 'https://vet.example',
      INTERNAL_API_KEY: 'k',
      JWT_JWKS_URL: 'https://user/.well-known/jwks.json',
      JWT_ISSUER: 'myanimalog-user-service',
      JWT_AUDIENCE: 'myanimalog-api',
    });

    expect(typeof deps.authenticate).toBe('function');
    expect(deps.clinicUseCase).toBeDefined();
    expect(deps.requestUseCase).toBeDefined();
  });
});
