import { HttpException, Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppHttpException } from './app-http.exception';
import { ErrorCode } from './error-codes';

@Controller('test-filter')
class TestFilterController {
  @Get('ok')
  ok() {
    return { foo: 'bar' };
  }

  @Get('domain-error')
  domainError() {
    throw new AppHttpException(ErrorCode.RESOURCE_NOT_FOUND, { resource: 'Reading', id: 999 });
  }

  @Get('not-found')
  notFound() {
    throw new HttpException('The reading was deleted', 404);
  }

  @Get('validation-error')
  validationError() {
    throw new HttpException(
      {
        message: ['email - must be a valid email', 'password - is too short'],
        error: 'Bad Request',
        statusCode: 400,
      },
      400,
    );
  }

  @Get('leaky-error')
  leaky() {
    throw new Error(
      'DB connection failed: postgres://app:supersecret@db:5432/dolynglish at /app/src/db.ts:42',
    );
  }
}

describe('AllExceptionsFilter (security audit)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestFilterController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the success envelope unchanged', async () => {
    const res = await request(app.getHttpServer()).get('/test-filter/ok').expect(200);
    expect(res.body).toEqual({ foo: 'bar' });
  });

  describe('domain errors (AppHttpException)', () => {
    it('returns the right HTTP status and a stable code', async () => {
      const res = await request(app.getHttpServer()).get('/test-filter/domain-error').expect(404);
      expect(res.body.message).toBe('The requested resource was not found');
      expect(res.body.data).toBeNull();
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(res.body.error.message).toBe('The requested resource was not found');
      expect(res.body.error.details).toEqual({ resource: 'Reading', id: 999 });
    });
  });

  describe('foreign HttpException (preserves user message when safe)', () => {
    it('maps a 404 with a generic string to RESOURCE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer()).get('/test-filter/not-found').expect(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(res.body.error.message).toBe('The requested resource was not found');
    });
  });

  describe('validation errors (BadRequestException with field list)', () => {
    it('extracts per-field messages into details.fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-filter/validation-error')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details.fields)).toBe(true);
      expect(res.body.error.details.fields).toEqual([
        { field: 'email', message: 'must be a valid email' },
        { field: 'password', message: 'is too short' },
      ]);
    });
  });

  describe('CRITICAL: leaky errors must not leak to the client', () => {
    it('does not expose the internal exception message', async () => {
      const res = await request(app.getHttpServer()).get('/test-filter/leaky-error').expect(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('An unexpected error occurred. Please try again later.');
      const stringified = JSON.stringify(res.body);
      expect(stringified).not.toContain('postgres://');
      expect(stringified).not.toContain('supersecret');
      expect(stringified).not.toContain('/app/src');
      expect(stringified).not.toContain('db.ts:42');
    });

    it('does not expose the stack trace in the body', async () => {
      const res = await request(app.getHttpServer()).get('/test-filter/leaky-error').expect(500);
      const stringified = JSON.stringify(res.body);
      expect(stringified).not.toMatch(/at\s+\w+\s+\(/);
      expect(stringified).not.toMatch(/\.ts:\d+:\d+/);
    });
  });
});
