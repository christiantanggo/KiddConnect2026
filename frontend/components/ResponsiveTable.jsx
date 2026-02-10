'use client';

/**
 * ResponsiveTable - A mobile-responsive table component
 * Automatically converts to card layout on mobile devices
 */
export default function ResponsiveTable({ columns, data, keyField = 'id', emptyMessage = 'No data available' }) {
  return (
    <div className="overflow-x-auto">
      {/* Desktop Table */}
      <table className="hidden md:table w-full">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row) => (
            <tr key={row[keyField]} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{emptyMessage}</div>
        ) : (
          data.map((row) => (
            <div
              key={row[keyField]}
              className="bg-white rounded-lg shadow p-4 border border-gray-200"
            >
              {columns.map((col) => (
                <div key={col.key} className="mb-3 last:mb-0">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {col.label}
                  </div>
                  <div className="text-sm text-gray-900">
                    {col.render ? col.render(row) : row[col.key]}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}



















