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
- **Access token TTL**: `5m` (default, configurable vía `JWT_ACCESS_TTL`).
- **Refresh token TTL**: `30d` (configurable vía `JWT_REFRESH_TTL`).
- **Storage en cliente**: access token en memoria/contexto; refresh en almacenamiento seguro del cliente. No usar `localStorage` para tokens.
- **Refresh tokens persistidos** en `auth_access_tokens` con hash, **nunca
  en claro**.
- `POST /auth/refresh` rota el refresh token; el anterior deja de ser utilizable.
- `POST /auth/logout` invalida el refresh token de la sesión indicada.
- `POST /auth/logout-all` invalida los refresh tokens activos del usuario.
- El access token ya emitido puede seguir siendo válido hasta su expiración,
  incluso después de logout.

### Decoradores

- `@Public()` — marca una ruta como pública, saltando el `JwtAuthGuard`.
  En [`src/common/decorators/public.decorator.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/common/decorators/public.decorator.ts).
- `@CurrentUser()` — inyecta el `User` autenticado en el controller. En
  [`src/common/decorators/current-user.decorator.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/common/decorators/current-user.decorator.ts).

### Guards

- `JwtAuthGuard` global en [`src/common/guards/jwt-auth.guard.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/common/guards/jwt-auth.guard.ts).
- El guard es **opt-out** (todas las rutas requieren auth salvo las que
  tengan `@Public()`).

## Validación de input

`ValidationPipe` global en
[`src/main.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/main.ts) con:

- `whitelist: true` — strip propiedades no declaradas en DTOs.
- `forbidNonWhitelisted: true` — rechaza requests con props extra.
- `transform: true` — convierte tipos (query params a números, etc.).
- `transformOptions: { enableImplicitConversion: true }`.

Cada DTO usa `class-validator` (`@IsString()`, `@IsEmail()`, etc.).

## Headers y CORS

### Helmet

Configurado en [`src/main.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/main.ts) con
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
  [`src/common/interceptors/logging.interceptor.ts`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/common/interceptors/logging.interceptor.ts).

**No loggear** passwords, tokens, o datos personales (PII) en claro.

## Manejo de errores

El [`AllExceptionsFilter`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/common/errors/all-exceptions.filter.ts)
garantiza:

1. `INTERNAL_ERROR` (500) **nunca** expone el mensaje original al cliente.
2. Validación de DTOs se mapea a `VALIDATION_ERROR` con
   `details.fields: [{ field, message }]`.
3. `HttpException` conocidas (`NotFoundException`, `ConflictException`,
   etc.) se mapean a códigos estables del catálogo.
4. Errores de Drizzle/pg se loggean con stack completo y se responden
   como `INTERNAL_ERROR` sin leak de queries.

Ver [api-contracts.md](./api-contracts.md) para el detalle.

## Correo transaccional

Servicio: [`src/modules/mail/`](https://github.com/DolyLanguagesORG/dolynation-atl-back/blob/develop/src/modules/mail/).
Transporte SMTP genérico (`nodemailer`): el proveedor es solo configuración.

### Tokens de correo

- Los tokens de confirmación y de restablecimiento se generan con **32 bytes
  aleatorios** (`base64url`) y se persisten **solo como hash SHA-256** en
  `auth_email_tokens`. El valor en claro únicamente viaja dentro del enlace del
  correo: no se puede recuperar de la base de datos.
- SHA-256 es adecuado aquí porque el token tiene 256 bits de entropía. Para las
  contraseñas, de baja entropía, el proyecto usa **Argon2id**.
- Caducidad: **24 h** el token de confirmación, **60 min** el de restablecimiento.
- El consumo es **atómico** (`UPDATE … WHERE consumed_at IS NULL RETURNING`): un
  token no se puede usar dos veces, ni con peticiones concurrentes.
- Emitir un token nuevo **revoca** el pendiente del mismo tipo: como máximo hay
  un token vigente por tipo y usuario.

### Anti-enumeración

`POST /auth/forgot-password` y `POST /auth/resend-verification` devuelven
siempre la misma respuesta, exista o no la cuenta. Solo se envía correo a
cuentas existentes.

### Límite de solicitudes

Cada dirección puede pedir como máximo **3 correos en 15 minutos**. El límite
vive **en memoria del proceso**: es *best effort*, no sobrevive a un reinicio
ni se comparte entre instancias. Cierra parcialmente el vector de *email
bombing*; la solución definitiva (rate limiting distribuido) sigue pendiente.

### Nunca filtrar credenciales

- El log de error del envío registra **solo el tipo y el código** del error
  (`EAUTH`, `ECONNECTION`…), nunca el mensaje crudo del proveedor.
- El destinatario se registra **enmascarado** (`e****@ejemplo.com`).
- El token del enlace **nunca** se loguea.
- Un fallo de SMTP **no rompe** el flujo que lo Originó: el registro y la
  solicitud de reset responden con normalidad y el error queda en el log.

### Verificación de correo

Con `EMAIL_VERIFICATION_REQUIRED=true`, `login`, `refresh` y la validación del
JWT rechazan las cuentas sin `users.email_verified_at` con
`AUTH_EMAIL_NOT_VERIFIED` (403). Con el flag apagado (por defecto) el
comportamiento es el de siempre.

## Brechas conocidas

| Brecha                                         | Estado            |
| ---------------------------------------------- | ----------------- |
| Rate limiting (express-rate-limit ausente)     | Pendiente         |
| Límite de envío de correo solo en memoria      | Pendiente         |
| CORS con `origin: true` (permite cualquiera)   | Pendiente         |
| Audit log de acciones sensibles                | Pendiente         |
| HTTPS forzado en prod (depende del proxy)      | Depende del infra |

Estas brechas están documentadas para que cualquier dev pueda priorizarlas.
