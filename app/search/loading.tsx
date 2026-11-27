import AppGrid from '@/components/AppGrid';
import Spinner from '@/components/Spinner';

export default function SearchLoading() {
  return (
    <AppGrid
      contentMain={
        <div
          role="status"
          className="flex min-h-[30vh] items-center justify-center gap-3 text-dim"
        >
          <Spinner size={18} />
          Loading search results…
        </div>
      }
    />
  );
}
