import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { rateConversation } from "@/lib/hub.functions";
import { Send, Star, MessageSquare, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/hub/messages")({
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  component: MessagesPage,
});

function MessagesPage() {
  const search = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(search.c ?? null);

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ["hub-conversations", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("conversations")
        .select("id,listing_id,buyer_id,seller_id,last_message_at,closed_at,listings(title)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.flatMap((r) => [r.buyer_id, r.seller_id])));
      if (ids.length) {
        const { data: profs } = await (supabase as any).from("profiles").select("id,full_name,email").in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        for (const r of rows) { r.buyer = map.get(r.buyer_id); r.seller = map.get(r.seller_id); }
      }
      return rows;
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!selected && convs[0]?.id) setSelected(convs[0].id);
  }, [selected, convs]);

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[500px]">
      <Card className="p-0 overflow-y-auto">
        <div className="p-3 border-b font-semibold text-sm">Conversas</div>
        {convs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
        <ul className="divide-y">
          {convs.map((c) => {
            const other = me === c.buyer_id ? c.seller : c.buyer;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className={cn("w-full text-left p-3 hover:bg-muted/50 transition-colors", selected === c.id && "bg-muted")}
                >
                  <div className="font-medium text-sm truncate">{other?.full_name ?? other?.email ?? "Usuário"}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.listings?.title ?? "Conversa direta"}</div>
                  {c.last_message_at && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {selected ? (
        <ChatPanel conversationId={selected} me={me ?? ""} conv={convs.find((c) => c.id === selected)} />
      ) : (
        <Card className="p-10 text-center flex items-center justify-center">
          <div>
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function ChatPanel({ conversationId, me, conv }: { conversationId: string; me: string; conv: any }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [contactShared, setContactShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rateFn = useServerFn(rateConversation);

  const { data: msgs = [] } = useQuery<any[]>({
    queryKey: ["hub-messages", conversationId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("messages").select("id,sender_id,body,flagged,contact_shared,created_at")
        .eq("conversation_id", conversationId).order("created_at").limit(500);
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`hub-msgs-${conversationId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      () => qc.invalidateQueries({ queryKey: ["hub-messages", conversationId] }),
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs.length]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId, sender_id: me, body: text.trim(), contact_shared: contactShared,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setText(""); setContactShared(false);
    qc.invalidateQueries({ queryKey: ["hub-messages", conversationId] });
  }

  const otherId = conv ? (me === conv.buyer_id ? conv.seller_id : conv.buyer_id) : null;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium truncate">{conv?.listings?.title ?? "Conversa"}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRateOpen(true)}><Star className="h-4 w-4 mr-1" />Avaliar</Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {msgs.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Envie a primeira mensagem. Combine detalhes aqui mesmo — só compartilhe contato quando fechar negócio.
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                mine ? "bg-primary text-primary-foreground" : "bg-background border",
              )}>
                <div>{m.body}</div>
                <div className={cn("text-[10px] mt-1 flex items-center gap-1", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {m.contact_shared && <ShieldCheck className="h-3 w-3" />}
                  {m.flagged && <AlertTriangle className="h-3 w-3 text-warning" />}
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t space-y-2 bg-background">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={contactShared} onChange={(e) => setContactShared(e.target.checked)} />
          Estou compartilhando meu contato agora (libera essa mensagem)
        </label>
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escreva sua mensagem..."
            rows={2}
            maxLength={2000}
            className="resize-none"
          />
          <Button onClick={send} disabled={busy || !text.trim()}><Send className="h-4 w-4" /></Button>
        </div>
        {!contactShared && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Telefones/URLs sem marcar como "compartilhando contato" são sinalizados automaticamente.
          </p>
        )}
      </div>

      {otherId && (
        <RateDialog
          open={rateOpen}
          onOpenChange={setRateOpen}
          onSubmit={async (stars, comment) => {
            try {
              await rateFn({ data: { conversation_id: conversationId, ratee_id: otherId, stars, comment: comment || null } });
              toast.success("Avaliação enviada!");
            } catch (e: any) { toast.error(e?.message ?? "Falha ao avaliar"); }
          }}
        />
      )}
    </Card>
  );
}

function RateDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (s: number, c: string) => Promise<void> }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Avaliar este contato</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center gap-1">
            {[1,2,3,4,5].map((n) => (
              <button key={n} type="button" onClick={() => setStars(n)}>
                <Star className={cn("h-8 w-8", n <= stars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Comente (opcional)" />
          <Badge variant="secondary" className="text-xs">Você só pode avaliar uma vez por conversa.</Badge>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await onSubmit(stars, comment); setBusy(false); onOpenChange(false); }}>Enviar avaliação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
