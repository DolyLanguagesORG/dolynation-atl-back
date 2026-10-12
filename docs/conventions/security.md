# Security

Reglas de seguridad del backend. Toda decisión de seguridad vive en el
código y se valida con tests automatizados.

## Authentication

### Hashing de passwords

**Argon2id** vía la librería `argon2` (^0.41). Configuración por defecto
de la librería es suficiente para nuestro nivel de tráfico.

**No** usar bcrypt, scrypt ni SHA-256 nativo.

### JWT (JSON Web Tokens)

- **Algoritmo**: HS256 con `JWT_SECRET` (≥48 caracteres random).
- **Access token TTL**: `15m` (default, configurable vía `JWT_ACCESS_TTL`).
- **Refresh token TTL**: `30d` (configurable vía `JWT_REFRESH_TTL`).
- **Storage en cliente**: SecureStore (mobile) / httpOnly cookie (web).
- **Refresh tokens persistidos** en `auth_access_tokens` con hash, **nunca
  en claro**.

### Decoradores

- `@Public()` — marca una ruta como pública, saltando el `JwtAuthGuard`.
  En [`src/common/decorators/public.decorator.ts`](../../src/common/decorators/public.decorator.ts).
- `@CurrentUser()` — inyecta el `User` autenticado en el controller. En
  [`src/common/decorators/current-user.decorator.ts`](../../src/common/decorators/current-user.decorator.ts).

### Guards

- `JwtAuthGuard` global en [`src/common/guards/jwt-auth.guard.ts`](../../src/common/guards/jwt-auth.guard.ts).
- El guard es **opt-out** (todas las rutas requieren auth salvo las que
  tengan `@Public()`).

## Validación de input

`ValidationPipe` global en
[`src/main.ts`](../../src/main.ts) con:

- `whitelist: true` — strip propiedades no declaradas en DTOs.
- `forbidNonWhitelisted: true` — rechaza requests con props extra.
- `transform: true` — convierte tipos (query params a números, etc.).
- `transformOptions: { enableImplicitConversion: true }`.

Cada DTO usa `class-validator` (`@IsString()`, `@IsEmail()`, etc.).

## Headers y CORS

### Helmet

Configurado en [`src/main.ts`](../../src/main.ts) con
Content Security Policy estricto. **Excepción importante**: `script-src`
permite `https://cdn.jsdelivr.net` porque Scalar API Reference carga su
JS bundle desde ahí.

Si añades una nueva dependencia externa que requiere ser permitida en
CSP, justifícalo en el PR.

### CORS

```ts
app.enableCors({
  origin: true,
  credentials: true,
});
```

En producción, restringir a orígenes específicos vía variable de entorno
(brecha actual, ver [brechas conocidas](#brechas-conocidas)).

## Logging y observabilidad

- `nestjs-pino` para logs estructurados JSON.
- En dev: `pino-pretty` para human-readable.
- Cada request pasa por `LoggingInterceptor` en
  [`src/common/interceptors/logging.interceptor.ts`](../../src/common/interceptors/logging.interceptor.ts).

**No loggear** passwords, tokens, o datos personales (PII) en claro.

## Manejo de errores

El [`AllExceptionsFilter`](../../src/common/errors/all-exceptions.filter.ts)
garantiza:

1. `INTERNAL_ERROR` (500) **nunca** expone el mensaje original al cliente.
2. Validación de DTOs se mapea a `VALIDATION_ERROR` con
   `details.fields: [{ field, message }]`.
3. `HttpException` conocidas (`NotFoundException`, `ConflictException`,
   etc.) se mapean a códigos estables del catálogo.
4. Errores de Drizzle/pg se loggean con stack completo y se responden
   como `INTERNAL_ERROR` sin leak de queries.

Ver [api-contracts.md](./api-contracts.md) para el detalle.

## Brechas conocidas

| Brecha                                       | Estado          |
| -------------------------------------------- | --------------- |
| Rate limiting (express-rate-limit ausente)   | Pendiente       |
| CORS con `origin: true` (permite cualquiera)  | Pendiente       |
| Refresh token rotation no implementada       | Pendiente       |
| Audit log de acciones sensibles              | Pendiente       |
| HTTPS forzado en prod (depende del proxy)    | Depende del infra |

Estas brechas están documentadas para que cualquier dev pueda priorizarlas.