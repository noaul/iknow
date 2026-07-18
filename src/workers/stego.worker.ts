/// <reference lib="webworker" />

import { decodePixels, encodePixels } from '../domain/stego'
import { StegoError } from '../domain/errors'
import { decodeImageFile, pixelsToPng } from '../image/decode-image'
import {
  workerError,
  type DecodeRequest,
  type EncodeRequest,
  type ProgressStage,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
const cancelled = new Set<string>()

function post(response: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer)
}

function progress(id: string, stage: ProgressStage, percent: number): void {
  post({ type: 'progress', id, stage, percent })
}

function ensureActive(id: string): void {
  if (cancelled.has(id)) throw new StegoError('CANCELLED')
}

async function encode(request: EncodeRequest): Promise<void> {
  progress(request.id, '读取图片', 10)
  const image = request.raster
    ? {
        width: request.raster.width,
        height: request.raster.height,
        pixels: new Uint8ClampedArray(request.raster.pixels),
      }
    : await decodeImageFile(request.image as File)
  ensureActive(request.id)

  progress(request.id, '派生密钥', 35)
  const payload = {
    ...request.payload,
    bytes: new Uint8Array(request.payload.bytes),
  }
  const encoded = await encodePixels(
    image.pixels,
    image.width,
    image.height,
    payload,
    request.password,
  )
  ensureActive(request.id)

  progress(request.id, '嵌入信息', 75)
  if (request.raster) {
    const pixels = Uint8ClampedArray.from(encoded).buffer
    post(
      {
        type: 'result',
        operation: 'encode-pixels',
        id: request.id,
        width: image.width,
        height: image.height,
        pixels,
      },
      [pixels],
    )
    return
  }

  progress(request.id, '生成 PNG', 90)
  const png = await (await pixelsToPng(encoded, image.width, image.height)).arrayBuffer()
  ensureActive(request.id)
  post(
    {
      type: 'result',
      operation: 'encode',
      id: request.id,
      width: image.width,
      height: image.height,
      png,
    },
    [png],
  )
}

async function decode(request: DecodeRequest): Promise<void> {
  progress(request.id, '读取图片', 10)
  const image = request.raster
    ? {
        width: request.raster.width,
        height: request.raster.height,
        pixels: new Uint8ClampedArray(request.raster.pixels),
      }
    : await decodeImageFile(request.image as File)
  ensureActive(request.id)

  progress(request.id, '派生密钥', 35)
  progress(request.id, '提取信息', 70)
  const payload = await decodePixels(
    image.pixels,
    image.width,
    image.height,
    request.password,
  )
  ensureActive(request.id)
  const bytes = Uint8Array.from(payload.bytes).buffer
  post(
    {
      type: 'result',
      operation: 'decode',
      id: request.id,
      payload: { ...payload, bytes },
    },
    [bytes],
  )
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === 'cancel') {
    cancelled.add(request.id)
    return
  }

  cancelled.delete(request.id)
  const task = request.type === 'encode' ? encode(request) : decode(request)
  void task
    .catch((error: unknown) => post(workerError(request.id, error)))
    .finally(() => cancelled.delete(request.id))
}
