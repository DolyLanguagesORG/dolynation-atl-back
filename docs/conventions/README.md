# Convenciones — `dolynation-atl-back`

Las reglas transversales del proyecto viven **en un solo sitio**: el repo de
documentación [`dolynation-ehecatl-docs`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/tree/develop/conventions).

Este archivo **no las copia**: las enlaza. Antes cada repositorio tenía su
propia copia y **se divergieron** (la de base de datos siguió explicando la
regla de migraciones por scripts cuando esa regla ya no existia: por eso un cambio de
schema llego a un ambiente sin aplicarse y dejo el backend en 500).

## Convenciones del proyecto

| Página | Tema |
| --- | --- |
| [git-workflow](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/git-workflow.md) | Ramas `main`/`develop`, PRs, hotfixes |
| [commits](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/commits.md) | Conventional Commits, scopes, ejemplos válidos |
| [versioning](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md) | Versionado semántico automático y reglas de bump |
| [code-style](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/code-style.md) | TypeScript estricto, ESLint, Prettier |
| [testing](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/testing.md) | Unit + e2e, qué testear, política por tipo de cambio |
| [api-contracts](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/api-contracts.md) | Envelope de respuesta, catálogo de códigos de error, Scalar docs |
| [environment](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/environment.md) | Variables de entorno, secretos, `.env.example` |
| [database](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/database.md) | PostgreSQL + Drizzle, schema vía SQL crudo, convenciones |
| [security](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/security.md) | Auth (JWT + Argon2), Helmet, CSP, ValidationPipe |
| [i18n](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/i18n.md) | Los 4 idiomas: interfaz, inmersión por contenido y documentos legales |

## Lo que sí es de este repositorio

- La estructura de módulos de NestJS y dónde vive cada cosa (`src/modules/`).
- Las variables de entorno **de este servicio**: el listado completo está en
  [`.env.example`](../../.env.example) y su regla, en
  [environment.md](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/environment.md).
- El schema de la base **no** está aquí: vive en
  [`dolynation-tlalli-infra/database/postgres/01-init.sql`](https://github.com/DolyLanguagesORG/dolynation-tlalli-infra/blob/develop/database/postgres/01-init.sql)
  y lo aplica `scripts/apply-schema.sh` en cada deploy. Este backend **no**
  ejecuta DDL.

## Cómo aplicar estas convenciones

1. Lee la página enlazada antes de tocar código que afecte a esa área.
2. Si una regla entra en conflicto con tu tarea, coméntalo en el PR — **no**
   la silencies localmente con un `eslint-disable`.
3. Si necesitas **añadir** una regla nueva, edita el archivo en
   `dolynation-ehecatl-docs/conventions/` (no una copia) y enlázalo desde el
   PR. La documentación vive en el repo, no en la cabeza de nadie.
