/** Consistent table primitives. Wrap in <Card> and <TableScroll>. */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
export function Table({ children, minWidth = 640 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth }}>
      {children}
    </table>
  );
}
export function Th({ children, align = 'left', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th
      scope="col"
      className={`sticky top-0 border-b border-line bg-[#F8F6F3] px-4 py-2.5 text-xs font-medium text-ink-500 first:rounded-tl-xl last:rounded-tr-xl ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </th>
  );
}
export function Td({ children, align = 'left', className = '' }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={`border-b border-line px-4 py-2.5 align-middle group-last:border-b-0 ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  );
}
export function Tr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tr className={`group transition-colors hover:bg-zinc-50 ${className}`}>{children}</tr>;
}
