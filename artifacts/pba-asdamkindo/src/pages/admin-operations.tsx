import {
  ArrowRight,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  LockKeyhole,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  getGetAdminOperationsQueryKey,
  getGetAdminFunnelQueryKey,
  useCreateAdminProgram,
  useDecideVerification,
  useGetAdminOperations,
  useGetAdminFunnel,
  useUpdateAdminEnrollment,
  useUpdateAdminMatching,
  useUpdateAdminProgram,
  useUpdateAdminTransaction,
  useResolveAdminTransactionReconciliation,
  useListAdminMatchings,
  getListAdminMatchingsQueryKey,
  listAdminMatchings,
  useGetAdminPilotEvaluationOptions,
  useGetAdminPilotEvaluation,
  getGetAdminPilotEvaluationQueryKey,
  useListAdminPilotFeedback,
  getListAdminPilotFeedbackQueryKey,
  useCreateAdminPilotFeedback,
  useResolveAdminPilotFeedback,
} from "@workspace/api-client-react";
import type {
  AdminOperations,
  Enrollment,
  Matching,
  ProgramInput,
  Transaction,
  Verification,
  AdminMatchingCandidate,
  AdminFunnel,
  AdminPilotFeedback,
} from "@workspace/api-client-react";
import { QueryState } from "@/components/ui-kit";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

type Tab = "funnel" | "pilot" | "verifications" | "programs" | "pipeline" | "revenue" | "audit";

const tabs: Array<{ id: Tab; label: string; icon: typeof ClipboardCheck }> = [
  { id: "funnel", label: "Funnel bisnis", icon: UsersRound },
  { id: "pilot", label: "Evaluasi pilot", icon: Sparkles },
  { id: "verifications", label: "Verifikasi", icon: FileCheck2 },
  { id: "programs", label: "Program & enrollment", icon: BookOpen },
  { id: "pipeline", label: "Matching / placement", icon: UsersRound },
  { id: "revenue", label: "Komisi & pendapatan", icon: ReceiptText },
  { id: "audit", label: "Audit log", icon: ShieldCheck },
];

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "paid" || status === "completed" || status === "placed" || status === "published" || status === "matched" || status === "resolved" || status === "on_track"
      ? "bg-accent/12 text-accent"
      : status === "rejected" || status === "cancelled" || status === "declined" || status === "refunded" || status === "mismatch" || status === "overdue" || status === "urgent"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/12 text-primary";
  const labels: Record<string, string> = {
    pending: "Menunggu",
    approved: "Disetujui",
    changes_requested: "Perlu revisi",
    rejected: "Ditolak",
    draft: "Draft",
    published: "Terbit",
    enrolled: "Terdaftar",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    new: "Baru",
    shortlisted: "Shortlist",
    interview: "Interview",
    placed: "Ditempatkan",
    declined: "Tidak lanjut",
    paid: "Dibayar",
    refunded: "Dikembalikan",
    matched: "Cocok",
    mismatch: "Tidak cocok",
    overdue: "Lewat SLA",
    approaching: "Mendekati SLA",
    on_track: "Sesuai SLA",
    urgent: "Prioritas segera",
    high: "Prioritas tinggi",
    normal: "Prioritas normal",
    resolved: "Diselesaikan",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{labels[status] ?? status}</span>;
}

function SummaryStrip({ summary }: { summary: AdminOperations["summary"] }) {
  const items = [
    ["Verifikasi tertunda", summary.pendingVerifications, "prioritas"],
    ["Mendekati SLA", summary.approachingVerifications, "≥ 54 jam"],
    ["Lewat SLA", summary.overdueVerifications, "perlu eskalasi"],
    ["Program aktif", summary.activePrograms, "terbit"],
    ["Enrollment aktif", summary.activeEnrollments, "berjalan"],
    ["Placement", summary.placements, "berhasil"],
    ["Pendapatan dibayar", formatIdr(summary.revenue), "settled"],
  ];
  items.push(
    ["Perlu rekonsiliasi", summary.reconciliationIssues, "mismatch / lewat SLA"],
    ["Lewat SLA settlement", summary.overdueSettlements, "perlu ditindaklanjuti"],
  );
  return <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-9">{items.map(([label, value, note], index) => <div className="bg-card p-5" key={label} data-testid={`admin-summary-${index}`}><p className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p><strong className="display-font mt-3 block text-2xl font-semibold">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>)}</div>;
}

