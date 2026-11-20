// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
const supertest: typeof import('supertest') = require('supertest');
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../src/database/database.module';
import { DRIZZLE } from '../src/database/database.tokens';
import { roles, users } from '../src/database/drizzle/schema';
import { MailService } from '../src/modules/mail/mail.service';

jest.setTimeout(30_000);

interface RecordedMailEvent {
  type: 'confirmation' | 'reset' | 'approved' | 'rejected' | 'admin_notice';
  to: string;
  token?: string;
  requestType?: string;
  planName?: string | null;
  reason?: string;
  userMessage?: string | null;
}

class FakeAccessMailService {
  readonly sent: RecordedMailEvent[] = [];

  sendAccountConfirmation(input: { to: string; token: string }): Promise<void> {
    this.sent.push({ type: 'confirmation', to: input.to, token: input.token });
    return Promise.resolve();
  }

  sendPasswordReset(input: { to: string; token: string }): Promise<void> {
    this.sent.push({ type: 'reset', to: input.to, token: input.token });
    return Promise.resolve();
  }

  sendAccessRequestApproved(input: {
    to: string;
    requestType: 'subscription' | 'language_unlock';
    planName: string | null;
  }): Promise<void> {
    this.sent.push({
      type: 'approved',
      to: input.to,
      requestType: input.requestType,
      planName: input.planName,
    });
    return Promise.resolve();
  }

  sendAccessRequestRejected(input: {
    to: string;
    requestType: 'subscription' | 'language_unlock';
    planName: string | null;
    reason: string;
  }): Promise<void> {
    this.sent.push({
      type: 'rejected',
      to: input.to,
      requestType: input.requestType,
      planName: input.planName,
      reason: input.reason,
    });
    return Promise.resolve();
  }

  sendAdminAccessRequestNotice(input: {
    to: string;
    requesterEmail: string;
    requestType: 'subscription' | 'language_unlock';
    planName: string | null;
    userMessage: string | null;
  }): Promise<void> {
    this.sent.push({
      type: 'admin_notice',
      to: input.to,
      requestType: input.requestType,
      planName: input.planName,
      userMessage: input.userMessage,
    });
    return Promise.resolve();
  }

  lastTokenFor(email: string): string {
    const matches = this.sent.filter((m) => m.type === 'confirmation' && m.to === email);
    const last = matches[matches.length - 1];
    if (!last?.token) {
      throw new Error(`No confirmation token found for ${email}`);
    }
    return last.token;
  }
}

