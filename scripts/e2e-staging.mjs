#!/usr/bin/env node
/**
 * Standalone critical-endpoint E2E runner (#71).
 * Works against both local builds and staging deployments via BASE_URL.
 */
import process from 'node:process';

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3333/api/v1').replace(/\/+$/, '');
const TEST_EMAIL = process.env.TEST_EMAIL?.trim() || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD?.trim() || '';
const ACCESS_TOKEN_ENV = process.env.ACCESS_TOKEN?.trim() || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || '';
const ADMIN_TOKEN_ENV = process.env.ADMIN_TOKEN?.trim() || '';
const AUTO_SELECT_PLAN = process.env.AUTO_SELECT_PLAN !== 'false';
const PUBLIC_ONLY = process.env.PUBLIC_ONLY === 'true';
const SKIP_AI = process.env.SKIP_AI === 'true';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);

const stepResults = [];

function buildCurlCommand(method, url, body) {
  const parts = [`curl -i -X ${method}`, `'${url}'`];
  parts.push(`-H 'Accept: application/json'`);
  if (body !== undefined) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`--data-raw '${JSON.stringify(body).replaceAll("'", "'\\''")}'`);
  }
  return parts.join(' ');
}

function assertNoStackLeak(stepName, rawText, parsed) {
  if (/node_modules\//i.test(rawText) || /\bat\s+[A-Za-z0-9_$.]+\s+\(/.test(rawText)) {
    throw new Error(`[${stepName}] Response leaked internal stack trace details.`);
  }
  if (parsed && typeof parsed === 'object' && 'stack' in parsed) {
    throw new Error(`[${stepName}] Response object contains forbidden "stack" property.`);
  }
}

function assertEnvelope(stepName, parsed) {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.message !== 'string' ||
    !('data' in parsed) ||
    ('error' in parsed && parsed.error !== undefined && typeof parsed.error !== 'object')
  ) {
    throw new Error(
      `[${stepName}] Expected standard envelope { message, data[, error] }, got: ${JSON.stringify(parsed)}`,
    );
  }
}

async function runStep(stepName, options) {
  const {
    method = 'GET',
    path,
    token,
    body,
    expectedStatus,
    expectEnvelope = true,
  } = options;
  const url = `${BASE_URL}${path}`;
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const startedAt = performance.now();
  let res;
  let rawText = '';
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    rawText = await res.text();
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    const reason = err instanceof Error ? err.message : String(err);
    const error = new Error(
      [
        `STEP FAILED: ${stepName}`,
        `Request: ${method} ${url}`,
        `Error: ${reason}`,
        `Reproduce: ${buildCurlCommand(method, url, body)}`,
      ].join('\n'),
    );
    stepResults.push({ stepName, status: 'ERR', durationMs, ok: false });
    throw error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  let parsed = null;
  if (rawText.trim().length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowed.includes(res.status)) {
    const snippet = rawText.slice(0, 600).replace(/\s+/g, ' ').trim();
    stepResults.push({ stepName, status: res.status, durationMs, ok: false });
    throw new Error(
      [
        `STEP FAILED: ${stepName}`,
        `Request: ${method} ${url}`,
        `Expected HTTP: ${allowed.join(' | ')}, got: ${res.status}`,
        `Response excerpt: ${snippet || '<empty body>'}`,
        `Reproduce: ${buildCurlCommand(method, url, body)}`,
      ].join('\n'),
    );
  }

  assertNoStackLeak(stepName, rawText, parsed);
  if (expectEnvelope && res.status !== 204) {
    assertEnvelope(stepName, parsed);
  }

  stepResults.push({ stepName, status: res.status, durationMs, ok: true });
  return { status: res.status, body: parsed, rawText, durationMs };
}

