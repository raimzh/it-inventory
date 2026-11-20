"use client";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { SyncReport } from "@/types";

/**
 * Отчёт обмена с 1С.
 *
 * Читает его человек, который решает, можно ли включать обмен по-настоящему.
 * Поэтому сверху — то, что может испортить учёт (по какому полю совпадают
 * номера, конфликты, недоступные справочники), и только потом — подробности.
 */

const FIELD_LABEL: Record<string, string> = {
  name: "Наименование",
  serialNumber: "Серийный номер",
  departmentName: "Подразделение",
  location: "Местоположение",
  responsiblePerson: "МОЛ",
  commissioningDate: "Дата ввода",
  residualValue: "Остаточная стоимость",
  initialValue: "Первоначальная стоимость",
  oneCId: "Код в 1С",
  oneCGuid: "Ссылка 1С",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "muted" }) {
  const color = tone === "good" ? "text-green-600 dark:text-green-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-gray-900 dark:text-white";
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{title}</h4>
      {children}
    </div>
  );
}

export function SyncReportView({ report, onClose }: { report: SyncReport; onClose: () => void }) {
  const matched = report.updates + report.unchanged;
  const best = report.candidates?.slice().sort((a, b) => b.matched - a.matched)[0];
  // Поле сопоставления не лучшее из кандидатов — главный риск первого обмена:
  // по нему не найдутся существующие карточки, и обмен создаст дубли
  const wrongField = best && report.matchField && best.field !== report.matchField
    && best.matched > (report.candidates?.find(c => c.field === report.matchField)?.matched ?? 0);
  const lowMatch = report.siteTotal > 0 && matched < report.siteTotal * 0.5;

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {report.dryRun ? "Пробный прогон — в учёт ничего не записано" : "Итог обмена"}
          </h3>
          {report.profile && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
              {report.profile} · <span className="font-mono">{report.entity}</span> · сопоставление по полю{" "}
              <span className="font-mono">{report.matchField}</span>
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Закрыть отчёт"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {(wrongField || lowMatch || report.warnings.length > 0 || report.conflicts.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Прежде чем обновлять по-настоящему</p>
          {wrongField && (
            <p>
              По полю <b className="font-mono">{best!.field}</b> совпадает больше карточек ({best!.matched}), чем по выбранному{" "}
              <b className="font-mono">{report.matchField}</b>. Обмен с текущей настройкой создаст дубли. Укажите{" "}
              <code className="font-mono">ONE_C_MATCH_FIELD={best!.field}</code>.
            </p>
          )}
          {lowMatch && !wrongField && (
            <p>Сопоставлено {matched} из {report.siteTotal} карточек сайта — меньше половины. Проверьте поле сопоставления и справочник ОС.</p>
          )}
          {report.conflicts.length > 0 && <p>Конфликтов: {report.conflicts.length} — эти записи пропускаются (список ниже).</p>}
          {report.warnings.map(w => <p key={w}>Не прочитано: {w}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label={`сопоставлено из ${report.siteTotal}`} value={matched} tone={lowMatch ? "warn" : "good"} />
        <Stat label={report.dryRun ? "изменилось бы" : "обновлено"} value={report.updates} />
        <Stat label={report.dryRun ? "создалось бы" : "создано"} value={report.creates} />
        <Stat label="есть на сайте, нет в 1С" value={report.missingInOneC} tone="muted" />
      </div>

      {report.candidates && report.candidates.length > 0 && (
        <Section title="По какому полю 1С совпадают номера">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Поле 1С</th><th className="th text-right">Заполнено</th><th className="th text-right">Нашлось карточек</th></tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
              {report.candidates.map(c => (
                <tr key={c.field}>
                  <td className="td font-mono">
                    {c.field}
                    {c.field === report.matchField && <CheckCircle2 className="inline w-3.5 h-3.5 ml-1.5 text-primary-600" aria-label="выбрано" />}
                  </td>
                  <td className="td text-right tabular-nums">{c.present}</td>
                  <td className="td text-right tabular-nums font-semibold">{c.matched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Получено из 1С">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Записей: {report.fetched}. Пропущено: групп {report.skipped.folder}, помеченных на удаление {report.skipped.deleted},
          без номера {report.skipped.noNumber}.
          {report.lookups && <> Подразделений {report.lookups.departments}, физлиц {report.lookups.persons},
            записей местонахождения {report.lookups.location}.</>}
        </p>
        {report.coverage && (
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Заполненность полей: {report.coverage.map(c => `${c.field} — ${c.present}`).join(", ")}
          </p>
        )}
      </Section>

      {report.samples.updates.length > 0 && (
        <Section title={`Изменения${report.updates > report.samples.updates.length ? ` (первые ${report.samples.updates.length} из ${report.updates})` : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className="th">Инв. номер</th><th className="th">Поле</th><th className="th">Было</th><th className="th">Станет</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {report.samples.updates.flatMap(u => u.changes.map((c, i) => (
                  <tr key={`${u.inventoryNumber}-${c.field}`}>
                    <td className="td font-mono text-xs">{i === 0 ? u.inventoryNumber : ""}</td>
                    <td className="td text-xs">{FIELD_LABEL[c.field] ?? c.field}</td>
                    <td className="td text-xs text-gray-400 dark:text-slate-500">{c.from ?? "—"}</td>
                    <td className="td text-xs">{c.to}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {report.samples.creates.length > 0 && (
        <Section title={`Новые из 1С${report.creates > report.samples.creates.length ? ` (первые ${report.samples.creates.length} из ${report.creates})` : ""}`}>
          <ul className="text-sm space-y-0.5">
            {report.samples.creates.map(c => (
              <li key={c.inventoryNumber}><span className="font-mono text-xs">{c.inventoryNumber}</span> {c.name}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.markedDeletedOnSite.length > 0 && (
        <Section title="Помечены на удаление в 1С, но есть на сайте — сайт их не меняет">
          <ul className="text-sm space-y-0.5">
            {report.markedDeletedOnSite.map(d => (
              <li key={d.inventoryNumber}><span className="font-mono text-xs">{d.inventoryNumber}</span> {d.name}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.numberMismatch.length > 0 && (
        <Section title="Номер в 1С отличается от номера на сайте — автоматически не меняется">
          <ul className="text-sm space-y-0.5">
            {report.numberMismatch.map(n => (
              <li key={n.site} className="font-mono text-xs">{n.site} → {n.oneC}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.conflicts.length > 0 && (
        <Section title="Конфликты — записи пропущены">
          <ul className="text-sm space-y-0.5">
            {report.conflicts.map((c, i) => (
              <li key={`${c.inventoryNumber}-${i}`}><span className="font-mono text-xs">{c.inventoryNumber}</span> — {c.reason}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.samples.missingInOneC.length > 0 && (
        <Section title={`Есть на сайте, нет в 1С — не удаляются${report.missingInOneC > report.samples.missingInOneC.length ? ` (первые ${report.samples.missingInOneC.length} из ${report.missingInOneC})` : ""}`}>
          <ul className="text-sm space-y-0.5">
            {report.samples.missingInOneC.map(a => (
              <li key={a.inventoryNumber}><span className="font-mono text-xs">{a.inventoryNumber}</span> {a.name}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
