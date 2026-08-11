export type UploadTask = () => Promise<void>;

export const createUploadTaskQueue = (maxConcurrent: number) => {
  const concurrency = Math.max(1, Math.floor(maxConcurrent));
  const queuedTasks: Array<{
    task: UploadTask
    resolve: () => void
    reject: (error: unknown) => void
  }> = [];
  let activeCount = 0;

  const pump = () => {
    while (activeCount < concurrency && queuedTasks.length > 0) {
      const queued = queuedTasks.shift();
      if (!queued) { return; }
      activeCount += 1;
      void queued.task()
        .then(queued.resolve, queued.reject)
        .finally(() => {
          activeCount -= 1;
          pump();
        });
    }
  };

  return {
    enqueue: (task: UploadTask) => new Promise<void>((resolve, reject) => {
      queuedTasks.push({ task, resolve, reject });
      pump();
    }),
    get activeCount() { return activeCount; },
    get pendingCount() { return queuedTasks.length; },
  };
};
