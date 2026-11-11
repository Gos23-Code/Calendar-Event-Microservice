// Identidad de quien hace la petición, derivada del JWT (CAL-01 / CAL-02).

export type TokenContext = 'USER' | 'VETERINARY';

export type Principal =
  | { kind: 'USER'; userId: string }
  | {
      kind: 'VETERINARY';
      userId: string;
      vetId: string;
      vetRole: string;
      employeeId: string;
      vetLicensed: boolean;
      vetStatus: string;
    };
