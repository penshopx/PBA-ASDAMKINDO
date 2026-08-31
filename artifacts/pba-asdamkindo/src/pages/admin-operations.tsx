import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  LockKeyhole,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminOperationsQueryKey,
  useCreateAdminProgram,
  useDecideVerification,
  useGetAdminOperations,
  useUpdateAdminEnrollment,
  useUpdateAdminMatching,
  useUpdateAdminProgram,
  useUpdateAdminTransaction,
} from "@workspace/api-client-react";
import type {
  AdminOperations,
  Enrollment,
  Matching,
  ProgramInput,
  Transaction,
  Verification,
} from "@workspace/api-client-react";
import { QueryState } from "@/components/ui-kit";
import { useToast } from "@/hooks/use-toast";

type Tab = "verifications" | "programs" | "pipeline" | "revenue" | "audit";

const tabs: Array<{ id: Tab; label: string; icon: typeof ClipboardCheck }> = [
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

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "paid" || status === "completed" || status === "placed" || status === "published"
      ? "bg-accent/12 text-accent"
      : status === "rejected" || status === "cancelled" || status === "declined" || status === "refunded"
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
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{labels[status] ?? status}</span>;
}

function SummaryStrip({ summary }: { summary: AdminOperations["summary"] }) {
  const items = [
    ["Verifikasi tertunda", summary.pendingVerifications, "prioritas"],
    ["Program aktif", summary.activePrograms, "terbit"],
    ["Enrollment aktif", summary.activeEnrollments, "berjalan"],
    ["Placement", summary.placements, "berhasil"],
    ["Pendapatan dibayar", formatIdr(summary.revenue), "settled"],
  ];
  return <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">{items.map(([label, value, note], index) => <div className="bg-card p-5" key={label} data-testid={`admin-summary-${index}`}><p className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p><strong className="display-font mt-3 block text-2xl font-semibold">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>)}</div>;
}

export function AdminOperations() {
  const query = useGetAdminOperations();
  const [tab, setTab] = useState<Tab>("verifications");
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

  return <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="eyebrow text-accent">PBA operations / workbench</p><h1 className="display-font mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Pusat operasi</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Kerjakan verifikasi, program, pipeline peluang, dan transaksi dari satu antrean yang memiliki jejak audit.</p></div>
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-accent" /> {data?.permissions.canManageTransactions ? "Super admin" : "Admin operasional"}</div>
    </div>
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}>
      {data && <><SummaryStrip summary={data.summary} /><div className="mt-7 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-auto rounded-2xl border border-border bg-card p-2 lg:block lg:h-fit lg:space-y-1" aria-label="Menu operasi">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold lg:w-full ${tab === id ? "bg-sidebar text-sidebar-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} data-testid={`tab-admin-${id}`}><Icon size={17} /><span>{label}</span>{id === "verifications" && data.summary.pendingVerifications > 0 && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{data.summary.pendingVerifications}</span>}</button>)}</nav>
        <section className="min-w-0">{tab === "verifications" && <VerificationQueue items={data.verifications} mutation={review} />} {tab === "programs" && <ProgramWorkspace data={data} showForm={showProgramForm} setShowForm={setShowProgramForm} createMutation={createProgram} updateMutation={updateProgram} updateEnrollment={updateEnrollment} />} {tab === "pipeline" && <PipelineWorkspace items={data.matchings} mutation={updateMatching} />} {tab === "revenue" && <RevenueWorkspace items={data.transactions} canManage={data.permissions.canManageTransactions} mutation={updateTransaction} />} {tab === "audit" && <AuditWorkspace items={data.auditLogs} canView={data.permissions.canViewAudit} />}</section>
      </div></>}
    </QueryState>
  </div>;
}

function SectionHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end"><div><p className="eyebrow text-accent">{eyebrow}</p><h2 className="mt-2 text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>{action}</div>;
}

