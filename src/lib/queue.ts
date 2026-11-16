// Limits how many generations run at once in this process. Waiting jobs are
// served priority first (Premium), then first come, first served.
type Waiter = { priority: boolean; start: () => void }

export function createQueue(maxConcurrency: () => number) {
  let running = 0
  const waiting: Waiter[] = []

  function release(): void {
    running -= 1
    const index = waiting.findIndex(waiter => waiter.priority)
    const next = waiting.splice(index === -1 ? 0 : index, 1)[0]
    next?.start()
  }

  return async function run<T>(priority: boolean, job: () => Promise<T>): Promise<T> {
    if (running >= maxConcurrency()) {
      await new Promise<void>(resolve => waiting.push({ priority, start: resolve }))
    }
    running += 1
    try {
      return await job()
    } finally {
      release()
    }
  }
}
