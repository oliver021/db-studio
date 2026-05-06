/**
 * Extend Vitest's ProvidedContext so inject() calls are fully typed.
 * globalSetup provides these values; driver-contract.spec.ts consumes them.
 */
import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    mysqlUrl: string;
    postgresUrl: string;
  }
}
