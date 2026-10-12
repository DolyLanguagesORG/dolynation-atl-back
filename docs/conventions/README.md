# Convenciones

Reglas no negociables del proyecto. Cada archivo cubre un área específica y
referencia al código fuente que las implementa — la documentación **no
duplica** el comportamiento, lo explica y lo enlaza.

## Índice

| Página                                                          | Tema                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| [git-workflow.md](./git-workflow.md)                            | Ramas `main`/`develop`, PRs, hotfixes                            |
| [commits.md](./commits.md)                                      | Conventional Commits, scopes, ejemplos válidos                   |
| [versioning.md](./versioning.md)                                | Versionado semántico automático y reglas de bump                 |
| [code-style.md](./code-style.md)                                | TypeScript estricto, ESLint, Prettier                            |
| [testing.md](./testing.md)                                      | Unit + e2e, qué testear, política por tipo de cambio             |
| [api-contracts.md](./api-contracts.md)                          | Envelope de respuesta, catálogo de códigos de error, Scalar docs |
| [environment.md](./environment.md)                              | Variables de entorno, secretos, `.env.example`                   |
| [database.md](./database.md)                                    | PostgreSQL + Drizzle, schema vía SQL crudo, convenciones         |
| [security.md](./security.md)                                    | Auth (JWT + Argon2), Helmet, CSP, ValidationPipe                 |

## Cómo aplicar estas convenciones

1. Lee el archivo relevante antes de tocar código que afecte esa área.
2. Si una regla entra en conflicto con tu tarea, coméntalo en el PR — **no**
   la silencies localmente con un `eslint-disable`.
3. Si necesitas **añadir** una regla nueva, edita este archivo y enlázala
   desde el PR. La documentación vive en el repo, no en la cabeza de nadie.