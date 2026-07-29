import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateHubProfile, submitVerification } from "@/lib/hub.functions";
import { ShieldCheck, Upload, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/hub/verification")({
  component: VerificationPage,
});

function VerificationPage() {
  const qc = useQueryClient();
  const updFn = useServerFn(updateHubProfile);
  const subFn = useServerFn(submitVerification);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["my-hub-profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await (supabase as any).from("hub_profiles").select("*").eq("id", me).maybeSingle();
      return data;
    },
  });

  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");

  // Sync form when data loads
  if (profile && handle === "" && profile.handle) {
    setHandle(profile.handle);
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
  }

  async function saveProfile() {
    setBusy(true);
    try {
      await updFn({ data: { handle: handle.trim().toLowerCase(), bio: bio.trim() || null, location: location.trim() || null } });
      toast.success("Perfil atualizado!");
      qc.invalidateQueries({ queryKey: ["my-hub-profile", me] });
    } catch (e: any) { toast.error(e?.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  async function uploadDoc(file: File) {
    if (!me) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${me}/verification-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("hub-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      await subFn({ data: { doc_path: path } });
      toast.success("Documento enviado! Aguarde a análise.");
      qc.invalidateQueries({ queryKey: ["my-hub-profile", me] });
    } catch (e: any) { toast.error(e?.message ?? "Falha ao enviar"); }
    finally { setUploading(false); }
  }

  const status = profile?.verification_status ?? "none";

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Meu perfil no Hub</h2>
        <div className="space-y-2">
          <Label htmlFor="handle">Apelido público (só letras minúsculas, números, _)</Label>
          <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} maxLength={24} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc">Localização</Label>
          <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: São Paulo — SP" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={500} placeholder="Fale um pouco sobre você / sua empresa" />
        </div>
        <Button onClick={saveProfile} disabled={busy}>{busy ? "Salvando..." : "Salvar perfil"}</Button>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Verificação de empresa/pessoa</h2>
        <div>
          Status:{" "}
          {status === "approved" && <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="secondary"><ShieldCheck className="h-3 w-3 mr-1" />Verificado</Badge>}
          {status === "pending" && <Badge variant="secondary">Em análise</Badge>}
          {status === "rejected" && <Badge variant="destructive">Rejeitado</Badge>}
          {status === "none" && <Badge variant="outline">Não enviado</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Envie um documento (CNPJ, RG, ou selfie com documento). Apenas você e a equipe do Stream Monitor têm acesso.
          Após aprovação, seu perfil ganha o selo <strong>Verificado</strong>.
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer border rounded-md px-4 py-2 hover:bg-muted/50 transition-colors w-fit">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="text-sm">{uploading ? "Enviando..." : "Escolher documento"}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }} />
        </label>
      </Card>
    </div>
  );
}
