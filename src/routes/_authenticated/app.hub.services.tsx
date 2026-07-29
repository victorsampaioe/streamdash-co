import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListingCard, type ListingRow } from "@/components/hub/listing-card";
import { Plus, Search } from "lucide-react";
import { CATEGORY_GROUPS } from "@/components/hub/categories";

const SERVICE_CATEGORIES = CATEGORY_GROUPS.find((g) => g.label === "Serviços")!.items;

export const Route = createFileRoute("/_authenticated/app/hub/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery<ListingRow[]>({
    queryKey: ["hub-services", q],
    queryFn: async () => {
      let qb = (supabase as any)
        .from("listings")
        .select("id,kind,category,title,description,price_cents,location,created_at,author_id,hub_profiles(handle,rating_avg,rating_count,business_count,verification_status)")
        .eq("status", "active").in("category", SERVICE_CATEGORIES)
        .order("created_at", { ascending: false }).limit(60);
      if (q) qb = qb.ilike("title", `%${q}%`);
      const { data } = await qb;
      return (data ?? []) as ListingRow[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar serviços..." className="pl-9" />
        </div>
        <Link to="/app/hub/new"><Button><Plus className="h-4 w-4 mr-1" /> Oferecer serviço</Button></Link>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
        data.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <p className="text-muted-foreground">Nenhum serviço publicado ainda.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((item) => <ListingCard key={item.id} item={item} />)}
          </div>
        )}
    </div>
  );
}
