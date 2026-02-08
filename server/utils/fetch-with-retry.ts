export interface FetchWithRetryOptions {
  readonly retries: number
  readonly initialDelayMs: number
  readonly timeoutMs: number
  readonly retryableStatuses: readonly number[]
}

const DEFAULT_OPTIONS: FetchWithRetryOptions = {
  retries: 3,
  initialDelayMs: 1_000,
  timeoutMs: 30_000,
  retryableStatuses: [429, 500, 502, 503, 504],
}

export class FetchRetryError extends Error {
  readonly statusCode: number | undefined
  readonly attempts: number

  constructor(
    message: string,
    statusCode: number | undefined,
    attempts: number
  ) {
    super(message)
    this.name = 'FetchRetryError'
    this.statusCode = statusCode
    this.attempts = attempts
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  options?: Partial<FetchWithRetryOptions>
): Promise<Response> {
  const opts: FetchWithRetryOptions = { ...DEFAULT_OPTIONS, ...options }
  const maxAttempts = opts.retries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts

    if (attempt > 1) {
      const backoffMs = opts.initialDelayMs * Math.pow(2, attempt - 2)
      await delay(backoffMs)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs)

    const mergedInit: RequestInit = {
      ...init,
      signal: controller.signal,
    }

    try {
      const response = await fetch(input, mergedInit)
      clearTimeout(timeoutId)

      if (response.ok) {
        return response
      }

      if (opts.retryableStatuses.includes(response.status)) {
        console.warn(
          `Fetch attempt ${attempt}/${maxAttempts} failed: HTTP ${response.status} ${response.statusText}`
        )
        if (isLastAttempt) {
          throw new FetchRetryError(
            `All ${maxAttempts} attempts failed. Last: HTTP ${response.status} ${response.statusText}`,
            response.status,
            maxAttempts
          )
        }
        continue
      }

      throw new FetchRetryError(
        `Non-retryable HTTP ${response.status}: ${response.statusText}`,
        response.status,
        attempt
      )
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof FetchRetryError) {
        throw error
      }

      console.warn(
        `Fetch attempt ${attempt}/${maxAttempts} failed:`,
        error instanceof Error ? error.message : error
      )

      if (isLastAttempt) {
        throw new FetchRetryError(
          `All ${maxAttempts} attempts failed. Last error: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          maxAttempts
        )
      }
    }
  }

  throw new FetchRetryError('Unexpected: no attempts made', undefined, 0)
}
