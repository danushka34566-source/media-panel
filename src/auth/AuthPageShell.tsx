import { clsx } from 'clsx/lite';
import { FiCheck, FiImage, FiShield } from 'react-icons/fi';

export default function AuthPageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={clsx('mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-6xl items-center justify-center py-5 sm:py-8', className)}>
      <div className="grid w-full overflow-hidden rounded-3xl border border-medium bg-extra-dim shadow-xl lg:min-h-[620px] lg:grid-cols-[1fr_1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gray-950 p-10 text-white dark:bg-black lg:flex xl:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-24 size-80 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><FiImage size={22} /></span>
              <div><p className="font-semibold tracking-tight">Media Panel</p><p className="text-xs text-white/55">Your library, in one place</p></div>
            </div>
            <div className="mt-24 max-w-sm">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/75"><FiShield size={14} /> Private by design</span>
              <h2 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">A calmer way to manage your media.</h2>
              <p className="mt-5 max-w-xs text-sm leading-6 text-white/60">Sign in to continue to your personal library and keep your collection close.</p>
            </div>
          </div>
          <div className="relative space-y-3 text-sm text-white/65">
            <p className="flex items-center gap-2"><FiCheck className="text-emerald-300" /> Your media stays organized</p>
            <p className="flex items-center gap-2"><FiCheck className="text-emerald-300" /> Protected account access</p>
            <p className="pt-5 text-xs text-white/35">MEDIA PANEL · SECURE ACCESS</p>
          </div>
        </aside>
        <section className="flex min-w-0 flex-col items-center justify-center gap-5 px-4 py-7 sm:px-8 lg:px-10 xl:px-14">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-main lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-xl bg-dim"><FiImage size={17} /></span>
            Media Panel
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
