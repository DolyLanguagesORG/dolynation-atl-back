# Política de seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Reporta la vulnerabilidad de forma privada con el
formulario de avisos de seguridad de GitHub:

> https://github.com/DolyLanguagesORG/dolynation-atl-back/security/advisories/new

O escribe directamente a los responsables:

- Jesús Alberto Villarreal Pérez (SM / Lead Dev) — `@XxjesusalbertoxX`
- José Elías Galarza Pedroza (Backend) — `@EliasGalarza333`
- Aozmar Azael García Candela (Backend) — `@AzaelG26`

## Qué reportar

- Autenticación y autorización (JWT, refresh tokens, `users.role`).
- Inyección de prompt contra el proveedor de IA o contra el motor de evaluación.
- Exposición de datos de usuario (lecturas, historial, tokens, correos).
- Inyección SQL, XSS, SSRF o ejecución de código.

## Qué no reportar aquí

- Vulnerabilidades ya conocidas y documentadas en `conventions/security.md` como
  «brecha abierta» con issue asignado: sigue el issue del tablero.
- Hallazgos sin impacto real en el entorno de la entrega (1-10 dic 2026).

## Compromiso

- Confirmamos la recepción en menos de 72 horas.
- Damos un plazo de corrección acordado antes de publicar el aviso.
- Agradecemos y acreditamos los reportes válidos en el `CHANGELOG.md`.
