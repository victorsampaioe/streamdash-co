import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Send, CreditCard, Sparkles, CheckCircle2 } from "lucide-center";
import { formatBRL } from "@/lib/payments";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import geminiBanner from "@/assets/gemini-pro-promo.jpg.asset.json";
import { ShoppingBag as ShoppingBagIcon, Send as SendIcon, CreditCard as CreditCardIcon, Sparkles as SparklesIcon, CheckCircle2 as CheckCircle2Icon } from "lucide-react";


export const Route = createFileRoute("/_authenticated/app/store")({
  beforeLoad: async ({ context }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
  },
  component: StorePage,
});

function StorePage() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["store-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pixSettings } = useQuery({
    queryKey: ["store-settings", "global_pix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "global_pix")
        .single();
      if (error) return null;
      return data.value as { key: string; name: string; city: string };
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingBag className="h-8 w-8 text-primary" />
          Loja Stream Monitor
        </h1>
        <p className="text-muted-foreground text-lg">
          Produtos e serviços digitais premium para potencializar seu negócio.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-[450px] animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products?.map((product) => (
            <ProductCard key={product.id} product={product} pixSettings={pixSettings} />
          ))}
        </div>
      )}

      {products?.length === 0 && !isLoading && (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">Nenhum produto disponível</h3>
          <p className="text-muted-foreground mt-2">Volte mais tarde para conferir as novidades.</p>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, pixSettings }: { product: any; pixSettings: any }) {
  const [open, setOpen] = useState(false);
  const image = product.name.includes("Gemini") ? geminiBanner.url : product.image_url;

  return (
    <Card className="flex flex-col overflow-hidden border-primary/10 bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-300 group shadow-lg hover:shadow-primary/5">
      <div className="relative aspect-video overflow-hidden">
        <img
          src={image}
          alt={product.name}
          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 right-2">
          <Badge className="bg-primary/90 hover:bg-primary shadow-xl backdrop-blur-sm">PREMIUM</Badge>
        </div>
      </div>
      
      <CardHeader className="flex-1">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-xl group-hover:text-primary transition-colors">{product.name}</CardTitle>
          <div className="text-2xl font-bold text-primary">
            {formatBRL(product.price * 100)}
          </div>
        </div>
        <CardDescription className="whitespace-pre-line mt-2 text-sm leading-relaxed">
          {product.description}
        </CardDescription>
      </CardHeader>

      <CardFooter className="pt-4 border-t border-primary/5 bg-primary/5">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full group/btn relative overflow-hidden h-11" size="lg">
              <span className="relative z-10 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" /> Comprar agora
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-600 to-primary opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px] bg-card border-primary/20">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-primary" />
                Pagamento via PIX
              </DialogTitle>
              <DialogDescription>
                Realize o pagamento para liberar seu acesso ao {product.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="bg-muted/30 p-6 rounded-xl border border-primary/10 text-center space-y-4">
                <div className="text-3xl font-extrabold text-primary">
                  {formatBRL(product.price * 100)}
                </div>
                
                <div className="bg-white p-3 rounded-lg inline-block shadow-inner mx-auto">
                   {/* Simplified QR Code Display */}
                   <div className="w-48 h-48 bg-slate-100 flex items-center justify-center border-2 border-dashed border-slate-300">
                      <CreditCard className="h-12 w-12 text-slate-300" />
                      <span className="text-[10px] absolute mt-20 text-slate-400">QR CODE PIX</span>
                   </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Chave PIX</p>
                  <div className="flex items-center gap-2 bg-background p-3 rounded-md border border-input">
                    <code className="text-sm font-mono flex-1 break-all text-left">
                      {pixSettings?.key || "brunohbibiano1@gmail.com"}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(pixSettings?.key || "brunohbibiano1@gmail.com");
                        toast.success("Chave copiada!");
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="text-center space-y-4">
                <p className="text-sm font-medium text-amber-500 flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Pagamento realizado? Entre em contato pelo Telegram para liberar seu acesso.
                </p>
                
                <a 
                  href="https://t.me/StreamMonitorOfc" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="outline" className="w-full border-primary/20 hover:bg-primary/5 h-11">
                    <Send className="h-4 w-4 mr-2 text-[#229ED9]" />
                    Falar no Telegram (@StreamMonitorOfc)
                  </Button>
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
