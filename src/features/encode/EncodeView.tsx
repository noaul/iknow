import {
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  PackageOpen,
  Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateCapacity } from '../../domain/capacity'
import { MAX_SECRET_BYTES } from '../../domain/envelope'
import { StegoError } from '../../domain/errors'
import { inspectImageFile, type ImageDimensions } from '../../image/decode-image'
import { CapacityMeter } from '../../components/CapacityMeter'
import { FilePicker } from '../../components/FilePicker'
import { ImagePreview } from '../../components/ImagePreview'
import { PasswordField } from '../../components/PasswordField'
import {
  startEncodeJob,
  type StartEncodeJob,
  type WorkerJob,
} from '../../workers/client'

type PayloadMode = 'text' | 'file'

export interface EncodeViewProps {
  inspectImage?: (file: File) => Promise<ImageDimensions>
  startEncode?: StartEncodeJob
}

const textEncoder = new TextEncoder()
const textMime = 'text/plain;charset=utf-8'

function payloadOverhead(name: string, mime: string): number {
  return 9 + textEncoder.encode(name).length + textEncoder.encode(mime).length + 16
}

function passwordLength(value: string): number {
  return textEncoder.encode(value.normalize('NFC')).length
}

function downloadName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]+/g, '-')
  return `${base || 'image'}-stego.png`
}

