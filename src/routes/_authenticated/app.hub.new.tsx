import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createListing } from "@/lib/hub.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CATEGORY_GROUPS, CATEGORY_LABEL } from "@/components/hub/categories";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/hub/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    kind: s.kind === "demand" ? "demand" as const : "offer" as const,
  }),
  component: NewListing,
});

function NewListing() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const [kind, setKind] = useState<"offer" | "demand">(search.kind);
  const [category, setCategory] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createListing);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.object({
      kind: z.enum(["offer","demand"]),
      category: z.string().min(1, "Escolha a categoria"),
      title: z.string().trim().min(4).max(120),
      description: z.string().trim().min(10).max(2000),
    }).safeParse({ kind, category, title, description });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Preencha os campos obrigatórios"); return; }
    setBusy(true);
    try {
      const priceCents = price ? Math.round(Number(price.replace(",", ".")) * 100) : null;
      const res = await create({ data: {
        kind, category: category as any, title: title.trim(), description: description.trim(),
        price_cents: priceCents, location: location.trim() || null,
      } });
      toast.success("Anúncio publicado!");
      nav({ to: "/app/hub/l/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao publicar");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Novo anúncio</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as any)} className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="offer" /> Estou oferecendo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="demand" /> Estou procurando
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Categoria *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category"><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
            <SelectContent>
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex: VPS em SP com 8GB RAM disponível" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descrição *</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000}
            placeholder="Detalhe o que oferece ou procura. Não coloque telefone/WhatsApp/URL aqui — o contato é liberado no chat depois." />
          <p className="text-xs text-muted-foreground">
            Para sua segurança, telefone/WhatsApp e links são detectados automaticamente e sinalizados para moderação.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">Preço (opcional, R$)</Label>
            <Input id="price" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g,""))} placeholder="0,00" inputMode="decimal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Localização (opcional)</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: São Paulo — SP" maxLength={120} />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={() => nav({ to: "/app/hub" })}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? "Publicando..." : "Publicar anúncio"}</Button>
        </div>
      </form>
    </Card>
  );
}
