import { Queue } from 'bullmq';

const myQueue = new Queue('test-queue', {
  connection: { host: '127.0.0.1', port: 6379 },
});

async function main() {
  const job = await myQueue.add('log-message', { videoId: 'crash-test-job' });
  console.log('Job added:', job.id);
  await myQueue.close();
}

main();