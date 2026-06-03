import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Globe,
  Link2,
  Loader2,
  Lock,
  Mail,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Share, ShareResourceType } from "@assistant/shared";
import { ApiError, api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { useConfirm } from "../ui/confirm-dialog";
import { Input } from "../ui/input";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Đã xảy ra lỗi, vui lòng thử lại";
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
}: ShareDialogProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const queryKey = ["share", resourceType, resourceId];

  const [email, setEmail] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset trạng thái cục bộ mỗi khi mở cho resource khác.
  useEffect(() => {
    if (open) {
      setEmail("");
      setActionError(null);
      setCopied(false);
    }
  }, [open, resourceId]);

  const shareQuery = useQuery({
    queryKey,
    queryFn: () => api.getShare(resourceType, resourceId),
    enabled: open,
  });

  const share = shareQuery.data;
  const onSuccess = (updated: Share): void => {
    qc.setQueryData(queryKey, updated);
    setActionError(null);
  };
  const onError = (err: unknown): void => setActionError(errorMessage(err));

  const linkMut = useMutation({
    mutationFn: (linkAccess: "none" | "view") =>
      api.setShareLink(resourceType, resourceId, linkAccess),
    onSuccess,
    onError,
  });
  const addInviteMut = useMutation({
    mutationFn: (value: string) =>
      api.addShareInvite(resourceType, resourceId, value),
    onSuccess: (updated) => {
      onSuccess(updated);
      setEmail("");
    },
    onError,
  });
  const removeInviteMut = useMutation({
    mutationFn: (inviteId: string) =>
      api.removeShareInvite(resourceType, resourceId, inviteId),
    onSuccess,
    onError,
  });
  const stopMut = useMutation({
    mutationFn: () => api.stopShare(resourceType, resourceId),
    onSuccess: () => {
      qc.removeQueries({ queryKey });
      onOpenChange(false);
    },
    onError,
  });

  const linkOn = share?.linkAccess === "view";
  const isShared = linkOn || (share?.invites.length ?? 0) > 0;
  const busy =
    linkMut.isPending ||
    addInviteMut.isPending ||
    removeInviteMut.isPending ||
    stopMut.isPending;

  const handleAddInvite = (): void => {
    const value = email.trim();
    if (!value) return;
    if (!value.includes("@")) {
      setActionError("Email không hợp lệ");
      return;
    }
    addInviteMut.mutate(value);
  };

  const handleCopy = async (): Promise<void> => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Không sao chép được, hãy copy thủ công");
    }
  };

  const handleStop = async (): Promise<void> => {
    const ok = await confirm({
      title: "Ngừng chia sẻ?",
      description:
        "Liên kết hiện tại sẽ ngừng hoạt động và mọi người được mời sẽ mất quyền xem.",
      confirmText: "Ngừng chia sẻ",
      variant: "destructive",
    });
    if (ok) stopMut.mutate();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-pop focus:outline-none">
          <DialogPrimitive.Title className="truncate text-base font-semibold leading-snug">
            Chia sẻ “{resourceName || "Không tên"}”
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            Người nhận chỉ có quyền xem, không chỉnh sửa được.
          </DialogPrimitive.Description>

          {shareQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : shareQuery.isError || !share ? (
            <p className="py-8 text-center text-sm text-destructive">
              Không tải được thông tin chia sẻ.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {/* Mời theo email */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Mời theo email
                </div>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    inputMode="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddInvite();
                      }
                    }}
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    size="md"
                    onClick={handleAddInvite}
                    disabled={busy || !email.trim()}
                  >
                    Thêm
                  </Button>
                </div>
                {share.invites.length > 0 ? (
                  <ul className="space-y-1">
                    {share.invites.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {invite.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInviteMut.mutate(invite.id)}
                          disabled={busy}
                          aria-label={`Gỡ ${invite.email}`}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Chưa mời ai. Người được mời phải đăng nhập đúng email để xem.
                  </p>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* Quyền truy cập chung */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        linkOn
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {linkOn ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Bất kỳ ai có link</p>
                      <p className="text-xs text-muted-foreground">
                        {linkOn
                          ? "Ai có link đều xem được"
                          : "Chỉ người được mời mới xem được"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={linkOn}
                    aria-label="Bật/tắt link công khai"
                    disabled={busy}
                    onClick={() => linkMut.mutate(linkOn ? "none" : "view")}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                      linkOn ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                        linkOn ? "translate-x-5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                </div>

                {linkOn && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-1.5">
                    <Link2 className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {shareUrl(share.token)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopy()}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Sao chép
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {actionError && (
                <p className="text-sm text-destructive">{actionError}</p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {isShared ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleStop()}
                    disabled={busy}
                  >
                    Ngừng chia sẻ
                  </Button>
                ) : (
                  <span />
                )}
                <DialogPrimitive.Close asChild>
                  <Button type="button" size="sm" variant="outline">
                    Xong
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
