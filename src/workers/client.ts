import { StegoError } from '../domain/errors'
import type {
  DecodeRequest,
  EncodeRequest,
  ProgressResponse,
  TransferSecretPayload,
  WorkerRequest,
  WorkerResponse,
} from './protocol'

export interface WorkerJob<T> {
  promise: Promise<T>
  cancel(): void
}

export interface EncodeJobInput {
  image: File
  payload: TransferSecretPayload
  password: string
}

export interface EncodeJobResult {
  png: ArrayBuffer
  width: number
  height: number
}

export interface DecodeJobInput {
  image: File
  password: string
}

export type DecodeJobResult = TransferSecretPayload
export type ProgressHandler = (progress: ProgressResponse) => void
export type StartEncodeJob = (
  input: EncodeJobInput,
  onProgress?: ProgressHandler,
) => WorkerJob<EncodeJobResult>
export type StartDecodeJob = (
  input: DecodeJobInput,
  onProgress?: ProgressHandler,
) => WorkerJob<DecodeJobResult>

function makeWorker(): Worker {
  return new Worker(new URL('./stego.worker.ts', import.meta.url), { type: 'module' })
}

function runJob<T>(
  request: WorkerRequest,
  selectResult: (response: WorkerResponse) => T | undefined,
  onProgress?: ProgressHandler,
): WorkerJob<T> {
  const worker = makeWorker()
  let settled = false
  let rejectPromise: (reason: unknown) => void = () => undefined

  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.id !== request.id) return
      if (response.type === 'progress') {
        onProgress?.(response)
        return
      }
      if (response.type === 'error') {
        settled = true
        worker.terminate()
        reject(new StegoError(response.code, response.message))
        return
      }
      const result = selectResult(response)
      if (result !== undefined) {
        settled = true
        worker.terminate()
        resolve(result)
      }
    }
    worker.onerror = () => {
      if (settled) return
      settled = true
      worker.terminate()
      reject(new StegoError('UNSUPPORTED_IMAGE'))
    }

    const transfer =
      request.type === 'encode' ? [request.payload.bytes] : []
    worker.postMessage(request, transfer)
  })

  return {
    promise,
    cancel(): void {
      if (settled) return
      settled = true
      worker.postMessage({ type: 'cancel', id: request.id } satisfies WorkerRequest)
      worker.terminate()
      rejectPromise(new StegoError('CANCELLED'))
    },
  }
}

export const startEncodeJob: StartEncodeJob = (input, onProgress) => {
  const request: EncodeRequest = {
    type: 'encode',
    id: crypto.randomUUID(),
    ...input,
  }
  return runJob(
    request,
    (response) =>
      response.type === 'result' && response.operation === 'encode'
        ? { png: response.png, width: response.width, height: response.height }
        : undefined,
    onProgress,
  )
}

export const startDecodeJob: StartDecodeJob = (input, onProgress) => {
  const request: DecodeRequest = {
    type: 'decode',
    id: crypto.randomUUID(),
    ...input,
  }
  return runJob(
    request,
    (response) =>
      response.type === 'result' && response.operation === 'decode'
        ? response.payload
        : undefined,
    onProgress,
  )
}

