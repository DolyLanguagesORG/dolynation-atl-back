# Flujo de trabajo — `dolynation-atl-back`

Cómo subir cambios en **este** repositorio: rama, commits, PR, checks y
plantilla. Es la parte "de este repo" del flujo global (el global completo vive
en `dolynation-ehecatl-docs`).

## Ramas

| Rama | Qué es |
| ---- | ------ |
| `develop` | **Rama por defecto.** Integración diaria. Los PR de trabajo apuntan aquí. |
| `main` | Producción. Solo recibe PR desde `develop` o `hotfix/*`. |
| `hotfix/*` | Corrección urgente que sale de `main` y vuelve a `develop`. |

**Nunca** push directo a `develop` ni a `main`. Toda rama de trabajo **sale de
`develop`**.

Nombres: `tipo/issue-<n>-<módulo>-<detalle>` — `feat/issue-12-readings-endpoint`,
`fix/issue-45-jwt-expiry`, `refactor/issue-30-users-service`,
`docs/issue-20-architecture`. El número de issue es obligatorio (`issue-<n>`).
También se acepta el formato del botón `<n>-<detalle>`.
Máx. 50 chars, kebab-case.

## Commits

**Conventional Commits** (validado por `commitlint` en el hook `commit-msg`).

```
<tipo>(<scope>): <subject imperativo, español, ≤72>
```

Tipos: `feat` `fix` `refactor` `docs` `test` `chore` `build` `ci` `perf` `style`.

Scopes: `auth` `readings` `ia` `users` `errors` `docs` `deps` `db` `prod` `infra`
`cleanup` `repo`.

- **Un concern por commit.**
- Subject en **español**, imperativo, ≤72.
- El hook `commit-msg` ahora funciona desde la raíz del repo.

Ejemplos:

```
feat(auth): agrega refresh token
fix(readings): corrige límite de pendientes
chore(db): refleja tabla prompt_logs
```

## Verificar antes de commitear

```bash
npm run verify   # typecheck + lint:check + format:check + test
```

Cubre lo que corre el check `unit-and-static` de CI (menos el `build` y los e2e).
Si `verify` falla, no commitees. El hook `pre-commit` (lint-staged) formatea y
arregla automáticamente lo que pueda en los archivos tocados.

Para los e2e en local necesitas Postgres levantado (ver `references/testing.md`).

## Abrir el PR

1. `git push -u origin feat/issue-12-readings-endpoint`
2. Crea el PR **hacia `develop`**:

   ```bash
   gh pr create --base develop \
     --title "feat(readings): agrega endpoint de generación" \
     --body "## Resumen
   - Nuevo endpoint POST /api/v1/readings/generate

   Closes #12"
   ```

3. La **plantilla** `.github/PULL_REQUEST_TEMPLATE.md` se rellena sola: Resumen,
   Tipo de cambio, Issue (`Closes #N` en su propia línea), Rama base (`develop`),
   Checklist (`verify` ✓, tests ✓, sin secretos, commits conventional).

## `Closes`, no `Refs`

- `Closes #12` en el **cuerpo** del PR: al mergear en `develop`, cierra el issue y
  el workflow `pr-labels` le **copia las etiquetas** `sprint-*`/`area:*` al PR.
- La palabra debe **empezar la línea**; dentro de una frase no cuenta.
- `Refs #12` **no** cierra ni copia etiquetas.
- El PR de release `develop` → `main` usa **`Refs`**, nunca `Closes`.

## Checks de CI que bloquean el merge

| Check | Workflow | Qué valida |
| ----- | -------- | ---------- |
| `unit-and-static` | `ci-backend.yml` | `typecheck` + `lint:check` + `format:check` + unit tests; además el test del regex de `pr-labels`; sube cobertura. |
| `e2e` | `ci-backend.yml` | levanta Postgres 15, aplica el schema de infra y corre `npm run test:e2e`. |
| `build` | `ci-backend.yml` | `nest build` y sube `dist`. |
| `openapi-guard` | `openapi-guard.yml` | contra Postgres real corre `openapi-envelope`, `openapi-response-coverage`, `bootstrap-ordering`. |
| `pr-title` | `pr-title.yml` | título del PR en Conventional Commits. |
| `pr-target` | `pr-title.yml` | rama base (`develop`/`main`) y rama origen válidas. |

Con cualquier check rojo o en cola, GitHub **no** habilita el merge. Además se
exige **1 aprobación** de otra persona (no puedes aprobar tu propio PR),
conversaciones resueltas, y el merge es **squash**.

> `e2e` y `openapi-guard` hacen **checkout de `dolynation-tlalli-infra`** para
> aplicar `database/postgres/01-init.sql`. Si cambias el schema, cámbialo primero
> en infra o la CI fallará.

## Después de mergear

1. El issue se cierra solo (si usaste `Closes #N` y base `develop`).
2. La rama se borra sola.
3. La **tarjeta del tablero NO se mueve sola**: muévela tú a `Done`.
