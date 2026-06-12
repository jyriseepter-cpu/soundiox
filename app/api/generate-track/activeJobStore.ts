const ACTIVE_JOB_STORE_KEY = "__soundiox_active_generate_jobs_v1";

export type ActiveGenerationJob = {
  jobId: string;
  startedAt: number;
  expiresAt: number;
  clientGenerationToken: string | null;
  clientKey: string;
};

type ActiveGenerationJobStore = {
  byClient: Map<string, ActiveGenerationJob>;
  clientByJobId: Map<string, string>;
};

function getActiveJobStore() {
  const globalScope = globalThis as typeof globalThis & {
    [ACTIVE_JOB_STORE_KEY]?: ActiveGenerationJobStore;
  };

  if (!globalScope[ACTIVE_JOB_STORE_KEY]) {
    globalScope[ACTIVE_JOB_STORE_KEY] = {
      byClient: new Map(),
      clientByJobId: new Map(),
    };
  }

  return globalScope[ACTIVE_JOB_STORE_KEY]!;
}

// Best-effort in-memory MVP/serverless protection. Later this moves to DB-backed generation_jobs.
export function setActiveGenerationJob(lockKey: string, job: ActiveGenerationJob) {
  const store = getActiveJobStore();
  store.byClient.set(lockKey, job);
  store.clientByJobId.set(job.jobId, lockKey);
}

export function getActiveGenerationJob(lockKey: string) {
  return getActiveJobStore().byClient.get(lockKey) ?? null;
}

export function clearActiveGenerationJobByJobId(jobId: string) {
  const store = getActiveJobStore();
  const lockKey = store.clientByJobId.get(jobId);

  if (!lockKey) return;

  store.clientByJobId.delete(jobId);
  store.byClient.delete(lockKey);
}

export function cleanupExpiredActiveGenerationJobs() {
  const now = Date.now();
  const store = getActiveJobStore();

  for (const [lockKey, job] of store.byClient.entries()) {
    if (job.expiresAt <= now) {
      store.byClient.delete(lockKey);
      store.clientByJobId.delete(job.jobId);
    }
  }
}
