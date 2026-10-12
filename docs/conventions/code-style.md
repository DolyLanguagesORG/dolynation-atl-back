# Code style

Reglas de estilo de código. El objetivo es que **dos devs distintos
escriban código indistinguishable** del mismo problema.

## TypeScript estricto

Las reglas no negociables viven en
[`TYPESCRIPT_STANDARDS.md`](../../TYPESCRIPT_STANDARDS.md).
Resumen:

- `strict` activado (strictNullChecks, noImplicitAny, etc.)
- `noUnusedLocals` y `noUnusedParameters` (silenciar con prefijo `_`)
- `exactOptionalPropertyTypes` (`undefined` ≠ ausencia)
- `noUncheckedIndexedAccess` (array access devuelve `T | undefined`)
- `noImplicitOverride` (marcar overrides con la palabra `override`)
- `noPropertyAccessFromIndexSignature` (usar bracket para keys dinámicas)

Si necesitas saltarte una regla, **arregla el código**, no silencies.

## ESLint

Config: [`.eslintrc.cjs`](../../.eslintrc.cjs).
Reglas activas (no exhaustivo):

- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/no-unsafe-any: error`
- `@typescript-eslint/explicit-function-return-type: error`
- `@typescript-eslint/no-floating-promises: error`
- `@typescript-eslint/no-misused-promises: error`
- `@typescript-eslint/return-await: error`
- `@typescript-eslint/await-thenable: error`
- `prefer-nullish-coalescing: error`
- `prefer-optional-chain: error`
- `no-non-null-assertion: error`
- `consistent-type-imports: error`
- `eqeqeq: ['error', 'always']`
- `no-var: error`, `prefer-const: error`

Los archivos de test (`*.spec.ts`, `*.e2e-spec.ts`) tienen un override que
relaja algunas reglas (no return-type explícito en mocks, допуска any en
fixtures, etc.).

## Prettier

Config: [`.prettierrc`](../../.prettierrc).

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "endOfLine": "lf"
}
```

No discutas formato en code review — Prettier decide. Ejecuta
`npm run format` (escribe) o `npm run format:check` (verifica).

## Script canónico de validación

Antes de commitear (o antes de pedir review), corre **siempre**:

```bash
npm run verify
```

Que ejecuta en orden:

1. `tsc --noEmit` (typecheck)
2. `eslint "{src,test}/**/*.ts"` (lint sin `--fix`)
3. `prettier --check "{src,test}/**/*.ts"` (formato)
4. `jest` (tests unitarios + e2e)

Si necesitas que también arregle los problemas:

```bash
npm run verify:fix
```

Que ejecuta:

1. `npm run format` (prettier --write)
2. `npm run lint` (eslint --fix)
3. `npm run typecheck`
4. `npm run test`

## Imports

- Usa `import type` para tipos puros (regla `consistent-type-imports`).
- Alias `@/` para `src/` (configurado en `tsconfig.json` paths).
- Orden de imports: externos → internos → relativos, separados por línea
  en blanco. ESLint y Prettier no imponen orden por defecto, pero el
  equipo debe ser consistente.

## Naming conventions

- **Variables y funciones**: `camelCase`
- **Clases y tipos**: `PascalCase`
- **Constantes globales**: `UPPER_SNAKE_CASE`
- **Archivos**: `kebab-case.ts`
- **Carpetas**: `kebab-case/`
- **Variables de entorno**: `UPPER_SNAKE_CASE` (ver [environment.md](./environment.md))

## Comentarios

- **Cuándo**: lógica no obvia, decisiones de diseño, workarounds.
- **Idioma**: español en JSDoc/títulos, inglés en nombres de variables
  y firmas.
- **NO uses** `// eslint-disable` salvo en el override explícito del archivo
  de tests.