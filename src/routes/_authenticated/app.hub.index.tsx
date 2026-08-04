import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard, type ListingRow } from "@/components/hub/listing-card";
import { CATEGORY_GROUPS, CATEGORY_LABEL } from "@/components/hub/categories";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hub/")({
  component: HubIndex,
});

function useListings(params: { kind?: "offer" | "demand"; category?: string; q?: string }) {
  return useQuery<ListingRow[]>({
    queryKey: ["hub-listings", params],
    queryFn: async () => {
      let q = (supabase as any)
        .from("listings")
        .select("id,kind,category,title,description,price_cents,location,created_at,author_id,hub_profiles(handle,rating_avg,rating_count,business_count,verification_status)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      if (params.kind) q = q.eq("kind", params.kind);
      if (params.category && params.category !== "all") q = q.eq("category", params.category);
      if (params.q) q = q.ilike("title", `%${params.q}%`);
      const { data } = await q;
      return (data ?? []) as ListingRow[];
    },
  });
}

function HubIndex() {
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useListings({ kind: "offer", category, q });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ofertas..." className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {CATEGORY_GROUPS.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.items.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Link to="/app/hub/new" search={{ kind: "offer" }}>
          <Button><Plus className="h-4 w-4 mr-1" /> Anunciar</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : data.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <p className="text-muted-foreground">Nenhum anúncio ainda. Seja o primeiro a anunciar!</p>
          <Link to="/app/hub/new" search={{ kind: "offer" }}><Button className="mt-4"><Plus className="h-4 w-4 mr-1" /> Criar anúncio</Button></Link>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item) => <ListingCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
