import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPlayerSettings, loginXtreamClient } from "@/lib/player.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, Tv, Film, Info, User, LogOut, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/player")({
  component: PlayerLoginPage,
});

function PlayerLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<any[]>([]);
  const [isLogged, setIsLogged] = useState(false);
  const [session, setSession] = useState<any>(null);

  // No MVP, usamos um ID fixo ou da URL. 
  // TODO: Pegar o ID do revendedor da URL (ex: /player/$resellerId)
  const resellerId = "00000000-0000-0000-0000-000000000000"; // Placeholder

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["public-player-settings", resellerId],
    queryFn: () => getPlayerSettings({ data: { profileId: resellerId } }),
  });

  // Busca servidores públicos vinculados a este revendedor
  useEffect(() => {
    async function fetchServers() {
      const { data } = await supabase
        .from("servers")
        .select("id, name, host")
        .limit(50); // Simplificado para o MVP
      setServers(data || []);
    }
    fetchServers();
  }, []);

  const loginMutation = useMutation({
    mutationFn: loginXtreamClient,
    onSuccess: (data) => {
      setSession(data);
      setIsLogged(true);
      toast.success("Bem-vindo!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Falha ao conectar");
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return toast.error("Selecione um servidor");
    
    loginMutation.mutate({
      data: {
        serverId,
        username,
        password,
        resellerId
      }
    });
  };

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const primaryColor = settings?.primary_color || "#3B82F6";
  const secondaryColor = settings?.secondary_color || "#0A0A0A";

  if (isLogged) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
        {/* Header Simulado do Player */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur">
          <div className="flex items-center gap-4">
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="Logo" className="h-8 w-auto" />
            )}
            <span className="font-bold text-lg">{settings?.brand_name || "Stream Player"}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full text-sm">
              <User className="h-4 w-4 text-primary" />
              <span>{session.user?.username || username}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsLogged(false)}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20 hover:border-blue-500/40 transition-all cursor-pointer group">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Tv className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Canais Ao Vivo</h3>
                  <p className="text-sm text-white/60">Assista seus esportes e notícias</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-600/20 to-transparent border-purple-500/20 hover:border-purple-500/40 transition-all cursor-pointer group">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Film className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Filmes (VOD)</h3>
                  <p className="text-sm text-white/60">O melhor do cinema em casa</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-600/20 to-transparent border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer group">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="h-16 w-16 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Séries</h3>
                  <p className="text-sm text-white/60">Sua maratona começa aqui</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Continuar assistindo</h2>
              <Button variant="link" className="text-primary">Ver tudo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="aspect-[2/3] bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: secondaryColor }}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
      </div>

      <Card className="w-full max-w-[400px] bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: primaryColor }} />
        
        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto h-20 w-20 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <Play className="h-10 w-10" style={{ color: primaryColor }} />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{settings?.brand_name || "Web Player"}</h1>
              <p className="text-sm text-white/60 mt-1">{settings?.welcome_message || "Entre com suas credenciais de acesso."}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server" className="text-white/80">Servidor</Label>
              <select 
                id="server"
                className="w-full h-11 bg-white/5 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
                required
              >
                <option value="" className="bg-neutral-900">Selecione um servidor...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-neutral-900">{s.name || s.host}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-white/80">Usuário</Label>
              <Input 
                id="username"
                placeholder="Seu usuário"
                className="bg-white/5 border-white/10 h-11 text-white"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" style={{ color: "rgba(255,255,255,0.8)" }}>Senha</Label>
              <Input 
                id="password"
                type="password"
                placeholder="Sua senha"
                className="bg-white/5 border-white/10 h-11 text-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold shadow-lg transition-all hover:scale-[1.02]"
            style={{ backgroundColor: primaryColor }}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            Conectar Agora
          </Button>

          <div className="flex items-center justify-center gap-2 pt-2">
            <Info className="h-3 w-3 text-white/40" />
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Powered by Stream Monitor</p>
          </div>
        </form>
      </Card>
    </div>
  );
}
