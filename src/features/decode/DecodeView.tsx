import { Download, KeyRound, LoaderCircle, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StegoError } from '../../domain/errors'
import { assertSupportedImage } from '../../image/decode-image'
import { FilePicker } from '../../components/FilePicker'
import { ImagePreview } from '../../components/ImagePreview'
import { PasswordField } from '../../components/PasswordField'
import {
  startDecodeJob,
  type DecodeJobResult,
  type StartDecodeJob,
  type WorkerJob,
} from '../../workers/client'

export interface DecodeViewProps {
  startDecode?: StartDecodeJob
}

function safeFileName(name: string): string {
  const lastSegment = name.split(/[\\/]/).pop()?.trim()
  return lastSegment || 'hidden-file.bin'
}

export function DecodeView({ startDecode = startDecodeJob }: DecodeViewProps) {
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [error, setError] = useState('')
  const [result, setResult] = useState<DecodeJobResult | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const activeJob = useRef<WorkerJob<unknown> | null>(null)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  }, [downloadUrl])

  useEffect(() => () => activeJob.current?.cancel(), [])

  const chooseImage = (file: File | null) => {
    setImage(null)
    setPreviewUrl(null)
    setResult(null)
    setDownloadUrl(null)
    setError('')
    if (!file) return
    try {
      assertSupportedImage(file)
      if (file.type !== 'image/png') throw new StegoError('UNSUPPORTED_IMAGE')
      setImage(file)
      setPreviewUrl(URL.createObjectURL(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取该图片。')
    }
  }

  const submit = async () => {
    if (!image || !password || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    setDownloadUrl(null)
    setProgress({ stage: '准备提取', percent: 2 })
    try {
      const job = startDecode(
        { image, password },
        ({ stage, percent }) => setProgress({ stage, percent }),
      )
      activeJob.current = job
      const payload = await job.promise
      setResult(payload)
      if (payload.kind === 'file') {
        setDownloadUrl(
          URL.createObjectURL(new Blob([payload.bytes], { type: payload.mime || 'application/octet-stream' })),
        )
      }
      setProgress({ stage: '完成', percent: 100 })
    } catch (reason) {
      if (reason instanceof StegoError && reason.code === 'CANCELLED') return
      setError(reason instanceof Error ? reason.message : '提取失败，请重试。')
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
          <span className="step-number">02</span>
          <div>
            <h2 id="decode-heading">提取信息</h2>
            <p>载入含密 PNG，并使用发送方提供的口令。</p>
          </div>
        </div>

        <FilePicker
          id="encoded-image"
          label="含密 PNG"
          accept="image/png"
          file={image}
          onFile={chooseImage}
          hint="必须是 StegoSend 生成的原始 PNG"
        />

        <PasswordField
          id="decode-password"
          label="解码口令"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          hint="口令不会离开此浏览器"
        />

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
            disabled={!image || !password || busy}
            onClick={() => void submit()}
          >
            <KeyRound size={18} aria-hidden="true" />
            提取隐藏信息
          </button>
          {busy && (
            <button type="button" className="secondary-button" onClick={cancel}>
              <Square size={16} aria-hidden="true" />
              取消
            </button>
          )}
        </div>

        {result?.kind === 'text' && (
          <div className="decoded-result">
            <div className="decoded-result-heading">隐藏文本</div>
            <pre aria-label="隐藏文本">{new TextDecoder().decode(result.bytes)}</pre>
          </div>
        )}

        {result?.kind === 'file' && downloadUrl && (
          <div className="result-strip" aria-live="polite">
            <div>
              <Download size={20} aria-hidden="true" />
              <span>
                <strong>{safeFileName(result.name)}</strong>
                <small>{result.mime || 'application/octet-stream'}</small>
              </span>
            </div>
            <a
              className="download-button"
              href={downloadUrl}
              download={safeFileName(result.name)}
            >
              <Download size={17} aria-hidden="true" />
              下载文件
            </a>
          </div>
        )}
      </div>

      <ImagePreview
        source={previewUrl}
        alt="含密 PNG 预览"
        label="输入预览"
      />
    </div>
  )
}

