import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  findAvailableMediaId,
  isExactVerifiedStorageCopy,
  runSafeRegistrationCommit,
} from '../src/index.ts';

class SimulatedCrash extends Error {}

class IsolatedRegistrationEnvironment {
  constructor(root) {
    this.root = root;
    this.storageRoot = join(root, 'storage');
    this.databasePath = join(root, 'database.json');
    this.copyRequests = 0;
    this.cleanupRequests = 0;
  }

  async initialize() {
    await mkdir(this.storageRoot, { recursive: true });
    await this.writeDatabase({ statuses: {}, media: {}, fileMaps: {} });
  }

  async readDatabase() {
    return JSON.parse(await readFile(this.databasePath, 'utf8'));
  }

  async writeDatabase(database) {
    await writeFile(this.databasePath, JSON.stringify(database), 'utf8');
  }

  objectPath(key) {
    return join(this.storageRoot, ...key.split('/'));
  }

  async putObject(key, bytes) {
    const path = this.objectPath(key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes);
  }

  async objectSize(key) {
    return stat(this.objectPath(key)).then(value => value.size).catch(() => undefined);
  }

  async objectBytes(key) {
    return readFile(this.objectPath(key)).catch(() => undefined);
  }

  async persistIdentity(sourceKey, mediaId) {
    const database = await this.readDatabase();
    const existing = database.statuses[sourceKey] || {};
    database.statuses[sourceKey] = {
      ...existing,
      sourceKey,
      mediaId: existing.mediaId || mediaId,
      status: 'registering',
    };
    await this.writeDatabase(database);
    return database.statuses[sourceKey].mediaId;
  }

  async idempotentCopy(sourceKey, destinationKey, { loseResponse = false } = {}) {
    this.copyRequests += 1;
    const source = await this.objectBytes(sourceKey);
    if (!source) throw new Error('source missing');
    const destination = await this.objectBytes(destinationKey);
    if (!destination || !isExactVerifiedStorageCopy(source.length, destination.length)) {
      await this.putObject(destinationKey, source);
    }
    if (loseResponse) throw new SimulatedCrash('copy response lost');
  }

  async atomicCommit({ sourceKey, destinationKey, mediaId }) {
    const database = await this.readDatabase();
    const duplicate = Object.values(database.media).find(row =>
      row.sourceKey === sourceKey && row.id !== mediaId,
    );
    if (duplicate) throw new Error('duplicate source identity');
    database.media[mediaId] = { id: mediaId, sourceKey, destinationKey };
    database.fileMaps[mediaId] = { mediaId, sourceKey, destinationKey };
    database.statuses[sourceKey] = {
      ...database.statuses[sourceKey],
      mediaId,
      status: 'registered',
    };
    await this.writeDatabase(database);
  }

  async cleanupSource(sourceKey) {
    this.cleanupRequests += 1;
    await unlink(this.objectPath(sourceKey)).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }

  async recover(sourceKey, { crashAt, loseCopyResponse = false } = {}) {
    const database = await this.readDatabase();
    const committed = Object.values(database.media).find(
      row => row.sourceKey === sourceKey,
    );
    if (committed) {
      await this.cleanupSource(sourceKey);
      return {
        mediaId: committed.id,
        destinationKey: committed.destinationKey,
      };
    }
    const existingId = database.statuses[sourceKey]?.mediaId;
    const mediaId = existingId || await findAvailableMediaId(
      attempt => Promise.resolve(String(700000000000 + attempt)),
      new Set(Object.keys(database.media)),
    );
    const durableId = await this.persistIdentity(sourceKey, mediaId);
    const extension = sourceKey.split('.').pop();
    const destinationKey = `registered/${durableId}.${extension}`;
    if (crashAt === 'after-id') throw new SimulatedCrash('after ID');

    const sourceSize = await this.objectSize(sourceKey);
    const destinationSize = await this.objectSize(destinationKey);
    if (!isExactVerifiedStorageCopy(sourceSize, destinationSize)) {
      await this.idempotentCopy(sourceKey, destinationKey, {
        loseResponse: loseCopyResponse,
      });
    }
    if (crashAt === 'after-copy') throw new SimulatedCrash('after copy');

    await runSafeRegistrationCommit({
      prepareDestination: async () => {
        const verifiedSize = await this.objectSize(destinationKey);
        if (!isExactVerifiedStorageCopy(sourceSize, verifiedSize)) {
          throw new Error('destination not verified');
        }
      },
      commitRegistration: async () => {
        await this.atomicCommit({ sourceKey, destinationKey, mediaId: durableId });
        if (crashAt === 'after-commit') throw new SimulatedCrash('after commit');
      },
      cleanupSource: async () => {
        if (crashAt === 'before-cleanup') throw new SimulatedCrash('before cleanup');
        await this.cleanupSource(sourceKey);
      },
    });
    return { mediaId: durableId, destinationKey };
  }

