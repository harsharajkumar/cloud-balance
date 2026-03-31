import assert from 'node:assert/strict';
import test from 'node:test';

import { metricsHandler, predictionHandler } from './ml.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    type(value) {
      this.headers['content-type'] = value;
      return this;
    },
    json(payload) {
      this.headers['content-type'] ??= 'application/json';
      this.body = JSON.stringify(payload);
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function withMockedFetch(mockFetch, testFn) {
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  try {
    await testFn();
  } finally {
    global.fetch = originalFetch;
  }
}

test('GET /ml/prediction proxies JSON predictions', async () => {
  await withMockedFetch(
    async () =>
      new Response(
        JSON.stringify({
          predicted_requests: 123.45,
          desired_replicas: 3,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    async () => {
      const res = createMockRes();

      await predictionHandler({}, res);

      const body = JSON.parse(res.body);
      assert.equal(res.statusCode, 200);
      assert.equal(body.predicted_requests, 123.45);
      assert.equal(body.desired_replicas, 3);
    }
  );
});

test('GET /ml/metrics proxies Prometheus text', async () => {
  const metricsPayload = `# HELP predicted_requests Predicted next-step requests
# TYPE predicted_requests gauge
predicted_requests 123.450
# HELP desired_replicas Desired replica count based on prediction
# TYPE desired_replicas gauge
desired_replicas 3
`;

  await withMockedFetch(
    async () =>
      new Response(metricsPayload, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      }),
    async () => {
      const res = createMockRes();

      await metricsHandler({}, res);

      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /text\/plain/);
      assert.match(res.body, /predicted_requests 123\.450/);
      assert.match(res.body, /desired_replicas 3/);
      assert.doesNotMatch(res.body, /^\s*\{/);
    }
  );
});
