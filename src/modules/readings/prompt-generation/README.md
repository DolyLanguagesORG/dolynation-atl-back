# Arquitectura de prompts versionados (`prompt-generation`)

Este módulo construye los prompts de generación de lecturas y ayuda contextual de forma desacoplada por **idioma**, **categoría**, **dificultad CEFR** y **longitud**, con trazabilidad por versión y semilla.

## Versionado por idioma

El catálogo `LANGUAGE_PROMPT_TEMPLATES` en [`prompt-builder.service.ts`](./prompt-builder.service.ts) define una plantilla aislada para cada idioma soportado (`es`, `en`, `fr`, `it`) con las guías lingüísticas CEFR (`easy` = A1-A2, `medium` = B1-B2, `hard` = C1-C2).

Cada ejecución de `PromptBuilderService.buildPrompt(params)` devuelve `templateVersion` con el formato `<idioma>@<versión>` (por ejemplo, `es@2.0.0`), el cual se persiste en `prompt_logs.params.templateVersion` y en `audit_logs.metadata.templateVersion` desde `ReadingsService`.

## Reproducibilidad por `seed`

- Cuando `generateRandomParams({ ..., seed })` y `buildPrompt(params)` reciben un `seed` explícito, la selección aleatoria de subparámetros (`difficulty`, `size`, `contentType`, `perspective`, `uniqueFocusElement`) usa un PRNG determinista (`createSeededRng`) para producir exactamente los mismos parámetros y prompts ante la misma entrada.
- Si no se especifica `seed`, `PromptBuilderService` selecciona variaciones aleatorias y genera una semilla única trazable para bitácoras.

## Cómo agregar un idioma o actualizar una versión

1. Agrega el código de idioma a `SupportedPromptLanguage` y su entrada en `LANGUAGE_PROMPT_TEMPLATES` dentro de `prompt-builder.service.ts` (y en `LANGUAGE_NAMES`).
2. Si modificas la estructura o guías pedagógicas de las plantillas, incrementa `PROMPT_TEMPLATE_VERSION` siguiendo SemVer.
3. Añade pruebas en `prompt-builder.service.spec.ts` cubriendo los niveles `easy`, `medium` y `hard` y verifica con `npm run verify`.
