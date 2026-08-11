import { createUploadTaskQueue } from '@/admin/upload/concurrency';

const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0));

describe('upload concurrency', () => {
  it('runs no more than two network uploads at once', async () => {
    const queue = createUploadTaskQueue(2);
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;

    const uploads = Array.from({ length: 5 }, () => queue.enqueue(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolve => { releases.push(resolve); });
      active -= 1;
    }));

    await nextTurn();
    expect(active).toBe(2);
    expect(queue.activeCount).toBe(2);
    expect(queue.pendingCount).toBe(3);

    releases.shift()?.();
    releases.shift()?.();
    await nextTurn();
    expect(active).toBe(2);
    expect(queue.pendingCount).toBe(1);

    while (releases.length > 0) {
      releases.shift()?.();
    }
    await nextTurn();
    releases.shift()?.();
    await Promise.all(uploads);

    expect(maximumActive).toBe(2);
    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });
});
