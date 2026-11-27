import { useAppText } from '@/i18n/state/client';
import { toastWaiting, toastWarning } from '@/toast';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useTransition } from 'react';
import { FiCheckSquare } from 'react-icons/fi';
import { toast } from 'sonner';

const ACTION_FAILURE_MESSAGE = 'Unable to complete this action.';

export default function useNavigateOrRunActionWithToast({
  pathOrAction,
  toastMessage: _toastMessage,
  dismissDelay = 1500,
}: {
  pathOrAction?: string | (() => string | Promise<unknown> | undefined)
  toastMessage?: string
  dismissDelay?: number
}) {
  const router = useRouter();

  const appText = useAppText();

  const toastMessage = _toastMessage ?? appText.utility.loading;

  const navigationToastId = useRef<string | number>(undefined);
  
  const [isPending, startTransition] = useTransition();

  const showCompletion = useCallback((id: string | number) => {
    toast(toastMessage, {
      id,
      icon: <FiCheckSquare size={16} />,
    });
    setTimeout(() => toast.dismiss(id), dismissDelay);
  }, [dismissDelay, toastMessage]);
  
  useEffect(() => {
    const finishNavigation = () => {
      const id = navigationToastId.current;
      if (id === undefined) { return; }
      navigationToastId.current = undefined;
      showCompletion(id);
    };
    if (isPending) { return finishNavigation; }
    finishNavigation();
  }, [isPending, showCompletion]);

  const navigateOrRunAction = useCallback(() => {
    let pathOrActionResult: string | Promise<unknown> | undefined;
    try {
      pathOrActionResult = typeof pathOrAction === 'function'
        ? pathOrAction()
        : pathOrAction;
    } catch (error) {
      if (isRedirectError(error)) { throw error; }
      toastWarning(ACTION_FAILURE_MESSAGE);
      return;
    }

    if (typeof pathOrActionResult === 'string') {
      startTransition(() => {
        const priorId = navigationToastId.current;
        if (priorId !== undefined) { toast.dismiss(priorId); }
        navigationToastId.current = toastWaiting(toastMessage);
        router.push(pathOrActionResult);
      });
    } else if (pathOrActionResult !== undefined) {
      const id = toastWaiting(toastMessage);
      void pathOrActionResult.then(
        () => showCompletion(id),
        (error: unknown) => {
          toast.dismiss(id);
          if (!isRedirectError(error)) { toastWarning(ACTION_FAILURE_MESSAGE); }
        },
      );
    }
  }, [pathOrAction, router, showCompletion, toastMessage]);

  return navigateOrRunAction;
}
