# AGENTS.md — `dolynation-atl-back`

Instrucciones para agentes de código (Claude Code, Codex, OpenCode, Cursor, etc.)
que trabajen en este repositorio.

## Skills de este repo

Están en `.agents/skills/` y se cargan bajo demanda:

- **`nestjs-backend`** — cómo trabajar aquí: arquitectura, comandos, envelope,
  códigos de error, Drizzle, tests y flujo de PR. **Léela antes de tocar código.**
- **`openapi-scalar`** — cómo documentar endpoints con OpenAPI/Scalar, los tests
  `openapi-*` y `/docs`. Úsala al crear o modificar endpoints.
- `api-design-principles` y `architecture-patterns` — **genéricas** (buenas
  prácticas generales, no nuestras convenciones). Si entran en conflicto con
  `nestjs-backend`, manda `nestjs-backend`.

## Reglas rápidas

- Toda respuesta usa el **envelope** (`apiOk`/`apiCreated`) y todo error pasa por
  `AppHttpException(ErrorCode.X, ...)`. No devuelvas objetos crudos ni lances
  excepciones de Nest directas.
- Rama nueva desde `develop` (default). **Nunca** push directo a `develop`/`main`.
- Antes de commitear: `npm run verify` (typecheck + lint + format + tests).
- Commits Conventional, subject en **español**, un concern por commit.
- PR hacia `develop`, título conventional, **squash**, 1 aprobación.
- `Closes #N` en el cuerpo del PR (en su propia línea).
- Si cambias el schema, edítalo primero en `dolynation-tlalli-infra`.

## Skills generales de la organización

El flujo global, el anteproyecto y la documentación oficial viven en:

- https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs
