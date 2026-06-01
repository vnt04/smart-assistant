import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Lock } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./button";
import { Input } from "./input";

export interface PasswordPromptOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
}

/** Resolves to mật khẩu đã nhập, hoặc null nếu người dùng hủy. */
type PasswordPromptFn = (
  options: PasswordPromptOptions,
) => Promise<string | null>;

const PasswordPromptContext = createContext<PasswordPromptFn | null>(null);

interface DialogState {
  options: PasswordPromptOptions;
  open: boolean;
}

export function PasswordPromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [value, setValue] = useState("");
  const resolverRef = useRef<((value: string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = useCallback<PasswordPromptFn>(
    (options) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setValue("");
        setState({ options, open: true });
      }),
    [],
  );

  const resolve = useCallback((result: string | null): void => {
    const fn = resolverRef.current;
    resolverRef.current = null;
    setState((prev) => (prev ? { ...prev, open: false } : prev));
    fn?.(result);
  }, []);

  useEffect(() => {
    if (!state || state.open) return;
    const t = window.setTimeout(() => setState(null), 150);
    return () => window.clearTimeout(t);
  }, [state]);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    resolve(trimmed);
  };

  const options = state?.options;

  return (
    <PasswordPromptContext.Provider value={prompt}>
      {children}
      <DialogPrimitive.Root
        open={Boolean(state?.open)}
        onOpenChange={(open) => {
          if (!open) resolve(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
            className={cn(
              "fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-pop focus:outline-none",
            )}
          >
            {options && (
              <form onSubmit={onSubmit}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Lock className="h-4 w-4" />
                  </span>
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
                <Input
                  ref={inputRef}
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={options.placeholder ?? "Nhập mật khẩu khóa"}
                  className="mt-4"
                  autoComplete="current-password"
                />
                <div className="mt-5 flex flex-row-reverse gap-2">
                  <Button type="submit" size="sm" disabled={!value.trim()}>
                    {options.confirmText ?? "Xác nhận"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(null)}
                  >
                    {options.cancelText ?? "Hủy"}
                  </Button>
                </div>
              </form>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PasswordPromptContext.Provider>
  );
}

export function usePasswordPrompt(): PasswordPromptFn {
  const ctx = useContext(PasswordPromptContext);
  if (!ctx) {
    throw new Error(
      "usePasswordPrompt must be used within a PasswordPromptProvider",
    );
  }
  return ctx;
}
