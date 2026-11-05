import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertResponses } from "./alert-responses";
import {
  getGetAdminObservabilityQueryKey,
  getListAdminAlertResponsesQueryKey,
  useGetAdminObservability,
  useSendAdminOnCallTest,
} from "@workspace/api-client-react";

export function OnCallStatus() {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  const query = useGetAdminObservability({
    query: { queryKey: getGetAdminObservabilityQueryKey(), refetchInterval: 15_000, retry: false },
  });
  // A dependency outage returns a dashboard with HTTP 503, not an empty error.
  const errorData = query.error?.data;
  const dashboard = errorData && "alertDelivery" in errorData ? errorData : query.data;
  const delivery = dashboard?.alertDelivery;
  const mutation = useSendAdminOnCallTest({
    mutation: {
      onSuccess: () => {
        setCooldownUntil(Date.now() + 60_000);
        setFeedback("Slack/webhook menerima alarm uji. Petugas tetap perlu mengonfirmasi notifikasi di perangkat.");
      },
      onError: (error) => {
        setCooldownUntil(Date.now() + 60_000);
        setFeedback(error.data?.error ?? "Alarm uji belum berhasil. Periksa koneksi dan coba lagi.");
      },
      onSettled: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: getGetAdminObservabilityQueryKey() }),
          client.invalidateQueries({ queryKey: getListAdminAlertResponsesQueryKey() }),
        ]);
      },
    },
  });
  return <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label="Observability alarm piket">
    <h2 className="text-xl font-bold">Observability — alarm piket</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Delivered berarti penyedia menerima pesan, bukan bukti perangkat petugas berbunyi.
      Riwayat menampilkan proses server ini dan direset saat server dimulai ulang.
    </p>
    {query.isLoading && <p className="mt-4" role="status">Memuat status kanal…</p>}
    {query.isError && <p className="mt-4 text-destructive" role="alert">
      {delivery ? "Ada gangguan kesehatan layanan. Status pengiriman tetap ditampilkan." : "Dashboard belum dapat dimuat. Periksa koneksi atau kesehatan layanan."}
      <button className="ml-2 underline" onClick={() => query.refetch()}>Coba lagi</button>
    </p>}
    {delivery && <>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Kanal</dt><dd className="font-bold">{delivery.channel}</dd></div>
        <div><dt className="text-muted-foreground">Konfigurasi</dt><dd>{delivery.configured ? "Aktif" : "Belum diatur"}</dd></div>
        <div><dt className="text-muted-foreground">Delivery gagal</dt><dd>{delivery.failedDeliveries}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          disabled={!delivery.configured || mutation.isPending || now < cooldownUntil}
          onClick={() => { setFeedback(""); mutation.mutate(); }}
          data-testid="button-on-call-test"
        >{mutation.isPending ? "Mengirim…" : "Kirim UJI ALARM"}</button>
        <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => query.refetch()}>Perbarui status</button>
      </div>
      {delivery.recent.length === 0
        ? <p className="mt-4 text-sm text-muted-foreground">Belum ada pengiriman sejak server dimulai.</p>
        : <ul className="mt-4 space-y-3">
          {delivery.recent.map(record => <li key={record.deduplicationKey} className="rounded-lg border border-border p-3 text-sm">
            <strong>{record.alertName}</strong>
            <p>Status: <span className={record.status === "failed" ? "text-destructive" : "font-bold"}>{record.status}</span> · Percobaan: {record.attempts}</p>
            <p className="break-all text-xs text-muted-foreground">ID: {record.deduplicationKey}</p>
            <p className="text-xs text-muted-foreground">{record.deliveredAt ? new Date(record.deliveredAt).toLocaleString("id-ID") : record.error ?? "Menunggu pengiriman"}</p>
          </li>)}
        </ul>}
    </>}
    <AlertResponses />
    {feedback && <p className="mt-4 text-sm" role="status">{feedback}</p>}
  </section>;
}
