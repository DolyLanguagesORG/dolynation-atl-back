# Plan Maestro de Pruebas y Flujos del Backend — Dolynglish

> **Documento vivo de verificación funcional y de calidad (QA Backend).**
>
> Cuando se modifique cualquier regla de suscripción, autenticación, idiomas, límites, categorías dinámicas o generación de lecturas en `dolynation-atl-back`, este documento define los **flujos obligatorios que el backend debe cumplir** para considerarse sano y listo para despliegue.

---

## 1. Alcance y Reglas Base del Sistema

- **Idiomas soportados (`SUPPORTED_LANGUAGE_IDS`):** `es` (Español), `en` (Inglés), `fr` (Francés), `it` (Italiano).
- **Planes de suscripción (`SUBSCRIPTION_PLANS`):**

| Plan (`tier`) | Categorías máximas | Idiomas simultáneos activos | Candado cambio idioma | Lecturas diarias | Preguntas/explicaciones diarias |
|---|---:|---:|---|---:|---:|
| `null` (recién registrado) | 0 (bloqueado) | 0 (bloqueado) | Bloqueado | 0 | 0 |
| `dolly` (Básico) | 5 | 1 idioma elegido | 1 cambio gratis cada 365 días o pagando `unlock-change` | 10 / día | 15 / día |
| `dolly_plus` (Intermedio) | 15 | 2 idiomas elegidos | 1 cambio gratis cada 365 días o pagando `unlock-change` | 20 / día | 30 / día |
| `dolly_pro` (Máximo) | Ilimitadas | 4 idiomas abiertos (`es, en, fr, it`) | Libre y sin bloqueo mientras permanezca en Pro | Ilimitadas | Ilimitadas |

- **Límite de lecturas pendientes (sin evaluar):** máximo **3** lecturas con `status = 'pending'` y `deletedAt IS NULL` por usuario, sin importar el plan.
- **Conteo diario anti-trampa:** las lecturas generadas hoy cuentan **todas** las filas creadas desde las `00:00` (`America/Mexico_City`), incluso si el usuario las borró con `DELETE /readings/:id`.

---

## 2. Matriz Resumen de Verificación

| ID | Flujo / Test | Resultado Esperado (RE) | Cobertura Unitaria / E2E / HTTP |
|---|---|---|---|
| **T1** | Registro sin selección de plan | Bloqueo `403 SUBSCRIPTION_REQUIRED` en todo el sistema salvo públicos, `logout`, `logout-all` y `POST /user/subscription` | `subscription.guard.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/01-*.http` |
| **T2** | Más de 3 lecturas pendientes | Al intentar la 4.ª pendiente -> `400 READING_PENDING_LIMIT_REACHED`; tras evaluar/borrar 1 vuelve a permitir | `readings.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/02-*.http` |
| **T3** | Básico (`dolly`) en otro idioma | Solo genera en su idioma activo; otro idioma -> `403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`; cambiar requiere 1 año o `unlock-change` | `subscriptions.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/03-*.http` |
| **T4** | Medio (`dolly_plus`) 2 cambios seguidos | No permite cambiar 2 veces seguidas tras elegir idioma, pagar 1 crédito o vencer 365 días -> `403 LANGUAGE_CHANGE_LOCKED` | `settings.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/04-*.http` |
| **T5** | Límite diario por plan (incl. soft-delete) | `dolly` bloquea #11 (`429`), `dolly_plus` bloquea #21 (`429`), `dolly_pro` sin límite; `DELETE` no reinicia cuota diaria | `subscriptions.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/05-*.http` |
| **T6** | Otro dispositivo tras `logout-all` | Access token vigente sigue pasando brevemente hasta expirar (`401`), pero `POST /auth/refresh` falla al instante (`401 AUTH_TOKEN_INVALID`) | `auth.service.spec.ts` · `auth.e2e-spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/06-*.http` |
| **T7** | Downgrade desde `dolly_pro` | En Pro genera en `es/en/fr/it`; al bajar a `dolly_plus`/`dolly` pierde acceso a los idiomas fuera de su cuota prioritaria (`403`) | `subscriptions.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/07-*.http` |
| **T8** | Moderación de categorías y caché IA `$0` | Rechaza explícitas/ofuscadas/gibberish/injection (`400 CATEGORY_MODERATION_REJECTED`), permite válidas, soporta OpenAI gratuito o MiniMax vía `.env`, y persiste caché global en `moderated_categories` | `category-blacklist.spec.ts` · `category-regex.spec.ts` · `category-moderation.service.spec.ts` · `category-ai-moderator.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/09-*.http` |
| **T9** | Tope diario anti-abuso categorías (`20/día`) | Bloquea más de 20 categorías nuevas distintas por día (`429 CATEGORY_DAILY_LIMIT_REACHED`, resistente a borrar y recrear) antes de llamar IA; reordenar/quitar/catálogo oficial no gasta cupo | `category-daily-limit.service.spec.ts` · `settings.service.spec.ts` · `subscription-language-flows.e2e-spec.ts` · `test/http/09-*.http` |
| **Q1** | Calidad 4 idiomas + categorías dinámicas | Prompts garantizan idioma estricto, 3 párrafos coherentes, dificultad `easy/medium/hard`, vocabulario del tema y cero repetición | `prompt-builder.service.spec.ts` · `ai-response-parser.service.spec.ts` · `readings.service.spec.ts` · `test/http/08-*.http` |

