# Commits

El proyecto sigue [Conventional Commits](https://www.conventionalcommits.org/).
Los mensajes se validan con `commitlint` vía los git hooks de husky (ver
[code-style.md](./code-style.md)).

> **⚠️ La validación de mensajes es local, no de CI.**
> El hook `.husky/commit-msg` corre commitlint en tu máquina, pero **ningún
> check de GitHub Actions revisa los mensajes de commit**. Solo se valida el
> **título del PR** (check `pr-title`). Si commiteas con `--no-verify`, o sin
> haber corrido `npm ci` en la raíz del repositorio (que es lo que instala
> husky), el mensaje entra sin revisarse. El hook **solo funciona si commiteas
> desde la raíz del repositorio**.
>
> El CI tampoco comprueba el **idioma** del mensaje ni que el `scope` esté en la
> lista de más abajo: el `scope` solo lo valida commitlint en local.

## Estructura del mensaje

```
<type>(<scope>): <subject, imperativo, ≤72 chars>

<body opcional, wrap a 72 chars>

<footer opcional>
```

## Tipos permitidos

| Tipo       | Cuándo usarlo                                                |
| ---------- | ------------------------------------------------------------ |
| `feat`     | Nueva funcionalidad visible para el usuario final o la API    |
| `fix`      | Corrección de bug                                             |
| `refactor` | Cambio de código que no añade feature ni arregla bug          |
| `docs`     | Solo cambios en documentación                                |
| `test`     | Solo añadir o corregir tests                                  |
| `chore`    | Tareas de mantenimiento (deps, build, configs) sin impacto   |
| `build`    | Cambios en build system o dependencias externas               |
| `ci`       | Cambios en CI/CD pipelines                                   |
| `perf`     | Mejora de rendimiento                                        |
| `style`    | Cambios de formato que no afectan lógica (espacios, comillas) |

Para breaking changes, añade `!` después del tipo: `feat(api)!: remove v1 routes`.

## Scopes usados en el repo

Lista cerrada — usa uno de estos o crea uno nuevo documentándolo:

`auth`, `readings`, `ia`, `users`, `errors`, `docs`, `deps`, `db`,
`prod`, `infra`, `cleanup`, `repo`

## Reglas de formato

1. **Subject imperativo** y en tiempo presente, ≤72 caracteres. El idioma del
   repositorio es el **español**; el historial de `develop` está escrito en
   español y los commits nuevos siguen esa línea.
   - Ejemplo válido: `feat(readings): agrega el prompt de dificultad alta al visor`
   - Inválido siempre: `Added a new field` / `WIP` / `updates`

   > Este documento decía antes "en inglés". Ya no aplica: los commits
   > anteriores que quedaron en inglés **no se reescriben** (eso reescribiría
   > el historial y cambiaría todos los hashes), pero todo commit nuevo se
   > escribe en español.
   >
   > Esto aplica al mensaje del commit y al título del PR. **No aplica al
   > contrato de API**: las descripciones de DTO, los mensajes de error y las
   > operaciones van en inglés porque los leen clientes externos. Ver
   > [api-contracts.md](./api-contracts.md).


2. **≤72 caracteres** en subject. Si necesitas más, muévelo al body.

3. **Body** opcional, separado del subject por línea en blanco. Wrap a 72 chars.

4. **Footer** para referencias:
   ```
   Refs: #123
   Co-Authored-By: Claude Code <noreply@anthropic.com>
   ```

## Regla de oro: commits pequeños

> Aunque se acumulen cambios en muchos archivos, **divide el trabajo en
> varios commits enfocados** (uno por concern).

Ejemplos válidos:

- ✅ `chore(cleanup): remove archived AdonisJS backend`
- ✅ `chore(infra): drop AdonisJS references from build configs`
- ✅ `docs(readings): strip legacy AdonisJS mentions from code comments`

Cada uno con un scope claro, una intención clara y diff pequeño. Esto
facilita:

- **Code review**: revisar 3 commits enfocados es más rápido que uno de 80
  archivos.
- **Reverts**: si algo falla, sabes exactamente qué commit revertir.
- **Bisect**: cuando un bug aparece en `prod`, el `git bisect` es útil
  solo si los commits están enfocados.
- **Cherry-pick**: puedes llevar un fix a `prod` sin traer cambios
  colaterales.

## Ejemplos válidos

```
feat(readings): echo userResponse in EvaluationResultDto
fix(docs): align ApiSuccessEnvelopeDto with allOf pattern
refactor(readings): split prompt-generation + prompt-logs subdomains
chore(repo): formalize docs, CI/CD, automation
feat(api)!: drop v1 auth endpoints (BREAKING)
```

## Ejemplos inválidos (rechazados por commitlint)

```
WIP
updates
feat: changes
Fix login bug.
```