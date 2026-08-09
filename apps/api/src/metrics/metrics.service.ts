import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly httpRequestDuration: Histogram<string>;
  readonly queueDepth: Gauge<string>;
  readonly jobDuration: Histogram<string>;
  readonly jobOutcomes: Counter<string>;

  constructor() {
    this.httpRequestDuration = (register.getSingleMetric('http_request_duration_seconds') as Histogram<string>) || new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.queueDepth = (register.getSingleMetric('bullmq_queue_depth') as Gauge<string>) || new Gauge({
      name: 'bullmq_queue_depth',
      help: 'Number of jobs waiting in the video-processing queue',
    });

    this.jobDuration = (register.getSingleMetric('video_processing_job_duration_seconds') as Histogram<string>) || new Histogram({
      name: 'video_processing_job_duration_seconds',
      help: 'Duration of video transcoding jobs in seconds',
      buckets: [5, 10, 30, 60, 120, 300],
    });

    this.jobOutcomes = (register.getSingleMetric('video_processing_job_outcomes_total') as Counter<string>) || new Counter({
      name: 'video_processing_job_outcomes_total',
      help: 'Count of job outcomes by status',
      labelNames: ['status'], // completed | failed | dead_lettered
    });
  }

  getMetrics() {
    return register.metrics();
  }
}