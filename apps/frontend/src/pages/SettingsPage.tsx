import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  aiProviderSchema,
  updateSettingsInputSchema,
  type AiProvider,
  type Theme,
  type UpdateSettingsInput,
  type UserSettings,
} from "@assistant/shared";
import {
  Bot,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Monitor,
  Moon,
  Palette,
  Send,
  SlidersHorizontal,
  Sun,
  Workflow,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useConfirm } from "../components/ui/confirm-dialog";
import { useTheme } from "../components/theme/theme-provider";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const onSaved = (s: UserSettings): void => {
    queryClient.setQueryData<UserSettings>(["settings"], s);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <header className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Cài đặt</h1>
            <p className="text-sm text-muted-foreground">
              Giao diện, AI provider, Telegram, n8n và khóa ghi chú.
            </p>
          </div>
        </header>

        {isLoading && <LoadingCards />}

        {data && (
          <>
            <AppearanceCard onSaved={onSaved} />
            <IntegrationsForm initial={data} onSaved={onSaved} />
            <NotesLockSection initial={data} onSaved={onSaved} />
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------- Giao diện (Theme) -------------------- */

const THEME_OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
];

/** Theme áp dụng NGAY qua theme-provider, đồng thời lưu lên server (không cần bấm Lưu). */
function AppearanceCard({ onSaved }: { onSaved: (s: UserSettings) => void }) {
  const { theme, setTheme } = useTheme();
  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: onSaved,
  });

  const change = (next: Theme): void => {
    if (next === theme) return;
    setTheme(next);
    mutation.mutate({ theme: next });
  };

  return (
    <SettingsCard
      icon={Palette}
      tone="purple"
      title="Giao diện"
      description="Chọn chế độ sáng/tối — áp dụng ngay."
    >
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => change(opt.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-primary")} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}

/* -------------------- AI / Telegram / n8n -------------------- */

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  ollama: "Ollama (máy cục bộ)",
};

interface IntegrationsFormProps {
  initial: UserSettings;
  onSaved: (s: UserSettings) => void;
}

function IntegrationsForm({ initial, onSaved }: IntegrationsFormProps) {
  const [aiProvider, setAiProvider] = useState<AiProvider>(initial.aiProvider);
  const [aiApiKey, setAiApiKey] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState(
    initial.telegramChatId ?? "",
  );
  const [n8nBaseUrl, setN8nBaseUrl] = useState(initial.n8nBaseUrl ?? "");
  const [n8nApiKey, setN8nApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Cố tình KHÔNG reseed theo `initial`: AppearanceCard lưu theme tức thì làm đổi
  // cache settings; reseed sẽ xóa nội dung đang gõ dở. State đã seed qua useState.

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (s) => {
      setAiApiKey("");
      setTelegramBotToken("");
      setN8nApiKey("");
      setSaved(true);
      onSaved(s);
    },
  });

  // Ẩn nhãn "Đã lưu" sau một lúc; reset khi người dùng chỉnh sửa tiếp.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const touched = (): void => {
    if (saved) setSaved(false);
    if (error) setError(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: UpdateSettingsInput = { aiProvider };
    if (aiApiKey.length > 0) patch.aiApiKey = aiApiKey;
    if (telegramBotToken.length > 0) patch.telegramBotToken = telegramBotToken;
    if ((initial.telegramChatId ?? "") !== telegramChatId)
      patch.telegramChatId = telegramChatId || null;
    if ((initial.n8nBaseUrl ?? "") !== n8nBaseUrl.trim())
      patch.n8nBaseUrl = n8nBaseUrl.trim() || null;
    if (n8nApiKey.trim().length > 0) patch.n8nApiKey = n8nApiKey.trim();
    const parsed = updateSettingsInputSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu thất bại");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <SettingsCard
        icon={Bot}
        tone="blue"
        title="Trợ lý AI"
        description="Nhà cung cấp mô hình và API key dùng cho trò chuyện."
      >
        <Field label="AI provider" htmlFor="aiProvider">
          <StyledSelect
            id="aiProvider"
            value={aiProvider}
            onChange={(e) => {
              setAiProvider(e.target.value as AiProvider);
              touched();
            }}
          >
            {aiProviderSchema.options.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </StyledSelect>
        </Field>

        <Field
          label="AI API key"
          htmlFor="aiApiKey"
          hint={maskedHint(initial.aiApiKeyMasked)}
        >
          <SecretInput
            id="aiApiKey"
            value={aiApiKey}
            placeholder="Để trống nếu không đổi"
            onChange={(e) => {
              setAiApiKey(e.target.value);
              touched();
            }}
          />
        </Field>
      </SettingsCard>

      <SettingsCard
        icon={Send}
        tone="cyan"
        title="Telegram"
        description="Bot gửi nhắc lịch & thông báo qua Telegram."
      >
        <Field
          label="Bot token"
          htmlFor="telegramBotToken"
          hint={maskedHint(initial.telegramBotTokenMasked)}
        >
          <SecretInput
            id="telegramBotToken"
            value={telegramBotToken}
            placeholder="123456:ABC-DEF…"
            onChange={(e) => {
              setTelegramBotToken(e.target.value);
              touched();
            }}
          />
        </Field>

        <Field label="Chat ID" htmlFor="telegramChatId">
          <Input
            id="telegramChatId"
            value={telegramChatId}
            placeholder="vd: 123456789"
            onChange={(e) => {
              setTelegramChatId(e.target.value);
              touched();
            }}
          />
        </Field>
      </SettingsCard>

      <SettingsCard
        icon={Workflow}
        tone="orange"
        title="n8n — Workflow Exc"
        description="Xem, retry & xóa executions từ view Jobs. Tạo API key trong n8n: Settings → n8n API (scope execution + workflow)."
      >
        <Field label="Base URL" htmlFor="n8nBaseUrl">
          <Input
            id="n8nBaseUrl"
            type="url"
            placeholder="https://n8n.nghiepdev.info"
            value={n8nBaseUrl}
            onChange={(e) => {
              setN8nBaseUrl(e.target.value);
              touched();
            }}
          />
        </Field>

        <Field
          label="API key"
          htmlFor="n8nApiKey"
          hint={maskedHint(initial.n8nApiKeyMasked)}
        >
          <SecretInput
            id="n8nApiKey"
            value={n8nApiKey}
            placeholder="Dán n8n API key (header X-N8N-API-KEY)"
            onChange={(e) => {
              setN8nApiKey(e.target.value);
              touched();
            }}
          />
        </Field>
      </SettingsCard>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu…
            </>
          ) : (
            "Lưu thay đổi"
          )}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-dot-green">
            <Check className="h-4 w-4" /> Đã lưu
          </span>
        )}
      </div>
    </form>
  );
}