function VerificationQueue({ items, mutation }: { items: Verification[]; mutation: ReturnType<typeof useDecideVerification> }) {
  const [selected, setSelected] = useState<Verification | null>(null);
  const [note, setNote] = useState("");
  const pending = items.filter((item) => item.status === "pending" || item.status === "changes_requested");
  const decide = (status: "approved" | "changes_requested" | "rejected") => {
    if (!selected || note.trim().length < 3) return;
    mutation.mutate({ id: selected.id, data: { status, note: note.trim() } }, { onSuccess: () => { setSelected(null); setNote(""); } });
  };
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
    <SectionHeader eyebrow="Verification queue" title="Profil, dokumen, dan bukti kompetensi" copy={`${pending.length} item membutuhkan keputusan Admin PBA.`} />
    {items.length === 0 ? <Empty label="Belum ada item verifikasi" /> : <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-accent"><FileCheck2 size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.subjectName}</strong><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{item.evidenceType} · {item.subjectType} · diajukan {formatDate(item.submittedAt)}</p>{item.reviewNote && <p className="mt-2 text-xs text-muted-foreground">Catatan: {item.reviewNote}</p>}</div>{item.status === "pending" || item.status === "changes_requested" ? <button onClick={() => { setSelected(item); setNote(""); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-review-${item.id}`}>Tinjau <ArrowRight size={14} /></button> : <span className="text-xs font-semibold text-muted-foreground">{formatDate(item.reviewedAt)}</span>}</div>)}</div>}
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

function PipelineWorkspace({ items, mutation }: { items: Matching[]; mutation: ReturnType<typeof useUpdateAdminMatching> }) {
  const counts = useMemo(() => items.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {}), [items]);
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Opportunity pipeline" title="Matching, shortlist, hingga placement" copy={`${items.length} kandidat dalam pipeline · ${counts.placed ?? 0} sudah ditempatkan`} />{items.length === 0 ? <Empty label="Belum ada matching" /> : <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.candidateName}</strong><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{item.requirement} · {item.companyName} · kecocokan {item.score}%</p></div><select value={item.status} onChange={(event) => mutation.mutate({ id: item.id, data: { status: event.target.value as Matching["status"], note: "Pipeline diperbarui oleh Admin PBA." } })} className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold" aria-label={`Status matching ${item.candidateName}`}><option value="new">Baru</option><option value="shortlisted">Shortlist</option><option value="interview">Interview</option><option value="placed">Ditempatkan</option><option value="declined">Tidak lanjut</option></select></div></div>)}</div>}</div>;
}

function RevenueWorkspace({ items, canManage, mutation }: { items: Transaction[]; canManage: boolean; mutation: ReturnType<typeof useUpdateAdminTransaction> }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Revenue control" title="Komisi dan status pendapatan" copy={canManage ? "Anda dapat memperbarui settlement sebagai super admin." : "Admin dapat meninjau; perubahan settlement membutuhkan super admin."} />{items.length === 0 ? <Empty label="Belum ada transaksi" /> : <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.customerName}</strong><StatusBadge status={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">{item.kind} · ref {item.referenceId} · {formatDate(item.occurredAt)}</p></div><div className="grid grid-cols-2 gap-5 text-right text-xs"><div><p className="text-muted-foreground">Nilai</p><strong className="mt-1 block">{formatIdr(item.amount)}</strong></div><div><p className="text-muted-foreground">Komisi</p><strong className="mt-1 block text-accent">{formatIdr(item.commission)}</strong></div></div></div>{canManage ? <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row"><input value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Catatan settlement (wajib)" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs" /><select value={item.status} onChange={(event) => { const note = notes[item.id]?.trim(); if (note && note.length >= 3) mutation.mutate({ id: item.id, data: { status: event.target.value as Transaction["status"], note } }); }} className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-bold" aria-label={`Status transaksi ${item.id}`}><option value="pending">Menunggu</option><option value="paid">Dibayar</option><option value="refunded">Dikembalikan</option></select></div> : <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><LockKeyhole size={14} /> Akses settlement hanya untuk super admin.</div>}</div>)}</div>}</div>;
}

function AuditWorkspace({ items, canView }: { items: AdminOperations["auditLogs"]; canView: boolean }) {
  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-7"><SectionHeader eyebrow="Governance" title="Audit log append-only" copy={canView ? "Semua keputusan penting ditampilkan bersama aktor dan perubahan status." : "Log tersedia untuk super admin demi pemisahan tugas."} />{!canView ? <div className="mt-5 rounded-xl bg-muted/60 p-6 text-center"><LockKeyhole className="mx-auto text-muted-foreground" size={24} /><p className="mt-3 text-sm font-bold">Akses audit dibatasi</p><p className="mt-1 text-xs text-muted-foreground">Role Admin tetap menghasilkan audit log, tetapi tidak dapat membaca seluruh riwayat governance.</p></div> : items.length === 0 ? <Empty label="Belum ada aktivitas audit" /> : <div className="mt-5 divide-y divide-border">{items.map((item) => <div key={item.id} className="flex gap-3 py-4"><div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><CheckCircle2 size={15} /></div><div className="min-w-0"><p className="text-sm"><strong>{item.actorName}</strong> · {item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.entityType} / {item.entityId} · {formatDate(item.createdAt)}</p>{item.note && <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>}</div></div>)}</div>}</div>;
}

function Empty({ label }: { label: string }) {
  return <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center"><Sparkles className="mx-auto text-accent" size={23} /><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-muted-foreground">Data akan muncul ketika aktivitas operasional mulai berjalan.</p></div>;
}