---

## 3. Especificación Detallada de Flujos y Casos Rebuscados

### Flow T1 — Usuario sin plan intenta usar el sistema
- **Objetivo:** Nadie recién registrado puede consumir ningún módulo operativo hasta seleccionar un plan válido (`dolly`, `dolly_plus`, `dolly_pro`).
- **Permitido antes de elegir plan:**
  - Públicos (`@Public()`): `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /subscriptions/plans`, `GET /health/live`, `GET /health/ready`, `GET /version`.
  - Autenticados mínimos (`@AllowWithoutSubscription()`): `POST /auth/logout`, `POST /auth/logout-all`, `POST /user/subscription`.
- **Bloqueado (`403 SUBSCRIPTION_REQUIRED`):**
  - `GET /auth/me`, `GET /user/subscription`, `GET/PATCH /user/profile`, `GET /user/streak`, `GET /history`, `GET /history/scores`, `GET/PUT /settings/categories`, `GET/PUT /settings/languages`, `PUT /settings/languages/reorder`, `POST /settings/languages/unlock-change`, `GET /readings/options`, `GET /readings/pending`, `GET /readings/completed`, `GET /readings/:id`, `POST /readings`, `POST /readings/:id/evaluate`, `POST /readings/:id/explanations`, `DELETE /readings/:id`, `POST /content/generate`, `POST /evaluation/submit`, `POST /ia/chat`, `GET /admin/categories`, `GET /admin/users`.
- **Criterios de aprobación:** Todas las rutas bloqueadas devuelven HTTP `403` con `error.code = "SUBSCRIPTION_REQUIRED"`. Justo después de `POST /user/subscription`, esas rutas responden normalmente (`200`/`201`).

### Flow T2 — Límite de 3 lecturas pendientes sin revisar
- **Pasos:**
  1. Configurar plan (`dolly`), idioma (`en`) y categoría dinámica permitida.
  2. Generar 3 lecturas (`POST /readings`) sin evaluarlas -> todas `201 Created`, `status = "pending"`.
  3. Intentar generar la 4.ª lectura -> **RE:** HTTP `400`, `error.code = "READING_PENDING_LIMIT_REACHED"`.
  4. Evaluar 1 lectura (`POST /readings/:id/evaluate` o `POST /evaluation/submit`) -> `201 Created`, `status = "completed"`.
  5. Generar nueva lectura -> `201 Created`. Intentar una más (con 3 pendientes otra vez) -> `400 READING_PENDING_LIMIT_REACHED`.
- **Caso rebuscado T2-A:** Si el usuario elimina con `DELETE /readings/:id` una lectura pendiente teniendo 3 pendientes, baja a 2 pendientes y puede generar otra (siempre que no supere su cuota diaria, ver **T5**).

### Flow T3 — Suscripción básica (`dolly`): idioma único y bloqueo
- **Pasos:**
  1. Seleccionar plan `dolly` (`maxLanguages = 1`).
  2. Intentar guardar 2 idiomas (`PUT /settings/languages { languages: ["fr", "en"] }`) -> **RE:** HTTP `400 SUBSCRIPTION_LANGUAGE_LIMIT_EXCEEDED`.
  3. Seleccionar `["fr"]` -> `200 OK`.
  4. Generar lectura en `"fr"` -> `201 Created`.
  5. Intentar generar en `"en"`, `"es"` o `"it"` (tanto vía `POST /readings` como `POST /content/generate`) -> **RE:** HTTP `403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`.
  6. Intentar código legado/no soportado (`"de"`, `"pt"`) -> **RE:** HTTP `403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`.
  7. Intentar cambiar a `"es"` vía `PUT /settings/languages { languages: ["es"] }` -> **RE:** HTTP `403 LANGUAGE_CHANGE_LOCKED`.
  8. Pagar desbloqueo (`POST /settings/languages/unlock-change`) -> cambiar a `["es"]` -> ahora `"es"` funciona (`201`) y `"fr"` devuelve `403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`.

