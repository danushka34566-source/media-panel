/**
 * Run independent work with a hard upper bound on in-flight operations.
 * Keeping the bound here makes storage and database fan-out safe for large
 * registration, cleanup, and reconciliation batches.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrent: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) { return []; }
  const concurrency = Math.max(1, Math.floor(maxConcurrent));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) { return; }
      results[index] = await task(items[index]!, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}
