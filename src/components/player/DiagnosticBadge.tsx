import { 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  Zap, 
  Info 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosticBadgeProps {
  status: 'up' | 'down' | 'degraded' | 'unknown';
  healthScore?: number | null;
  latency?: number | null;
  className?: string;
  onClick?: () => void;
}

export function DiagnosticBadge({ status, healthScore, latency, className, onClick }: DiagnosticBadgeProps) {
  const isUp = status === 'up';
  const isDegraded = status === 'degraded';
  const isDown = status === 'down';

  return (
    <div className="relative group">
      <button 
        onClick={onClick}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all active:scale-95",
          isUp && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20",
          isDegraded && "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20",
          isDown && "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20",
          !isUp && !isDegraded && !isDown && "bg-white/5 border-white/10 text-white/40",
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <div className={cn(
            "h-2 w-2 rounded-full",
            isUp && "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
            isDegraded && "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
            isDown && "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]",
            !isUp && !isDegraded && !isDown && "bg-white/20"
          )} />
          {isUp && <div className="absolute h-4 w-4 rounded-full border border-emerald-400/50 animate-ping opacity-20" />}
        </div>
        
        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
          {isUp ? "Serviço Normal" : (isDegraded ? "Instabilidade" : (isDown ? "Indisponível" : "Verificando"))}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest sm:hidden">
          {isUp ? "Normal" : (isDegraded ? "Instável" : (isDown ? "Fora" : "Check"))}
        </span>
      </button>

      {/* Tooltip Content (Custom Implementation) */}
      <div className="absolute right-0 top-full mt-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-1 group-hover:translate-y-0">
        <div className="bg-neutral-900 border border-white/10 text-white p-3 rounded-xl shadow-2xl min-w-[140px] pointer-events-none">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">Status do Servidor</p>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <Zap className="h-3 w-3 text-primary" />
              Saúde
            </div>
            <span className="text-[11px] font-bold">{healthScore ?? '--'}%</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <Wifi className="h-3 w-3 text-primary" />
              Latência
            </div>
            <span className="text-[11px] font-bold">{latency ? `${latency}ms` : '--'}</span>
          </div>

          <div className="pt-2 border-t border-white/5 mt-1 flex items-center gap-1.5 text-[9px] text-white/30 italic">
            <Info className="h-2.5 w-2.5" />
            Clique para diagnóstico completo
          </div>
        </div>
      </div>
    </div>
  );
}
