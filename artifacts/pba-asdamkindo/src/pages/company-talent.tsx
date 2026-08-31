import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  GraduationCap,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCompanyRequirementsQueryKey,
  getListCompanyTalentPoolQueryKey,
  listCompanyTalentPool,
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
import { QueryState } from "@/components/ui-kit";
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
      minimumSkkLevel: requirement?.minimumSkkLevel ?? 0,
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
      minimumSkkLevel: Number(values.minimumSkkLevel || 0),
      minimumExperience: Number(values.minimumExperience),
      headcount: Number(values.headcount),
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListCompanyRequirementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/company/talent-pool"] });
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

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="minimumSkkLevel"
                rules={{ min: { value: 0, message: "Tidak boleh negatif." } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. SKK</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} max={9} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-requirement-skk" /></FormControl>
                    <p className="text-[11px] text-muted-foreground">0 = Tanpa min</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minimumExperience"
                rules={{ min: { value: 0, message: "Tidak boleh negatif." } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. Pengalaman</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-requirement-experience" /></FormControl>
                    <p className="text-[11px] text-muted-foreground">Tahun</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="headcount"
                rules={{ required: "Isi jumlah kebutuhan.", min: { value: 1, message: "Minimal 1 orang." } }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kapasitas</FormLabel>
                    <FormControl><Input {...field} type="number" min={1} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="input-requirement-headcount" /></FormControl>
                    <p className="text-[11px] text-muted-foreground">Posisi</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status awal</FormLabel>
                    <FormControl>
                      <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" data-testid="select-requirement-status">
                        <option value="draft">Draft</option>
                        <option value="open">Terbuka</option>
                        <option value="closed">Ditutup</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

  const changeStatus = (status: CandidateStatus) => {
    const data = { status, note: "Status diperbarui dari ruang kerja perusahaan." };
    const onSuccess = () => {
      toast({ title: "Status kandidat diperbarui", description: `${candidate.name} sekarang berada di tahap ${statusLabels[status].toLowerCase()}.` });
      onChange();
    };
    if (!candidate.matchingId) {
      createShortlist.mutate({ data: { requirementId, candidateId: candidate.candidateId } }, {
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
    <article className="rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5 hover:shadow-sm" data-testid={`card-candidate-${candidate.candidateId}`}>
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sidebar text-lg font-bold text-primary">{candidate.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold" data-testid={`text-candidate-name-${candidate.candidateId}`}>{candidate.name}</h3>
            <StatusPill value={candidate.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin size={13} /> {candidate.domicile}</span>
            <span>{candidate.experienceYears} tahun pengalaman</span>
            <span>{candidate.expertise}</span>
            {candidate.jobTitle && <span>• {candidate.jobTitle}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className={`px-2 py-0.5 rounded-full ${candidate.skkLevel > 0 ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>SKK Level {candidate.skkLevel}</span>
            <span className="px-2 py-0.5 rounded-full bg-sidebar/10 text-sidebar">{candidate.availabilityStatus.replace(/_/g, ' ')}</span>
            <span className={`px-2 py-0.5 rounded-full ${candidate.verificationStatus === 'verified' ? "bg-primary/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>Verifikasi: {candidate.verificationStatus}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-3xl font-bold text-accent" data-testid={`text-candidate-score-${candidate.candidateId}`}>{candidate.score}<span className="text-lg text-muted-foreground">/100</span></p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Match Score</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center divide-x divide-border border-y border-border py-3">
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">Job Title</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.jobTitle ?? 0}<span className="text-[10px] text-muted-foreground">/25</span></p></div>
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">SKK Level</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.skkLevel ?? 0}<span className="text-[10px] text-muted-foreground">/20</span></p></div>
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">Kompetensi</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.requiredCompetencies ?? 0}<span className="text-[10px] text-muted-foreground">/20</span></p></div>
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">Pengalaman</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.experience ?? 0}<span className="text-[10px] text-muted-foreground">/15</span></p></div>
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">Lokasi</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.location ?? 0}<span className="text-[10px] text-muted-foreground">/10</span></p></div>
         <div className="px-2"><p className="text-[10px] text-muted-foreground uppercase mb-1">Kesiapan</p><p className="font-mono font-bold text-sm">{candidate.scoreBreakdown?.availability ?? 0}<span className="text-[10px] text-muted-foreground">/10</span></p></div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <div>
           <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5"><Check size={14} className="text-accent" /> Kompetensi Terpenuhi</p>
           {candidate.matchedCompetencies && candidate.matchedCompetencies.length > 0 ? (
             <ul className="flex flex-wrap gap-1.5">
               {candidate.matchedCompetencies.map(c => <li key={c} className="bg-accent/10 text-accent px-2 py-0.5 rounded text-[11px] font-semibold">{c}</li>)}
             </ul>
           ) : <p className="text-xs text-muted-foreground">-</p>}
        </div>
        <div>
           <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5"><X size={14} className="text-destructive" /> Belum Terpenuhi</p>
           {candidate.unmetCompetencies && candidate.unmetCompetencies.length > 0 ? (
             <ul className="flex flex-wrap gap-1.5">
               {candidate.unmetCompetencies.map(c => <li key={c} className="bg-destructive/10 text-destructive px-2 py-0.5 rounded text-[11px] font-semibold">{c}</li>)}
             </ul>
           ) : <p className="text-xs text-muted-foreground">-</p>}
        </div>
      </div>

      {candidate.matchReasons && candidate.matchReasons.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="eyebrow text-accent">Mengapa cocok</p>
          <ul className="mt-3 space-y-2">
            {candidate.matchReasons.map(reason => <li key={reason} className="flex gap-2 text-sm leading-relaxed"><Check className="mt-0.5 shrink-0 text-accent" size={15} />{reason}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="mr-auto text-xs text-muted-foreground">{candidate.matchingId ? "Sudah tersimpan dalam pipeline" : "Belum masuk shortlist"}</span>
        {candidate.status === "new" && <button type="button" disabled={pending} onClick={() => changeStatus("review")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary disabled:opacity-50" data-testid={`button-review-candidate-${candidate.candidateId}`}>Mulai review</button>}
        {candidate.status !== "shortlisted" && candidate.status !== "placed" && candidate.status !== "declined" && <button type="button" disabled={pending} onClick={() => changeStatus("shortlisted")} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-shortlist-candidate-${candidate.candidateId}`}>{pending ? "Menyimpan..." : "Simpan shortlist"}</button>}
        {candidate.status === "shortlisted" && <button type="button" disabled={pending} onClick={() => changeStatus("interview")} className="rounded-lg bg-sidebar px-3 py-2 text-xs font-bold text-sidebar-foreground disabled:opacity-50" data-testid={`button-interview-candidate-${candidate.candidateId}`}>Siapkan interview</button>}
        {candidate.status === "interview" && <button type="button" disabled={pending} onClick={() => changeStatus("placed")} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50" data-testid={`button-place-candidate-${candidate.candidateId}`}>Tandai ditempatkan</button>}
        {candidate.status !== "placed" && candidate.status !== "declined" && (
          <select value={candidate.status} disabled={pending} onChange={(event) => changeStatus(event.target.value as CandidateStatus)} className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold outline-none" aria-label={`Ubah status ${candidate.name}`} data-testid={`select-candidate-status-${candidate.candidateId}`}>
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

export function CompanyTalent() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formRequirement, setFormRequirement] = useState<CompanyRequirement | null | undefined>(undefined);

  const requirementsQuery = useListCompanyRequirements({ query: { queryKey: getListCompanyRequirementsQueryKey(), refetchOnMount: "always" } });
  const requirements = requirementsQuery.data ?? [];
  const activeRequirement = requirements.find((item) => item.id === selectedId) ?? requirements.find((item) => item.status === "open") ?? requirements[0];

  const [draftFilters, setDraftFilters] = useState({ search: "", status: "all", minScore: "", location: "", skkLevel: "", experienceMin: "", availability: "", verificationStatus: "" });
  const [filters, setFilters] = useState(draftFilters);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [refreshing, setRefreshing] = useState(false);

  const queryParams = {
    requirementId: activeRequirement?.id ?? "",
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

  const talentQuery = useListCompanyTalentPool(queryParams, {
    query: {
      enabled: Boolean(activeRequirement?.id),
      queryKey: getListCompanyTalentPoolQueryKey(queryParams),
      refetchOnMount: "always"
    },
  });

  const pageData = talentQuery.data;
  const candidates = pageData?.items ?? [];

  const handleRefresh = async (params = queryParams) => {
    setRefreshing(true);
    try {
      const refreshed = await listCompanyTalentPool({ ...params, refresh: true });
      client.setQueryData(getListCompanyTalentPoolQueryKey(params), refreshed);
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

  const openCreate = () => setFormRequirement(null);

  const invalidateTalent = () => {
    if (activeRequirement) client.invalidateQueries({ queryKey: ["/api/company/talent-pool"] });
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-11">
        <div className="mb-8 flex flex-col gap-6">
          <Link href="/company/dashboard" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-muted-foreground hover:text-accent" data-testid="link-company-dashboard-back">
            <ArrowLeft size={16} /> Kembali ke ringkasan perusahaan
          </Link>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="eyebrow text-accent">Company workspace / talent pool</p>
              <h1 className="display-font mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Dari kebutuhan jelas,<br /><span className="text-accent">ke kandidat yang siap ditindak.</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Kelola brief talenta dan training, lalu filter kandidat yang paling relevan secara transparan.</p>
            </div>
            <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="button-create-requirement">
              <Plus size={17} /> Buat kebutuhan
            </button>
          </div>
        </div>

        <QueryState loading={requirementsQuery.isLoading} error={requirementsQuery.isError} retry={() => requirementsQuery.refetch()}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-sidebar p-5 text-sidebar-foreground">
              <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-sidebar-foreground/55">Kebutuhan terbuka</p><Target className="text-primary" size={19} /></div>
              <p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-open-requirements">{requirements.filter((item) => item.status === "open").length}</p>
              <p className="mt-1 text-xs text-sidebar-foreground/55">Brief yang sedang dicari</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Kandidat terhubung</p><UsersRound className="text-accent" size={19} /></div>
              <p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-connected-candidates">{requirements.reduce((sum, item) => sum + item.candidateCount, 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Akumulasi dari kebutuhan aktif</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Pipeline saat ini</p><BriefcaseBusiness className="text-accent" size={19} /></div>
              <p className="display-font mt-4 text-4xl font-semibold" data-testid="metric-shortlisted-candidates">{candidates.filter((candidate) => ["shortlisted", "interview", "placed"].includes(candidate.status)).length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Shortlist, interview, atau ditempatkan di filter ini</p>
            </div>
          </div>

          {requirements.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
              <Target className="mx-auto text-accent" size={25} />
              <h2 className="mt-4 text-lg font-bold">Belum ada kebutuhan aktif.</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Buat brief pertama untuk mulai menerima rekomendasi kandidat consented dari Talent Pool.</p>
              <button onClick={openCreate} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-create-first-requirement">Buat kebutuhan pertama</button>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.28fr)]">
              <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 h-fit">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow text-accent">Brief perusahaan</p>
                    <h2 className="mt-2 text-lg font-bold">Kebutuhan yang dikelola</h2>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{requirements.length} total</span>
                </div>
                <div className="mt-5 space-y-3">
                  {requirements.map((requirement) => (
                    <button key={requirement.id} onClick={() => { setSelectedId(requirement.id); setPage(1); }} className={`w-full rounded-xl border p-4 text-left transition-colors ${activeRequirement?.id === requirement.id ? "border-primary bg-primary/8" : "border-border hover:border-primary/60"}`} data-testid={`card-requirement-${requirement.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-muted-foreground">
                          {requirement.kind === "talent" ? <BriefcaseBusiness size={13} /> : <GraduationCap size={13} />}
                          {requirement.kind === "talent" ? "Talenta" : "Training"}
                        </span>
                        <StatusPill value={requirement.status} />
                      </div>
                      <h3 className="mt-3 text-sm font-bold leading-snug">{requirement.title}</h3>
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={13} /> {requirement.location}</p>
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                        <span className="font-bold text-accent">{requirement.candidateCount} kandidat</span>
                        <span className="text-muted-foreground">{formatDate(requirement.deadline)}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={openCreate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-bold text-accent hover:border-primary hover:bg-muted" data-testid="button-add-another-requirement">
                  <Plus size={15} /> Tambah kebutuhan
                </button>
              </section>

              <section className="min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Kandidat relevan</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Untuk "{activeRequirement?.title}"</p>
                  </div>
                  <button onClick={() => setFormRequirement(activeRequirement)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold shadow-sm hover:bg-muted" data-testid="button-edit-active-requirement">
                    Edit kebutuhan
                  </button>
                </div>

                <div className="bg-card border border-border p-5 rounded-2xl mt-5">
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

                <QueryState loading={talentQuery.isLoading} error={talentQuery.isError} retry={handleRefresh}>
                  {candidates.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                      <UsersRound className="mx-auto text-accent" size={32} />
                      <h3 className="mt-4 text-lg font-bold">Tidak ada kandidat</h3>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Sesuaikan filter atau tunggu hingga kandidat PBA memberikan persetujuan data mereka pada kebutuhan ini.</p>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {candidates.map((candidate) => (
                        <CandidateCard
                          key={candidate.candidateId}
                          candidate={candidate}
                          requirementId={activeRequirement.id}
                          onChange={invalidateTalent}
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
              </section>
            </div>
          )}
        </QueryState>
      </div>

      {formRequirement !== undefined && (
        <RequirementForm requirement={formRequirement} onClose={() => setFormRequirement(undefined)} />
      )}
    </>
  );
}