export function AdminOperations() {
  const query = useGetAdminOperations();
  const [tab, setTab] = useState<Tab>("funnel");
  const [showProgramForm, setShowProgramForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const data = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAdminOperationsQueryKey() });
  const notifyError = () => toast({ variant: "destructive", title: "Aksi belum tersimpan", description: "Periksa koneksi lalu coba lagi." });
  const notifySuccess = (title: string) => toast({ title, description: "Perubahan tercatat di audit log." });

  const review = useDecideVerification({ mutation: { onSuccess: () => { refresh(); notifySuccess("Keputusan verifikasi tersimpan"); }, onError: notifyError } });
  const createProgram = useCreateAdminProgram({ mutation: { onSuccess: () => { refresh(); setShowProgramForm(false); notifySuccess("Program berhasil dibuat"); }, onError: notifyError } });
  const updateProgram = useUpdateAdminProgram({ mutation: { onSuccess: () => { refresh(); notifySuccess("Program diperbarui"); }, onError: notifyError } });
  const updateEnrollment = useUpdateAdminEnrollment({ mutation: { onSuccess: () => { refresh(); notifySuccess("Status enrollment diperbarui"); }, onError: notifyError } });
  const updateMatching = useUpdateAdminMatching({ mutation: { onSuccess: () => { refresh(); notifySuccess("Pipeline matching diperbarui"); }, onError: notifyError } });
  const updateTransaction = useUpdateAdminTransaction({ mutation: { onSuccess: () => { refresh(); notifySuccess("Status transaksi diperbarui"); }, onError: notifyError } });
  const resolveReconciliation = useResolveAdminTransactionReconciliation({ mutation: { onSuccess: () => { refresh(); notifySuccess("Rekonsiliasi diselesaikan"); }, onError: notifyError } });

  return <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="eyebrow text-accent">PBA operations / workbench</p><h1 className="display-font mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Pusat operasi</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Kerjakan verifikasi, program, pipeline peluang, dan transaksi dari satu antrean yang memiliki jejak audit.</p></div>
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-accent" /> {data?.permissions.canManageTransactions ? "Super admin" : "Admin operasional"}</div>
    </div>
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}>
      {data && <><SummaryStrip summary={data.summary} /><div className="mt-7 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-auto rounded-2xl border border-border bg-card p-2 lg:block lg:h-fit lg:space-y-1" aria-label="Menu operasi">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold lg:w-full ${tab === id ? "bg-sidebar text-sidebar-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} data-testid={`tab-admin-${id}`}><Icon size={17} /><span>{label}</span>{id === "verifications" && data.summary.pendingVerifications > 0 && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{data.summary.pendingVerifications}</span>}</button>)}</nav>
        <section className="min-w-0">
          {tab === "verifications" && <VerificationQueue items={data.verifications} mutation={review} />}
          {tab === "funnel" && <FunnelWorkspace />}
          {tab === "pilot" && <PilotWorkspace />}
          {tab === "programs" && <ProgramWorkspace data={data} showForm={showProgramForm} setShowForm={setShowProgramForm} createMutation={createProgram} updateMutation={updateProgram} updateEnrollment={updateEnrollment} />}
          {tab === "pipeline" && <PipelineWorkspace mutation={updateMatching} />}
          {tab === "revenue" && <RevenueWorkspace items={data.transactions} canManage={data.permissions.canManageTransactions} mutation={updateTransaction} resolveMutation={resolveReconciliation} />}
          {tab === "audit" && <AuditWorkspace items={data.auditLogs} canView={data.permissions.canViewAudit} />}
        </section>
      </div></>}
    </QueryState>
  </div>;
}

function FunnelWorkspace() {
  const query = useGetAdminFunnel();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetAdminFunnelQueryKey() });
    await query.refetch();
  };
  const metrics = query.data?.metrics ?? [];

  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
    <SectionHeader
      eyebrow="Business funnel"
      title="Funnel bisnis"
      copy="Ringkasan agregat operasional; definisi setiap angka tersedia untuk menjaga interpretasi tetap konsisten."
      action={<button onClick={refresh} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold hover:border-primary disabled:opacity-50" data-testid="button-refresh-funnel"><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />{query.isFetching ? "Memuat..." : "Refresh"}</button>}
    />
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}>
      {metrics.length === 0 ? <Empty label="Belum ada data funnel" /> : <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric: AdminFunnel["metrics"][number]) => <article key={metric.key} className="rounded-xl border border-border bg-background p-4" data-testid={`funnel-metric-${metric.key}`}>
          <p className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{metric.label}</p>
          <strong className="display-font mt-2 block text-3xl font-semibold">{metric.value.toLocaleString("id-ID")}</strong>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{metric.definition}</p>
        </article>)}
      </div>}
    </QueryState>
  </div>;
}

function SectionHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end"><div><p className="eyebrow text-accent">{eyebrow}</p><h2 className="mt-2 text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>{action}</div>;
}

