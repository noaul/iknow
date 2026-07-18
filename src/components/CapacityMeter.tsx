import { formatBytes } from '../utils/format'

export interface CapacityMeterProps {
  used: number
  available: number
}

export function CapacityMeter({ used, available }: CapacityMeterProps) {
  const over = used > available
  return (
    <div className="capacity-meter" data-over={over || undefined}>
      <div className="capacity-labels">
        <span>{over ? '容量不足' : '容量预算'}</span>
        <span>
          {formatBytes(used)} / {formatBytes(available)}
        </span>
      </div>
      <progress max={Math.max(available, 1)} value={Math.min(used, Math.max(available, 1))}>
        {used} / {available}
      </progress>
      {over && <p>容量不足：请缩小内容或选择分辨率更高的载体图片。</p>}
    </div>
  )
}
