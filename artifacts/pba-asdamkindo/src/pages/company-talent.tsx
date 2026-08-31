import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Edit3,
  GraduationCap,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompanyRequirementsQueryKey,
  getListCompanyTalentPoolQueryKey,
  useCreateCompanyRequirement,
  useCreateCompanyShortlist,
  useListCompanyRequirements,
  useListCompanyTalentPool,
  useUpdateCompanyRequirement,
  useUpdateCompanyShortlist,
} from "@workspace/api-client-react";
import type {
  CompanyRequirement,
  CompanyRequirementInput,
  CompanyRequirementUpdate,
  TalentPoolCandidate,
} from "@workspace/api-client-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QueryState, Skeleton } from "@/components/ui-kit";
import { useToast } from "@/hooks/use-toast";

type RequirementFormValues = CompanyRequirementInput;
type CandidateStatus = TalentPoolCandidate["status"];

const statusLabels: Record<string, string> = {
  draft: "Draft",
  open: "Terbuka",
  closed: "Ditutup",
  new: "Baru",
  review: "Ditinjau",
  shortlisted: "Shortlist",
  interview: "Interview",
  placed: "Ditempatkan",
  declined: "Tidak dilanjutkan",
};

const statusClass: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-accent/12 text-accent",
  closed: "bg-sidebar/10 text-sidebar",
  new: "bg-primary/15 text-foreground",
  review: "bg-accent/12 text-accent",
  shortlisted: "bg-primary/18 text-foreground",
  interview: "bg-sidebar/10 text-sidebar",
  placed: "bg-accent text-accent-foreground",
  declined: "bg-destructive/10 text-destructive",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass[value] ?? "bg-muted text-muted-foreground"}`}
      data-testid={`status-pill-${value}`}
    >
      {statusLabels[value] ?? value}
    </span>
  );
}

function RequirementForm({
  requirement,
  onClose,
}: {
  requirement: CompanyRequirement | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateCompanyRequirement();
  const updateMutation = useUpdateCompanyRequirement();
  const isEditing = Boolean(requirement);
  const form = useForm<RequirementFormValues>({
    defaultValues: {
      kind: requirement?.kind ?? "talent",
      title: requirement?.title ?? "",
      description: requirement?.description ?? "",
      location: requirement?.location ?? "",
      competencies: requirement?.competencies ?? [],
      minimumExperience: requirement?.minimumExperience ?? 0,
      headcount: requirement?.headcount ?? 1,
      deadline: requirement?.deadline?.slice(0, 10) ?? "",
      status: requirement?.status ?? "draft",
    },
  });
  const [competencyInput, setCompetencyInput] = useState("");
  const competencies = form.watch("competencies");
  const pending = createMutation.isPending || updateMutation.isPending;

  const addCompetency = () => {
    const value = competencyInput.trim();
    if (!value || competencies.includes(value)) return;
    form.setValue("competencies", [...competencies, value], { shouldValidate: true });
    setCompetencyInput("");
  };

  const submit = (values: RequirementFormValues) => {
    const payload = {
      ...values,
      competencies: values.competencies.filter(Boolean),
      minimumExperience: Number(values.minimumExperience),
      headcount: Number(values.headcount),
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListCompanyRequirementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/company/talent-pool/matches"] });
      toast({
        title: isEditing ? "Kebutuhan diperbarui" : "Kebutuhan tersimpan",
        description: "Perubahan sudah tercatat di ruang kerja perusahaan.",
      });
      onClose();
    };
    if (requirement) {
      updateMutation.mutate(
        { id: requirement.id, data: payload as CompanyRequirementUpdate },
        { onSuccess },
      );
    } else {
      createMutation.mutate({ data: payload }, { onSuccess });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-sidebar/45 px-4 py-6 sm:grid sm:place-items-center sm:py-10">
      <button
        className="absolute inset-0 cursor-default"
        aria-label="Tutup formulir kebutuhan"
        onClick={onClose}
        data-testid="button-close-requirement-overlay"
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between border-b border-border px-5 py-5 sm:px-7">
          <div>
            <p className="eyebrow text-accent">{isEditing ? "Perbarui kebutuhan" : "Kebutuhan baru"}</p>
            <h2 className="display-font mt-2 text-2xl font-semibold">
              {isEditing ? "Jaga brief tetap tajam." : "Mulai dari kebutuhan yang jelas."}
            </h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Detail ini dipakai untuk menyaring kandidat yang sudah memberikan persetujuan data.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
            data-testid="button-close-requirement-form"
          >
            <X size={18} />
          </button>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5 p-5 sm:p-7" data-testid="form-company-requirement">
            <div className="grid gap-5 sm:grid-cols-[.8fr_1.2fr]">
              <FormField
                control={form.control}
                name="kind"
                rules={{ required: "Pilih jenis kebutuhan." }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jenis kebutuhan</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        data-testid="select-requirement-kind"
                      >
                        <option value="talent">Kebutuhan talenta</option>
                        <option value="training">Kebutuhan training</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                rules={{ required: "Judul kebutuhan wajib diisi.", minLength: { value: 2, message: "Gunakan minimal 2 karakter." } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Judul kebutuhan</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Contoh: Site supervisor proyek Jakarta" data-testid="input-requirement-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              rules={{ required: "Ringkasan kebutuhan wajib diisi." }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ringkasan kebutuhan</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Konteks proyek, tanggung jawab, atau hasil yang diharapkan." data-testid="input-requirement-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="location"
                rules={{ required: "Lokasi wajib diisi.", minLength: { value: 2, message: "Gunakan minimal 2 karakter." } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lokasi kerja</FormLabel>
                    <FormControl><Input {...field} placeholder="Jakarta / Jawa Barat" data-testid="input-requirement-location" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deadline"
                rules={{ required: "Tenggat wajib diisi." }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenggat kebutuhan</FormLabel>
                    <FormControl><Input {...field} type="date" data-testid="input-requirement-deadline" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div>
              <span className="text-sm font-medium">Kompetensi kunci<span className="ml-1 text-primary">*</span></span>
              <div className="mt-2 flex gap-2">
                <Input
                  value={competencyInput}
                  onChange={(event) => setCompetencyInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCompetency(); } }}
                  placeholder="Ketik kompetensi, lalu tekan Enter"
                  data-testid="input-requirement-competency"
                />
                <button type="button" onClick={addCompetency} className="grid h-9 w-10 shrink-0 place-items-center rounded-md border border-border text-accent hover:bg-muted" aria-label="Tambah kompetensi" data-testid="button-add-competency"><Plus size={16} /></button>
              </div>
              <div className="mt-2 flex min-h-7 flex-wrap gap-2">
                {competencies.map((item) => (
                  <button type="button" key={item} onClick={() => form.setValue("competencies", competencies.filter((value) => value !== item))} className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/20" data-testid={`button-remove-competency-${item.replaceAll(" ", "-")}`}>
                    {item}<X size={12} />
                  </button>
                ))}
              </div>
              {competencies.length === 0 && <p className="mt-2 text-xs text-destructive">Tambahkan setidaknya satu kompetensi.</p>}
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField control={form.control} name="minimumExperience" rules={{ min: { value: 0, message: "Tidak boleh negatif." } }} render={({ field }) => <FormItem><FormLabel>Pengalaman minimum</FormLabel><FormControl><Input {...field} type="number" min={0} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-requirement-experience" /></FormControl><p className="text-xs text-muted-foreground">Tahun</p><FormMessage /></FormItem>} />
              <FormField control={form.control} name="headcount" rules={{ required: "Isi jumlah kebutuhan.", min: { value: 1, message: "Minimal 1 orang." } }} render={({ field }) => <FormItem><FormLabel>Jumlah orang</FormLabel><FormControl><Input {...field} type="number" min={1} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-requirement-headcount" /></FormControl><p className="text-xs text-muted-foreground">Posisi / peserta</p><FormMessage /></FormItem>} />
              <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Status saat disimpan</FormLabel><FormControl><select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" data-testid="select-requirement-status"><option value="draft">Draft</option><option value="open">Buka kebutuhan</option><option value="closed">Tutup kebutuhan</option></select></FormControl><FormMessage /></FormItem>} />
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-requirement">Batal</button>
              <button type="submit" disabled={pending || competencies.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60" data-testid="button-save-requirement">
                {pending ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Simpan kebutuhan"} <ArrowRight size={16} />
              </button>
            </div>
            {(createMutation.isError || updateMutation.isError) && <p className="text-right text-xs font-semibold text-destructive">Perubahan belum tersimpan. Coba lagi.</p>}
          </form>
        </Form>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  requirementId,
  onChange,
}: {
  candidate: TalentPoolCandidate;
  requirementId: string;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const createShortlist = useCreateCompanyShortlist();
  const updateShortlist = useUpdateCompanyShortlist();
  const pending = createShortlist.isPending || updateShortlist.isPending;
  const [expanded, setExpanded] = useState(false);

  const changeStatus = (status: CandidateStatus) => {
    const data = { status, note: "Status diperbarui dari ruang kerja perusahaan." };
    const onSuccess = () => {
      toast({ title: "Status kandidat diperbarui", description: `${candidate.name} sekarang berada di tahap ${statusLabels[status].toLowerCase()}.` });
      onChange();
    };
    if (!candidate.matchingId) {
      createShortlist.mutate({ data: { requirementId, memberUserId: candidate.memberUserId } }, {
        onSuccess: (matching) => {
          if (status !== "shortlisted" && matching.id) {
            updateShortlist.mutate({ id: matching.id, data }, { onSuccess });
          } else onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: "Kandidat belum tersimpan", description: "Periksa koneksi lalu coba lagi." }),
      });
    } else {
      updateShortlist.mutate({ id: candidate.matchingId, data }, {
        onSuccess,
        onError: () => toast({ variant: "destructive", title: "Status belum berubah", description: "Periksa koneksi lalu coba lagi." }),
      });
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid={`card-candidate-${candidate.memberUserId}`}>
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sidebar text-lg font-bold text-primary">{candidate.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold" data-testid={`text-candidate-name-${candidate.memberUserId}`}>{candidate.name}</h3><StatusPill value={candidate.status} /></div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin size={13} /> {candidate.domicile}</span><span>{candidate.experienceYears} tahun pengalaman</span><span>{candidate.expertise}</span></div>
        </div>
        <div className="shrink-0 text-right"><p className="font-mono text-2xl font-bold text-accent" data-testid={`text-candidate-score-${candidate.memberUserId}`}>{candidate.score}</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">match score</p></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl bg-muted/55 p-3">
          <div className="flex items-center justify-between text-xs"><span className="font-bold">Sinyal kesiapan</span><span className="font-mono font-bold text-accent">{candidate.readinessScore} · {candidate.readinessLabel}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(candidate.readinessScore, 100)}%` }} /></div>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary" aria-expanded={expanded} data-testid={`button-candidate-context-${candidate.memberUserId}`}>{expanded ? "Tutup konteks" : "Lihat konteks"}<ChevronDown size={14} className={expanded ? "rotate-180" : ""} /></button>
      </div>
      {expanded && <div className="mt-4 rounded-xl border border-border bg-background p-4"><p className="eyebrow text-accent">Mengapa cocok</p><ul className="mt-3 space-y-2">{candidate.matchReasons.map((reason) => <li key={reason} className="flex gap-2 text-sm leading-relaxed"><Check className="mt-0.5 shrink-0 text-accent" size={15} />{reason}</li>)}</ul><p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Data kandidat ditampilkan karena telah memberikan persetujuan untuk kebutuhan perusahaan yang relevan.</p></div>}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="mr-auto text-xs text-muted-foreground">{candidate.matchingId ? "Sudah tersimpan dalam pipeline" : "Belum masuk shortlist"}</span>
        {candidate.status === "new" && <button type="button" disabled={pending} onClick={() => changeStatus("review")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary disabled:opacity-50" data-testid={`button-review-candidate-${candidate.memberUserId}`}>Mulai review</button>}
        {candidate.status !== "shortlisted" && candidate.status !== "placed" && candidate.status !== "declined" && <button type="button" disabled={pending} onClick={() => changeStatus("shortlisted")} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-shortlist-candidate-${candidate.memberUserId}`}>{pending ? "Menyimpan..." : "Simpan shortlist"}</button>}
        {candidate.status === "shortlisted" && <button type="button" disabled={pending} onClick={() => changeStatus("interview")} className="rounded-lg bg-sidebar px-3 py-2 text-xs font-bold text-sidebar-foreground disabled:opacity-50" data-testid={`button-interview-candidate-${candidate.memberUserId}`}>Siapkan interview</button>}
        {candidate.status === "interview" && <button type="button" disabled={pending} onClick={() => changeStatus("placed")} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50" data-testid={`button-place-candidate-${candidate.memberUserId}`}>Tandai ditempatkan</button>}
        {candidate.status !== "placed" && candidate.status !== "declined" && <select value={candidate.status} disabled={pending} onChange={(event) => changeStatus(event.target.value as CandidateStatus)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none" aria-label={`Ubah status ${candidate.name}`} data-testid={`select-candidate-status-${candidate.memberUserId}`}><option value="new">Baru</option><option value="review">Ditinjau</option><option value="shortlisted">Shortlist</option><option value="interview">Interview</option><option value="placed">Ditempatkan</option><option value="declined">Tidak dilanjutkan</option></select>}
      </div>
    </article>
  );
}

export function CompanyTalent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formRequirement, setFormRequirement] = useState<CompanyRequirement | null | undefined>(undefined);
  const [candidateFilter, setCandidateFilter] = useState<"all" | CandidateStatus>("all");
  const [search, setSearch] = useState("");
  const requirementsQuery = useListCompanyRequirements({ query: { queryKey: getListCompanyRequirementsQueryKey(), refetchOnMount: "always" } });
  const requirements = requirementsQuery.data ?? [];
  const activeRequirement = requirements.find((item) => item.id === selectedId) ?? requirements.find((item) => item.status === "open") ?? requirements[0];
  const talentQuery = useListCompanyTalentPool(
    { requirementId: activeRequirement?.id ?? "" },
    { query: { enabled: Boolean(activeRequirement?.id), queryKey: getListCompanyTalentPoolQueryKey({ requirementId: activeRequirement?.id ?? "" }), refetchOnMount: "always" } },
  );
  const client = useQueryClient();
  const visibleCandidates = useMemo(() => (talentQuery.data ?? []).filter((candidate) => {
    const matchesFilter = candidateFilter === "all" || candidate.status === candidateFilter;
    const needle = search.trim().toLowerCase();
    return matchesFilter && (!needle || `${candidate.name} ${candidate.expertise} ${candidate.domicile}`.toLowerCase().includes(needle));
  }), [talentQuery.data, candidateFilter, search]);
  const openCreate = () => setFormRequirement(null);
  const invalidateTalent = () => {
    if (activeRequirement) client.invalidateQueries({ queryKey: getListCompanyTalentPoolQueryKey({ requirementId: activeRequirement.id }) });
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-11">
        <div className="mb-8 flex flex-col gap-6">
          <Link href="/company/dashboard" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-muted-foreground hover:text-accent" data-testid="link-company-dashboard-back"><ArrowLeft size={16} /> Kembali ke ringkasan perusahaan</Link>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="eyebrow text-accent">Company workspace / talent pool</p><h1 className="display-font mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Dari kebutuhan jelas,<br /><span className="text-accent">ke kandidat yang siap ditindak.</span></h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Kelola brief talenta dan training, lalu baca kandidat yang paling relevan tanpa kehilangan konteks kompetensinya.</p></div>
            <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="button-create-requirement"><Plus size={17} /> Buat kebutuhan</button>
          </div>
        </div>
        <QueryState loading={requirementsQuery.isLoading} error={requirementsQuery.isError} retry={() => requirementsQuery.refetch()}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-sidebar p-5 text-sidebar-foreground"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-sidebar-foreground/55">Kebutuhan terbuka</p><Target className="text-primary" size={19} /></div><p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-open-requirements">{requirements.filter((item) => item.status === "open").length}</p><p className="mt-1 text-xs text-sidebar-foreground/55">Brief yang sedang dicari</p></div>
            <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Kandidat terhubung</p><UsersRound className="text-accent" size={19} /></div><p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-connected-candidates">{requirements.reduce((sum, item) => sum + item.candidateCount, 0)}</p><p className="mt-1 text-xs text-muted-foreground">Akumulasi dari kebutuhan aktif</p></div>
            <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Pipeline dipilih</p><BriefcaseBusiness className="text-accent" size={19} /></div><p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-shortlisted-candidates">{(talentQuery.data ?? []).filter((candidate) => ["shortlisted", "interview", "placed"].includes(candidate.status)).length}</p><p className="mt-1 text-xs text-muted-foreground">Shortlist, interview, dan penempatan</p></div>
          </div>
          {requirements.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center"><Target className="mx-auto text-accent" size={25} /><h2 className="mt-4 text-lg font-bold">Belum ada kebutuhan aktif.</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Buat brief pertama untuk mulai menerima rekomendasi kandidat consented dari Talent Pool.</p><button onClick={openCreate} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-create-first-requirement">Buat kebutuhan pertama</button></div> :
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.28fr)]">
              <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="eyebrow text-accent">Brief perusahaan</p><h2 className="mt-2 text-lg font-bold">Kebutuhan yang dikelola</h2></div><span className="font-mono text-xs text-muted-foreground">{requirements.length} total</span></div><div className="mt-5 space-y-3">{requirements.map((requirement) => <button key={requirement.id} onClick={() => { setSelectedId(requirement.id); setCandidateFilter("all"); setSearch(""); }} className={`w-full rounded-xl border p-4 text-left transition-colors ${activeRequirement?.id === requirement.id ? "border-primary bg-primary/8" : "border-border hover:border-primary/60"}`} data-testid={`card-requirement-${requirement.id}`}><div className="flex items-start justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-muted-foreground">{requirement.kind === "talent" ? <BriefcaseBusiness size={13} /> : <GraduationCap size={13} />}{requirement.kind === "talent" ? "Talenta" : "Training"}</span><StatusPill value={requirement.status} /></div><h3 className="mt-3 text-sm font-bold leading-snug">{requirement.title}</h3><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={13} /> {requirement.location}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs"><span className="font-bold text-accent">{requirement.candidateCount} kandidat</span><span className="text-muted-foreground">{formatDate(requirement.deadline)}</span></div></button>)}</div><button onClick={openCreate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-bold text-accent hover:border-primary hover:bg-muted" data-testid="button-add-another-requirement"><Plus size={15} /> Tambah kebutuhan</button></section>
              <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start"><div><p className="eyebrow text-accent">Talent Pool terkurasi</p><h2 className="mt-2 text-2xl font-semibold" data-testid="text-active-requirement-title">{activeRequirement?.title}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin size={13} /> {activeRequirement?.location}</span><span className="inline-flex items-center gap-1"><UsersRound size={13} /> {activeRequirement?.headcount} posisi</span><span className="inline-flex items-center gap-1"><CalendarDays size={13} /> sampai {activeRequirement && formatDate(activeRequirement.deadline)}</span></div></div><button onClick={() => activeRequirement && setFormRequirement(activeRequirement)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary" data-testid="button-edit-active-requirement"><Edit3 size={14} /> Edit brief</button></div><div className="mt-5 rounded-xl bg-muted/50 p-4"><p className="text-sm leading-relaxed text-muted-foreground">{activeRequirement?.description}</p><div className="mt-3 flex flex-wrap gap-2">{activeRequirement?.competencies.map((competency) => <span key={competency} className="rounded-full bg-background px-2.5 py-1 text-[11px] font-bold text-accent">{competency}</span>)}</div></div><div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, domisili, atau expertise" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" data-testid="input-search-candidates" /></div><div className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-muted-foreground" /><select value={candidateFilter} onChange={(event) => setCandidateFilter(event.target.value as "all" | CandidateStatus)} className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold outline-none focus:border-primary" aria-label="Filter status kandidat" data-testid="select-candidate-filter"><option value="all">Semua tahap</option><option value="new">Baru</option><option value="review">Ditinjau</option><option value="shortlisted">Shortlist</option><option value="interview">Interview</option><option value="placed">Ditempatkan</option><option value="declined">Tidak dilanjutkan</option></select></div></div><div className="mt-5">{talentQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /></div> : talentQuery.isError ? <QueryState error retry={() => talentQuery.refetch()}>{null}</QueryState> : visibleCandidates.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-muted/25 p-10 text-center"><Clock3 className="mx-auto text-accent" size={23} /><h3 className="mt-3 text-sm font-bold">{search || candidateFilter !== "all" ? "Tidak ada kandidat dalam filter ini." : "Belum ada kandidat yang cocok."}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{search || candidateFilter !== "all" ? "Coba ubah pencarian atau tahap pipeline." : "Kandidat consented akan muncul setelah sistem menemukan kecocokan."}</p></div> : <div className="space-y-3">{visibleCandidates.map((candidate) => <CandidateCard key={candidate.memberUserId} candidate={candidate} requirementId={activeRequirement!.id} onChange={invalidateTalent} />)}</div>}</div></section>
            </div>}
        </QueryState>
      </div>
      {formRequirement !== undefined && <RequirementForm requirement={formRequirement} onClose={() => setFormRequirement(undefined)} />}
    </>
  );
}