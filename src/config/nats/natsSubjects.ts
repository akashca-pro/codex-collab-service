
export const NatsSubjects = {
  SUBMISSION_JOB: 'submission.jobs.*',
  SUBMISSION_RESULT: 'submission.results.*',
} as const;

export type NatsSubject = typeof NatsSubjects[keyof typeof NatsSubjects];

// export type JobPayload = {
//   submissionId: string;
//   problemId: string;
//   language: string;
//   userCode: string;
//   testCases: Array<{ input: string; output: string }>;
//   userId: string;
// };

// export type ResultPayload = {
//   submissionId: string;
//   status: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT';
//   stdout?: string;
//   stderr?: string;
//   timeMs?: number;
//   memoryKb?: number;
//   score?: number;
//   updatedAt: string; // ISO date
// };