/* -------------------- Khóa ghi chú -------------------- */

interface NotesLockSectionProps {
  initial: UserSettings;
  onSaved: (s: UserSettings) => void;
}

function NotesLockSection({ initial, onSaved }: NotesLockSectionProps) {
  const confirm = useConfirm();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const setMut = useMutation({
    mutationFn: api.setNotesLock,
    onSuccess: (s) => {
      reset();
      onSaved(s);
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Lưu thất bại"),
  });

  const removeMut = useMutation({
    mutationFn: (password: string) => api.removeNotesLock(password),
    onSuccess: (s) => {
      reset();
      onSaved(s);
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Xóa thất bại"),
  });

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 4) {
      setError("Mật khẩu khóa tối thiểu 4 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setMut.mutate(
      initial.hasNotesLock ? { currentPassword, newPassword } : { newPassword },
    );
  };

  const onRemove = async (): Promise<void> => {
    setError(null);
    if (!currentPassword) {
      setError("Nhập mật khẩu hiện tại để xóa");
      return;
    }
    const ok = await confirm({
      title: "Xóa mật khẩu khóa?",
      description:
        "Toàn bộ ghi chú và thư mục đang khóa sẽ được mở khóa. Bạn có chắc chắn?",
      confirmText: "Xóa mật khẩu",
      variant: "destructive",
    });
    if (ok) removeMut.mutate(currentPassword);
  };

  const busy = setMut.isPending || removeMut.isPending;

  return (
    <SettingsCard
      icon={Lock}
      tone="yellow"
      title="Khóa ghi chú"
      description={
        initial.hasNotesLock
          ? "Đã đặt mật khẩu khóa. Có thể đổi hoặc xóa bên dưới."
          : "Đặt mật khẩu khóa để bảo vệ ghi chú và thư mục."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {initial.hasNotesLock && (
          <Field label="Mật khẩu hiện tại" htmlFor="currentNotesLock">
            <SecretInput
              id="currentNotesLock"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
        )}

        <Field
          label={initial.hasNotesLock ? "Mật khẩu mới" : "Mật khẩu khóa"}
          htmlFor="newNotesLock"
        >
          <SecretInput
            id="newNotesLock"
            autoComplete="new-password"
            placeholder="Tối thiểu 4 ký tự"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>

        <Field label="Nhập lại mật khẩu" htmlFor="confirmNotesLock">
          <SecretInput
            id="confirmNotesLock"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {initial.hasNotesLock ? "Đổi mật khẩu" : "Đặt mật khẩu khóa"}
          </Button>
          {initial.hasNotesLock && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              Xóa mật khẩu khóa
            </Button>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}

/* -------------------- Pieces dùng chung -------------------- */

type Tone = "blue" | "purple" | "cyan" | "orange" | "yellow" | "green";

const TONE_CHIP: Record<Tone, string> = {
  blue: "bg-dot-blue/10 text-dot-blue",
  purple: "bg-dot-purple/10 text-dot-purple",
  cyan: "bg-dot-cyan/10 text-dot-cyan",
  orange: "bg-dot-orange/10 text-dot-orange",
  yellow: "bg-dot-yellow/10 text-dot-yellow",
  green: "bg-dot-green/10 text-dot-green",
};

function SettingsCard({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-soft">
      <header className="flex items-start gap-3 border-b border-border/60 p-4 sm:p-5">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            TONE_CHIP[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Native select bọc lại cho đồng nhất, kèm icon chevron. */
function StyledSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="flex h-10 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** Input bí mật (password) với nút hiện/ẩn nội dung. */
function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ẩn" : "Hiện"}
        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Backend mask = `•` lặp (độ dài − 4) + 4 ký tự cuối. Với key dài (vd JWT n8n)
 * dãy `•` lên tới hàng trăm ký tự làm vỡ layout → gom về 4 dấu, giữ đuôi thật.
 */
function compactMask(masked: string): string {
  const tail = masked.replace(/^•+/, "");
  if (!tail) return masked.length > 4 ? "••••" : masked; // secret ngắn (toàn •)
  return `••••${tail}`;
}

/** Gợi ý giá trị đang lưu (đã masked) cho các trường bí mật. */
function maskedHint(masked: string | null): ReactNode {
  if (!masked) return undefined;
  return (
    <>
      Hiện tại:{" "}
      <span className="font-medium tabular-nums text-foreground/70">
        {compactMask(masked)}
      </span>{" "}
      · để trống nếu không đổi
    </>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}
