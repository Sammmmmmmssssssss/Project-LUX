import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Trash2, Copy, Check } from 'lucide-react'

const LOG_TYPES = ['STATE', 'BUFFER', 'FEC', 'SYSTEM']
const LOG_MESSAGES = {
  STATE: ['Transceiver calibrated.', 'Link active.', 'Signal degradation detected.', 'Re-aligning phase.', 'Phase lock established.'],
  BUFFER: ['SPSC Head Advanced.', 'SPSC Tail Catchup.', 'Zero-alloc push success.', 'Buffer watermark at 45%.'],
  FEC: ['RS(255,223) Block decoded.', 'Parity check passed.', 'Corrected 2 symbols.', 'Burst error mitigated.'],
  SYSTEM: ['DMA interrupt serviced.', 'USB Bulk transfer complete.', 'Heartbeat OK.', 'TUN interface routed.']
}

export default function HardwareLogs() {
  const [logs, setLogs] = useState<{ id: string, timestamp: string, type: string, message: string }[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [copied, setCopied] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const isPausedRef = useRef(isPaused)

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    // Initial logs
    const initialLogs = Array.from({ length: 15 }).map((_, i) => generateLog(new Date(Date.now() - (15 - i) * 1000)))
    setLogs(initialLogs)

    const interval = setInterval(() => {
      if (!isPausedRef.current) {
        setLogs(prev => {
          const newLog = generateLog(new Date())
          return [...prev.slice(-99), newLog]
        })
      }
    }, 1200)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isPaused])

  const generateLog = (date: Date) => {
    const type = LOG_TYPES[Math.floor(Math.random() * LOG_TYPES.length)]
    const messages = LOG_MESSAGES[type as keyof typeof LOG_MESSAGES]
    const message = messages[Math.floor(Math.random() * messages.length)]
    
    return {
      id: Math.random().toString(36).substring(7),
      timestamp: date.toISOString().split('T')[1].replace('Z', ''),
      type,
      message
    }
  }

  const getColorForType = (type: string) => {
    switch(type) {
      case 'STATE': return 'text-blue-400'
      case 'BUFFER': return 'text-purple-400'
      case 'FEC': return 'text-orange-400'
      default: return 'text-muted'
    }
  }

  const handleCopy = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 flex flex-col h-[65vh] min-h-[400px]">
      <div>
        <h2 className="font-serif text-3xl font-semibold text-ink mb-2">Hardware Logs</h2>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <p className="text-muted text-sm max-w-2xl leading-relaxed uppercase tracking-wider">
            Diagnostic stream: Hardware state, buffer status, and FEC corrections
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => setIsPaused(!isPaused)} 
              className={`p-2 border transition-colors ${isPaused ? 'bg-ink text-bg border-ink' : 'border-ink/20 hover:border-ink text-ink bg-bg'}`}
              title={isPaused ? "Resume Stream" : "Pause Stream"}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button 
              onClick={handleCopy} 
              className="p-2 border border-ink/20 hover:border-ink text-ink bg-bg transition-colors"
              title="Copy Logs"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setLogs([])} 
              className="p-2 border border-ink/20 hover:border-red-600 hover:text-red-600 text-ink bg-bg transition-colors"
              title="Clear Logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-ink border border-ink p-4 font-mono text-[0.75rem] overflow-y-auto shadow-inner relative flex flex-col">
        <div className="sticky top-0 right-0 w-full flex justify-end pb-2 mb-2 border-b border-bg/10 bg-ink/90 backdrop-blur z-10">
          <span className={`text-muted text-[0.6rem] uppercase ${isPaused ? '' : 'animate-pulse'}`}>
            {isPaused ? 'Stream Paused' : 'Live Stream Active'}
          </span>
        </div>
        <div className="space-y-2 flex-1">
          {logs.length === 0 && (
            <div className="text-muted text-center mt-10">No logs available.</div>
          )}
          {logs.map(log => (
            <div key={log.id} className="flex gap-4 hover:bg-bg/5 p-1 transition-colors">
              <span className="text-muted shrink-0 w-24">[{log.timestamp}]</span>
              <span className={`shrink-0 w-20 font-bold ${getColorForType(log.type)}`}>[{log.type}]</span>
              <span className="text-bg/90">{log.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} className="h-4" />
        </div>
      </div>
    </div>
  )
}
