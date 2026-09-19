export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-10 w-64 rounded" />
      <div className="skeleton h-40 rounded-xl" />
      <div className="skeleton h-40 rounded-xl" />
    </div>
  );
}
