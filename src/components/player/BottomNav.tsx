import { 
  Home, 
  Search, 
  Star, 
  Tv, 
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  activeView: string;
  onChangeView: (view: any) => void;
  primaryColor?: string;
}

export function BottomNav({ activeView, onChangeView, primaryColor }: BottomNavProps) {
  const items = [
    { id: "home", label: "Início", icon: Home },
    { id: "live", label: "TV Ao Vivo", icon: Tv },
    { id: "mylist", label: "Minha Lista", icon: Star },
    { id: "search", label: "Buscar", icon: Search },
    { id: "settings", label: "Ajustes", icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 h-[72px] bg-black border-t border-white/5 flex items-center justify-around px-2 z-[60] pb-safe">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all active:scale-90",
              isActive ? "text-primary" : "text-white/40"
            )}
            style={isActive ? { color: primaryColor } : {}}
          >
            <div className={cn(
              "p-1.5 rounded-lg transition-colors",
              isActive && "bg-primary/10"
            )} style={isActive ? { backgroundColor: `${primaryColor}15` } : {}}>
              <Icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
