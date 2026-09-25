// API pública del módulo auth: el resto del sistema solo importa desde acá.
export { AuthModule } from './auth.module';
export type { AuthContext } from './auth-context';
export { CurrentAuth, Public } from './decorators';
