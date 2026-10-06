import {parentPort, workerData} from 'node:worker_threads';
import {measureProject, prepareArchive, cleanupArchive} from './disk.js';

try {
  const {kind, root, project, exam, actor} = workerData;
  const result =
    kind === 'measure'
      ? await measureProject(root, project)
      : kind === 'prepare'
        ? await prepareArchive(root, project, exam, actor, (progress) =>
            parentPort!.postMessage({progress}),
          )
        : kind === 'cleanup'
          ? await cleanupArchive(root, project)
          : (() => {
              throw new Error('Invalid disk operation');
            })();
  parentPort!.postMessage({result});
} catch (error) {
  parentPort!.postMessage({
    error: error instanceof Error ? error.message : 'Disk operation failed',
  });
}