### Flow T4 — Suscripción media (`dolly_plus`): bloqueo ante 2 cambios seguidos
- **Pasos:**
  1. Seleccionar plan `dolly_plus` (`maxLanguages = 2`).
  2. Seleccionar idiomas iniciales `["en", "it"]` -> `200 OK` (activa `lastLanguageChangeAt` = hoy).
  3. Reordenar los mismos 2 idiomas (`PUT /settings/languages/reorder { languages: ["it", "en"] }`) -> `200 OK` (permitido sin consumir bloqueo porque ambos ya eran activos).
  4. Intentar primer cambio inmediatamente (`PUT /settings/languages { languages: ["it", "fr"] }`) -> **RE:** HTTP `403 LANGUAGE_CHANGE_LOCKED`.
  5. Pagar **1 crédito** (`POST /settings/languages/unlock-change`):
     - 1.º cambio (`["it", "fr"]`) -> `200 OK` (`languageChangeCredits` vuelve a `0`).
     - **2.º cambio seguido** inmediatamente (`["es", "fr"]`) -> **RE:** HTTP `403 LANGUAGE_CHANGE_LOCKED`.
  6. Simular vencimiento de 365 días (`lastLanguageChangeAt` > 365 días atrás):
     - 1.º cambio anual gratis (`["es", "fr"]`) -> `200 OK`.
     - **2.º cambio seguido** inmediatamente (`["en", "fr"]`) -> **RE:** HTTP `403 LANGUAGE_CHANGE_LOCKED`.
- **Caso rebuscado T4-A:** Si el usuario en `dolly_plus` solo eligió 1 idioma al inicio (`["en"]`), puede agregar su 2.º cupo vacío (`["en", "fr"]`) sin pagar, porque no reemplaza ni elimina un idioma ya elegido; pero si inmediatamente intenta sustituirlo (`["en", "it"]`), debe bloquearse (`403 LANGUAGE_CHANGE_LOCKED`).

### Flow T5 — Límites diarios por plan y evasión mediante borrado
- **Pasos:**
  1. Usuario en `dolly` (`10/día`) genera 9 lecturas y las evalúa (para no chocar con límite de 3 pendientes).
  2. Genera la lectura #10 y la borra lógicamente con `DELETE /readings/:id` (`204`).
  3. Intenta generar la **#11** el mismo día -> **RE:** HTTP `429 READING_DAILY_LIMIT_REACHED`. *El borrado lógico NO devuelve el cupo diario.*
  4. Cambia a `dolly_plus` (`20/día`): `GET /user/subscription` refleja `readingsCreatedToday = 10` y `readingsRemainingToday = 10`. Genera 10 lecturas más (evaluándolas) -> todas `201 Created`.
  5. Intenta generar la **#21** -> **RE:** HTTP `429 READING_DAILY_LIMIT_REACHED`.
  6. Cambia a `dolly_pro` (`dailyReadingsLimit = null`): intenta generar la #21 y #22 el mismo día -> ambas `201 Created` sin bloqueo diario.

### Flow T6 — Cierre de sesión global (`logout-all`) frente a otro dispositivo activo
- **Pasos:**
  1. Dispositivo A y Dispositivo B inician sesión de forma independiente con el mismo usuario (`(accessA, refreshA)` y `(accessB, refreshB)`). Plan activo asignado.
  2. Dispositivo B comprueba que `GET /user/profile` y `GET /auth/me` funcionan (`200 OK`).
  3. Dispositivo A ejecuta `POST /auth/logout-all` (`200 OK`), revocando en `auth_access_tokens` todos los refresh tokens del usuario.
  4. **Durante el breve TTL del access token (`5m` por defecto):** Dispositivo B todavía puede usar `accessB` en endpoints protegidos (`200 OK`).
  5. Cuando Dispositivo B (o Dispositivo A) intenta renovar sesión con `POST /auth/refresh` usando `refreshB` o `refreshA` -> **RE:** HTTP `401 AUTH_TOKEN_INVALID`.
  6. Cuando el access token de corta duración expira -> cualquier petición con `accessB` devuelve HTTP `401`.
- **Caso rebuscado T6-A (Token Rotation Replay):** Si un refresh token ya fue rotado por un dispositivo y se reintenta usar el refresh token anterior, `refresh()` lo rechaza con `401 AUTH_TOKEN_INVALID`.

### Flow T7 — Downgrade desde plan máximo (`dolly_pro`)
- **Pasos (Variante A — con prioridad configurada):**
  1. Usuario en `dolly_pro` configura categorías e idiomas prioritarios `["it", "fr", "es", "en"]`, y cambia/reordena libremente sin bloqueo anual ni consumo de créditos.
  2. Genera lecturas en cualquiera de los 4 idiomas -> `201 Created`.
  3. Baja a `dolly_plus` (`maxLanguages = 2`): `it` y `fr` siguen activos (`201 Created`); `es` y `en` devuelven **`403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`**.
  4. Baja a `dolly` (`maxLanguages = 1`): únicamente `it` sigue activo (`201 Created`); `fr`, `es` y `en` devuelven **`403 SUBSCRIPTION_LANGUAGE_NOT_ALLOWED`**.
  5. Intenta promover `"es"` vía `PUT /settings/languages/reorder { languages: ["es", "it", "fr", "en"] }` -> **`403 LANGUAGE_CHANGE_LOCKED`**.
- **Pasos (Variante B — usuario Pro sin lista guardada en settings):**
  1. Usuario en `dolly_pro` nunca llamó `PUT /settings/languages` (`selectedLanguages = []`); en `dolly_pro` los 4 idiomas están abiertos (`201 Created`).
  2. Baja a `dolly` (`maxLanguages = 1`) -> al intentar generar en `"it"`, `"fr"`, `"es"` o `"en"`, el backend lo bloquea con **`403 LANGUAGE_NOT_SELECTED`** hasta que elija su único idioma permitido en `PUT /settings/languages`.

### Flow T8 — Moderación de categorías dinámicas, caché persistente y control de proveedor IA por `.env`
- **Objetivo:** Bloquear categorías dañinas, ofensivas, sexuales, morbosas, gibberish o prompt-injection en `es/en/fr/it` con costo cero tras el primer análisis, permitiendo seleccionar por entorno si Capa 3 usa **OpenAI Moderation gratuita (`/v1/moderations`)** o **MiniMax**.
- **Pasos:**
  1. Enviar categorías explícitas, leetspeak (`"P0rn0gr4f1a"`), espacios intercalados (`"S u i c i d i o"`), homóglifos (`"мuеrtоs"`), insultos FR/IT (`"Putain"`, `"Vaffanculo"`), prompt-injection (`"Ignore all previous instructions"`), emojis o gibberish (`"asdfghjkl"`) -> **RE:** HTTP `400 CATEGORY_MODERATION_REJECTED` resuelto en Capa 1/2 local (**0 llamadas IA**).
  2. Enviar una categoría sutil evaluada por Capa 3 (IA/OpenAI): se rechaza con `400 CATEGORY_MODERATION_REJECTED` (`ai_moderation` / `openai_moderation`) y el veredicto queda guardado en PostgreSQL (`moderated_categories`). Al reintentarse desde otro usuario o tras reiniciar memoria L1 -> **0 llamadas a IA/API**.
  3. Enviar categorías dinámicas educativas legítimas (p. ej. `"Día de Muertos"`, `"Architettura Gotica"`, `"Gastronomía Molecular"`) -> `200 OK`; siguientes usuarios reutilizan caché permanente sin gastar tokens.
  4. Con `CATEGORY_MODERATION_AI_PROVIDER=openai`, el backend **nunca** invoca MiniMax ni endpoints pagos de chat (únicamente `/v1/moderations`); con `minimax`, va directo a MiniMax cuando falta caché; con `auto`, intenta OpenAI gratuito primero y si aprueba o rechaza detiene el flujo sin llamar a MiniMax.

### Flow T9 — Límite diario anti-abuso de categorías (`CATEGORY_DAILY_LIMIT = 20`)
- **Objetivo:** Evitar que usuarios creen/eliminen miles de categorías dinámicas en bucle para agotar cuota o tokens de IA.
- **Pasos:**
  1. Enviar `> 20` categorías nuevas distintas en `PUT /settings/categories` -> **RE:** HTTP `429 CATEGORY_DAILY_LIMIT_REACHED` antes de invocar moderación externa/IA (**0 llamadas IA**).
  2. Crear y reemplazar categorías en bucle hasta evaluar **20 categorías nuevas distintas** en un mismo día (`America/Mexico_City`, tabla `category_daily_usage`) -> `200 OK` hasta la #20.
  3. Estando en `20/20`, reordenar categorías existentes, eliminar categorías, alternar categorías oficiales del catálogo o re-agregar una ya evaluada hoy -> **`200 OK`** (no consume cupo adicional).
  4. Intentar evaluar la categoría nueva **#21** tras haber borrado anteriores -> **RE:** HTTP `429 CATEGORY_DAILY_LIMIT_REACHED` (sin llamar a la IA).