function assertCondition(stepName, condition, details) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED [${stepName}]: ${details}`);
  }
}

async function main() {
  console.log(
    `Running E2E critical suite against ${BASE_URL} (PUBLIC_ONLY=${PUBLIC_ONLY}, SKIP_AI=${SKIP_AI})`,
  );

  // 1. Health probes, DB readiness, version, plans & security runtime config
  const live = await runStep('Health live', { path: '/health/live', expectedStatus: 200 });
  assertCondition('Health live', live.body.data?.status === 'ok', 'status must be ok');

  const ready = await runStep('Health ready', { path: '/health/ready', expectedStatus: 200 });
  assertCondition(
    'Health ready',
    ready.body.data?.status === 'ok' && ready.body.data?.info?.db?.status === 'up',
    `expected db status up, got ${JSON.stringify(ready.body.data)}`,
  );

  // 2. OpenAPI contract availability
  const openapi = await runStep('OpenAPI document', {
    path: '/openapi.json',
    expectedStatus: 200,
    expectEnvelope: false,
  });
  const paths = openapi.body?.paths ?? {};
  const requiredPaths = [
    '/api/v1/auth/login',
    '/api/v1/readings',
    '/api/v1/readings/{id}/evaluate',
    '/api/v1/readings/{id}/explanations',
    '/api/v1/history/scores',
    '/api/v1/user/streak',
    '/api/v1/admin/categories',
  ];
  for (const requiredPath of requiredPaths) {
    assertCondition(
      'OpenAPI paths',
      Object.prototype.hasOwnProperty.call(paths, requiredPath),
      `missing OpenAPI path ${requiredPath}`,
    );
  }

  const versionRes = await runStep('Version metadata', { path: '/version', expectedStatus: 200 });
  const deployedVersion = versionRes.body.data?.version ?? 'unknown';
  const deployedCommit = String(versionRes.body.data?.commit ?? 'unknown').slice(0, 7);
  console.log(`Target deployment: version=${deployedVersion}, commit=${deployedCommit}`);

  const plansRes = await runStep('Public subscription plans', {
    path: '/subscriptions/plans',
    expectedStatus: 200,
  });
  assertCondition(
    'Public subscription plans',
    Array.isArray(plansRes.body.data) && plansRes.body.data.length > 0,
    'expected non-empty public subscription plans catalog',
  );

  const captchaRes = await runStep('Security CAPTCHA runtime config', {
    path: '/security/captcha/config',
    expectedStatus: 200,
  });
  const captchaEnabled = Boolean(captchaRes.body.data?.enabled);
  const captchaProvider = captchaRes.body.data?.provider ?? 'disabled';

  await runStep('Auth /me unauthenticated', { path: '/auth/me', expectedStatus: 401 });
  await runStep('Auth /me invalid JWT', {
    path: '/auth/me',
    token: 'invalid-jwt-token',
    expectedStatus: 401,
  });

  if (PUBLIC_ONLY) {
    console.log('\n=== Staging Public Verification Summary ===');
    for (const step of stepResults) {
      console.log(
        `${step.ok ? 'PASS' : 'FAIL'} [${step.status}] ${step.stepName} (${step.durationMs}ms)`,
      );
    }
    console.log(
      `\nTurnstile/CAPTCHA runtime: enabled=${captchaEnabled}, provider=${captchaProvider}`,
    );
    console.log(`All ${stepResults.length} public staging checks passed cleanly.`);
    return;
  }

  // 3. Auth lifecycle (unless ACCESS_TOKEN is injected for Turnstile-protected environments)
  const isEphemeralUser = !TEST_EMAIL && !ACCESS_TOKEN_ENV;
  const shouldRestoreProfile = Boolean(TEST_EMAIL || ACCESS_TOKEN_ENV);
  let accessToken = ACCESS_TOKEN_ENV;

  if (!accessToken && captchaEnabled) {
    throw new Error(
      `Environment has CAPTCHA enabled (provider: ${captchaProvider}). ` +
        `Run with PUBLIC_ONLY=true for public/contract checks, or provide ACCESS_TOKEN=<jwt> from a browser-authenticated session to run authenticated flows.`,
    );
  }

  if (!accessToken) {
    const email =
      TEST_EMAIL ||
      `staging-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const password = TEST_PASSWORD || 'StagingE2ePass123!';

    if (isEphemeralUser) {
      const reg = await runStep('Auth register', {
        method: 'POST',
        path: '/auth/register',
        body: { email, password, fullName: 'Staging E2E Runner' },
        expectedStatus: 201,
      });
      assertCondition(
        'Auth register',
        reg.body.data?.user?.email === email && !('password' in (reg.body.data?.user ?? {})),
        'unexpected register payload or leaked password field',
      );
    }

    const firstLogin = await runStep('Auth login', {
      method: 'POST',
      path: '/auth/login',
      body: { email, password },
      expectedStatus: 200,
    });
    accessToken = firstLogin.body.data?.tokens?.accessToken;
    let refreshToken = firstLogin.body.data?.tokens?.refreshToken;
    assertCondition('Auth login', Boolean(accessToken && refreshToken), 'missing JWT tokens');

    if (isEphemeralUser && AUTO_SELECT_PLAN) {
      await runStep('Select subscription plan', {
        method: 'POST',
        path: '/user/subscription',
        token: accessToken,
        body: { tier: 'dolly_pro' },
        expectedStatus: 201,
      });
    }

    const me = await runStep('Auth /me authenticated', {
      path: '/auth/me',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition('Auth /me authenticated', me.body.data?.email === email, 'email mismatch');

    const refreshed = await runStep('Auth refresh', {
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
      expectedStatus: 200,
    });
    accessToken = refreshed.body.data?.accessToken;
    refreshToken = refreshed.body.data?.refreshToken;
    assertCondition('Auth refresh', Boolean(accessToken && refreshToken), 'missing rotated tokens');

    await runStep('Auth logout', {
      method: 'POST',
      path: '/auth/logout',
      token: accessToken,
      body: { refreshToken },
      expectedStatus: 200,
    });

    await runStep('Auth refresh reuse rejected after logout', {
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken },
      expectedStatus: 401,
    });

    const activeLogin = await runStep('Auth login (active session)', {
      method: 'POST',
      path: '/auth/login',
      body: { email, password },
      expectedStatus: 200,
    });
    accessToken = activeLogin.body.data?.tokens?.accessToken;
    assertCondition('Auth login (active session)', Boolean(accessToken), 'missing accessToken');
  } else {
    const me = await runStep('Auth /me authenticated (provided ACCESS_TOKEN)', {
      path: '/auth/me',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'Auth /me authenticated (provided ACCESS_TOKEN)',
      Boolean(me.body.data?.email),
      'missing user email in /auth/me',
    );
  }

  // 4. Profile read, update & persistence
  const profileBefore = await runStep('Profile GET', {
    path: '/user/profile',
    token: accessToken,
    expectedStatus: 200,
  });
  const originalName = profileBefore.body.data?.fullName ?? 'Staging E2E Runner';
  const tempName = `Staging Verified ${Date.now() % 10_000}`;

  await runStep('Profile PATCH', {
    method: 'PATCH',
    path: '/user/profile',
    token: accessToken,
    body: { fullName: tempName },
    expectedStatus: 200,
  });

  const profileAfter = await runStep('Profile GET persistence check', {
    path: '/user/profile',
    token: accessToken,
    expectedStatus: 200,
  });
  assertCondition(
    'Profile GET persistence check',
    profileAfter.body.data?.fullName === tempName,
    `expected fullName=${tempName}, got ${profileAfter.body.data?.fullName}`,
  );

  if (shouldRestoreProfile) {
    await runStep('Profile restore original fullName', {
      method: 'PATCH',
      path: '/user/profile',
      token: accessToken,
      body: { fullName: originalName },
      expectedStatus: 200,
    });
  }

  // 5. Readings, contextual vocabulary, glossary, evaluation, history & streak
  if (!SKIP_AI) {
    const langState = await runStep('Settings GET languages', {
      path: '/settings/languages',
      token: accessToken,
      expectedStatus: 200,
    });
    let activeLanguages = langState.body.data?.active ?? [];
    if (activeLanguages.length === 0) {
      const updatedLangs = await runStep('Settings PUT languages', {
        method: 'PUT',
        path: '/settings/languages',
        token: accessToken,
        body: { languages: ['en'] },
        expectedStatus: 200,
      });
      activeLanguages = updatedLangs.body.data?.active ?? ['en'];
    }
    const language = activeLanguages[0] ?? 'en';

    const catState = await runStep('Settings GET categories', {
      path: '/settings/categories',
      token: accessToken,
      expectedStatus: 200,
    });
    let selectedCategories = catState.body.data?.selected ?? [];
    if (selectedCategories.length < 3) {
      const updatedCats = await runStep('Settings PUT categories', {
        method: 'PUT',
        path: '/settings/categories',
        token: accessToken,
        body: { categories: ['technology', 'science', 'history'] },
        expectedStatus: 200,
      });
      selectedCategories = updatedCats.body.data?.selected ?? ['technology'];
    }
    const category = selectedCategories[0] ?? 'technology';

    const createdReading = await runStep('Readings POST generate', {
      method: 'POST',
      path: '/readings',
      token: accessToken,
      body: { category, language, difficulty: 'medium', size: 'short' },
      expectedStatus: 201,
    });
    const reading = createdReading.body.data;
    assertCondition(
      'Readings POST generate',
      Number.isInteger(reading?.id) &&
        typeof reading?.title === 'string' &&
        typeof reading?.content === 'string' &&
        reading.content.length > 20,
      'generated reading missing required content',
    );

    const fetchedReading = await runStep('Readings GET by id', {
      path: `/readings/${reading.id}`,
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'Readings GET by id',
      fetchedReading.body.data?.id === reading.id &&
        fetchedReading.body.data?.title === reading.title &&
        fetchedReading.body.data?.content === reading.content,
      'fetched reading does not match generated reading',
    );

    const sampleWordMatch = /[A-Za-zÀ-ÿ]{5,}/.exec(reading.content);
    const lookupWord = sampleWordMatch?.[0] ?? 'context';
    const explain = await runStep('Vocabulary POST explanation', {
      method: 'POST',
      path: `/readings/${reading.id}/explanations`,
      token: accessToken,
      body: { word: lookupWord, context: reading.content.slice(0, 200) },
      expectedStatus: 201,
    });
    assertCondition(
      'Vocabulary POST explanation',
      typeof explain.body.data?.explanation === 'string' &&
        explain.body.data.explanation.length > 0,
      'missing contextual explanation text',
    );

    const glossary = await runStep('Glossary GET', {
      path: '/readings/glossary',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'Glossary GET',
      Array.isArray(glossary.body.data) &&
        glossary.body.data.some((entry) => entry.readingId === reading.id),
      'glossary does not include the created explanation',
    );

    const evaluation = await runStep('Readings POST evaluate', {
      method: 'POST',
      path: `/readings/${reading.id}/evaluate`,
      token: accessToken,
      body: {
        userResponse: `This reading explores ${reading.title} and connects key concepts including ${lookupWord} in context.`,
      },
      expectedStatus: 201,
    });
    assertCondition(
      'Readings POST evaluate',
      Number.isInteger(evaluation.body.data?.score) &&
        typeof evaluation.body.data?.passed === 'boolean' &&
        typeof evaluation.body.data?.feedback === 'string' &&
        evaluation.body.data.feedback.length > 0,
      'evaluation response missing score/passed/feedback',
    );

    const history = await runStep('History GET summary', {
      path: '/history',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'History GET summary',
      (history.body.data?.readings?.completed ?? 0) >= 1,
      `readings.completed did not increment: ${JSON.stringify(history.body.data)}`,
    );

    const scores = await runStep('History GET scores', {
      path: '/history/scores',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'History GET scores',
      Array.isArray(scores.body.data) &&
        scores.body.data.some((entry) => entry.readingId === reading.id),
      'evaluated reading missing in /history/scores',
    );

    const streak = await runStep('User GET streak', {
      path: '/user/streak?days=7',
      token: accessToken,
      expectedStatus: 200,
    });
    assertCondition(
      'User GET streak',
      (streak.body.data?.count ?? 0) >= 1,
      `expected streak count >= 1, got ${JSON.stringify(streak.body.data)}`,
    );
  }

  // 6. Admin RBAC enforcement
  await runStep('Admin route denied for student (403)', {
    path: '/admin/categories',
    token: accessToken,
    expectedStatus: 403,
  });

  let adminToken = ADMIN_TOKEN_ENV;
  if (!adminToken && ADMIN_EMAIL && ADMIN_PASSWORD) {
    const adminLogin = await runStep('Admin auth login', {
      method: 'POST',
      path: '/auth/login',
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      expectedStatus: 200,
    });
    adminToken = adminLogin.body.data?.tokens?.accessToken ?? '';
  }

  if (adminToken) {
    const adminCats = await runStep('Admin GET categories (200)', {
      path: '/admin/categories',
      token: adminToken,
      expectedStatus: 200,
    });
    assertCondition(
      'Admin GET categories (200)',
      Array.isArray(adminCats.body.data),
      'expected array from /admin/categories',
    );
    const adminUsers = await runStep('Admin GET users (200)', {
      path: '/admin/users',
      token: adminToken,
      expectedStatus: 200,
    });
    assertCondition(
      'Admin GET users (200)',
      Array.isArray(adminUsers.body.data) && adminUsers.body.data.length > 0,
      'expected non-empty admin users list',
    );
  }

  console.log('\n=== Staging / Critical E2E Summary ===');
  for (const step of stepResults) {
    console.log(
      `${step.ok ? 'PASS' : 'FAIL'} [${step.status}] ${step.stepName} (${step.durationMs}ms)`,
    );
  }
  console.log(`\nAll ${stepResults.length} critical checks passed cleanly.`);
}

main().catch((err) => {
  console.error('\nCRITICAL E2E FAILURE');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
