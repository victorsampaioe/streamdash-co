import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPlayerSettings, savePlayerSettings } from "@/lib/player.functions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Layout, Palette, Type, Image as ImageIcon, Globe, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/player")({
  component: PlayerAdminPage,
});

function PlayerAdminPage() {
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#1E293B");
  const [welcomeMessage, setWelcomeMessage] = useState("");

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { isLoading } = useQuery({
    queryKey: ["player-settings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const settings = await getPlayerSettings({ data: { profileId: user!.id } });
      if (settings) {
        setBrandName(settings.brand_name || "");
        setLogoUrl(settings.logo_url || "");
        setPrimaryColor(settings.primary_color || "#3B82F6");
        setSecondaryColor(settings.secondary_color || "#1E293B");
        setWelcomeMessage(settings.welcome_message || "");
      }
      return settings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: savePlayerSettings,
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      data: {
        brand_name: brandName,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        welcome_message: welcomeMessage || null,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Layout className="h-6 w-6 text-primary" /> Player Inteligente (White-label)
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalize a aparência do Web Player para seus clientes finais.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="h-4 w-4" /> Identidade Visual
              </CardTitle>
              <CardDescription>Nome da marca e logo do seu player.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brand-name">Nome da Marca</Label>
                <Input
                  id="brand-name"
                  placeholder="Ex: MyStream Player"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo-url">URL da Logo (PNG transparente recomendado)</Label>
                <div className="flex gap-2">
                  <Input
                    id="logo-url"
                    placeholder="https://..."
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                  {logoUrl && (
                    <div className="h-10 w-10 border rounded bg-muted flex items-center justify-center overflow-hidden">
                      <img src={logoUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-4 w-4" /> Cores do Tema
              </CardTitle>
              <CardDescription>Defina as cores principais da interface.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cor Primária</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-12 p-1 h-10"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#3B82F6"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Secundária</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-12 p-1 h-10"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      placeholder="#1E293B"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-4 w-4" /> Mensagem de Boas-vindas
              </CardTitle>
              <CardDescription>Texto exibido na tela de login.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Ex: Bem-vindo ao seu portal de entretenimento!"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                className="min-h-[100px]"
              />
            </CardContent>
          </Card>

          <Button 
            className="w-full h-12 text-lg glow-primary" 
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>

        <div className="space-y-6">
          <Card className="h-full border-dashed">
            <CardHeader>
              <CardTitle className="text-lg">Preview do Player</CardTitle>
              <CardDescription>Como seu player aparecerá para os clientes.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center min-h-[400px]">
              <div 
                className="w-full max-w-[320px] rounded-2xl overflow-hidden shadow-2xl border"
                style={{ backgroundColor: secondaryColor }}
              >
                <div className="p-8 space-y-6 flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-muted rounded-xl flex items-center justify-center">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{brandName || "Nome da Marca"}</h3>
                    <p className="text-xs text-white/60 mt-2">{welcomeMessage || "Mensagem de boas-vindas..."}</p>
                  </div>
                  <div className="w-full space-y-3 pt-4">
                    <div className="h-10 bg-white/5 rounded-lg border border-white/10" />
                    <div className="h-10 bg-white/5 rounded-lg border border-white/10" />
                    <div 
                      className="h-11 rounded-lg font-bold text-white flex items-center justify-center shadow-lg"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Acessar Player
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <p className="text-xs text-center text-muted-foreground w-full">
                Link de acesso público (em breve):
              </p>
              <div className="bg-muted p-2 rounded text-xs font-mono w-full break-all">
                https://streammonitor.site/player/{user?.id?.slice(0, 8)}
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