function PilotWorkspace() {
  const optionsQuery = useGetAdminPilotEvaluationOptions();
  
  const [programId, setProgramId] = useState<string>("");
  const [requirementId, setRequirementId] = useState<string>("");

  useEffect(() => {
    if (optionsQuery.data) {
      if (!programId && optionsQuery.data.programs.length > 0) {
        setProgramId(optionsQuery.data.programs[0].id);
      }
      if (!requirementId && optionsQuery.data.requirements.length > 0) {
        setRequirementId(optionsQuery.data.requirements[0].id);
      }
    }
  }, [optionsQuery.data, programId, requirementId]);

  const enabled = Boolean(programId && requirementId);
  const evalQuery = useGetAdminPilotEvaluation(
    { programId, requirementId }, 
    { query: { enabled, queryKey: getGetAdminPilotEvaluationQueryKey({programId, requirementId}) } }
  );
  const feedbackQuery = useListAdminPilotFeedback(
    { programId, requirementId }, 
    { query: { enabled, queryKey: getListAdminPilotFeedbackQueryKey({programId, requirementId}) } }
  );

  return (
    <div className="rounded-2xl border border-primary/20 bg-sidebar p-5 sm:p-7 shadow-lg">
      <div className="flex flex-col justify-between gap-4 border-b border-primary/20 pb-5 sm:flex-row sm:items-end">
         <div>
           <p className="eyebrow text-primary">Pilot Evaluation</p>
           <h2 className="mt-2 text-xl font-bold text-sidebar-foreground">Evaluasi Program Pilot</h2>
           <p className="mt-1 text-sm text-sidebar-foreground/70">Ukur hasil pilot 20 peserta dengan partner perusahaan.</p>
         </div>
         <div className="flex items-center gap-3">
           <button 
              onClick={() => { evalQuery.refetch(); feedbackQuery.refetch(); }} 
              disabled={!enabled || evalQuery.isFetching || feedbackQuery.isFetching} 
              className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:border-primary disabled:opacity-50"
              data-testid="button-refresh-pilot"
           >
               <RefreshCw size={14} className={evalQuery.isFetching || feedbackQuery.isFetching ? "animate-spin" : ""} />
               {evalQuery.isFetching || feedbackQuery.isFetching ? "Memuat..." : "Refresh"}
           </button>
         </div>
      </div>
      
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
         <label>
           <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-primary">Program Pelatihan</span>
           <select 
              value={programId} 
              onChange={e => setProgramId(e.target.value)} 
               disabled={optionsQuery.isLoading || optionsQuery.isError}
              className="w-full rounded-lg border border-primary/30 bg-black/20 px-3 py-2.5 text-sm font-semibold text-sidebar-foreground outline-none focus:border-primary"
               data-testid="select-pilot-program"
           >
              <option value="">Pilih program Bimtek</option>
              {optionsQuery.data?.programs.map((p) => (
               <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
             ))}
           </select>
         </label>
         <label>
           <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-primary">Kebutuhan Perusahaan</span>
           <select 
              value={requirementId} 
              onChange={e => setRequirementId(e.target.value)} 
               disabled={optionsQuery.isLoading || optionsQuery.isError}
              className="w-full rounded-lg border border-primary/30 bg-black/20 px-3 py-2.5 text-sm font-semibold text-sidebar-foreground outline-none focus:border-primary"
               data-testid="select-pilot-requirement"
           >
              <option value="">Pilih kebutuhan perusahaan</option>
              {optionsQuery.data?.requirements.map((r) => (
               <option key={r.id} value={r.id}>{r.title} — {r.companyName}</option>
             ))}
           </select>
         </label>
      </div>
       {optionsQuery.isError && <p className="mt-3 text-xs font-semibold text-destructive">Opsi pilot belum dapat dimuat. Coba refresh halaman.</p>}
       {!optionsQuery.isLoading && optionsQuery.data && (optionsQuery.data.programs.length === 0 || optionsQuery.data.requirements.length === 0) && <p className="mt-3 text-xs text-sidebar-foreground/70">Dashboard memerlukan setidaknya satu program kategori Bimtek berstatus terbit dan satu kebutuhan perusahaan berstatus terbuka.</p>}

      <div className="mt-8">
        <QueryState loading={evalQuery.isLoading} error={evalQuery.isError} retry={() => evalQuery.refetch()}>
          {evalQuery.data && (
            <div className="space-y-8">
              
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                 <div className="flex items-center gap-4">
                   <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                     <UsersRound size={20} />
                   </div>
                   <div className="min-w-0 flex-1">
                     <p className="text-base font-bold text-sidebar-foreground">{evalQuery.data.cohort.companyName} Pilot Cohort</p>
                     <p className="mt-1 text-xs text-sidebar-foreground/70">{evalQuery.data.cohort.programName} ➔ {evalQuery.data.cohort.requirementTitle}</p>
                   </div>
                   <div className="shrink-0 text-right">
                      <p className="font-mono text-3xl font-bold text-primary">{evalQuery.data.cohort.participantCount}<span className="text-sm text-sidebar-foreground/50">/{evalQuery.data.targetParticipants}</span></p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Peserta</p>
                   </div>
                 </div>
              </div>

              <div>
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-primary">Pipeline Konversi</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                   {evalQuery.data.funnel.map((f) => (
                     <div key={f.key} className="group relative overflow-hidden rounded-xl border border-primary/20 bg-black/10 p-4 transition-colors hover:border-primary/40">
                        <div className="absolute inset-0 translate-y-[100%] bg-primary/5 transition-transform group-hover:translate-y-0" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{f.label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                          <strong className="font-mono text-3xl font-bold text-sidebar-foreground">{f.count}</strong>
                          <span className="text-sm font-semibold text-primary">{f.percentage}%</span>
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-sidebar-foreground/50">{f.definition}</p>
                     </div>
                   ))}
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-primary">Indikator Kinerja (KPI)</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                   {evalQuery.data.metrics.map((m) => (
                     <div key={m.key} className="flex flex-col rounded-xl border border-primary/20 bg-black/10 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{m.label}</p>
                        <div className="mt-2 flex items-baseline gap-1">
                          <strong className="font-mono text-2xl font-bold text-sidebar-foreground">{m.value ?? "N/A"}</strong>
                          {m.value !== null && m.denominator !== null && m.denominator > 0 && <span className="text-xs font-bold text-sidebar-foreground/50">/{m.denominator}</span>}
                          {m.unit === 'percentage' && <span className="text-sm font-semibold text-primary">%</span>}
                          {m.unit === 'hours' && <span className="ml-1 text-xs font-semibold text-primary">jam</span>}
                        </div>
                        <p className="mt-auto pt-3 text-[10px] leading-relaxed text-sidebar-foreground/50">{m.definition}</p>
                     </div>
                   ))}
                </div>
              </div>

              <PilotFeedback 
                 programId={programId} 
                 requirementId={requirementId} 
                 feedbackQuery={feedbackQuery} 
              />
              
            </div>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function PilotFeedback({
  programId,
  requirementId,
  feedbackQuery,
}: {
  programId: string;
  requirementId: string;
  feedbackQuery: UseQueryResult<AdminPilotFeedback[], unknown>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidatePilot = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminPilotFeedbackQueryKey({ programId, requirementId }) });
    queryClient.invalidateQueries({ queryKey: getGetAdminPilotEvaluationQueryKey({ programId, requirementId }) });
  };
  
  const createMutation = useCreateAdminPilotFeedback({
    mutation: {
      onSuccess: () => {
        toast({ title: "Catatan ditambahkan" });
        setNewNote("");
        invalidatePilot();
      },
      onError: () => toast({ variant: "destructive", title: "Catatan belum tersimpan", description: "Periksa isian dan coba lagi." }),
    }
  });

  const resolveMutation = useResolveAdminPilotFeedback({
    mutation: {
      onSuccess: () => {
        toast({ title: "Catatan diselesaikan" });
        invalidatePilot();
      },
      onError: () => toast({ variant: "destructive", title: "Catatan belum diselesaikan", description: "Coba lagi setelah memuat ulang data." }),
    }
  });

  const [newNote, setNewNote] = useState("");

  const items = feedbackQuery.data ?? [];

  return (
    <div className="mt-8">
       <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-primary">Catatan Operasional & Kendala · {items.filter((item) => item.status === "open").length} terbuka</h3>
       
       <QueryState loading={feedbackQuery.isLoading} error={feedbackQuery.isError} retry={() => feedbackQuery.refetch()}>
       <div className="space-y-3">
         {items.length === 0 ? (
           <div className="rounded-xl border border-dashed border-primary/20 p-6 text-center text-sm text-primary/50">
             Belum ada catatan operasional.
           </div>
         ) : (
           items.map((item) => (
             <div key={item.id} className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-start ${item.status === 'open' ? 'border-primary/40 bg-primary/10' : 'border-primary/20 bg-black/10 opacity-75'}`} data-testid={`pilot-feedback-${item.id}`}>
                <div className="min-w-0 flex-1">
                   <div className="mb-1.5 flex items-center gap-2">
                     <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${item.status === 'open' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}`}>
                       {item.status === 'open' ? 'Terbuka' : 'Selesai'}
                     </span>
                     <span className="text-[10px] text-sidebar-foreground/50">{formatDate(item.createdAt)}</span>
                   </div>
                   <p className="text-sm leading-relaxed text-sidebar-foreground">{item.note}</p>
                </div>
                {item.status === 'open' && (
                  <button 
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: item.id, data: { status: 'resolved' } })}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-black/20 px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/20 hover:text-primary disabled:opacity-50"
                    data-testid={`button-resolve-pilot-feedback-${item.id}`}
                  >
                    <Check size={12} /> Selesaikan
                  </button>
                )}
             </div>
           ))
         )}
       </div>
       </QueryState>

       <form 
         onSubmit={e => {
           e.preventDefault();
           if (newNote.trim().length < 3) return;
           createMutation.mutate({ data: { programId, requirementId, note: newNote.trim() } });
         }} 
         className="mt-4 flex flex-col gap-3 sm:flex-row"
       >
         <input 
           type="text" 
           value={newNote}
           onChange={e => setNewNote(e.target.value)}
           minLength={3}
           maxLength={500}
           placeholder="Ringkasan non-sensitif; jangan tulis nama atau kontak peserta..." 
           className="flex-1 rounded-lg border border-primary/30 bg-black/20 px-4 py-2.5 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/30 focus:border-primary"
           aria-label="Ringkasan feedback pilot"
           data-testid="input-pilot-feedback"
         />
         <button 
           type="submit" 
           disabled={newNote.trim().length < 3 || createMutation.isPending}
           className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
           data-testid="button-create-pilot-feedback"
         >
           {createMutation.isPending ? "Menyimpan..." : "Kirim"}
         </button>
       </form>
    </div>
  );
}

