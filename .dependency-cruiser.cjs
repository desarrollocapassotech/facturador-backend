/**
 * Límites entre módulos (ARCHITECTURE.md §4). Corre en el CI: `npm run deps`.
 * - Un módulo solo usa lo que otro exporta en su index.ts.
 * - recibos/core no depende de nada del Facturador (se va a publicar aparte).
 * - shared/ no conoce a los módulos.
 * Los tests quedan afuera: arman servicios a mano y pueden importar internos.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'solo-por-index',
      comment: 'Un módulo solo puede importar el index.ts público de otro módulo.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: '\\.spec\\.ts$' },
      to: { path: '^src/modules/([^/]+)/.+', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'recibos-core-independiente',
      comment: 'recibos/core solo usa sus propios archivos y pdfkit.',
      severity: 'error',
      from: { path: '^src/modules/recibos/core/' },
      to: { pathNot: ['^src/modules/recibos/core/', 'node_modules/pdfkit/', '^(fs|path)$'], dependencyTypesNot: ['core'] },
    },
    {
      name: 'shared-no-conoce-modulos',
      comment: 'shared/ es infraestructura: no puede depender de los módulos.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'sin-ciclos',
      severity: 'error',
      from: { pathNot: '\\.spec\\.ts$' },
      to: { circular: true, viaOnly: { pathNot: '\\.spec\\.ts$' } },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^dist/|\\.spec\\.ts$)' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
