import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPlayerSettings, loginXtreamClient, getPlayerCatalog, validatePlayerSession } from "@/lib/player.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, Tv, Film, Info, User, LogOut, ChevronRight, Search, LayoutGrid, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/player/$resellerId")({
  component: PlayerPage,
});

function PlayerPage() {
  const { resellerId } = Route.useParams();
  const [token, setToken] = useState<string | null>(localStorage.getItem(`stream_player_token_${resellerId}`));
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"live" | "vod" | "series">("live");
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [content, setContent] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  
  // Identidade Visual
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["public-player-settings", resellerId],
    queryFn: () => getPlayerSettings({ data: { profileId: resellerId } }),
  });

  // Validar sessão ao carregar
  useEffect(() => {
    if (token) {
      validatePlayerSession({ data: { token } })
        .then((s) => {
          if (s) setSession(s);
          else setToken(null);
        })
        .catch(() => setToken(null));
    }
  }, [token]);

  // Salvar token
  useEffect(() => {
    if (token) localStorage.setItem(`stream_player_token_${resellerId}`, token);
    else localStorage.removeItem(`stream_player_token_${resellerId}`);
  }, [token, resellerId]);

  // Carregar categorias
  useEffect(() => {
    if (session && token) {
      const actionMap = {
        live: "get_live_categories",
        vod: "get_vod_categories",
        series: "get_series_categories"
      } as const;
      
      getPlayerCatalog({ data: { token, action: actionMap[activeTab] } })
        .then((data: any) => {
          setCategories(Array.isArray(data) ? data : []);
          setSelectedCategory(null);
        });
    }
  }, [session, token, activeTab]);

  // Carregar conteúdo por categoria
  useEffect(() => {
    if (session && token && selectedCategory) {
      setLoadingContent(true);
      const actionMap = {
        live: "get_live_streams",
        vod: "get_vod_streams",
        series: "get_series"
      } as const;
      
      getPlayerCatalog({ data: { token, action: actionMap[activeTab], categoryId: selectedCategory } })
        .then((data: any) => {
          setContent(Array.isArray(data) ? data : []);
        })
        .finally(() => setLoadingContent(false));
    } else {
      setContent([]);
    }
  }, [session, token, activeTab, selectedCategory]);

  const primaryColor = settings?.primary_color || "#3B82F6";
  const secondaryColor = settings?.secondary_color || "#0A0A0A";

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <LoginForm 
      resellerId={resellerId} 
      settings={settings} 
      onLogin={(data) => {
        setToken(data.token);
        setSession(data);
      }}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
    />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-8 w-auto" />
          )}
          <span className="font-bold text-lg hidden sm:block">{settings?.brand_name || "Stream Player"}</span>
        </div>
        
        <nav className="flex items-center gap-1 sm:gap-4">
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "live" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("live")}
          >
            <Tv className="h-4 w-4" /> <span className="hidden sm:inline">TV Ao Vivo</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "vod" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("vod")}
          >
            <Film className="h-4 w-4" /> <span className="hidden sm:inline">Filmes</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "series" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("series")}
          >
            <Play className="h-4 w-4" /> <span className="hidden sm:inline">Séries</span>
          </Button>
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full text-xs">
            <User className="h-3 w-3 text-primary" />
            <span className="max-w-[100px] truncate">{session.xtream_user}</span>
          </div>
          <Button variant="ghost" size="icon" className="text-white/40 hover:text-red-500" onClick={() => setToken(null)}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Categorias */}
        <aside className="w-64 border-r border-white/5 bg-black/20 overflow-y-auto hidden md:block">
          <div className="p-4 space-y-2">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest px-2 mb-4">Categorias</h3>
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                onClick={() => setSelectedCategory(cat.category_id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === cat.category_id 
                    ? "bg-primary text-white font-bold" 
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        </aside>

        {/* Conteúdo Principal */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedCategory ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <LayoutGrid className="h-16 w-16" />
              <div>
                <h2 className="text-xl font-bold">Selecione uma categoria</h2>
                <p className="text-sm">Escolha ao lado para começar a assistir</p>
              </div>
            </div>
          ) : loadingContent ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-2xl font-bold">
                  {categories.find(c => c.category_id === selectedCategory)?.category_name}
                </h2>
                <div className="flex gap-2">
                   <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                     <Input className="bg-white/5 border-white/10 pl-9 w-64 h-9 text-sm" placeholder="Buscar..." />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {content.map((item) => (
                  <ContentCard key={item.stream_id || item.series_id} item={item} type={activeTab} primaryColor={primaryColor} />
                ))}
              </div>
              
              {content.length === 0 && (
                <div className="py-20 text-center opacity-40">
                  Nenhum conteúdo encontrado nesta categoria.
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ContentCard({ item, type, primaryColor }: { item: any, type: string, primaryColor: string }) {
  const name = item.name || item.title;
  const image = item.stream_icon || item.cover;
  
  return (
    <div className="group relative aspect-[2/3] bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all cursor-pointer">
      {image ? (
        <img src={image} alt={name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
           {type === "live" ? <Tv className="h-8 w-8 opacity-20" /> : <Film className="h-8 w-8 opacity-20" />}
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
        <h4 className="font-bold text-sm line-clamp-2">{name}</h4>
        <div 
          className="mt-2 h-8 w-8 rounded-full flex items-center justify-center self-end shadow-lg"
          style={{ backgroundColor: primaryColor }}
        >
          <Play className="h-4 w-4 fill-white" />
        </div>
      </div>
      
      {type === "live" && (
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-tighter">AO VIVO</div>
      )}
    </div>
  );
}

function LoginForm({ resellerId, settings, onLogin, primaryColor, secondaryColor }: any) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("servers")
      .select("id, name, host")
      .eq("owner_id", resellerId)
      .then(({ data }) => setServers(data || []));
  }, [resellerId]);

  const loginMutation = useMutation({
    mutationFn: loginXtreamClient,
    onSuccess: onLogin,
    onError: (err: any) => toast.error(err.message || "Erro ao conectar")
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return toast.error("Selecione o servidor");
    loginMutation.mutate({ data: { serverId, username, password, resellerId } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: secondaryColor }}>
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
      </div>

      <Card className="w-full max-w-[400px] bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: primaryColor }} />
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto h-20 w-20 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <Play className="h-10 w-10 text-primary" style={{ color: primaryColor }} />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{settings?.brand_name || "Web Player"}</h1>
              <p className="text-sm text-white/60 mt-1">{settings?.welcome_message || "Entre com suas credenciais."}</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Servidor</Label>
               <select 
                 className="w-full h-11 bg-white/5 border border-white/10 rounded-lg px-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                 value={serverId}
                 onChange={(e) => setServerId(e.target.value)}
                 required
               >
                 <option value="" className="bg-neutral-900">Escolha o servidor...</option>
                 {servers.map(s => <option key={s.id} value={s.id} className="bg-neutral-900">{s.name || s.host}</option>)}
               </select>
             </div>
             
             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Usuário</Label>
               <Input 
                 placeholder="Usuário IPTV" 
                 value={username} 
                 onChange={e => setUsername(e.target.value)}
                 className="bg-white/5 border-white/10 h-11 text-white" 
                 required
               />
             </div>

             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Senha</Label>
               <Input 
                 type="password"
                 placeholder="Senha IPTV" 
                 value={password} 
                 onChange={e => setPassword(e.target.value)}
                 className="bg-white/5 border-white/10 h-11 text-white" 
                 required
               />
             </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold"
            style={{ backgroundColor: primaryColor }}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Play className="h-5 w-5 mr-2" />}
            Conectar
          </Button>

          <p className="text-[10px] text-center text-white/20 uppercase tracking-widest pt-2">Powered by Stream Monitor</p>
        </form>
      </Card>
    </div>
  );
}
