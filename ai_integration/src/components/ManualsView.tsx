import { BookOpen } from 'lucide-react'

export default function ManualsView() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-ink">
      <div>
        <h2 className="font-serif text-3xl font-semibold text-ink mb-2">System Manuals</h2>
        <p className="text-muted text-sm max-w-3xl leading-relaxed uppercase tracking-wider">
          Reference Documentation & Specifications
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ManualCard 
          title="Optical Transceiver Alignment"
          category="Hardware"
          description="Guidelines for aligning the 2MHz infrared beam. Maximum variance is 3 degrees off-axis before SNR degradation occurs. Ensure direct line-of-sight."
        />
        <ManualCard 
          title="RP2040 PIO Programming"
          category="Firmware"
          description="The Manchester encoding state machine requires exact timing. Clock dividers must be calculated against the 133MHz system clock to hit the 2Mbps target exactly."
        />
        <ManualCard 
          title="TUN Interface Bridging"
          category="Software"
          description="The Go daemon must run with elevated privileges (CAP_NET_ADMIN) to attach to the raw TUN device and bypass the standard kernel network stack."
        />
        <ManualCard 
          title="Error Correction Tuning"
          category="Protocol"
          description="RS(255,223) parameters are fixed to ensure zero-allocation. If packet loss exceeds 12%, align the transceivers before attempting to increase TX power."
        />
      </div>
    </div>
  )
}

function ManualCard({ title, category, description }: { title: string, category: string, description: string }) {
  return (
    <div className="p-5 border border-ink/20 hover:border-ink transition-colors bg-bg">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-1 border border-ink/20 text-muted">{category}</span>
      </div>
      <p className="text-ink/80 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