describe('Access requests, roles & admin review flows (e2e)', () => {
  let app: INestApplication;
  let db: DrizzleDb;
  let mail: FakeAccessMailService;

  const uniqueEmail = (tag: string): string =>
    `req-e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const registerAndVerify = async (tag: string) => {
    const email = uniqueEmail(tag);
    const password = 'SecurePassword123!';
    const reg = await supertest(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: `QA ${tag}`, locale: 'es' })
      .expect(201);

    expect(reg.body.data.tokens).toBeNull();
    expect(reg.body.data.user.role).toBe('student');

    const token = mail.lastTokenFor(email);
    const verified = await supertest(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(200);

    return {
      email,
      password,
      user: verified.body.data.user as { id: number; email: string; role: string },
      accessToken: verified.body.data.tokens.accessToken as string,
    };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = 'api/v1';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.LOG_LEVEL = 'silent';
    process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
    process.env.ACCESS_REQUESTS_ENABLED = 'true';
    process.env.BILLING_PROVIDER = 'manual';
    process.env.ADMIN_NOTIFICATION_EMAIL = 'owners@dolynation.test';

    const { AppModule } = await import('../src/app.module');
    mail = new FakeAccessMailService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    db = app.get<DrizzleDb>(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.EMAIL_VERIFICATION_REQUIRED;
    delete process.env.ACCESS_REQUESTS_ENABLED;
    delete process.env.BILLING_PROVIDER;
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
  });

  it('isolates admin role to admin routes, enforces waitlist approvals with emails, and handles language unlocks', async () => {
    const server = app.getHttpServer();

    // 1. Crear administrador asignando rol 'admin' directo en BD y validar aislamiento
    const adminAccount = await registerAndVerify('admin');
    const [adminRole] = await db.select().from(roles).where(eq(roles.name, 'admin')).limit(1);
    if (!adminRole) {
      throw new Error('Missing seeded admin role');
    }
    await db.update(users).set({ roleId: adminRole.id }).where(eq(users.id, adminAccount.user.id));

    const adminLogin = await supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: adminAccount.email, password: adminAccount.password })
      .expect(200);
    const adminToken = adminLogin.body.data.tokens.accessToken as string;
    expect(adminLogin.body.data.user.role).toBe('admin');

    // Admin puede consultar /auth/me y /admin/* sin suscripción
    const adminMe = await supertest(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminMe.body.data.role).toBe('admin');

    await supertest(server)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Admin NO puede usar el sistema como estudiante
    const adminBlockedStudentRoute = await supertest(server)
      .get('/api/v1/user/profile')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(adminBlockedStudentRoute.body.error.code).toBe('RESOURCE_FORBIDDEN');

    const adminBlockedRequestCreate = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'subscription', tier: 'dolly' })
      .expect(403);
    expect(adminBlockedRequestCreate.body.error.code).toBe('RESOURCE_FORBIDDEN');

    // 2. Registrar y verificar estudiante; bloquear activación directa de plan
    const student = await registerAndVerify('student');
    const studentAuth = `Bearer ${student.accessToken}`;

    const directSub = await supertest(server)
      .post('/api/v1/user/subscription')
      .set('Authorization', studentAuth)
      .send({ tier: 'dolly' })
      .expect(403);
    expect(directSub.body.error.code).toBe('ACCESS_REQUEST_REQUIRED');

    // 3. Estudiante envía solicitud para plan dolly_pro y se notifica al correo admin opcional
    const createdReq = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', studentAuth)
      .send({
        type: 'subscription',
        tier: 'dolly_pro',
        message: 'Quiero probar los 4 idiomas en mi maestría.',
      })
      .expect(201);
    const firstReqId = createdReq.body.data.id as number;
    expect(createdReq.body.data.status).toBe('pending');
    expect(
      mail.sent.some((m) => m.type === 'admin_notice' && m.to === 'owners@dolynation.test'),
    ).toBe(true);

    // Solicitud duplicada pendiente falla con 409
    const duplicate = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', studentAuth)
      .send({ type: 'subscription', tier: 'dolly' })
      .expect(409);
    expect(duplicate.body.error.code).toBe('ACCESS_REQUEST_ALREADY_PENDING');

    // 4. Admin rechaza la primera solicitud con motivo obligatorio y envía correo
    const rejected = await supertest(server)
      .post(`/api/v1/admin/requests/${firstReqId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Comienza primero con el plan Dolly o Dolly Plus para la beta.' })
      .expect(200);
    expect(rejected.body.data.request.status).toBe('rejected');
    expect(rejected.body.data.emailSent).toBe(true);
    expect(
      mail.sent.some(
        (m) =>
          m.type === 'rejected' &&
          m.to === student.email &&
          m.reason?.includes('Dolly o Dolly Plus'),
      ),
    ).toBe(true);

    // 5. Estudiante cancela una solicitud y luego solicita dolly (aprobada por admin)
    const tempReq = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', studentAuth)
      .send({ type: 'subscription', tier: 'dolly_plus' })
      .expect(201);
    await supertest(server)
      .delete(`/api/v1/access-requests/${tempReq.body.data.id as number}`)
      .set('Authorization', studentAuth)
      .expect(200);

    const secondReq = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', studentAuth)
      .send({ type: 'subscription', tier: 'dolly', message: 'Listo para probar Dolly.' })
      .expect(201);
    const secondReqId = secondReq.body.data.id as number;

    const usersSnapshot = await supertest(server)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const studentRow = (
      usersSnapshot.body.data as Array<{ id: number; pendingRequestsCount: number }>
    ).find((u) => u.id === student.user.id);
    expect(studentRow?.pendingRequestsCount).toBe(1);

    const approved = await supertest(server)
      .post(`/api/v1/admin/requests/${secondReqId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(approved.body.data.request.status).toBe('approved');
    expect(approved.body.data.emailSent).toBe(true);
    expect(
      mail.sent.some(
        (m) => m.type === 'approved' && m.to === student.email && m.planName === 'Dolly',
      ),
    ).toBe(true);

    // Estudiante ya no puede entrar a /admin/*
    const studentBlockedAdmin = await supertest(server)
      .get('/api/v1/admin/requests')
      .set('Authorization', studentAuth)
      .expect(403);
    expect(studentBlockedAdmin.body.error.code).toBe('RESOURCE_FORBIDDEN');

    // 6. Estudiante configura idioma ('en'), queda bloqueado anual y pide desbloqueo de idioma
    await supertest(server)
      .put('/api/v1/settings/languages')
      .set('Authorization', studentAuth)
      .send({ languages: ['en'] })
      .expect(200);

    const directUnlock = await supertest(server)
      .post('/api/v1/settings/languages/unlock-change')
      .set('Authorization', studentAuth)
      .expect(403);
    expect(directUnlock.body.error.code).toBe('ACCESS_REQUEST_REQUIRED');

    const unlockReq = await supertest(server)
      .post('/api/v1/access-requests')
      .set('Authorization', studentAuth)
      .send({ type: 'language_unlock', message: 'Necesito cambiar a francés.' })
      .expect(201);

    await supertest(server)
      .post(`/api/v1/admin/requests/${unlockReq.body.data.id as number}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Ahora cuenta con 1 crédito y puede cambiar a francés
    const langsAfter = await supertest(server)
      .put('/api/v1/settings/languages')
      .set('Authorization', studentAuth)
      .send({ languages: ['fr'] })
      .expect(200);
    expect(langsAfter.body.data.selected).toEqual(['fr']);
    expect(langsAfter.body.data.languageChangeCredits).toBe(0);

    // 7. Admin consulta el detalle de usuario específico y su historial de solicitudes
    const userDetail = await supertest(server)
      .get(`/api/v1/admin/users/${student.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(userDetail.body.data.user.email).toBe(student.email);
    expect(userDetail.body.data.user.pendingRequestsCount).toBe(0);
    expect(userDetail.body.data.requests.length).toBeGreaterThanOrEqual(3);
  });
});
