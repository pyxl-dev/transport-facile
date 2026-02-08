import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchWithRetry,
  FetchRetryError,
} from '../utils/fetch-with-retry.js'

describe('fetchWithRetry', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const fastOptions = { retries: 3, initialDelayMs: 10, timeoutMs: 5_000 }

  it('should return response on first attempt success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    const response = await fetchWithRetry('https://example.com', undefined, fastOptions)

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('should retry after 504 then succeed', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 504, statusText: 'Gateway Timeout' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })

    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs)
    const response = await promise

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('should retry after 429 rate limit then succeed', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })

    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs)
    const response = await promise

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('should retry after network error then succeed', async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })

    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs)
    const response = await promise

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('should throw FetchRetryError when all retries exhausted (retryable status)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    })

    let caughtError: unknown
    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
      .catch((error: unknown) => { caughtError = error })

    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs * 10)
    await promise

    expect(caughtError).toBeInstanceOf(FetchRetryError)
    const retryError = caughtError as FetchRetryError
    expect(retryError.statusCode).toBe(502)
    expect(retryError.attempts).toBe(4)
    expect(globalThis.fetch).toHaveBeenCalledTimes(4)
  })

  it('should throw FetchRetryError when all retries exhausted (network error)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    let caughtError: unknown
    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
      .catch((error: unknown) => { caughtError = error })

    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs * 10)
    await promise

    expect(caughtError).toBeInstanceOf(FetchRetryError)
    const retryError = caughtError as FetchRetryError
    expect(retryError.statusCode).toBeUndefined()
    expect(retryError.attempts).toBe(4)
    expect(retryError.message).toContain('ECONNREFUSED')
  })

  it('should throw immediately on non-retryable 400 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    })

    await expect(
      fetchWithRetry('https://example.com', undefined, fastOptions)
    ).rejects.toThrow(FetchRetryError)

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('should throw immediately on non-retryable 404 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    try {
      await fetchWithRetry('https://example.com', undefined, fastOptions)
    } catch (error) {
      const retryError = error as FetchRetryError
      expect(retryError.statusCode).toBe(404)
      expect(retryError.attempts).toBe(1)
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('should pass AbortSignal for timeout', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    await fetchWithRetry('https://example.com', undefined, fastOptions)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('should use exponential backoff delays', async () => {
    const callTimes: number[] = []

    globalThis.fetch = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now())
      return Promise.resolve({ ok: false, status: 504, statusText: 'Gateway Timeout' })
    })

    const opts = { retries: 3, initialDelayMs: 1_000, timeoutMs: 30_000 }
    let caughtError: unknown
    const promise = fetchWithRetry('https://example.com', undefined, opts)
      .catch((error: unknown) => { caughtError = error })

    // Attempt 1 fires immediately
    await vi.advanceTimersByTimeAsync(0)
    expect(callTimes).toHaveLength(1)

    // Attempt 2 after 1000ms
    await vi.advanceTimersByTimeAsync(1_000)
    expect(callTimes).toHaveLength(2)

    // Attempt 3 after 2000ms
    await vi.advanceTimersByTimeAsync(2_000)
    expect(callTimes).toHaveLength(3)

    // Attempt 4 after 4000ms
    await vi.advanceTimersByTimeAsync(4_000)
    expect(callTimes).toHaveLength(4)

    await promise
    expect(caughtError).toBeInstanceOf(FetchRetryError)
  })

  it('should pass RequestInit to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    const requestInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'value' }),
    }

    await fetchWithRetry('https://example.com', requestInit, fastOptions)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('should handle abort error as retryable', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })

    const promise = fetchWithRetry('https://example.com', undefined, fastOptions)
    await vi.advanceTimersByTimeAsync(fastOptions.initialDelayMs)
    const response = await promise

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('should use default options when none provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    const response = await fetchWithRetry('https://example.com')

    expect(response.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})
