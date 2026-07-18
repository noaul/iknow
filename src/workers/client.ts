import { StegoError } from '../domain/errors'
import { decodeImageFile, pixelsToPng } from '../image/decode-image'
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

    const transfer: Transferable[] = []
    if (request.type === 'encode') transfer.push(request.payload.bytes)
    if (request.type !== 'cancel' && request.raster) transfer.push(request.raster.pixels)
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

function cancellablePreparation<T>(
  work: (setInnerJob: (job: WorkerJob<unknown>) => void) => Promise<T>,
): WorkerJob<T> {
  let innerJob: WorkerJob<unknown> | null = null
  let rejectCancellation: (error: StegoError) => void = () => undefined
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject
  })
  const promise = Promise.race([
    work((job) => {
      innerJob = job
    }),
    cancellation,
  ])

  return {
    promise,
    cancel(): void {
      innerJob?.cancel()
      rejectCancellation(new StegoError('CANCELLED'))
    },
  }
}

function fallbackEncode(
  input: EncodeJobInput,
  onProgress?: ProgressHandler,
): WorkerJob<EncodeJobResult> {
  const id = crypto.randomUUID()
  return cancellablePreparation(async (setInnerJob) => {
    onProgress?.({ type: 'progress', id, stage: '读取图片', percent: 10 })
    const image = await decodeImageFile(input.image)
    const pixels = Uint8ClampedArray.from(image.pixels).buffer
    const request: EncodeRequest = {
      type: 'encode',
      id,
      raster: { width: image.width, height: image.height, pixels },
      payload: input.payload,
      password: input.password,
    }
    const inner = runJob(
      request,
      (response) =>
        response.type === 'result' && response.operation === 'encode-pixels'
          ? response
          : undefined,
      onProgress,
    )
    setInnerJob(inner)
    const result = await inner.promise
    onProgress?.({ type: 'progress', id, stage: '生成 PNG', percent: 90 })
    const png = await (
      await pixelsToPng(
        new Uint8ClampedArray(result.pixels),
        result.width,
        result.height,
      )
    ).arrayBuffer()
    return { png, width: result.width, height: result.height }
  })
}

function fallbackDecode(
  input: DecodeJobInput,
  onProgress?: ProgressHandler,
): WorkerJob<DecodeJobResult> {
  const id = crypto.randomUUID()
  return cancellablePreparation(async (setInnerJob) => {
    onProgress?.({ type: 'progress', id, stage: '读取图片', percent: 10 })
    const image = await decodeImageFile(input.image)
    const pixels = Uint8ClampedArray.from(image.pixels).buffer
    const request: DecodeRequest = {
      type: 'decode',
      id,
      raster: { width: image.width, height: image.height, pixels },
      password: input.password,
    }
    const inner = runJob(
      request,
      (response) =>
        response.type === 'result' && response.operation === 'decode'
          ? response.payload
          : undefined,
      onProgress,
    )
    setInnerJob(inner)
    return inner.promise
  })
}

export const startEncodeJob: StartEncodeJob = (input, onProgress) => {
  if (typeof OffscreenCanvas === 'undefined') return fallbackEncode(input, onProgress)
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
  if (typeof OffscreenCanvas === 'undefined') return fallbackDecode(input, onProgress)
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
