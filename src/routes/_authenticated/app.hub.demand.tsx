import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingCard, type ListingRow } from "@/components/hub/listing-card";
import { Plus, Search, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hub/demand")({
  component: DemandPage,
});

function DemandPage() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery<ListingRow[]>({
    queryKey: ["hub-demand", q],
    queryFn: async () => {
      let qb = (supabase as any)
        .from("listings")
        .select("id,kind,category,title,description,price_cents,location,created_at,author_id,hub_profiles(handle,rating_avg,rating_count,business_count,verification_status)")
        .eq("status", "active").eq("kind", "demand")
        .order("created_at", { ascending: false }).limit(60);
      if (q) qb = qb.ilike("title", `%${q}%`);
      const { data } = await qb;
      return (data ?? []) as ListingRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 border-warning/40 bg-warning/5 flex gap-3 items-start">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Preciso de ajuda</p>
          <p className="text-muted-foreground">
            Publique o que você procura — VPS numa região, técnico para configurar um painel, um parceiro para dividir estrutura, etc.
            Técnicos e fornecedores clicam em "Tenho interesse" para iniciar uma conversa protegida.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedidos..." className="pl-9" />
        </div>
        <Link to="/app/hub/new" search={{ kind: "demand" } as any}>
          <Button variant="outline"><Plus className="h-4 w-4 mr-1" /> Publicar pedido</Button>
        </Link>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
        data.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <p className="text-muted-foreground">Nenhum pedido publicado ainda.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((item) => <ListingCard key={item.id} item={item} />)}
          </div>
        )}
    </div>
  );
}
