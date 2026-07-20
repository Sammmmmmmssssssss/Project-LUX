import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function SPSCBuffer() {
  const [head, setHead] = useState(0)
  const [tail, setTail] = useState(0)
  const [isSimulating, setIsSimulating] = useState(false)
  const bufferSize = 16

  useEffect(() => {
    if (!isSimulating) return
    const interval = setInterval(() => {
      setHead(h => (h + 1) % bufferSize)
      setTimeout(() => {
        setTail(t => (t + 1) % bufferSize)
      }, 300) // Delay consumer slightly
    }, 500)
    return () => clearInterval(interval)
  }, [isSimulating])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-medium text-ink mb-2">SPSC Ring Buffer (Zero-Allocation)</h2>
        <p className="text-muted text-sm max-w-3xl leading-relaxed">
          The Go daemon operates lock-free using custom Single-Producer Single-Consumer (SPSC) ring buffers. Head and tail atomics are separated by explicit 64-byte padding to eliminate SMP false-sharing.
        </p>
      </div>

      <div className="flex items-center justify-between bg-ink/5 p-4 rounded-lg border border-ink/20">
        <div className="font-mono text-xs text-muted">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-cyan-500/20 border border-cyan-500 rounded-sm inline-block"></span>
            <span>Producer (Head): {head}</span>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <span className="w-3 h-3 bg-purple-500/20 border border-purple-500 rounded-sm inline-block"></span>
            <span>Consumer (Tail): {tail}</span>
          </div>
        </div>
        <button
          onClick={() => setIsSimulating(!isSimulating)}
          className="px-4 py-2 bg-ink  hover:bg-accent text-bg rounded-md text-sm font-medium transition-colors"
        >
          {isSimulating ? 'Stop Simulation' : 'Start Simulation'}
        </button>
      </div>

      <div className="relative w-full aspect-[3/1] max-w-3xl mx-auto flex items-center justify-center">
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: bufferSize }).map((_, i) => {
            const isHead = i === head
            const isTail = i === tail
            const isFilled = head >= tail ? (i >= tail && i < head) : (i >= tail || i < head)
            
            return (
              <div 
                key={i} 
                className={`relative w-12 h-12 flex items-center justify-center font-mono text-xs rounded-md border transition-all duration-200
                  ${isFilled ? 'bg-ink/20 border-ink/40 text-ink/80' : 'bg-ink/5 border-ink/20 text-ink/70'}
                `}
              >
                {i}
                {isHead && (
                  <motion.div 
                    layoutId="head-indicator"
                    className="absolute -top-6 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-cyan-500"
                  />
                )}
                {isTail && (
                  <motion.div 
                    layoutId="tail-indicator"
                    className="absolute -bottom-6 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-purple-500"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-ink/10/50 rounded-lg border border-ink/20/50">
        <h3 className="text-xs font-mono text-muted mb-2">MEMORY LAYOUT (64-BYTE CACHE LINE PADDING)</h3>
        <div className="flex space-x-1 overflow-hidden rounded border border-ink/20">
          <div className="bg-cyan-950 text-cyan-400 text-[10px] p-2 font-mono border-r border-ink/20">HEAD ATOMIC (8B)</div>
          <div className="bg-ink/10 text-ink/60 text-[10px] p-2 flex-1 font-mono text-center border-r border-ink/20">--- 56 BYTES EXPLICIT PADDING ---</div>
          <div className="bg-purple-950 text-purple-400 text-[10px] p-2 font-mono">TAIL ATOMIC (8B)</div>
        </div>
      </div>
    </div>
  )
}
