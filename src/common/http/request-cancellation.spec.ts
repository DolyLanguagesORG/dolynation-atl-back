import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { createRequestCancellation } from './request-cancellation';

class FakeResponse extends EventEmitter {
  writableFinished = false;
}

describe('createRequestCancellation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts when the client closes the connection before the response is sent', () => {
    const res = new FakeResponse();
    const { signal, dispose } = createRequestCancellation(res as unknown as Response, 60_000);

    res.emit('close');

    expect(signal.aborted).toBe(true);
    dispose();
  });

  it('does not abort when the connection closes after the response finished', () => {
    const res = new FakeResponse();
    const { signal, dispose } = createRequestCancellation(res as unknown as Response, 60_000);

    res.writableFinished = true;
    res.emit('close');

    expect(signal.aborted).toBe(false);
    dispose();
  });

  it('aborts when the deadline expires and stops listening once disposed', () => {
    jest.useFakeTimers();
    const res = new FakeResponse();
    const { signal, dispose } = createRequestCancellation(res as unknown as Response, 1_000);

    jest.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);

    dispose();
    expect(res.listenerCount('close')).toBe(0);
  });
});
