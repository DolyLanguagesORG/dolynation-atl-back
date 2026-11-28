#!/usr/bin/env node
/**
 * Reproducible load & latency smoke script (#25).
 * Default scenario: 1 AI reading + evaluation cycle/sec alongside continuous
 * non-AI workers for 60s, reporting p50/p95/p99, throughput, and bottleneck analysis.
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3333/api/v1').replace(/\/+$/, '');
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS ?? 60);
const AI_RATE_PER_SEC = Number(process.env.AI_RATE_PER_SEC ?? 1);
const NON_AI_CONCURRENCY = Number(process.env.NON_AI_CONCURRENCY ?? 2);
const MAX_AI_INFLIGHT = Number(process.env.MAX_AI_INFLIGHT ?? 3);
const LOGIN_SAMPLE_COUNT = Number(process.env.LOGIN_SAMPLE_COUNT ?? 8);
const SKIP_AI = process.env.SKIP_AI === 'true';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);
const TEST_EMAIL = process.env.TEST_EMAIL?.trim() || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD?.trim() || '';
const OUTPUT_JSON = process.env.OUTPUT_JSON?.trim() || '';

const statsByEndpoint = new Map();

function getBucket(name, category) {
  let bucket = statsByEndpoint.get(name);
  if (!bucket) {
    bucket = { name, category, latencies: [], ok: 0, errors: 0, statusCodes: {} };
    statsByEndpoint.set(name, bucket);
  }
  return bucket;
}

function recordMetric(name, category, status, durationMs, ok) {
  const bucket = getBucket(name, category);
  bucket.latencies.push(durationMs);
  const codeKey = String(status);
  bucket.statusCodes[codeKey] = (bucket.statusCodes[codeKey] ?? 0) + 1;
  if (ok) {
    bucket.ok += 1;
  } else {
    bucket.errors += 1;
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeBucket(bucket, elapsedSec) {
  const sorted = [...bucket.latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avgMs = count > 0 ? sum / count : 0;
  return {
    endpoint: bucket.name,
    category: bucket.category,
    count,
    ok: bucket.ok,
    errors: bucket.errors,
    errorRatePct: count > 0 ? Number(((bucket.errors / count) * 100).toFixed(2)) : 0,
    rps: elapsedSec > 0 ? Number((count / elapsedSec).toFixed(2)) : 0,
    minMs: count > 0 ? Number(sorted[0].toFixed(2)) : 0,
    avgMs: Number(avgMs.toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: count > 0 ? Number(sorted[count - 1].toFixed(2)) : 0,
    statusCodes: bucket.statusCodes,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedRequest(metricName, category, { method = 'GET', path, token, body }) {
  const url = `${BASE_URL}${path}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const startedAt = performance.now();
  let status = 'ERR';
  let json = null;
  let ok = false;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = res.status;
    ok = res.ok;
    const text = await res.text();
    if (text.trim().length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
  } catch {
    status = 'TIMEOUT_OR_NET';
    ok = false;
  }
  const durationMs = performance.now() - startedAt;
  recordMetric(metricName, category, status, durationMs, ok);
  return { ok, status, json, durationMs };
}

async function setupActor() {
  const email =
    TEST_EMAIL || `load-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = TEST_PASSWORD || 'LoadSmokePass123!';

  if (!TEST_EMAIL) {
    const reg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'Load Smoke Runner' }),
    });
    if (!reg.ok) {
      throw new Error(`Setup register failed with ${reg.status}: ${await reg.text()}`);
    }
    const regJson = await reg.json();
    const token = regJson.data?.tokens?.accessToken;
    const plan = await fetch(`${BASE_URL}/user/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tier: 'dolly_pro' }),
    });
    if (!plan.ok) {
      throw new Error(`Setup plan selection failed with ${plan.status}: ${await plan.text()}`);
    }
    await fetch(`${BASE_URL}/settings/languages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ languages: ['en'] }),
    });
    await fetch(`${BASE_URL}/settings/categories`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ categories: ['technology', 'science', 'history'] }),
    });
  }

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Setup login failed with ${loginRes.status}: ${await loginRes.text()}`);
  }
  const loginJson = await loginRes.json();
  const accessToken = loginJson.data?.tokens?.accessToken;
  if (!accessToken) {
    throw new Error('Setup login did not return accessToken');
  }
  return { email, password, accessToken };
}

async function runNonAiWorker(deadlineMs, actor) {
  const routes = [
    { name: 'GET /health/ready', path: '/health/ready', auth: false },
    { name: 'GET /user/profile', path: '/user/profile', auth: true },
    { name: 'GET /history', path: '/history', auth: true },
    { name: 'GET /user/streak?days=7', path: '/user/streak?days=7', auth: true },
  ];
  let idx = 0;
  while (Date.now() < deadlineMs) {
    const route = routes[idx % routes.length];
    idx += 1;
    await timedRequest(route.name, 'non-ai', {
      path: route.path,
      token: route.auth ? actor.accessToken : undefined,
    });
  }
}

async function runLoginSampler(deadlineMs, actor) {
  if (LOGIN_SAMPLE_COUNT <= 0) return;
  const intervalMs = Math.max(200, Math.floor((DURATION_SECONDS * 1000) / LOGIN_SAMPLE_COUNT));
  for (let i = 0; i < LOGIN_SAMPLE_COUNT && Date.now() < deadlineMs; i += 1) {
    await timedRequest('POST /auth/login', 'non-ai', {
      method: 'POST',
      path: '/auth/login',
      body: { email: actor.email, password: actor.password },
    });
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
}

async function runAiCycles(deadlineMs, actor) {
  if (SKIP_AI || AI_RATE_PER_SEC <= 0) return;
  const intervalMs = Math.max(50, Math.round(1000 / AI_RATE_PER_SEC));
  let inFlight = 0;
  const pendingPromises = [];

  const runSingleCycle = async () => {
    inFlight += 1;
    try {
      const gen = await timedRequest('POST /readings', 'ai', {
        method: 'POST',
        path: '/readings',
        token: actor.accessToken,
        body: { category: 'technology', language: 'en', difficulty: 'medium', size: 'short' },
      });
      const readingId = gen.json?.data?.id;
      if (gen.ok && Number.isInteger(readingId)) {
        await timedRequest('POST /readings/:id/evaluate', 'ai', {
          method: 'POST',
          path: `/readings/${readingId}/evaluate`,
          token: actor.accessToken,
          body: {
            userResponse:
              'The passage explains key principles in context and links domain terminology with coherent examples.',
          },
        });
      }
    } finally {
      inFlight -= 1;
    }
  };

  while (Date.now() < deadlineMs) {
    const tickStart = Date.now();
    if (inFlight < MAX_AI_INFLIGHT) {
      pendingPromises.push(runSingleCycle());
    }
    const elapsed = Date.now() - tickStart;
    const waitMs = Math.min(Math.max(0, intervalMs - elapsed), Math.max(0, deadlineMs - Date.now()));
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  await Promise.allSettled(pendingPromises);
}

async function main() {
  console.log(
    `Starting load & latency smoke test against ${BASE_URL} | duration=${DURATION_SECONDS}s | aiRate=${AI_RATE_PER_SEC}/s | nonAiConcurrency=${NON_AI_CONCURRENCY} | SKIP_AI=${SKIP_AI}`,
  );
  const actor = await setupActor();
  const startedAt = Date.now();
  const deadlineMs = startedAt + DURATION_SECONDS * 1000;

  const tasks = [runLoginSampler(deadlineMs, actor), runAiCycles(deadlineMs, actor)];
  for (let i = 0; i < NON_AI_CONCURRENCY; i += 1) {
    tasks.push(runNonAiWorker(deadlineMs, actor));
  }

  await Promise.all(tasks);
  const actualDurationSec = Math.max(0.001, (Date.now() - startedAt) / 1000);

  const endpointSummaries = Array.from(statsByEndpoint.values()).map((bucket) =>
    summarizeBucket(bucket, actualDurationSec),
  );

  const nonAiLatencies = endpointSummaries
    .filter((s) => s.category === 'non-ai')
    .flatMap((s) => statsByEndpoint.get(s.endpoint).latencies)
    .sort((a, b) => a - b);
  const aiLatencies = endpointSummaries
    .filter((s) => s.category === 'ai')
    .flatMap((s) => statsByEndpoint.get(s.endpoint).latencies)
    .sort((a, b) => a - b);

  const totalRequests = endpointSummaries.reduce((acc, s) => acc + s.count, 0);
  const totalErrors = endpointSummaries.reduce((acc, s) => acc + s.errors, 0);
  const slowestOverall = [...endpointSummaries].sort((a, b) => b.p95Ms - a.p95Ms)[0] ?? null;
  const slowestNonAi =
    endpointSummaries
      .filter((s) => s.category === 'non-ai')
      .sort((a, b) => b.p95Ms - a.p95Ms)[0] ?? null;

  const report = {
    baseUrl: BASE_URL,
    durationSec: Number(actualDurationSec.toFixed(2)),
    totalRequests,
    totalErrors,
    overallErrorRatePct:
      totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
    overallRps: Number((totalRequests / actualDurationSec).toFixed(2)),
    nonAiSummary: {
      count: nonAiLatencies.length,
      p50Ms: Number(percentile(nonAiLatencies, 50).toFixed(2)),
      p95Ms: Number(percentile(nonAiLatencies, 95).toFixed(2)),
      p99Ms: Number(percentile(nonAiLatencies, 99).toFixed(2)),
    },
    aiSummary: {
      count: aiLatencies.length,
      p50Ms: Number(percentile(aiLatencies, 50).toFixed(2)),
      p95Ms: Number(percentile(aiLatencies, 95).toFixed(2)),
      p99Ms: Number(percentile(aiLatencies, 99).toFixed(2)),
    },
    slowestOverall,
    slowestNonAi,
    endpoints: endpointSummaries,
  };

  console.log('\n=== Load & Latency Report ===');
  console.log(
    `Duration: ${report.durationSec}s | Total Requests: ${report.totalRequests} | RPS: ${report.overallRps} | Errors: ${report.totalErrors} (${report.overallErrorRatePct}%)`,
  );
  console.log(
    `Non-AI Aggregate -> count=${report.nonAiSummary.count}, p50=${report.nonAiSummary.p50Ms}ms, p95=${report.nonAiSummary.p95Ms}ms, p99=${report.nonAiSummary.p99Ms}ms`,
  );
  console.log(
    `AI Aggregate     -> count=${report.aiSummary.count}, p50=${report.aiSummary.p50Ms}ms, p95=${report.aiSummary.p95Ms}ms, p99=${report.aiSummary.p99Ms}ms`,
  );
  console.log(
    '\nEndpoint                         | Cat    | Count | OK   | Err | RPS   | p50(ms) | p95(ms) | p99(ms) | Max(ms)',
  );
  console.log(
    '---------------------------------+--------+-------+------+-----+-------+---------+---------+---------+--------',
  );
  for (const row of endpointSummaries) {
    console.log(
      `${row.endpoint.padEnd(32)} | ${row.category.padEnd(6)} | ${String(row.count).padStart(5)} | ${String(row.ok).padStart(4)} | ${String(row.errors).padStart(3)} | ${String(row.rps).padStart(5)} | ${String(row.p50Ms).padStart(7)} | ${String(row.p95Ms).padStart(7)} | ${String(row.p99Ms).padStart(7)} | ${String(row.maxMs).padStart(7)}`,
    );
  }
  if (slowestOverall) {
    console.log(
      `\nSlowest overall endpoint (p95): ${slowestOverall.endpoint} (${slowestOverall.p95Ms}ms)`,
    );
  }
  if (slowestNonAi) {
    console.log(
      `Slowest non-AI endpoint  (p95): ${slowestNonAi.endpoint} (${slowestNonAi.p95Ms}ms)`,
    );
  }

  if (OUTPUT_JSON) {
    writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`JSON report saved to ${OUTPUT_JSON}`);
  }

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nLOAD SMOKE FAILURE');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
