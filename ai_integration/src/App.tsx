import { useState, useRef, useEffect } from 'react'
import { Activity, Cpu, Shield, Zap, MoreVertical, X, BookOpen, RefreshCw, Terminal, Maximize, Minimize, Moon, Sun } from 'lucide-react'
import SPSCBuffer from './components/SPSCBuffer'
import FECSimulator from './components/FECSimulator'
import ManchesterVisualizer from './components/ManchesterVisualizer'
import ArchitectureView from './components/ArchitectureView'
import HardwareDashboard from './components/HardwareDashboard'
import ManualsView from './components/ManualsView'
import HardwareLogs from './components/HardwareLogs'

export default function App() {
  const [activeModal, setActiveModal] = useState<'arch' | 'buffer' | 'fec' | 'signal' | 'manuals' | 'logs' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRebooting, setIsRebooting] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkTheme])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`)
      })
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  const triggerReboot = () => {
    setMenuOpen(false)
    setIsRebooting(true)
    setTimeout(() => {
      setIsRebooting(false)
    }, 3500)
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto min-h-screen flex flex-col p-8 md:p-12 gap-12 md:gap-16">
      {/* Reboot Overlay */}
      {isRebooting && (
        <div className="fixed inset-0 bg-ink z-[100] flex flex-col items-center justify-center text-bg font-mono p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-2xl">
            <div className="flex items-center gap-4 mb-8 border-b border-bg/20 pb-4">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <h2 className="text-3xl font-bold tracking-widest uppercase">System Reboot</h2>
            </div>
            <div className="space-y-2 text-sm opacity-80">
              <p>{'>'} INIT HARDWARE RESET SEQUENCE...</p>
              <p className="animate-pulse">{'>'} FLUSHING SPSC BUFFERS...</p>
              <p className="animate-pulse" style={{ animationDelay: '0.5s' }}>{'>'} RESETTING MANCHESTER PIO STATE MACHINE...</p>
              <p className="animate-pulse" style={{ animationDelay: '1.0s' }}>{'>'} RECALIBRATING OPTICAL TRANSCEIVERS...</p>
              <p className="animate-pulse" style={{ animationDelay: '1.5s' }}>{'>'} ESTABLISHING TUN INTERFACE BRIDGE...</p>
              <p className="text-green-400 mt-4 font-bold" style={{ animationDelay: '2.5s', animationFillMode: 'both', animation: 'fadeIn 0.1s 2.5s both' }}>{'>'} SYSTEM READY.</p>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b-[2px] border-ink">
        <div>
          <h1 className="font-serif text-5xl md:text-6xl tracking-tight leading-[0.8] font-semibold text-ink">Project LUX</h1>
          <p className="text-[0.9rem] text-muted mt-4 uppercase tracking-[0.1em]">Interactive Photonic IP Network Dashboard</p>
        </div>
        
        <div className="flex items-center gap-6 mt-6 md:mt-0 relative" ref={menuRef}>
          <div className="flex gap-4">
            <span className="font-mono text-[0.65rem] md:text-xs uppercase border border-ink px-3 py-1.5 text-ink">L1 CACHE</span>
            <span className="font-mono text-[0.65rem] md:text-xs uppercase border border-ink px-3 py-1.5 text-ink">ZERO-ALLOC</span>
            <span className="font-mono text-[0.65rem] md:text-xs uppercase border border-ink px-3 py-1.5 text-ink">BARE-METAL</span>
          </div>

          <button 
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            className="p-1 hover:opacity-50 transition-opacity text-ink ml-2"
            title="Toggle Theme"
          >
            {isDarkTheme ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={toggleFullscreen}
            className="p-1 hover:opacity-50 transition-opacity text-ink"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 hover:opacity-50 transition-opacity text-ink"
          >
            <MoreVertical className="w-6 h-6" />
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-bg border border-ink shadow-2xl z-50">
              <div className="px-4 py-3 text-xs font-mono text-muted uppercase tracking-wider border-b border-ink bg-ink/5">
                Technical Details
              </div>
              <MenuButton 
                onClick={() => { setActiveModal('arch'); setMenuOpen(false); }} 
                icon={<Activity className="w-4 h-4" />}
                label="Architecture" 
              />
              <MenuButton 
                onClick={() => { setActiveModal('buffer'); setMenuOpen(false); }} 
                icon={<Cpu className="w-4 h-4" />}
                label="SPSC Buffer" 
              />
              <MenuButton 
                onClick={() => { setActiveModal('fec'); setMenuOpen(false); }} 
                icon={<Shield className="w-4 h-4" />}
                label="RS(255,223) FEC" 
              />
              <MenuButton 
                onClick={() => { setActiveModal('signal'); setMenuOpen(false); }} 
                icon={<Zap className="w-4 h-4" />}
                label="Manchester PIO" 
              />
              <div className="border-t border-ink/20"></div>
              <MenuButton 
                onClick={() => { setActiveModal('manuals'); setMenuOpen(false); }} 
                icon={<BookOpen className="w-4 h-4" />}
                label="Manuals" 
              />
              <MenuButton 
                onClick={() => { setActiveModal('logs'); setMenuOpen(false); }} 
                icon={<Terminal className="w-4 h-4" />}
                label="Hardware Logs" 
              />
              <MenuButton 
                onClick={triggerReboot} 
                icon={<RefreshCw className="w-4 h-4 text-red-500" />}
                label="Hardware Reset" 
                className="text-red-600 hover:bg-red-950/30"
              />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <HardwareDashboard />
      </main>

      <footer className="flex justify-between font-mono text-[0.7rem] text-muted pt-8 border-t border-ink/20">
        <div>[SESSION_ID] 882-991-XLA</div>
        <div className="hidden md:block">VER: 0.9.8_PRE-BUILD</div>
        <div>STATUS: READY_TO_INIT</div>
      </footer>

      {/* Modal for Technical Details */}
      {activeModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg border border-ink w-full max-w-4xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-2 bg-ink text-bg hover:opacity-80 transition-opacity z-20"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-0">
              <div className="p-8 md:p-12 min-h-[500px]">
                {activeModal === 'arch' && <ArchitectureView />}
                {activeModal === 'buffer' && <SPSCBuffer />}
                {activeModal === 'fec' && <FECSimulator />}
                {activeModal === 'signal' && <ManchesterVisualizer />}
                {activeModal === 'manuals' && <ManualsView />}
                {activeModal === 'logs' && <HardwareLogs />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuButton({ onClick, icon, label, className }: { onClick: () => void, icon: React.ReactNode, label: string, className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm text-ink hover:bg-ink/5 transition-colors text-left font-medium ${className || ''}`}
    >
      <span className={className ? '' : 'text-muted'}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
