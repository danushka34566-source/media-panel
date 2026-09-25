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
      <span className="flex size-8 items-center justify-center text-main">
        {icon}
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-main">
        {title}
      </h1>
      {description &&
        <p className="max-w-xs text-sm leading-relaxed text-medium">
          {description}
        </p>}
      {action &&
        <p className="text-sm leading-relaxed text-medium">
          {action}
        </p>}
    </div>
  );
}
