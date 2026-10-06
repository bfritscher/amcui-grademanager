import {Worker} from 'node:worker_threads';

export function diskWork<T>(
  data: Record<string, unknown>,
  progress: (value: string) => void = () => {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./diskWorker.js', import.meta.url), {
      workerData: data,
    });
    let finished = false;
    worker.on('message', (message) => {
      if (message.progress) progress(message.progress);
      else {
        finished = true;
        if (message.error) reject(new Error(message.error));
        else resolve(message.result);
      }
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (!finished) reject(new Error('Disk worker exited: ' + code));
    });
  });
}
