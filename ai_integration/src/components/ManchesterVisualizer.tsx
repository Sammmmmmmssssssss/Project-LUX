import { useState, useEffect } from 'react'

export default function ManchesterVisualizer() {
  const [bits, setBits] = useState([1, 0, 1, 1, 0])
  const [phase, setPhase] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 4) // 0, 1, 2, 3 (where 3 is 3/4T)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-medium text-ink mb-2">Manchester Phase Math (PIO)</h2>
        <p className="text-muted text-sm max-w-3xl leading-relaxed">
          The RX state machine dynamically realigns its sampling phase on every edge transition. 
          The sampling window is calculated precisely to guarantee the analog pin is sampled exactly at the 75% (3/4T) mark of the bit period.
        </p>
      </div>

      <div className="p-6 bg-ink/5 border border-ink/20 rounded-xl overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Timeline header */}
          <div className="flex mb-4">
            {bits.map((bit, i) => (
              <div key={i} className="flex-1 text-center font-mono text-xs text-muted border-l border-ink/20/50">
                BIT {i}: {bit}
              </div>
            ))}
          </div>

          {/* Manchester Waveform */}
          <div className="relative h-32 border-b border-ink/20 flex items-center">
            {bits.map((bit, i) => (
              <div key={i} className="flex-1 h-full relative flex items-center border-l border-ink/20/30 border-dashed">
                {/* 1 = high to low transition in middle, 0 = low to high */}
                <div className="absolute inset-0 flex items-center">
                  <svg className="w-full h-full text-cyan-400" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {bit === 1 ? (
                      <polyline points="0,20 50,20 50,80 100,80" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
                    ) : (
                      <polyline points="0,80 50,80 50,20 100,20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
                    )}
                  </svg>
                </div>
                
                {/* 3/4T Sampling Indicator */}
                <div className="absolute left-[75%] top-0 bottom-0 w-px bg-orange-500/50 z-10">
                  <div className={`absolute top-2 -translate-x-1/2 w-2 h-2 rounded-full ${phase === 3 ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-ink/20'}`} />
                  <div className="absolute bottom-2 -translate-x-1/2 text-[9px] font-mono text-orange-500/80 bg-ink/5 px-1">3/4T</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-ink/10/50 p-4 rounded border border-ink/20 font-mono text-xs text-muted">
        <div className="text-muted mb-2">// RP2040 PIO Assembly Snippet</div>
        <div className="text-ink/80">wait 0 pin 0</div>
        <div>nop [3] <span className="text-muted ml-4">// Wait 1/4 period</span></div>
        <div className="text-ink/80">wait 1 pin 0</div>
        <div className="text-purple-400">in pins, 1 <span className="text-muted ml-3">// Sample exactly at 3/4T</span></div>
        <div>nop [6] <span className="text-muted ml-4">// Complete cycle</span></div>
      </div>
    </div>
  )
}
