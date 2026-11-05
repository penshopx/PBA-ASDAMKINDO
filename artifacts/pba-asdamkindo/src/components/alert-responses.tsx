import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminAlertResponsesQueryKey,
  useListAdminAlertResponses,
  useAcknowledgeAdminAlert,
} from "@workspace/api-client-react";
import { useState } from "react";

const labels = {
  awaiting_ack: "Menunggu konfirmasi",
  overdue: "Terlambat — belum dikonfirmasi",
  acknowledged: "Sudah dikonfirmasi",
  acknowledged_late: "Dikonfirmasi setelah tenggat",
};

export function AlertResponses() {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const query = useListAdminAlertResponses({
    query: { queryKey: getListAdminAlertResponsesQueryKey(), refetchInterval: 15_000, retry: false },
  });
  const acknowledge = useAcknowledgeAdminAlert({
    mutation: {
      onSuccess: () => {
        setFeedback("Konfirmasi tercatat. ACK bukan berarti gangguan sudah selesai.");
        return client.invalidateQueries({ queryKey: getListAdminAlertResponsesQueryKey() });
      },
      onError: () => setFeedback("Konfirmasi belum tersimpan. Coba lagi; jangan anggap alarm sudah ditangani."),
    },
  });
  return <section className="mt-6 border-t border-border pt-5" aria-label="Konfirmasi respons alarm">
    <h3 className="text-lg font-bold">Konfirmasi petugas (ACK)</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      Tenggat awal 15 menit sejak alarm dipicu, dapat dikonfigurasi oleh operator.
      Konfirmasi dan keterlambatan disimpan di database, terpisah dari status pengiriman.
      Belum ada eskalasi SMS, WhatsApp, atau telepon.
    </p>
    {query.isLoading && <p className="mt-3" role="status">Memuat respons alarm…</p>}
    {query.isError && <p className="mt-3 text-destructive" role="alert">
      Respons alarm tidak dapat dimuat.
      <button className="ml-2 underline" onClick={() => query.refetch()}>Coba lagi</button>
    </p>}
    {query.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">
      Belum ada alarm tercatat sejak fitur ACK diaktifkan.
    </p>}
    <ul className="mt-4 space-y-3">
      {query.data?.map(record => <li key={record.id} className="rounded-lg border border-border p-3 text-sm">
        <strong>{record.alertName}</strong>
        <p className={record.overdueAt ? "font-semibold text-destructive" : "font-semibold"}>
          {labels[record.responseStatus]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tenggat: {new Date(record.responseDueAt).toLocaleString("id-ID")}
        </p>
        {record.acknowledgedAt
          ? <p className="text-xs text-muted-foreground">Dikonfirmasi: {new Date(record.acknowledgedAt).toLocaleString("id-ID")}</p>
          : <button
              className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              disabled={acknowledge.isPending}
              data-testid="button-alert-ack"
              onClick={() => { setFeedback(""); acknowledge.mutate({ id: record.id }); }}
            >{acknowledge.isPending && acknowledge.variables?.id === record.id ? "Menyimpan…" : "Saya menerima alarm (ACK)"}</button>}
        {record.overdueAt && <p className="mt-1 text-xs text-destructive">
          Pelanggaran tenggat tetap dicatat meskipun alarm telah dikonfirmasi.
        </p>}
      </li>)}
    </ul>
    {feedback && <p className="mt-3 text-sm" role="status">{feedback}</p>}
  </section>;
}
