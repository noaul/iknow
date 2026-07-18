import { StegoError, type StegoErrorCode } from '../domain/errors'

export interface TransferSecretPayload {
  kind: 'text' | 'file'
  name: string
  mime: string
  bytes: ArrayBuffer
}

export interface EncodeRequest {
  type: 'encode'
  id: string
  image: File
  payload: TransferSecretPayload
  password: string
}

export interface DecodeRequest {
  type: 'decode'
  id: string
  image: File
  password: string
}

export interface CancelRequest {
  type: 'cancel'
  id: string
}

export type WorkerRequest = EncodeRequest | DecodeRequest | CancelRequest

export type ProgressStage = '读取图片' | '派生密钥' | '嵌入信息' | '提取信息' | '生成 PNG'

export interface ProgressResponse {
  type: 'progress'
  id: string
  stage: ProgressStage
  percent: number
}

export interface EncodeResultResponse {
  type: 'result'
  operation: 'encode'
  id: string
  width: number
  height: number
  png: ArrayBuffer
}

export interface DecodeResultResponse {
  type: 'result'
  operation: 'decode'
  id: string
  payload: TransferSecretPayload
}

export interface ErrorResponse {
  type: 'error'
  id: string
  code: StegoErrorCode
  message: string
}

export type WorkerResponse =
  | ProgressResponse
  | EncodeResultResponse
  | DecodeResultResponse
  | ErrorResponse

export function workerError(id: string, error: unknown): ErrorResponse {
  const safeError =
    error instanceof StegoError ? error : new StegoError('UNSUPPORTED_IMAGE')
  return {
    type: 'error',
    id,
    code: safeError.code,
    message: safeError.message,
  }
}