  async assertSingleSurvivor(sourceKey, expectedBytes) {
    const database = await this.readDatabase();
    const mediaRows = Object.values(database.media).filter(row => row.sourceKey === sourceKey);
    const fileMaps = Object.values(database.fileMaps).filter(row => row.sourceKey === sourceKey);
    assert.equal(mediaRows.length, 1, 'one media identity per source');
    assert.equal(fileMaps.length, 1, 'one durable source map per source');
    assert.equal(mediaRows[0].id, fileMaps[0].mediaId);
    assert.deepEqual(await this.objectBytes(mediaRows[0].destinationKey), expectedBytes);
  }
}

const withEnvironment = async callback => {
  const root = await mkdtemp(join(tmpdir(), 'registration-survival-'));
  const environment = new IsolatedRegistrationEnvironment(root);
  await environment.initialize();
  try {
    await callback(environment);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

for (const crashAt of ['after-id', 'after-copy', 'before-cleanup']) {
  test(`isolated recovery survives termination ${crashAt} without duplicates`, async () => {
    await withEnvironment(async environment => {
      const sourceKey = 'incoming/original.mp4';
      const bytes = Buffer.from('original-video-bytes');
      await environment.putObject(sourceKey, bytes);
      if (crashAt === 'before-cleanup') {
        await environment.recover(sourceKey, { crashAt });
        assert.deepEqual(
          await environment.objectBytes(sourceKey),
          bytes,
          'post-commit cleanup failure preserves the source for later cleanup',
        );
      } else {
        await assert.rejects(
          environment.recover(sourceKey, { crashAt }),
          SimulatedCrash,
        );
      }

      const beforeRecovery = await environment.readDatabase();
      const persistedId = beforeRecovery.statuses[sourceKey].mediaId;
      assert.ok(persistedId, 'media ID survives invocation death');

      const recovered = await environment.recover(sourceKey);
      assert.equal(recovered.mediaId, persistedId, 'recovery reuses the same ID');
      await environment.assertSingleSurvivor(sourceKey, bytes);
      assert.equal(await environment.objectSize(sourceKey), undefined);
    });
  });
}

test('lost Drive copy response reuses the exact destination and does not clone the object', async () => {
  await withEnvironment(async environment => {
    const sourceKey = 'incoming/response-lost.mp4';
    const bytes = Buffer.from('copy-completed-before-timeout');
    await environment.putObject(sourceKey, bytes);
    await assert.rejects(
      environment.recover(sourceKey, { loseCopyResponse: true }),
      SimulatedCrash,
    );
    const requestsAfterLostResponse = environment.copyRequests;
    await environment.recover(sourceKey);
    assert.equal(environment.copyRequests, requestsAfterLostResponse,
      'exact-size destination prevents a duplicate copy request');
    await environment.assertSingleSurvivor(sourceKey, bytes);
  });
});

test('a corrupt partial destination is repaired at the same key before commit', async () => {
  await withEnvironment(async environment => {
    const sourceKey = 'incoming/partial.mp4';
    const bytes = Buffer.from('complete-original-payload');
    await environment.putObject(sourceKey, bytes);
    await environment.persistIdentity(sourceKey, '700000000000');
    await environment.putObject('registered/700000000000.mp4', Buffer.from('partial'));

    const recovered = await environment.recover(sourceKey);
    assert.equal(recovered.destinationKey, 'registered/700000000000.mp4');
    await environment.assertSingleSurvivor(sourceKey, bytes);
    assert.equal(environment.copyRequests, 1);
  });
});

test('repeated recovery calls converge on one media row, map, and object key', async () => {
  await withEnvironment(async environment => {
    const sourceKey = 'incoming/repeated.mp4';
    const bytes = Buffer.from('repeat-safe-payload');
    await environment.putObject(sourceKey, bytes);
    await environment.recover(sourceKey, { crashAt: 'after-copy' }).catch(() => undefined);
    await environment.recover(sourceKey);
    await environment.recover(sourceKey);
    await environment.assertSingleSurvivor(sourceKey, bytes);
    const database = await environment.readDatabase();
    assert.equal(Object.keys(database.media).length, 1);
    assert.equal(Object.keys(database.fileMaps).length, 1);
  });
});

test('failed commit preserves both source and verified destination for recovery', async () => {
  await withEnvironment(async environment => {
    const sourceKey = 'incoming/commit-failure.mp4';
    const bytes = Buffer.from('never-delete-before-commit');
    await environment.putObject(sourceKey, bytes);
    const originalCommit = environment.atomicCommit.bind(environment);
    environment.atomicCommit = async () => { throw new Error('database unavailable'); };
    await assert.rejects(environment.recover(sourceKey), /database unavailable/);
    assert.deepEqual(await environment.objectBytes(sourceKey), bytes);
    const database = await environment.readDatabase();
    const mediaId = database.statuses[sourceKey].mediaId;
    assert.deepEqual(
      await environment.objectBytes(`registered/${mediaId}.mp4`),
      bytes,
    );

    environment.atomicCommit = originalCommit;
    await environment.recover(sourceKey);
    await environment.assertSingleSurvivor(sourceKey, bytes);
  });
});

test('ten thousand randomized interruption schedules converge without duplicates or data loss', () => {
  const scenarioCount = 10_000;
  let seed = 0x6d2b79f5;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };

  for (let scenario = 0; scenario < scenarioCount; scenario += 1) {
    const sources = Array.from({ length: 2 + (random() % 5) }, (_, index) => ({
      key: `incoming/${scenario}-${index}.mp4`,
      id: undefined,
      expectedSize: undefined,
      destinationKey: undefined,
      destinationSize: undefined,
      committed: false,
      sourcePresent: true,
      terminal: index === 0 && scenario % 7 === 0,
      attempts: 0,
    }));
    const committedIds = new Set();
    const committedDestinations = new Set();
    let nextId = scenario * 10 + 800000000000;

    for (let step = 0; step < 80; step += 1) {
      const healthy = sources.filter(source =>
        !source.committed && !source.terminal,
      );
      const retryableTerminal = healthy.length === 0
        ? sources.filter(source => !source.committed && source.terminal)
        : [];
      const source = healthy[0] || retryableTerminal[0];
      if (!source) break;

      // Explicit/manual recovery may make a terminal row eligible, but it
      // retains identity and destination checkpoints.
      if (source.terminal) source.terminal = false;
      source.attempts += 1;
      source.id ||= String(nextId++);
      source.destinationKey ||= `registered/${source.id}.mp4`;
      const crashPoint = random() % 9;
      if (crashPoint === 0) continue; // killed immediately after atomic claim+ID

      source.expectedSize ||= 1000 + (random() % 1_000_000);
      if (crashPoint === 1) continue; // killed after durable source metadata

      if (source.destinationSize !== source.expectedSize) {
        // A partial or missing target is always repaired at the same key.
        source.destinationSize = crashPoint === 2
          ? Math.max(0, source.expectedSize - 1)
          : source.expectedSize;
      }
      if (crashPoint === 2 || crashPoint === 3) continue;

      assert.equal(source.destinationSize, source.expectedSize);
      if (!source.committed) {
        assert.equal(committedIds.has(source.id), false);
        assert.equal(committedDestinations.has(source.destinationKey), false);
        committedIds.add(source.id);
        committedDestinations.add(source.destinationKey);
        source.committed = true;
      }
      if (crashPoint === 4) continue; // committed, cleanup interrupted
      source.sourcePresent = false;
    }

    // Force all recoverable rows through a fault-free pass. This models later
    // cron/manual invocations after any finite sequence of interruptions.
    for (const source of sources) {
      source.terminal = false;
      source.id ||= String(nextId++);
      source.destinationKey ||= `registered/${source.id}.mp4`;
      source.expectedSize ||= 1000 + (random() % 1_000_000);
      source.destinationSize = source.expectedSize;
      if (!source.committed) {
        assert.equal(committedIds.has(source.id), false);
        assert.equal(committedDestinations.has(source.destinationKey), false);
        committedIds.add(source.id);
        committedDestinations.add(source.destinationKey);
        source.committed = true;
      }
      source.sourcePresent = false;
    }

    assert.equal(committedIds.size, sources.length);
    assert.equal(committedDestinations.size, sources.length);
    assert.equal(sources.every(source => source.committed), true);
    assert.equal(sources.every(source => !source.sourcePresent), true);
    assert.equal(
      new Set(sources.map(source => source.id)).size,
      sources.length,
    );
  }
});
