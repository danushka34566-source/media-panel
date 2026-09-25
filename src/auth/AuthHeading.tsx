import type { ReactNode } from 'react';

export default function AuthHeading({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-dim text-main">
        {icon}
      </span>
      <h1 className="font-sans text-2xl font-semibold tracking-tight text-main">
        {title}
      </h1>
      {description &&
        <p className="max-w-xs font-sans text-sm leading-relaxed text-medium">
          {description}
        </p>}
      {action &&
        <p className="font-sans text-sm leading-relaxed text-medium">
          {action}
        </p>}
    </div>
  );
}
