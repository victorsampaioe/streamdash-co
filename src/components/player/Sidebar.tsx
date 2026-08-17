import { 
  Home, 
  Tv, 
  Film, 
  Play, 
  Star, 
  Search, 
  Settings,
  LogOut,
  Activity,
  Zap,
  Clock,
  Wifi,
  LayoutGrid
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getServerStatus } from "@/lib/player.functions";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activeView: string;
  onChangeView: (view: any) => void;
  brandName?: string;
  logoUrl?: string;
  onLogout: () => void;
  token?: string;
}

export function Sidebar({ activeView, onChangeView, brandName, logoUrl, onLogout, token }: SidebarProps) {
  const { data: serverStatus, isError } = useQuery({
    queryKey: ["player-server-status", token],
    queryFn: async () => {
      try {
        return await getServerStatus({ data: { token: token! } });
      } catch (err) {
        console.error("Telemetria do servidor indisponível:", err);
        throw err;
      }
    },
    enabled: !!token,
    refetchInterval: 60000,
    retry: 2,
    staleTime: 30000,
  });


  const items = [
    { id: "home", label: "Início", icon: Home },
    { id: "live", label: "TV Ao Vivo", icon: Tv },
    { id: "movie", label: "Filmes", icon: Film },
    { id: "series", label: "Séries", icon: Play },
    { id: "mylist", label: "Minha Lista", icon: Star },
    { id: "search", label: "Buscar", icon: Search },
    { id: "settings", label: "Configurações", icon: Settings },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-black border-r border-white/5 h-screen sticky top-0 z-50">
        <div className="p-6 mb-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-8 w-auto" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center font-bold text-lg">
                S
              </div>
            )}
            <span className="font-bold text-xl tracking-tight truncate">
              {brandName || "Stream Player"}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-primary text-white shadow-lg shadow-primary/20" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "scale-110" : "group-hover:scale-110 transition-transform")} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-2 mt-auto">
          {isError ? (
            <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Status indisponível</span>
            </div>
          ) : serverStatus ? (
            <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Status do Servidor</span>
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] font-bold uppercase",
                  serverStatus.current_status === 'up' ? "text-emerald-400" : (serverStatus.current_status === 'degraded' ? "text-amber-400" : "text-red-400")
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full animate-pulse",
                    serverStatus.current_status === 'up' ? "bg-emerald-400" : (serverStatus.current_status === 'degraded' ? "bg-amber-400" : "bg-red-400")
                  )} />
                  {serverStatus.current_status === 'up' ? "Estável" : (serverStatus.current_status === 'degraded' ? "Instável" : "Offline")}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-white/60">
                    <Zap className="h-3 w-3 text-primary" />
                    <span>Saúde</span>
                  </div>
                  <span className="font-bold">{serverStatus.health_score ?? 100}%</span>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-white/60">
                    <Wifi className="h-3 w-3 text-primary" />
                    <span>Latência</span>
                  </div>
                  <span className="font-bold">{serverStatus.last_latency_ms ? `${serverStatus.last_latency_ms}ms` : '--'}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-white/30 pt-1 border-t border-white/5">
                  <div className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    <span>Análise</span>
                  </div>
                  <span>{serverStatus.last_checked_at ? formatDistanceToNow(new Date(serverStatus.last_checked_at), { addSuffix: true, locale: ptBR }) : 'agora'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 rounded-xl p-4 border border-white/5 animate-pulse space-y-2">
              <div className="h-3 w-2/3 bg-white/10 rounded" />
              <div className="h-8 bg-white/10 rounded" />
            </div>
          )}

        </div>

        <nav className="px-4 py-4 space-y-2">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-white/40 hover:text-red-500 hover:bg-red-500/5 cursor-pointer"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Sair</span>
          </button>
        </nav>
      </aside>

      {/* Mobile Navigation Bar is now handled by BottomNav component */}
    </>
  );
}
