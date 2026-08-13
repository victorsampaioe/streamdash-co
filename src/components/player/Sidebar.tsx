import { 
  Home, 
  Tv, 
  Film, 
  Play, 
  Star, 
  Search, 
  Settings,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activeView: string;
  onChangeView: (view: any) => void;
  brandName?: string;
  logoUrl?: string;
  onLogout: () => void;
}

export function Sidebar({ activeView, onChangeView, brandName, logoUrl, onLogout }: SidebarProps) {
  const items = [
    { id: "home", label: "Início", icon: Home },
    { id: "live", label: "TV Ao Vivo", icon: Tv },
    { id: "movie", label: "Filmes", icon: Film },
    { id: "series", label: "Séries", icon: Play },
    { id: "mylist", label: "Minha Lista", icon: Star },
    { id: "search", label: "Buscar", icon: Search },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-black/60 backdrop-blur-xl border-r border-white/5 h-screen sticky top-0 z-50">
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

        <div className="p-4 mt-auto space-y-2">
          <button
            onClick={() => onChangeView("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-white/60 hover:text-white hover:bg-white/5",
              activeView === "settings" && "bg-white/5 text-white"
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="font-medium">Configurações</span>
          </button>
          
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-white/40 hover:text-red-500 hover:bg-red-500/5"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-black/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-50">
        {items.filter(i => i.id !== "search" && i.id !== "settings").map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 py-1 rounded-lg transition-colors",
                isActive ? "text-primary" : "text-white/40"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => onChangeView("search")}
          className={cn(
            "flex flex-col items-center gap-1 flex-1 py-1 rounded-lg transition-colors",
            activeView === "search" ? "text-primary" : "text-white/40"
          )}
        >
          <Search className="h-5 w-5" />
          <span className="text-[10px] font-medium">Buscar</span>
        </button>
      </nav>
    </>
  );
}
