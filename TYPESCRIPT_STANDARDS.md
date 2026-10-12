/**
 * TypeScript strict mode notes:
 *
 * The tsconfig.json enables the most strict options:
 *   - strict (all of: strictNullChecks, noImplicitAny, etc.)
 *   - noUnusedLocals, noUnusedParameters (with _ prefix to silence)
 *   - exactOptionalPropertyTypes (undefined vs missing are distinct)
 *   - noUncheckedIndexedAccess (arr[i] is T | undefined)
 *   - noImplicitOverride (must mark overrides with `override`)
 *   - noPropertyAccessFromIndexSignature (must use bracket for dynamic keys)
 *
 * These rules are NOT negotiable. If a test or implementation needs to
 * bypass one, the answer is to fix the code, not to silence the warning.
 *
 * Exemptions:
 *   - Param `_foo` (prefixed with underscore) is allowed unused.
 *   - Variable `_foo` likewise.
 */
