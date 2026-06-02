/**
 * Tiny FIFO concurrency limiter for client-side async work.
 *
 * Caps how many tasks run at once; the rest queue and start as slots
 * free. Used to bound the burst of `/api/track-cover` lookups a long
 * tracklist / chart grid would otherwise fire in one wave (every call
 * serializes through MB's 1-req/sec queue, so an unbounded burst
 * saturates it). A slot is always freed — success OR failure — so one
 * rejected task can't wedge the queue.
 */
export function createAsyncLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    if (active >= maxConcurrent) return;
    const start = queue.shift();
    if (!start) return;
    active++;
    start();
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
  };
}
