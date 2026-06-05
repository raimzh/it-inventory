import { clsx } from "clsx";

interface Column<T> { key: keyof T | string; label: string; className?: string; render?: (row: T) => React.ReactNode; }

interface TableProps<T> { columns: Column<T>[]; data: T[]; loading?: boolean; emptyMessage?: string; onRowClick?: (row: T) => void; }

export function Table<T extends { id: string }>({ columns, data, loading, emptyMessage = "Нет данных", onRowClick }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
          <tr>
            {columns.map(col => (
              <th key={col.key as string} className={clsx("px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400", col.className)}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {loading ? Array(5).fill(0).map((_, i) => (
            <tr key={i} className="animate-pulse">
              {columns.map(c => <td key={c.key as string} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" /></td>)}
            </tr>
          )) : data.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400 text-sm">{emptyMessage}</td></tr>
          ) : data.map(row => (
            <tr key={row.id} onClick={() => onRowClick?.(row)}
              className={clsx("hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", onRowClick && "cursor-pointer")}>
              {columns.map(col => (
                <td key={col.key as string} className={clsx("px-4 py-3 text-gray-700 dark:text-gray-300", col.className)}>
                  {col.render ? col.render(row) : (row[col.key as keyof T] as any) ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
