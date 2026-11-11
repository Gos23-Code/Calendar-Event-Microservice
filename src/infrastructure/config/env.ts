// Lectura de variables de entorno obligatorias.
// Según CALENDAR_SERVICE_CHANGES.md, las variables no deben tener espacios al inicio ni al final.

export class MissingEnvError extends Error {
  readonly code = 'ENV_INVALID';

  constructor(readonly variable: string, reason: string) {
    super(`Variable de entorno ${variable} inválida: ${reason}`);
    this.name = 'MissingEnvError';
  }
}

type EnvSource = Record<string, string | undefined>;

export function readRequiredEnv(name: string, env: EnvSource = process.env): string {
  const value = env[name];

  if (value === undefined || value === '') {
    throw new MissingEnvError(name, 'no está definida');
  }

  if (value !== value.trim()) {
    throw new MissingEnvError(name, 'tiene espacios al inicio o al final');
  }

  return value;
}