---

## 4. Garantías de Calidad en 4 Idiomas, Categorías Dinámicas y Dificultades

Para asegurar textos útiles para aprender vocabulario real en el idioma elegido (`es`, `en`, `fr`, `it`) con categorías creadas por el usuario:

1. **Integridad de idioma end-to-end:**
   - `PromptBuilderService.generateRandomParams` propaga explícitamente `language` al Paso 2 de generación.
   - `readings.language` se persiste en PostgreSQL (`09-readings-language.sql`) y en `prompt_logs.params`.
   - `ReadingsService.evaluate()` y `ReadingsService.explain()` leen `reading.language` para instruir al LLM en el idioma exacto de la lectura (evitando el defecto anterior de evaluar/explicar siempre en inglés).
2. **Estructura expositiva y coherencia:**
   - Los prompts exigen una progresión lógica de 2–4 párrafos separados (`\n\n`): apertura/gancho contextual -> desarrollo analítico con conectores propios del idioma -> síntesis de cierre sin cortes abruptos, viñetas ni historias ficticias.
3. **Adquisición de vocabulario en categorías dinámicas:**
   - El Paso 1 (`buildEnrichmentPrompt`) extrae un subtema no repetitivo y 3–5 términos/conceptos auténticos de la categoría dinámica del usuario en el idioma destino y nivel CEFR solicitado (`easy`: A1–A2, `medium`: B1–B2, `hard`: C1–C2).
   - El Paso 2 teje esos términos con claves contextuales dentro de la prosa y respeta `avoidTopics` (hasta los últimos títulos del usuario en esa categoría).
   - `POST /content/generate` sin `category` consulta primero `/settings/categories` del usuario antes de usar el catálogo genérico.
4. **Resiliencia del proveedor IA (`MiniMax-M3`), parser y moderación:**
   - `MiniMaxProvider` envía `reasoning_effort` (`MINIMAX_REASONING_EFFORT=low`), `reasoning_split: true` y `response_format: { type: 'json_object' }` en peticiones JSON con defaults ampliados (`MINIMAX_TIMEOUT_MS=90000`, `MINIMAX_MAX_TOKENS=8192`) para evitar cortes `finish_reason=length` y timeouts durante generación multilingüe (`MiniMax-M3.provider.spec.ts`).
   - `AiResponseParserService` (`parseGeneratedText`, `parseEvaluation`, `parseExplanation`) limpia bloques `<think>...</think>`, prefijos residuales del proveedor antes de `{...}` y compara categorías de forma canónica insensible a mayúsculas, guiones, espacios y tildes (p. ej. `"Música Clásica"` frente a `"Musica Clasica"`).
   - Las categorías dinámicas pasan por los 3 filtros de moderación (blacklist multilingüe `es/en/fr/it`, regex anti-evasión, moderación IA/externa).

---

## 5. Cómo Ejecutar y Actualizar las Pruebas

### Pruebas automatizadas en el backend (`dolynation-atl-back`)

```bash
# Chequeo estático TypeScript y ESLint
npx tsc --noEmit --incremental false
npm run lint

# Pruebas unitarias (servicios, guardias, moderación, prompts, parser)
npm run test

# Pruebas HTTP End-to-End contra PostgreSQL (incluye Tests 1–7, OpenAPI y Auth)
npm run test:e2e
```

### Pruebas HTTP manuales (`.http`)

Ver instrucciones y scripts listos por escenario en [`test/http/README.md`](../../test/http/README.md).

### Guía para actualizar este documento

Cada vez que se agregue una nueva regla de negocio o endpoint crítico en el backend:
1. Añadir el identificador del nuevo flujo (`T8`, `Q2`, etc.) en la **Matriz Resumen** (Sección 2).
2. Documentar precondiciones, pasos exactos, código HTTP/`ErrorCode` esperado y casos borde en la Sección 3.
3. Vincular el archivo de prueba automatizado (`*.spec.ts` / `*.e2e-spec.ts`) y el script `.http` correspondiente.
