import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingBag, 
} from "lucide-react";

import { formatBRL } from "@/lib/payments";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import geminiBanner from "@/assets/gemini-pro-18m.png.asset.json";
import { createPixPayment } from "@/lib/mercadopago.functions";
import { useServerFn } from "@tanstack/react-start";
import { PixDialog } from "@/components/payments/pix-dialog";

export const Route = createFileRoute("/_authenticated/app/store")({
  beforeLoad: async ({ context }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
  },
  component: StorePage,
});

function StorePage() {
  const { data: products, isLoading, refetch } = useQuery({
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

  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [pix, setPix] = useState<any>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const createPix = useServerFn(createPixPayment);
  const navigate = useNavigate();

  const handlePaid = useCallback(async () => {
    toast.success("Pagamento confirmado! O administrador entrará em contato para liberar seu acesso.");
    setOpenPlan(null);
    setPix(null);
    navigate({ to: "/app" });
  }, [navigate]);

  async function handleBuy(productId: string) {
    const planId = `store_${productId}`;
    setOpenPlan(planId);
    setLoading(true);
    setPix(null);
    setPaymentError(null);
    try {
      const res = await createPix({ data: { plan: planId } });
      setPix(res);
      if (!res.integrationReady) {
        toast.info("Estrutura de pagamento pronta. Configure o Mercado Pago para gerar o QR Code PIX.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao iniciar pagamento";
      setPaymentError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

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
            <ProductCard 
              key={product.id} 
              product={product} 
              onBuy={() => handleBuy(product.id)}
            />
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

      <PixDialog
        openPlan={openPlan as any}
        onClose={() => { setOpenPlan(null); setPix(null); setPaymentError(null); }}
        pix={pix}
        loading={loading}
        error={paymentError}
        onPaid={handlePaid}
      />
    </div>
  );
}

function ProductCard({ product, onBuy }: { product: any; onBuy: () => void }) {
  const image = (product.name.includes("Gemini") && geminiBanner) ? geminiBanner.url : product.image_url;

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
        <Button 
          className="w-full group/btn relative overflow-hidden h-11" 
          size="lg"
          onClick={onBuy}
        >
          <span className="relative z-10 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" /> Comprar agora
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-600 to-primary opacity-0 group-hover/btn:opacity-100 transition-opacity" />
        </Button>
      </CardFooter>
    </Card>
  );
}
