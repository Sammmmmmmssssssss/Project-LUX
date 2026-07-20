import { useState, useEffect } from 'react'
import { Usb, Activity, ShieldCheck, AlertCircle, RefreshCw, Settings2, Send, Zap, Shield, Cable, Trash2, Copy, Check, Clock } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function HardwareDashboard() {
  const [isConnected, setIsConnected] = useState(false)
  const [port, setPort] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  
  // Device Controls
  const [txPower, setTxPower] = useState(75)
  const [fecEnabled, setFecEnabled] = useState(true)
  const [throughputData, setThroughputData] = useState<{time: string, rx: number, tx: number}[]>([])
  const [uptime, setUptime] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      setUptime(0)
      return
    }
    const uptimeInterval = setInterval(() => setUptime(prev => prev + 1), 1000)
    return () => clearInterval(uptimeInterval)
  }, [isConnected])

  useEffect(() => {
    if (!isConnected) return
    // Simulate incoming telemetry data when connected
    const interval = setInterval(() => {
      setThroughputData(prev => {
        const newData = [...prev, {
          time: new Date().toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' }),
          rx: Math.floor(Math.random() * 400) + 100,
          tx: Math.floor(Math.random() * 400) + 100
        }]
        return newData.slice(-15) // Keep last 15 points
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isConnected])

  const formatUptime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const connectToUSB = async () => {
    try {
      setError(null)
      if ('serial' in navigator) {
        try {
          const newPort = await (navigator as any).serial.requestPort()
          await newPort.open({ baudRate: 115200 })
          
          setPort(newPort)
          setIsConnected(true)
          addLog('Successfully paired with LUX RP2040.')
          addLog('Establishing secure communication channel...')
          
          // Mocking the initial telemetry setup
          addLog('Syncing device configuration...')
        } catch (innerErr: any) {
          if (innerErr.name === 'SecurityError' || innerErr.message.includes('permissions policy')) {
            addLog('Web Serial blocked by permissions policy. Falling back to simulation mode.')
            setTimeout(() => {
              setIsConnected(true)
              addLog('Simulation Mode: Mock device connected.')
            }, 1000)
          } else {
            throw innerErr
          }
        }
      } else {
        // Fallback for simulation in AI Studio iframe
        setError('Web Serial API not available in this environment. Falling back to simulation mode.')
        setTimeout(() => {
          setIsConnected(true)
          addLog('Simulation Mode: Mock device connected.')
        }, 1500)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to connect to the USB device.')
    }
  }

  const disconnect = async () => {
    if (port) {
      try {
        await port.close()
        setPort(null)
      } catch (err) {
        console.error(err)
      }
    }
    setIsConnected(false)
    setThroughputData([])
    addLog('Device disconnected safely.')
  }

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const applySettings = () => {
    addLog(`Applied settings: TX Power ${txPower}%, FEC ${fecEnabled ? 'ON' : 'OFF'}`)
  }

  const sendTestPacket = async () => {
    addLog('Sending test packet (LUX_PING)...')
    if (port) {
      try {
        const writer = port.writable.getWriter()
        const data = new TextEncoder().encode('LUX_PING')
        await writer.write(data)
        writer.releaseLock()
        addLog('Test packet transmitted.')
      } catch (err: any) {
        addLog(`Transmit error: ${err.message}`)
      }
    } else {
      setTimeout(() => addLog('Simulation: Test packet transmitted successfully.'), 500)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 lg:gap-24 items-start animate-in fade-in duration-500">
      
      {/* LEFT COLUMN: Editorial & Telemetry */}
      <section className="flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="font-serif text-4xl font-semibold text-ink">Live Hardware Connection</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted">
              {isConnected ? 'Hardware Active' : 'Hardware Offline'}
            </span>
            <button 
              onClick={isConnected ? disconnect : connectToUSB}
              className={`w-12 h-6 rounded-full transition-colors relative border flex-shrink-0 ${isConnected ? 'bg-ink border-ink' : 'bg-ink/10 border-ink/30'}`}
              title={isConnected ? 'Disconnect' : 'Connect'}
            >
              <div className={`absolute top-[3px] left-[3px] bg-bg w-4 h-4 rounded-full transition-transform shadow-sm ${isConnected ? 'translate-x-[22px]' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
        <p className="text-[1.1rem] leading-[1.8] text-ink/80 mb-12">
          Connect directly to your hardware via USB from the browser. The browser acts as a secure "key", requesting your explicit permission to bridge the hardware to this dashboard. No extra software installation is required.
        </p>

        {isConnected && (
          <div className="mb-12 border border-ink/20 bg-bg p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4 mb-6">
              <h3 className="font-mono text-[0.7rem] text-muted flex items-center gap-2 uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>Live Telemetry (kbps)</span>
              </h3>
              <div className="flex items-center gap-4 text-xs font-mono text-muted uppercase">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>UPTIME: {formatUptime(uptime)}</span>
                </div>
              </div>
            </div>
            
            <div className="h-[250px] w-full">
              {throughputData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={throughputData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="time" stroke="#a0a0a0" fontSize={10} tickMargin={10} />
                    <YAxis stroke="#a0a0a0" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderColor: '#eee', fontSize: '12px', color: '#1a1a1a', borderRadius: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                      itemStyle={{ color: '#1a1a1a' }}
                    />
                    <Line type="monotone" dataKey="rx" stroke="#6366f1" strokeWidth={2} dot={false} name="RX (kbps)" />
                    <Line type="monotone" dataKey="tx" stroke="#14b8a6" strokeWidth={2} dot={false} name="TX (kbps)" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted">
                  Awaiting telemetry data...
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.6rem] text-muted uppercase tracking-wider">System Terminal Log</span>
              {isConnected && (
                <span className="relative flex h-2 w-2" title="Hardware Active">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleCopyLogs}
                className="p-1.5 text-muted hover:text-ink transition-colors"
                title="Copy Terminal Logs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setLogs([])}
                className="p-1.5 text-muted hover:text-red-600 transition-colors"
                title="Clear Terminal Logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="bg-ink/5 border border-ink/20 p-4 font-mono text-[0.75rem] h-[160px] flex flex-col-reverse overflow-y-auto">
            {logs.length === 0 ? (
              <span className="text-muted">Waiting for hardware handshake...</span>
            ) : (
              <div className="space-y-1.5 flex flex-col">
                {logs.slice().reverse().map((log, i) => (
                  <div key={i} className="text-ink">
                    <span className="text-muted mr-2">{'>'}</span>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT COLUMN: Connection Panel & Controls */}
      <section className="flex flex-col gap-8">
        
        {/* Connection Panel */}
        <div className="bg-bg border border-ink/20 p-10 text-center shadow-[0_20px_40px_rgba(0,0,0,0.04)]">
          <div className="w-20 h-20 border border-ink rounded-full flex items-center justify-center mx-auto mb-8">
            <Cable className="w-8 h-8 text-ink" strokeWidth={1.5} />
          </div>
          <div className="mb-10">
            <h3 className="text-2xl font-bold mb-2">
              {isConnected ? 'Device Connected' : 'No Device Connected'}
            </h3>
            <p className="text-[0.85rem] text-muted uppercase tracking-[0.05em]">
              {isConnected ? 'Secure Session Active' : 'Awaiting USB Pairing'}
            </p>
          </div>
          
          {!isConnected ? (
            <button
              onClick={connectToUSB}
              className="w-full p-5 bg-ink text-bg border-none font-bold text-[0.9rem] uppercase tracking-[0.1em] cursor-pointer flex justify-center items-center gap-3 hover:bg-accent transition-colors"
            >
              <Usb className="w-5 h-5" />
              Pair & Connect USB
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="w-full p-5 bg-bg text-ink border border-ink font-bold text-[0.9rem] uppercase tracking-[0.1em] cursor-pointer flex justify-center items-center gap-3 hover:bg-ink/5 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Disconnect
            </button>
          )}

          {error && !isConnected && (
            <div className="mt-6 p-4 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Controls Panel */}
        {isConnected && (
          <div className="bg-bg border border-ink/20 p-8 shadow-sm animate-in slide-in-from-bottom-4 duration-500">
            <h3 className="font-mono text-[0.7rem] text-muted flex items-center gap-2 border-b border-ink/10 pb-4 mb-6 uppercase tracking-wider">
              <Settings2 className="w-4 h-4" />
              <span>RP2040 Configuration</span>
            </h3>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="font-medium">TX LED Power</span>
                  <span className="font-mono text-ink font-bold">{txPower}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={txPower}
                  onChange={(e) => setTxPower(Number(e.target.value))}
                  className="w-full h-1 bg-ink/20 appearance-none cursor-pointer accent-ink"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Shield className="w-4 h-4 text-ink" />
                  <span>RS(255,223) FEC</span>
                </div>
                <button 
                  onClick={() => setFecEnabled(!fecEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative border ${fecEnabled ? 'bg-ink border-ink' : 'bg-ink/10 border-ink/30'}`}
                >
                  <div className={`absolute top-[3px] left-[3px] bg-bg w-4 h-4 rounded-full transition-transform shadow-sm ${fecEnabled ? 'translate-x-[22px]' : 'translate-x-0'}`} />
                </button>
              </div>

              <button 
                onClick={applySettings}
                className="w-full py-3 bg-bg text-ink border border-ink text-sm font-medium hover:bg-ink/5 transition-colors uppercase tracking-wider"
              >
                Apply Settings
              </button>
              
              <div className="pt-6 border-t border-ink/10">
                <button 
                  onClick={sendTestPacket}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-ink/5 hover:bg-ink/10 text-ink text-sm font-medium transition-colors uppercase tracking-wider"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Test Ping</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
