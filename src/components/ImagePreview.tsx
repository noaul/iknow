import { ImageIcon } from 'lucide-react'

export interface ImagePreviewProps {
  source: string | null
  alt: string
  label: string
  dimensions?: { width: number; height: number } | null
}

export function ImagePreview({ source, alt, label, dimensions }: ImagePreviewProps) {
  return (
    <div className="preview-panel">
      <div className="preview-heading">
        <span>{label}</span>
        {dimensions && (
          <span className="preview-dimensions">
            {dimensions.width} × {dimensions.height}
          </span>
        )}
      </div>
      <div className="image-stage">
        {source ? (
          <img src={source} alt={alt} />
        ) : (
          <div className="image-empty">
            <ImageIcon size={28} aria-hidden="true" />
            <span>尚未选择图片</span>
          </div>
        )}
      </div>
    </div>
  )
}

