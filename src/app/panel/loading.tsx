export default function PanelLoading() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      <div className="skeleton mt-8 h-40 w-full" />
      <div className="skeleton mt-6 h-64 w-full" />
    </div>
  );
}
