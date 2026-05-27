import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export type ConfirmVariant = "default" | "destructive";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState {
  options: ConfirmOptions;
  open: boolean;
}

interface ConfirmDialogProviderProps {
  children: ReactNode;
}

export function ConfirmDialogProvider({ children }: ConfirmDialogProviderProps) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setState({ options, open: true });
      }),
    [],
  );

  const resolve = useCallback((value: boolean): void => {
    const fn = resolverRef.current;
    resolverRef.current = null;
    setState((prev) => (prev ? { ...prev, open: false } : prev));
    fn?.(value);
  }, []);

  useEffect(() => {
    if (!state || state.open) return;
    const t = window.setTimeout(() => setState(null), 150);
    return () => window.clearTimeout(t);
  }, [state]);

  const options = state?.options;
  const variant = options?.variant ?? "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <DialogPrimitive.Root
        open={Boolean(state?.open)}
        onOpenChange={(open) => {
          if (!open) resolve(false);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-pop focus:outline-none",
            )}
          >
            {options && (
              <>
                <div className="flex items-start gap-3">
                  {variant === "destructive" && (
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 space-y-1.5">
                    <DialogPrimitive.Title className="text-base font-semibold leading-snug">
                      {options.title}
                    </DialogPrimitive.Title>
                    {options.description && (
                      <DialogPrimitive.Description className="text-sm text-muted-foreground">
                        {options.description}
                      </DialogPrimitive.Description>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex flex-row-reverse gap-2">
                  <Button
                    autoFocus
                    size="sm"
                    variant={
                      variant === "destructive" ? "destructive" : "default"
                    }
                    onClick={() => resolve(true)}
                  >
                    {options.confirmText ?? "Xác nhận"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(false)}
                  >
                    {options.cancelText ?? "Hủy"}
                  </Button>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return ctx;
}
