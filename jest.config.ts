/**
 * Test runner config (Jest) for the NestJS backend.
 *
 * Aqui corren SOLO las unitarias: `*.spec.ts` (colocadas junto al codigo).
 * Las end-to-end viven en `test/*.e2e-spec.ts` y tienen su propia config
 * (`test/jest-e2e.json`), que es la que levanta PostgreSQL.
 *
 * Antes este archivo tambien recogia los `*.e2e-spec.ts`, asi que
 * `npm run verify` exigia una base de datos local (y el CI tenia que
 * esquivarlo con `--testPathIgnorePatterns`).
 */
import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  // Solo unitarias: los `.e2e-spec.ts` se ejecutan con `npm run test:e2e`
  // (config propia en `test/jest-e2e.json`).
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