function VerificationQueue({ items, mutation }: { items: Verification[]; mutation: ReturnType<typeof useDecideVerification> }) {
  const [selected, setSelected] = useState<Verification | null>(null);
  const [note, setNote] = useState("");
  const pending = items.filter((item) => item.slaStatus !== "resolved");
  const orderedItems = useMemo(() => {
    const priorityRank = { urgent: 0, high: 1, normal: 2 };
    return [...items].sort((a, b) => {
      const priorityDifference = priorityRank[a.slaPriority] - priorityRank[b.slaPriority];
      return priorityDifference || b.pendingAgeHours - a.pendingAgeHours;
    });
  }, [items]);
  const formatAge = (hours: number) => hours < 24 ? `${hours} jam` : `${Math.floor(hours / 24)} hari ${Math.round(hours % 24)} jam`;
  const decide = (status: "approved" | "changes_requested" | "rejected") => {
    if (!selected || note.trim().length < 3) return;
    mutation.mutate({ id: selected.id, data: { status, note: note.trim() } }, { onSuccess: () => { setSelected(null); setNote(""); } });
  };
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
    <SectionHeader eyebrow="Verification queue" title="Profil, dokumen, dan bukti kompetensi" copy={`${pending.length} item membutuhkan keputusan Admin PBA.`} />
    {items.length === 0 ? <Empty label="Belum ada item verifikasi" /> : <div className="mt-5 space-y-3">{orderedItems.map((item) => <div key={item.id} className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${item.slaStatus === "overdue" ? "border-destructive/35 bg-destructive/[.03]" : item.slaStatus === "approaching" ? "border-primary/35 bg-primary/[.03]" : "border-border"}`} data-testid={`verification-${item.id}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.slaPriority === "urgent" ? "bg-destructive/10 text-destructive" : item.slaPriority === "high" ? "bg-primary/10 text-primary" : "bg-muted text-accent"}`}>{item.slaStatus === "overdue" ? <AlertTriangle size={19} /> : <FileCheck2 size={19} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.subjectName}</strong><StatusBadge status={item.status} />{item.slaStatus !== "resolved" && <StatusBadge status={item.slaStatus} />}</div><p className="mt-1 text-xs text-muted-foreground">{item.evidenceType} · {item.subjectType} · diajukan {formatDate(item.submittedAt)}</p>{item.slaStatus !== "resolved" ? <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold"><span className={`inline-flex items-center gap-1.5 ${item.slaPriority === "urgent" ? "text-destructive" : item.slaPriority === "high" ? "text-primary" : "text-muted-foreground"}`}><Timer size={14} /> {formatAge(item.pendingAgeHours)} tertunda</span><span className="text-muted-foreground">Batas SLA {formatDate(item.slaDueAt)}</span><StatusBadge status={item.slaPriority} /></div> : <p className="mt-2 text-xs text-muted-foreground">Diputuskan {formatDate(item.reviewedAt)}</p>}{item.reviewNote && <p className="mt-2 text-xs text-muted-foreground">Catatan: {item.reviewNote}</p>}</div>{item.slaStatus !== "resolved" ? <button onClick={() => { setSelected(item); setNote(""); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-review-${item.id}`}>Tinjau <ArrowRight size={14} /></button> : null}</div>)}</div>}
    {selected && <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-5" data-testid="verification-review-panel"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-primary">Keputusan audit</p><h3 className="mt-2 font-bold">{selected.subjectName}</h3><p className="mt-1 text-xs text-muted-foreground">Catatan wajib diisi untuk menjaga konteks keputusan.</p></div><button onClick={() => setSelected(null)} aria-label="Tutup review"><X size={18} /></button></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: Dokumen sesuai dengan data profil..." className="mt-4 min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary" data-testid="input-review-note" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button disabled={mutation.isPending || note.trim().length < 3} onClick={() => decide("changes_requested")} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50">Minta revisi</button><button disabled={mutation.isPending || note.trim().length < 3} onClick={() => decide("rejected")} className="rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50">Tolak</button><button disabled={mutation.isPending || note.trim().length < 3} onClick={() => decide("approved")} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50">Setujui</button></div></div>}
  </div>;
}

