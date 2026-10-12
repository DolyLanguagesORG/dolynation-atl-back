<!--
Thanks for the PR! Please fill out the sections below so reviewers have
context. The CI must pass before this can be merged.

Guia paso a paso: docs/COMO-HACER-UN-PR.md
Panorama del repo: docs/FLUJO-DE-TRABAJO.md
-->

## Resumen

<!-- 1-3 bullets: what does this PR do and why? -->

-

## Tipo de cambio

<!-- Marca lo que aplique. -->

- [ ] `feat` — Nueva funcionalidad
- [ ] `fix` — Corrección de bug
- [ ] `refactor` — Cambio de código sin nueva funcionalidad
- [ ] `docs` — Solo documentación
- [ ] `test` — Solo tests
- [ ] `chore` — Mantenimiento (deps, build, configs)
- [ ] `perf` — Mejora de rendimiento
- [ ] `ci` — Cambios en CI

## Issue / contexto

<!--
Escribe el issue que este PR cierra. El formato es `Closes #<numero>`.
GitHub cierra el issue solo al mergear, pero SOLO si el PR apunta a `develop`,
que es la rama por defecto. En un PR hacia `main` usa `Refs #<numero>`: la
palabra de cierre se ignora y el issue queda abierto.
-->

Closes #

## Rama base

<!-- Confirma que el PR apunta a la rama correcta. -->

- [ ] El PR apunta a `develop` (trabajo diario) → aquí sí funciona `Closes #`
- [ ] El PR apunta a `main` (solo release o hotfix) → aquí usa `Refs #`, no `Closes #`

## Título del PR

<!-- Lo valida el check `pr-title` de CI. Debe seguir Conventional Commits:
     `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`.
     Ver docs/conventions/commits.md -->

## Cambios principales

<!-- Lista de archivos o áreas clave tocadas. -->

-

## Checklist

<!-- Marca lo que aplique. Items no marcados requerirán explicación en review. -->

- [ ] `cd backend && npm run verify` pasa localmente
- [ ] Tests añadidos o actualizados (cubren el cambio)
- [ ] La rama está al día con `develop` y no hay conflictos de merge
- [ ] Si cambié la API: DTOs documentados con `@ApiProperty` (en inglés)
- [ ] Si cambié la API: el endpoint devuelve el envelope `{ message, data, error? }` via `apiOk`
- [ ] Si añadí un código de error: está en el enum `ErrorCode` y en `ErrorCatalog`
- [ ] Si cambié la API: actualicé `docs/conventions/api-contracts.md` si aplica
- [ ] Si añadí un script: actualicé la tabla en `backend/README.md`
- [ ] Sin secretos, `.env`, ni archivos generados en el diff
- [ ] Commits siguen Conventional Commits — commitlint lo verificó en local al
      commitear (recordatorio: **CI no vuelve a validar los mensajes**)

## Screenshots / logs

<!-- Opcional: capturas si es UI, logs si es backend. -->

## Notas para el reviewer

<!-- Cualquier contexto adicional, decisiones de diseño, tradeoffs. -->