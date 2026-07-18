import { useState } from 'react'
import { Download, ImagePlus, LockKeyhole, ShieldCheck } from 'lucide-react'

type WorkspaceMode = 'encode' | 'decode'

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('encode')

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="/" aria-label="StegoSend 首页">
          <span className="brand-mark" aria-hidden="true">
            <LockKeyhole size={18} strokeWidth={2.25} />
          </span>
          <span>StegoSend</span>
        </a>
        <div className="privacy-status">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>仅在本机处理</span>
        </div>
      </header>

      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">图片隐写工具</p>
            <h1>在图片中安全传递信息</h1>
          </div>
          <p className="workspace-meta">AES-256-GCM · PNG 输出</p>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="工作模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'encode'}
            className="mode-tab"
            onClick={() => setMode('encode')}
          >
            <ImagePlus size={18} aria-hidden="true" />
            藏入信息
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'decode'}
            className="mode-tab"
            onClick={() => setMode('decode')}
          >
            <Download size={18} aria-hidden="true" />
            提取信息
          </button>
        </div>

        <section
          className="tool-surface"
          role="tabpanel"
          aria-labelledby={`${mode}-heading`}
        >
          <h2 id={`${mode}-heading`}>
            {mode === 'encode' ? '藏入信息' : '提取信息'}
          </h2>
        </section>
      </main>

      <footer className="notice-bar">
        <span className="notice-dot" aria-hidden="true" />
        请发送原始 PNG；压缩、裁剪或截图会破坏隐藏内容。
      </footer>
    </div>
  )
}

export default App
