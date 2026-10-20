# Versionado

El proyecto usa [Semantic Versioning](https://semver.org/lang/es/) (`vX.Y.Z`)
y **versionado automático**: el prefijo del commit de squash determina la
release, sin que nadie tenga que editar un número a mano.

## Quién dispara una release

Solo llega a `main` lo que viene de `develop` (y hotfixes). Cada merge a
`main` dispara el workflow `release` ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)),
que crea el tagannotated y el GitHub Release correspondiente.

Durante el desarrollo activo en `develop` **no hay releases**: las etiquetas
solo existen en `main`.

## Reglas de bump

Como el merge es squash, el subject del commit resultante es el **título del
PR**. Ese título es el que decide el bump:

| Patrón en el título del PR                       | Bump   | Resultado             |
| ------------------------------------------------ | ------ | --------------------- |
| `fix(scope): ...`                                | patch  | `v0.1.0` → `v0.1.1`   |
| `refactor(scope): ...`, `chore(...)`, `docs(...)`| patch  | `v0.1.0` → `v0.1.1`   |
| `feat(scope): ...`                               | minor  | `v0.1.0` → `v0.2.0`   |
| `feat(scope)!: ...` (bang)                       | major  | `v0.1.0` → `v1.0.0`   |
| Cualquier tipo con `BREAKING CHANGE:` en el body | major | `v0.1.0` → `v1.0.0`   |

La lista de tipos es la misma de [commits.md](./commits.md). El título del PR
lo valida el check `pr-title` de CI **antes** de poder mergear, así que un
título inválido nunca llega a la release.

## Línea de tiempo del proyecto

| Versión  | Significado                                                        |
| -------- | ------------------------------------------------------------------ |
| `v0.1.0` | Primer release. Se crea automáticamente al publicar `main`.         |
| `v0.x.y` | Iteración durante el desarrollo. Cada milestone a `main` bumpea.   |
| `v1.0.0` | Release final del entregable de diciembre.                         |

## Forzar un bump

Si el título no refleja el cambio real (por ejemplo, un `chore` que rompe la
API), se puede forzar desde la pestaña **Actions → release → Run workflow**:

```
bump: major | minor | patch
```

## Ejemplo de flujo completo

```bash
# 1. Trabajo normal en una rama
git checkout -b feat/issue-8-settings
 npm run verify
git commit -m "feat(users): persist study preferences in user_preferences"
git push -u origin feat/issue-8-settings

# 2. PR con título Conventional Commits hacia develop
gh pr create --base develop \
  --title "feat(users): persist study preferences in user_preferences" \
  --body "Closes #8"

    # 3. Cuando toca release: PR de develop hacia main.
    #    Ojo: `main` no es la rama por defecto, asi que `Closes` se ignoraria
    #    y los issues quedarian abiertos. Ahi va `Refs`.
    gh pr create --base main --title "feat(users): release v0.2.0" \
      --body "Refs #12 -- integra el trabajo de desarrollo hasta la fecha."
```

Al mergear ese PR, el workflow calcula el bump, crea el tag y publica el
GitHub Release con las notas de los commits incluidos.

## Notas

- El primer run no bumpea: publica `v0.1.0` como base.
- Los tags son anotados (`git tag -a`), no lightweight, para que `git describe`
  y el historial conserven la fecha y el mensaje.
- Si el cálculo de versión no cambia el número, el workflow **falla** en vez
  de crear un tag duplicado. Eso es intencional: señala un error en el título
  del PR.
