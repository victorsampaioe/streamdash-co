import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReputationBadges } from "@/components/hub/reputation-badges";
import { formatPrice } from "@/components/hub/listing-card";
import { CATEGORY_LABEL } from "@/components/hub/categories";
import { startConversation, reportItem } from "@/lib/hub.functions";
import { MessageSquare, Flag, MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/hub/l/$id")({
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const startFn = useServerFn(startConversation);
  const reportFn = useServerFn(reportItem);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("listings")
        .select("*, hub_profiles(handle,bio,location,rating_avg,rating_count,business_count,verification_status)")
        .eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  async function handleInterest() {
    setBusy(true);
    try {
      const res = await startFn({ data: { listing_id: id } });
      nav({ to: "/app/hub/messages", search: { c: res.conversation_id } as any });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar conversa");
    } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data) return (
    <Card className="p-8 text-center">
      <p className="text-muted-foreground">Anúncio não encontrado ou removido.</p>
      <Link to="/app/hub"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button></Link>
    </Card>
  );

  const isOwner = me === data.author_id;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/app/hub" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-2 flex-wrap">
          <Badge variant={data.kind === "offer" ? "default" : "outline"}>
            {data.kind === "offer" ? "Oferta" : "Demanda"}
          </Badge>
          <Badge variant="secondary">{CATEGORY_LABEL[data.category] ?? data.category}</Badge>
        </div>
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <p className="whitespace-pre-wrap text-sm">{data.description}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-mono font-semibold text-primary">{formatPrice(data.price_cents)}</span>
          {data.location && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />{data.location}</span>}
          <span className="text-muted-foreground">{formatDistanceToNow(new Date(data.created_at), { addSuffix: true, locale: ptBR })}</span>
        </div>

        {data.hub_profiles && (
          <Card className="p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <Link to="/app/hub/u/$handle" params={{ handle: data.hub_profiles.handle }} className="font-medium hover:text-primary">
                  @{data.hub_profiles.handle}
                </Link>
                {data.hub_profiles.location && <p className="text-xs text-muted-foreground">{data.hub_profiles.location}</p>}
              </div>
              <ReputationBadges p={data.hub_profiles} />
            </div>
          </Card>
        )}

        <div className="flex gap-2 flex-wrap">
          {!isOwner && (
            <Button onClick={handleInterest} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              Tenho interesse
            </Button>
          )}
          <ReportDialog onSubmit={async (reason, detail) => {
            try { await reportFn({ data: { target_kind: "listing", target_id: id, reason, detail } }); toast.success("Denúncia enviada"); }
            catch (e: any) { toast.error(e?.message ?? "Falha ao denunciar"); }
          }} />
        </div>
      </Card>
    </div>
  );
}

function ReportDialog({ onSubmit }: { onSubmit: (reason: any, detail: string | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Flag className="h-4 w-4 mr-1" />Denunciar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Denunciar anúncio</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="spam">Spam</SelectItem>
              <SelectItem value="scam">Golpe</SelectItem>
              <SelectItem value="contact_leak">Divulgação de contato</SelectItem>
              <SelectItem value="offensive">Conteúdo ofensivo</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
          <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Descreva o problema (opcional)" maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await onSubmit(reason, detail || null); setBusy(false); setOpen(false); }}>Enviar denúncia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
