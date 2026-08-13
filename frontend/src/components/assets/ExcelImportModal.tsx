"use client";
import { useState, useRef, useCallback } from "react";
import {
  X, Upload, FileSpreadsheet, Download, AlertCircle,
  CheckCircle, AlertTriangle, RefreshCw, Eye, Info,
} from "lucide-react";
import { excelApi, downloadBlob } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PreviewRow {
  rowNum: number;
  action: "create" | "update" | "skip" | "error";
  inventoryNumber: string;
  name: string;
  departmentName?: string;
  responsiblePerson?: string;
  residualValue?: number;
  status?: string;
  error?: string;
}

interface PreviewResult {
  totalRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: PreviewRow[];
}

interface ImportLog {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  status: "success" | "partial" | "failed";
  createdAt: string;
  errors?: string | null;
}

type Step = "upload" | "preview" | "importing" | "done";

const STEPS = [
  { id: "upload",    label: "1. Файл" },
  { id: "preview",   label: "2. Предпросмотр" },
  { id: "importing", label: "3. Импорт" },
  { id: "done",      label: "4. Готово" },
] as const;

const STEP_ORDER: Step[] = ["upload", "preview", "importing", "done"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExcelImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importLog, setImportLog] = useState<ImportLog | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── File handling ─────────────────────────────────────────────────────────
  const validateFile = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? ""))
      return "Разрешены только файлы .xlsx и .xls";
    if (f.size > 20 * 1024 * 1024)
      return "Размер файла не должен превышать 20 МБ";
    return null;
  };

  const handleFile = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError("");
    setFile(f);
    setPreview(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ─── Authenticated template download ──────────────────────────────────────
  // IMPORTANT: Use axios (with Authorization header) instead of <a href>,
  // because the backend requires JWT authentication.
  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      const { data: blob } = await excelApi.downloadTemplate();
      downloadBlob(blob, "assets_template.xlsx");
    } catch {
      setError("Не удалось скачать шаблон. Попробуйте ещё раз.");
    } finally {
      setTemplateLoading(false);
    }
  };

  // ─── Error message extractor ───────────────────────────────────────────────
  // Handles any shape the backend might return (string, nested object, array).
  const extractError = (e: any, fallback: string): string => {
    const d = e?.response?.data;
    if (!d) return e?.message || fallback;

    // d.message can be: string | string[] | object | object[]
    const m = d?.message;
    if (typeof m === "string" && m) return m;
    if (Array.isArray(m) && m.length > 0) {
      // e.g. class-validator returns ["field must not be empty"]
      return m.map((x: any) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
    }
    if (m && typeof m === "object") {
      // Our old HttpExceptionFilter nested the whole response as message — handle it
      const inner = (m as any).message;
      if (typeof inner === "string") return inner;
    }
    if (typeof d?.error === "string") return d.error;
    return e?.message || fallback;
  };

  // ─── Preview ───────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      const { data } = await excelApi.preview(file);
      // Guard: backend must return a rows array
      if (!data || !Array.isArray(data.rows)) {
        setError("Сервер вернул неверный формат. Проверьте файл и попробуйте снова.");
        return;
      }
      setPreview(data as PreviewResult);
      setStep("preview");
    } catch (e: any) {
      setError(extractError(e, "Ошибка парсинга файла"));
    } finally {
      setLoading(false);
    }
  };

  // ─── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!file) return;
    setStep("importing"); setError(""); setProgress(0);

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 3, 85));
    }, 200);

    try {
      const { data } = await excelApi.importFile(file);
      clearInterval(interval);
      setProgress(100);
      setImportLog(data as ImportLog);
      setStep("done");
      if ((data.createdCount ?? 0) > 0 || (data.updatedCount ?? 0) > 0) {
        onSuccess();
      }
    } catch (e: any) {
      clearInterval(interval);
      setProgress(0);
      setStep("preview");
      setError(extractError(e, "Ошибка импорта"));
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────
  const actionBadge = (action: string) => {
    const cfg: Record<string, { label: string; cls: string }> = {
      create: { label: "Добавить",   cls: "bg-green-100 text-green-700" },
      update: { label: "Обновить",   cls: "bg-blue-100 text-blue-700" },
      skip:   { label: "Пропустить", cls: "bg-gray-100 text-gray-600" },
      error:  { label: "Ошибка",     cls: "bg-red-100 text-red-700" },
    };
    const c = cfg[action] ?? { label: action, cls: "bg-gray-100 text-gray-600" };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>
        {c.label}
      </span>
    );
  };

  // Safe parse of errors JSON stored in the import log
  const parseErrors = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      return [raw];
    }
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Импорт из Excel</h2>
              <p className="text-sm text-gray-500">Массовая загрузка основных средств</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className={`font-medium ${
                  step === s.id ? "text-primary-600" :
                  stepIndex > i ? "text-gray-900 dark:text-white" : "text-gray-400"
                }`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-gray-300">›</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Step: UPLOAD ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Download template (authenticated) */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                <div className="flex items-center gap-3">
                  <Info className="w-4 h-4 text-primary-600 flex-shrink-0" />
                  <span className="text-sm text-primary-700 dark:text-primary-300">
                    Используйте готовый шаблон для правильного заполнения данных
                  </span>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  disabled={templateLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {templateLoading
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                  Шаблон Excel
                </button>
              </div>

              {/* Drop zone */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                  ${dragging
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : file
                    ? "border-green-400 bg-green-50 dark:bg-green-900/10"
                    : "border-gray-200 dark:border-slate-700 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-slate-800/50"}`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {file ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="font-semibold text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {(file.size / 1024).toFixed(0)} КБ · Нажмите для замены
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-semibold text-gray-700 dark:text-slate-300">
                      Перетащите файл сюда или нажмите для выбора
                    </p>
                    <p className="text-sm text-gray-400 mt-1">Форматы: .xlsx, .xls · Максимум 20 МБ</p>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step: PREVIEW ── */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Добавить",   count: preview.createCount  ?? 0, color: "green" },
                  { label: "Обновить",   count: preview.updateCount  ?? 0, color: "blue" },
                  { label: "Пропустить", count: preview.skipCount    ?? 0, color: "gray" },
                  { label: "Ошибки",     count: preview.errorCount   ?? 0, color: "red" },
                ].map(({ label, count, color }) => (
                  <div key={label} className={`p-4 rounded-xl text-center
                    ${color === "green" ? "bg-green-50 dark:bg-green-900/20" :
                      color === "blue"  ? "bg-blue-50 dark:bg-blue-900/20" :
                      color === "red"   ? "bg-red-50 dark:bg-red-900/20" :
                      "bg-gray-50 dark:bg-slate-800"}`}>
                    <div className={`text-2xl font-bold
                      ${color === "green" ? "text-green-600" :
                        color === "blue"  ? "text-blue-600" :
                        color === "red"   ? "text-red-600" : "text-gray-600"}`}>
                      {count}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Preview table */}
              <div className="rounded-xl border border-gray-100 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800 flex items-center gap-2 border-b border-gray-100 dark:border-slate-700">
                  <Eye className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    Предпросмотр ({Math.min((preview.rows ?? []).length, 200)} из {preview.totalRows ?? 0} строк)
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs hidden md:table-cell">Строка</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Действие</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Инв. номер</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs hidden md:table-cell">Наименование</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs hidden md:table-cell">Подразделение</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs hidden md:table-cell">Ответственный</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-500 text-xs hidden md:table-cell">Остат. ст-ть</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Ошибка</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                      {(preview.rows ?? []).map(row => (
                        <tr
                          key={row.rowNum}
                          className={`${
                            row.action === "error" ? "bg-red-50/50 dark:bg-red-900/10" :
                            row.action === "skip"  ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2 text-gray-400 text-xs hidden md:table-cell">{row.rowNum}</td>
                          <td className="px-3 py-2">{actionBadge(row.action)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-slate-300">
                            {row.inventoryNumber ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[200px] truncate hidden md:table-cell">
                            {row.name ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs hidden md:table-cell">{row.departmentName || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs hidden md:table-cell">{row.responsiblePerson || "—"}</td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-slate-300 text-xs hidden md:table-cell">
                            {row.residualValue != null && !isNaN(Number(row.residualValue))
                              ? Number(row.residualValue).toLocaleString("ru-RU") + " ₽"
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-red-500 text-xs">{row.error ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: IMPORTING ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-900 dark:text-white text-lg">Импорт данных...</p>
                <p className="text-sm text-gray-500 mt-1">Пожалуйста, не закрывайте окно</p>
              </div>
              <div className="w-full max-w-sm">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Прогресс</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step: DONE ── */}
          {step === "done" && importLog && (
            <div className="space-y-5">
              <div className={`flex items-center gap-4 p-5 rounded-2xl
                ${importLog.status === "success" ? "bg-green-50 dark:bg-green-900/20" :
                  importLog.status === "partial" ? "bg-yellow-50 dark:bg-yellow-900/20" :
                  "bg-red-50 dark:bg-red-900/20"}`}>
                {importLog.status === "success"
                  ? <CheckCircle className="w-10 h-10 text-green-500 flex-shrink-0" />
                  : importLog.status === "partial"
                  ? <AlertTriangle className="w-10 h-10 text-yellow-500 flex-shrink-0" />
                  : <AlertCircle className="w-10 h-10 text-red-500 flex-shrink-0" />}
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-lg">
                    {importLog.status === "success" ? "Импорт завершён успешно!" :
                     importLog.status === "partial" ? "Импорт завершён с ошибками" :
                     "Импорт не удался"}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{importLog.fileName}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Добавлено", count: importLog.createdCount  ?? 0, color: "green" },
                  { label: "Обновлено", count: importLog.updatedCount  ?? 0, color: "blue" },
                  { label: "Пропущено", count: importLog.skippedCount  ?? 0, color: "gray" },
                  { label: "Ошибок",    count: importLog.errorCount    ?? 0, color: "red" },
                ].map(({ label, count, color }) => (
                  <div key={label} className={`p-4 rounded-xl text-center
                    ${color === "green" ? "bg-green-50 dark:bg-green-900/20" :
                      color === "blue"  ? "bg-blue-50 dark:bg-blue-900/20" :
                      color === "red"   ? "bg-red-50 dark:bg-red-900/20" :
                      "bg-gray-50 dark:bg-slate-800"}`}>
                    <div className={`text-2xl font-bold
                      ${color === "green" ? "text-green-600" :
                        color === "blue"  ? "text-blue-600" :
                        color === "red"   ? "text-red-600" : "text-gray-600"}`}>
                      {count}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Errors list — safe JSON parse */}
              {importLog.errors && (
                <div className="rounded-xl border border-red-100 dark:border-red-900/50 overflow-hidden">
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/50">
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">Список ошибок</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-3 space-y-1">
                    {parseErrors(importLog.errors).map((e, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">• {e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 dark:border-slate-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            {step === "done" ? "Закрыть" : "Отмена"}
          </button>

          <div className="flex items-center gap-3">
            {step === "upload" && (
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium
                  hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                <Eye className="w-4 h-4" />
                Предпросмотр
              </button>
            )}

            {step === "preview" && (
              <>
                <button
                  onClick={() => setStep("upload")}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  ← Назад
                </button>
                <button
                  onClick={handleImport}
                  disabled={
                    !preview ||
                    ((preview.createCount ?? 0) + (preview.updateCount ?? 0) === 0)
                  }
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium
                    hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Импортировать{" "}
                  {preview ? `(${(preview.createCount ?? 0) + (preview.updateCount ?? 0)})` : ""}
                </button>
              </>
            )}

            {step === "done" && (
              <button
                onClick={() => {
                  setStep("upload");
                  setFile(null);
                  setPreview(null);
                  setImportLog(null);
                  setError("");
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Новый импорт
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