function ProgramWorkspace({ data, showForm, setShowForm, createMutation, updateMutation, updateEnrollment }: { data: AdminOperations; showForm: boolean; setShowForm: (value: boolean) => void; createMutation: ReturnType<typeof useCreateAdminProgram>; updateMutation: ReturnType<typeof useUpdateAdminProgram>; updateEnrollment: ReturnType<typeof useUpdateAdminEnrollment> }) {
  return <div className="space-y-6"><div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Program operations" title="Program, jadwal, instruktur, dan kapasitas" copy={`${data.programs.length} program terdaftar · ${data.enrollments.length} enrollment tercatat`} action={<button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground" data-testid="button-new-program">{showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? "Tutup form" : "Program baru"}</button>} />{showForm && <ProgramForm mutation={createMutation} />}{data.programs.length === 0 ? <Empty label="Belum ada program" /> : <div className="mt-5 grid gap-3">{data.programs.map((program) => <div key={program.id} className="rounded-xl border border-border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><strong>{program.name}</strong><StatusBadge status={program.status} /></div><p className="mt-1 text-xs text-muted-foreground">{program.schedule} · {program.duration} · {program.instructor}</p></div><button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ id: program.id, data: { status: program.status === "published" ? "draft" : "published" } })} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary disabled:opacity-50" data-testid={`button-toggle-program-${program.id}`}>{program.status === "published" ? "Jadikan draft" : "Terbitkan"} <ChevronDown size={14} /></button></div><div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs"><div><p className="text-muted-foreground">Harga</p><strong className="mt-1 block">{formatIdr(program.price)}</strong></div><div><p className="text-muted-foreground">Kapasitas</p><strong className="mt-1 block">{program.capacity}</strong></div><div><p className="text-muted-foreground">Selesai</p><strong className="mt-1 block">{program.completionCount}</strong></div></div></div>)}</div>}</div><EnrollmentQueue items={data.enrollments} mutation={updateEnrollment} /></div>;
}

function ProgramForm({ mutation }: { mutation: ReturnType<typeof useCreateAdminProgram> }) {
  const [form, setForm] = useState<ProgramInput>({ name: "", category: "Bimtek", mode: "Hybrid", schedule: "", duration: "", price: 0, instructor: "", description: "", status: "draft", capacity: 20 });
  const set = (key: keyof ProgramInput, value: string | number) => setForm((current) => ({ ...current, [key]: key === "price" || key === "capacity" ? Number(value) : value }));
  return <form onSubmit={(event) => { event.preventDefault(); mutation.mutate({ data: form }); }} className="mt-5 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2" data-testid="form-new-program">{(["name", "category", "mode", "schedule", "duration", "instructor", "description"] as const).map((key) => <label key={key} className={key === "description" ? "sm:col-span-2" : ""}><span className="mb-1 block text-xs font-bold capitalize">{key === "name" ? "Nama program" : key}</span>{key === "description" ? <textarea value={form[key]} onChange={(event) => set(key, event.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-background p-2.5 text-sm" required /> : <input value={form[key]} onChange={(event) => set(key, event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" required />}</label>)}<label><span className="mb-1 block text-xs font-bold">Harga (Rp)</span><input type="number" min="0" value={form.price} onChange={(event) => set("price", event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></label><label><span className="mb-1 block text-xs font-bold">Kapasitas</span><input type="number" min="1" value={form.capacity} onChange={(event) => set("capacity", event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" /></label><div className="flex items-end sm:col-span-2"><button disabled={mutation.isPending} className="rounded-lg bg-sidebar px-4 py-2.5 text-sm font-bold text-sidebar-foreground disabled:opacity-50" type="submit">{mutation.isPending ? "Menyimpan..." : "Simpan sebagai draft"}</button></div></form>;
}

function EnrollmentQueue({ items, mutation }: { items: Enrollment[]; mutation: ReturnType<typeof useUpdateAdminEnrollment> }) {
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Enrollment & completion" title="Kehadiran dan penyelesaian belajar" copy="Setiap perubahan status tercatat sebagai aktivitas audit." />{items.length === 0 ? <Empty label="Belum ada enrollment" /> : <div className="mt-5 divide-y divide-border">{items.map((item) => <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><strong className="text-sm">{item.memberName}</strong><p className="mt-1 text-xs text-muted-foreground">{item.programName} · dibuat {formatDate(item.createdAt)}</p></div><StatusBadge status={item.status} /><select value={item.status} onChange={(event) => mutation.mutate({ id: item.id, data: { status: event.target.value as Enrollment["status"], note: "Status diperbarui oleh Admin PBA." } })} className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold" aria-label={`Status enrollment ${item.memberName}`}><option value="pending">Menunggu</option><option value="enrolled">Terdaftar</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></div>)}</div>}</div>;
}

function AdminMatchingCard({ item, mutation, onSuccess }: { item: AdminMatchingCandidate; mutation: ReturnType<typeof useUpdateAdminMatching>; onSuccess: () => void }) {
  const pending = mutation.isPending;

  const changeStatus = (status: string) => {
    if (!item.matchingId) return;
    mutation.mutate(
      { id: item.matchingId, data: { status: status as any, note: "Status diperbarui oleh Admin PBA." } },
      { onSuccess }
    );
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex items-start gap-4 border-b border-border pb-4 mb-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
          {item.companyName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
            {item.companyName}
          </p>
          <h3 className="text-sm font-bold leading-tight">{item.requirementTitle}</h3>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sidebar text-lg font-bold text-primary">
          {item.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold">{item.name}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {item.domicile}
            </span>
            <span>{item.experienceYears} tahun pengalaman</span>
            <span>{item.expertise}</span>
            {item.jobTitle && <span>• {item.jobTitle}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className={`px-2 py-0.5 rounded-full ${item.skkLevel > 0 ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
              SKK Level {item.skkLevel}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sidebar/10 text-sidebar">
              {item.availabilityStatus.replace(/_/g, " ")}
            </span>
            <span className={`px-2 py-0.5 rounded-full ${item.verificationStatus === "verified" ? "bg-primary/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              Verifikasi: {item.verificationStatus}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-3xl font-bold text-accent">
            {item.score}
            <span className="text-lg text-muted-foreground">/100</span>
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Match Score</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center divide-x divide-border border-y border-border py-3">
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Job Title</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.jobTitle ?? 0}
            <span className="text-[10px] text-muted-foreground">/25</span>
          </p>
        </div>
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">SKK Level</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.skkLevel ?? 0}
            <span className="text-[10px] text-muted-foreground">/20</span>
          </p>
        </div>
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Kompetensi</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.requiredCompetencies ?? 0}
            <span className="text-[10px] text-muted-foreground">/20</span>
          </p>
        </div>
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Pengalaman</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.experience ?? 0}
            <span className="text-[10px] text-muted-foreground">/15</span>
          </p>
        </div>
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Lokasi</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.location ?? 0}
            <span className="text-[10px] text-muted-foreground">/10</span>
          </p>
        </div>
        <div className="px-2">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Kesiapan</p>
          <p className="font-mono font-bold text-sm">
            {item.scoreBreakdown?.availability ?? 0}
            <span className="text-[10px] text-muted-foreground">/10</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <Check size={14} className="text-accent" /> Kompetensi Terpenuhi
          </p>
          {item.matchedCompetencies && item.matchedCompetencies.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {item.matchedCompetencies.map((c) => (
                <li key={c} className="bg-accent/10 text-accent px-2 py-0.5 rounded text-[11px] font-semibold">
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">-</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <X size={14} className="text-destructive" /> Belum Terpenuhi
          </p>
          {item.unmetCompetencies && item.unmetCompetencies.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {item.unmetCompetencies.map((c) => (
                <li key={c} className="bg-destructive/10 text-destructive px-2 py-0.5 rounded text-[11px] font-semibold">
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">-</p>
          )}
        </div>
      </div>

      {item.matchReasons && item.matchReasons.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="eyebrow text-accent">Mengapa cocok</p>
          <ul className="mt-3 space-y-2">
            {item.matchReasons.map((reason, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <Check className="mt-0.5 shrink-0 text-accent" size={15} />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          {item.matchingId ? "Tersimpan dalam pipeline" : "Belum masuk shortlist"}
        </span>

        {item.matchingId && (
          <select
            value={item.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold outline-none"
          >
            <option value="new">Baru</option>
            <option value="review">Ditinjau</option>
            <option value="shortlisted">Shortlist</option>
            <option value="interview">Interview</option>
            <option value="placed">Ditempatkan</option>
            <option value="declined">Tidak dilanjutkan</option>
          </select>
        )}
      </div>
    </article>
  );
}

function PipelineWorkspace({ mutation }: { mutation: ReturnType<typeof useUpdateAdminMatching> }) {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState({ search: "", status: "all", minScore: "", location: "", skkLevel: "", experienceMin: "", availability: "", verificationStatus: "" });
  const [filters, setFilters] = useState(draftFilters);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [refreshing, setRefreshing] = useState(false);

  const queryParams = {
    page,
    pageSize,
    search: filters.search || undefined,
    status: filters.status !== "all" ? (filters.status as any) : undefined,
    minScore: filters.minScore ? Number(filters.minScore) : undefined,
    location: filters.location || undefined,
    skkLevel: filters.skkLevel ? Number(filters.skkLevel) : undefined,
    experienceMin: filters.experienceMin ? Number(filters.experienceMin) : undefined,
    availability: (filters.availability || undefined) as any,
    verificationStatus: (filters.verificationStatus || undefined) as any,
  };

  const matchingsQuery = useListAdminMatchings(queryParams, {
    query: {
      queryKey: getListAdminMatchingsQueryKey(queryParams),
      refetchOnMount: "always",
    }
  });

  const pageData = matchingsQuery.data;
  const items = pageData?.items ?? [];

  const handleRefresh = async (params = queryParams) => {
    setRefreshing(true);
    try {
      const refreshed = await listAdminMatchings({ ...params, refresh: true });
      queryClient.setQueryData(getListAdminMatchingsQueryKey(params), refreshed);
    } finally {
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    const nextFilters = { ...draftFilters };
    const nextParams = {
      ...queryParams,
      page: 1,
      search: nextFilters.search || undefined,
      status: nextFilters.status !== "all" ? (nextFilters.status as typeof queryParams.status) : undefined,
      minScore: nextFilters.minScore ? Number(nextFilters.minScore) : undefined,
      location: nextFilters.location || undefined,
      skkLevel: nextFilters.skkLevel ? Number(nextFilters.skkLevel) : undefined,
      experienceMin: nextFilters.experienceMin ? Number(nextFilters.experienceMin) : undefined,
      availability: (nextFilters.availability || undefined) as typeof queryParams.availability,
      verificationStatus: (nextFilters.verificationStatus || undefined) as typeof queryParams.verificationStatus,
    };
    setFilters(nextFilters);
    setPage(1);
    void handleRefresh(nextParams);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
      <SectionHeader eyebrow="Opportunity pipeline" title="Matching, shortlist, hingga placement" copy="Tinjau semua kecocokan lintas kebutuhan perusahaan dari satu tampilan terpusat." />

      <div className="bg-muted/30 border border-border p-4 rounded-xl mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="text-xs font-bold mb-1 block">Pencarian</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-muted-foreground" size={14} />
              <Input value={draftFilters.search} onChange={e => setDraftFilters({...draftFilters, search: e.target.value})} placeholder="Nama, keahlian..." className="pl-8 h-9 text-sm" />
            </div>
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Status Kandidat</span>
            <select value={draftFilters.status} onChange={e => setDraftFilters({...draftFilters, status: e.target.value})} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none">
              <option value="all">Semua status</option>
              <option value="new">Baru</option>
              <option value="review">Ditinjau</option>
              <option value="shortlisted">Shortlist</option>
              <option value="interview">Interview</option>
              <option value="placed">Ditempatkan</option>
              <option value="declined">Tidak dilanjutkan</option>
            </select>
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Lokasi</span>
            <Input value={draftFilters.location} onChange={e => setDraftFilters({...draftFilters, location: e.target.value})} placeholder="Kota/Provinsi" className="h-9 text-sm" />
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Verifikasi</span>
            <select value={draftFilters.verificationStatus} onChange={e => setDraftFilters({...draftFilters, verificationStatus: e.target.value})} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none">
              <option value="">Semua</option>
              <option value="verified">Terverifikasi</option>
              <option value="pending">Menunggu</option>
              <option value="unverified">Belum verifikasi</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4 pt-4 border-t border-border">
          <label>
            <span className="text-xs font-bold mb-1 block">Min Score (0-100)</span>
            <Input type="number" min={0} max={100} value={draftFilters.minScore} onChange={e => setDraftFilters({...draftFilters, minScore: e.target.value})} placeholder="0" className="h-9 text-sm" />
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Min Level SKK (1-9)</span>
            <Input type="number" min={0} max={9} value={draftFilters.skkLevel} onChange={e => setDraftFilters({...draftFilters, skkLevel: e.target.value})} placeholder="0" className="h-9 text-sm" />
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Min Pengalaman (Tahun)</span>
            <Input type="number" min={0} value={draftFilters.experienceMin} onChange={e => setDraftFilters({...draftFilters, experienceMin: e.target.value})} placeholder="0" className="h-9 text-sm" />
          </label>
          <label>
            <span className="text-xs font-bold mb-1 block">Ketersediaan</span>
            <select value={draftFilters.availability} onChange={e => setDraftFilters({...draftFilters, availability: e.target.value})} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none">
              <option value="">Semua</option>
              <option value="available">Tersedia</option>
              <option value="open_to_offer">Terbuka penawaran</option>
              <option value="unavailable">Tidak tersedia</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={applyFilters} disabled={refreshing} className="h-9 px-6 bg-primary text-primary-foreground text-sm font-bold rounded-lg flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50">
            <SlidersHorizontal size={14} className={refreshing ? "animate-pulse" : ""} />
            {refreshing ? "Memuat..." : "Terapkan Filter & Refresh"}
          </button>
        </div>
      </div>

      <QueryState loading={matchingsQuery.isLoading} error={matchingsQuery.isError} retry={handleRefresh}>
        {items.length === 0 ? <Empty label="Belum ada matching yang sesuai kriteria filter" /> : (
          <div className="mt-6 space-y-6">
            {items.map(item => (
              <AdminMatchingCard
                key={item.matchingId ?? item.candidateId}
                item={item}
                mutation={mutation}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/matchings"] })}
              />
            ))}
          </div>
        )}

        {pageData && pageData.totalPages > 1 && (
           <div className="flex justify-center items-center gap-4 mt-8 pt-6 border-t border-border">
             <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-9 px-4 border border-border rounded-lg text-sm font-bold hover:bg-muted disabled:opacity-50">Sebelumnya</button>
             <span className="text-sm font-bold">Halaman {pageData.page} dari {pageData.totalPages}</span>
             <button onClick={() => setPage(p => Math.min(pageData.totalPages, p + 1))} disabled={page === pageData.totalPages} className="h-9 px-4 border border-border rounded-lg text-sm font-bold hover:bg-muted disabled:opacity-50">Berikutnya</button>
           </div>
        )}
      </QueryState>
    </div>
  );
}

function RevenueWorkspace({ items, canManage, mutation, resolveMutation }: {
  items: Transaction[];
  canManage: boolean;
  mutation: ReturnType<typeof useUpdateAdminTransaction>;
  resolveMutation: ReturnType<typeof useResolveAdminTransactionReconciliation>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const flagLabels: Record<string, string> = {
    settlement_missing: "Settlement bank belum masuk",
    amount_mismatch: "Nominal tidak cocok",
    settlement_sla_breached: "Melewati SLA 7 hari",
  };

  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
    <SectionHeader
      eyebrow="Revenue control"
      title="Rekonsiliasi invoice dan settlement"
      copy={canManage ? "Periksa angka invoice, payout komisi, refund, dan settlement bank. Penyelesaian hanya tersedia untuk super admin." : "Admin dapat meninjau detail dan anomali; penyelesaian rekonsiliasi membutuhkan super admin."}
    />
    {items.length === 0 ? <Empty label="Belum ada transaksi" /> : <div className="mt-5 space-y-3">{items.map((item) => {
      const note = notes[item.id]?.trim() ?? "";
      const hasIssue = item.reconciliationStatus === "mismatch" || item.reconciliationStatus === "overdue" || item.reconciliationStatus === "pending";
      return <article key={item.id} className={`rounded-xl border p-4 ${hasIssue ? "border-primary/35" : "border-border"}`} data-testid={`transaction-${item.id}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{item.customerName}</strong>
              <StatusBadge status={item.status} />
              <StatusBadge status={item.reconciliationStatus} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.kind} · ref {item.referenceId} · invoice {item.invoiceNumber} · {formatDate(item.occurredAt)}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right text-xs sm:grid-cols-3">
            <div><p className="text-muted-foreground">Invoice</p><strong className="mt-1 block">{formatIdr(item.invoiceAmount)}</strong></div>
            <div><p className="text-muted-foreground">Net settlement</p><strong className={`mt-1 block ${item.settlementDifference && Math.abs(item.settlementDifference) > 0.01 ? "text-destructive" : "text-accent"}`}>{item.netSettlement === null ? "Belum masuk" : formatIdr(item.netSettlement)}</strong></div>
            <div><p className="text-muted-foreground">Selisih</p><strong className={`mt-1 block ${item.settlementDifference && Math.abs(item.settlementDifference) > 0.01 ? "text-destructive" : ""}`}>{item.settlementDifference === null ? "—" : formatIdr(item.settlementDifference)}</strong></div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-5">
          <div><p className="text-muted-foreground">Fee</p><strong className="mt-1 block">{formatIdr(item.feeAmount)}</strong></div>
          <div><p className="text-muted-foreground">Payout komisi</p><strong className="mt-1 block">{formatIdr(item.commission)}</strong></div>
          <div><p className="text-muted-foreground">Refund</p><strong className="mt-1 block">{formatIdr(item.refundAmount)}</strong></div>
          <div><p className="text-muted-foreground">Net yang diharapkan</p><strong className="mt-1 block">{formatIdr(item.expectedSettlement)}</strong></div>
          <div><p className="text-muted-foreground">Jatuh tempo SLA</p><strong className="mt-1 block">{formatDate(item.settlementDueAt)}</strong></div>
        </div>

        {item.reconciliationFlags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.reconciliationFlags.map((flag) => <span key={flag} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{flagLabels[flag] ?? flag}</span>)}</div>}

        <button onClick={() => setExpanded((current) => ({ ...current, [item.id]: !current[item.id] }))} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" aria-expanded={expanded[item.id] ?? false}>
          {expanded[item.id] ? "Sembunyikan detail" : "Lihat detail invoice & settlement"} <ChevronDown size={14} className={expanded[item.id] ? "rotate-180" : ""} />
        </button>
        {expanded[item.id] && <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          <p>Invoice: <strong className="text-foreground">{item.invoiceNumber}</strong> · nilai {formatIdr(item.invoiceAmount)}</p>
          <p>Settlement bank: <strong className="text-foreground">{item.netSettlement === null ? "Belum diterima" : formatIdr(item.netSettlement)}</strong> · diterima {formatDate(item.settledAt)}</p>
          <p>Rumus expected: invoice − fee − komisi − refund = <strong className="text-foreground">{formatIdr(item.expectedSettlement)}</strong></p>
          <p>Rekonsiliasi diperbarui: <strong className="text-foreground">{formatDate(item.updatedAt)}</strong>{item.reconciliationResolvedAt ? ` · diselesaikan ${formatDate(item.reconciliationResolvedAt)}` : ""}</p>
        </div>}

        {canManage ? <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Catatan audit wajib (min. 3 karakter)" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs" aria-label={`Catatan transaksi ${item.id}`} />
            <select value={item.status} onChange={(event) => { if (note.length >= 3) mutation.mutate({ id: item.id, data: { status: event.target.value as Transaction["status"], note } }); }} className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold" aria-label={`Status transaksi ${item.id}`}>
              <option value="pending">Menunggu</option><option value="paid">Dibayar</option><option value="refunded">Dikembalikan</option>
            </select>
          </div>
          {item.reconciliationStatus !== "resolved" && <button disabled={resolveMutation.isPending || note.length < 3} onClick={() => resolveMutation.mutate({ id: item.id, data: { note } })} className="mt-2 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50" data-testid={`button-resolve-${item.id}`}>Selesaikan rekonsiliasi</button>}
        </div> : <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><LockKeyhole size={14} /> Akses settlement dan penyelesaian hanya untuk super admin.</div>}
      </article>;
    })}</div>}
  </div>;
}

function AuditWorkspace({ items, canView }: { items: AdminOperations["auditLogs"]; canView: boolean }) {
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Governance" title="Audit log append-only" copy={canView ? "Semua keputusan penting ditampilkan bersama aktor dan perubahan status." : "Log tersedia untuk super admin demi pemisahan tugas."} />{!canView ? <div className="mt-5 rounded-xl bg-muted/60 p-6 text-center"><LockKeyhole className="mx-auto text-muted-foreground" size={24} /><p className="mt-3 text-sm font-bold">Akses audit dibatasi</p><p className="mt-1 text-xs text-muted-foreground">Role Admin tetap menghasilkan audit log, tetapi tidak dapat membaca seluruh riwayat governance.</p></div> : items.length === 0 ? <Empty label="Belum ada aktivitas audit" /> : <div className="mt-5 divide-y divide-border">{items.map((item) => <div key={item.id} className="flex gap-3 py-4"><div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><CheckCircle2 size={15} /></div><div className="min-w-0"><p className="text-sm"><strong>{item.actorName}</strong> · {item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.entityType} / {item.entityId} · {formatDate(item.createdAt)}</p>{item.note && <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}</div>}</div>;
}

function Empty({ label }: { label: string }) {
  return <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center"><Sparkles className="mx-auto text-accent" size={23} /><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-muted-foreground">Data akan muncul ketika aktivitas operasional mulai berjalan.</p></div>;
}