export function EncodeView({
  inspectImage = inspectImageFile,
  startEncode = startEncodeJob,
}: EncodeViewProps) {
  const [carrier, setCarrier] = useState<File | null>(null)
  const [carrierInfo, setCarrierInfo] = useState<ImageDimensions | null>(null)
  const [carrierUrl, setCarrierUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<PayloadMode>('text')
  const [text, setText] = useState('')
  const [payloadFile, setPayloadFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultName, setResultName] = useState('')
  const [resultDimensions, setResultDimensions] = useState<ImageDimensions | null>(null)
  const activeJob = useRef<WorkerJob<unknown> | null>(null)

  useEffect(() => () => {
    if (carrierUrl) URL.revokeObjectURL(carrierUrl)
  }, [carrierUrl])

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [resultUrl])

  useEffect(() => () => activeJob.current?.cancel(), [])

  const capacity = carrierInfo
    ? calculateCapacity(carrierInfo.width, carrierInfo.height).maxCipherBytes
    : 0
  const payloadBytes = mode === 'text' ? textEncoder.encode(text).length : (payloadFile?.size ?? 0)
  const estimatedBytes =
    payloadBytes +
    payloadOverhead(
      mode === 'file' ? (payloadFile?.name ?? '') : '',
      mode === 'file' ? (payloadFile?.type || 'application/octet-stream') : textMime,
    )
  const contentReady = mode === 'text' ? text.length > 0 : Boolean(payloadFile)
  const tooLarge = payloadBytes > MAX_SECRET_BYTES || (carrierInfo !== null && estimatedBytes > capacity)
  const weakPassword = password.length > 0 && passwordLength(password) < 12
  const passwordMismatch = confirmation.length > 0 && password !== confirmation
  const canSubmit =
    Boolean(carrier && carrierInfo && contentReady) &&
    !tooLarge &&
    passwordLength(password) >= 12 &&
    password === confirmation &&
    !busy

  const passwordError = useMemo(() => {
    if (weakPassword) return '口令至少需要 12 个 UTF-8 字节。'
    return undefined
  }, [weakPassword])

  const chooseCarrier = async (file: File | null) => {
    setError('')
    setCarrier(null)
    setCarrierInfo(null)
    setCarrierUrl(null)
    setResultUrl(null)
    if (!file) return
    try {
      const info = await inspectImage(file)
      setCarrier(file)
      setCarrierInfo(info)
      setCarrierUrl(URL.createObjectURL(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取该图片。')
    }
  }

  const choosePayloadFile = (file: File | null) => {
    setPayloadFile(file)
    setError('')
    setResultUrl(null)
  }

  const submit = async () => {
    if (!canSubmit || !carrier) return
    setBusy(true)
    setError('')
    setResultUrl(null)
    setProgress({ stage: '准备内容', percent: 2 })

    try {
      const bytes =
        mode === 'text'
          ? textEncoder.encode(text).buffer
          : await (payloadFile as File).arrayBuffer()
      const job = startEncode(
        {
          image: carrier,
          payload: {
            kind: mode,
            name: mode === 'file' ? (payloadFile as File).name : '',
            mime:
              mode === 'file'
                ? (payloadFile as File).type || 'application/octet-stream'
                : textMime,
            bytes,
          },
          password,
        },
        ({ stage, percent }) => setProgress({ stage, percent }),
      )
      activeJob.current = job
      const result = await job.promise
      const blob = new Blob([result.png], { type: 'image/png' })
      setResultUrl(URL.createObjectURL(blob))
      setResultName(downloadName(carrier.name))
      setResultDimensions({ width: result.width, height: result.height })
      setProgress({ stage: '完成', percent: 100 })
    } catch (reason) {
      if (reason instanceof StegoError && reason.code === 'CANCELLED') return
      setError(reason instanceof Error ? reason.message : '生成失败，请重试。')
    } finally {
      activeJob.current = null
      setBusy(false)
    }
  }

  const cancel = () => {
    activeJob.current?.cancel()
    activeJob.current = null
    setBusy(false)
    setProgress({ stage: '', percent: 0 })
  }

  return (
    <div className="workflow">
      <div className="workflow-form">
        <div className="section-heading">
          <span className="step-number">01</span>
          <div>
            <h2 id="encode-heading">藏入信息</h2>
            <p>选择载体并设置要保护的内容。</p>
          </div>
        </div>

        <FilePicker
          id="carrier-image"
          label="载体图片"
          accept="image/png,image/jpeg,image/webp"
          file={carrier}
          onFile={(file) => void chooseCarrier(file)}
          hint="PNG、JPEG 或 WebP，最大 30 MiB"
        />

        <div className="field-group">
          <span className="field-label">秘密内容</span>
          <div className="segmented-control" role="group" aria-label="秘密内容类型">
            <button
              type="button"
              aria-pressed={mode === 'text'}
              onClick={() => setMode('text')}
            >
              <FileText size={17} aria-hidden="true" />
              文本
            </button>
            <button
              type="button"
              aria-pressed={mode === 'file'}
              onClick={() => setMode('file')}
            >
              <PackageOpen size={17} aria-hidden="true" />
              文件
            </button>
          </div>
        </div>

        {mode === 'text' ? (
          <div className="field-group">
            <label className="field-label" htmlFor="secret-text">
              秘密文本
            </label>
            <textarea
              id="secret-text"
              rows={6}
              value={text}
              maxLength={MAX_SECRET_BYTES}
              placeholder="输入要隐藏的内容"
              onChange={(event) => {
                setText(event.target.value)
                setResultUrl(null)
              }}
            />
          </div>
        ) : (
          <FilePicker
            id="secret-file"
            label="秘密文件"
            accept="*/*"
            file={payloadFile}
            onFile={choosePayloadFile}
            hint="单个文件，最大 5 MiB"
          />
        )}

        {carrierInfo && <CapacityMeter used={estimatedBytes} available={capacity} />}

        <div className="password-grid">
          <PasswordField
            id="encode-password"
            label="设置口令"
            value={password}
            onChange={setPassword}
            error={passwordError}
            hint="至少 12 个 UTF-8 字节"
          />
          <PasswordField
            id="confirm-password"
            label="确认口令"
            value={confirmation}
            onChange={setConfirmation}
            error={passwordMismatch ? '两次输入的口令不一致。' : undefined}
          />
        </div>

        {error && (
          <div className="inline-alert" role="alert">
            {error}
          </div>
        )}

        {busy && (
          <div className="job-progress" aria-live="polite">
            <div>
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
              <span>{progress.stage}</span>
              <span>{progress.percent}%</span>
            </div>
            <progress max={100} value={progress.percent} />
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            生成含密 PNG
          </button>
          {busy && (
            <button type="button" className="secondary-button" onClick={cancel}>
              <Square size={16} aria-hidden="true" />
              取消
            </button>
          )}
        </div>

        {resultUrl && (
          <div className="result-strip" aria-live="polite">
            <div>
              <CheckCircle2 size={20} aria-hidden="true" />
              <span>
                <strong>PNG 已生成</strong>
                <small>请通过不会压缩图片的方式发送原文件</small>
              </span>
            </div>
            <a className="download-button" href={resultUrl} download={resultName}>
              <Download size={17} aria-hidden="true" />
              下载含密 PNG
            </a>
          </div>
        )}
      </div>

      <ImagePreview
        source={resultUrl ?? carrierUrl}
        alt={resultUrl ? '生成的含密 PNG 预览' : '载体图片预览'}
        label={resultUrl ? '输出预览' : '载体预览'}
        dimensions={resultUrl ? resultDimensions : carrierInfo}
      />
    </div>
  )
}

