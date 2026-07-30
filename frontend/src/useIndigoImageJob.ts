import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  cancelIndigoImageJob,
  createIndigoImageJob,
  getIndigoImageJob,
  retryIndigoImageJob,
  type IndigoImageJob,
} from './api'
import type { IndigoStoryUnit } from './indigo_types'

const POLL_INTERVAL_MS = 1200

export function isImageJobActive(job: IndigoImageJob | null): boolean {
  return job?.status === 'queued' || job?.status === 'running'
}

export function useIndigoImageJob() {
  const [job, setJob] = useState<IndigoImageJob | null>(null)
  const [error, setError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runRef = useRef(0)

  const stopPolling = useCallback(() => {
    runRef.current += 1
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const poll = useCallback(async function pollJob(
    jobId: string,
    runId: number,
    failedPolls = 0,
  ): Promise<void> {
    if (runId !== runRef.current) return
    try {
      const next = await getIndigoImageJob(jobId)
      if (runId !== runRef.current) return
      setJob(next)
      setError('')
      if (isImageJobActive(next)) {
        timerRef.current = setTimeout(
          () => void pollJob(jobId, runId, 0),
          POLL_INTERVAL_MS,
        )
      }
    } catch (cause) {
      if (runId !== runRef.current) return
      setError(cause instanceof Error ? cause.message : '图片任务连接失败')
      if (!(cause instanceof ApiError && cause.status === 404)) {
        const delay = Math.min(POLL_INTERVAL_MS * 2 ** failedPolls, 10_000)
        timerRef.current = setTimeout(
          () => void pollJob(jobId, runId, failedPolls + 1),
          delay,
        )
      }
    }
  }, [])

  const adopt = useCallback((next: IndigoImageJob) => {
    stopPolling()
    setJob(next)
    setError('')
    if (isImageJobActive(next)) {
      const runId = runRef.current
      timerRef.current = setTimeout(
        () => void poll(next.id, runId),
        POLL_INTERVAL_MS,
      )
    }
    return next
  }, [poll, stopPolling])

  const start = useCallback(async (story: IndigoStoryUnit) => {
    setActionBusy(true)
    setError('')
    try {
      return adopt(await createIndigoImageJob(story))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片任务创建失败')
      throw cause
    } finally {
      setActionBusy(false)
    }
  }, [adopt])

  const resume = useCallback(async (jobId: string) => {
    if (job?.id === jobId && isImageJobActive(job)) return job
    setActionBusy(true)
    setError('')
    try {
      return adopt(await getIndigoImageJob(jobId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片任务恢复失败')
      throw cause
    } finally {
      setActionBusy(false)
    }
  }, [adopt, job])

  const retry = useCallback(async () => {
    if (!job) return null
    setActionBusy(true)
    setError('')
    try {
      return adopt(await retryIndigoImageJob(job.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片任务重试失败')
      throw cause
    } finally {
      setActionBusy(false)
    }
  }, [adopt, job])

  const cancel = useCallback(async () => {
    if (!job) return null
    setActionBusy(true)
    setError('')
    try {
      return adopt(await cancelIndigoImageJob(job.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片任务取消失败')
      throw cause
    } finally {
      setActionBusy(false)
    }
  }, [adopt, job])

  const clear = useCallback(() => {
    stopPolling()
    setJob(null)
    setError('')
    setActionBusy(false)
  }, [stopPolling])

  useEffect(() => stopPolling, [stopPolling])

  return {
    job,
    error,
    actionBusy,
    active: isImageJobActive(job),
    start,
    resume,
    retry,
    cancel,
    clear,
  }
}
