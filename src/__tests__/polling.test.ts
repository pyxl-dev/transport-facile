import { createPollingService } from '../services/polling'

describe('createPollingService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not be running initially', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    expect(service.isRunning()).toBe(false)
  })

  it('should call callback immediately on start', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.start()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(true)

    service.stop()
  })

  it('should call callback on each interval', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.start()
    expect(callback).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(3)

    service.stop()
  })

  it('should stop calling callback after stop', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.start()
    expect(callback).toHaveBeenCalledTimes(1)

    service.stop()

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(service.isRunning()).toBe(false)
  })

  it('should not start twice if already running', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.start()
    service.start()

    expect(callback).toHaveBeenCalledTimes(1)

    service.stop()
  })

  it('should not throw if stop is called when not running', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback)

    expect(() => service.stop()).not.toThrow()
  })

  it('should handle callback errors without stopping polling', () => {
    const callback = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(undefined)

    const service = createPollingService(callback, 5000)

    service.start()
    expect(callback).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(service.isRunning()).toBe(true)

    service.stop()
  })

  it('should call callback on forceRefresh', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.forceRefresh()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should allow restart after stop', () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const service = createPollingService(callback, 5000)

    service.start()
    expect(callback).toHaveBeenCalledTimes(1)

    service.stop()

    service.start()
    expect(callback).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(3)

    service.stop()
  })
})
