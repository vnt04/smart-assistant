import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  Mail,
  Network,
  Sparkles,
  Workflow,
} from "lucide-react";

const FEATURES = [
  {
    title: "Notes & AI Assistant",
    icon: BrainCircuit,
    accent: "bg-dot-yellow/15 text-dot-yellow",
    text: "Biến ghi chú rời rạc thành kho tri thức có thể tìm kiếm, kết nối và trò chuyện cùng AI.",
    points: [
      "Notebook, tag và tìm kiếm toàn văn",
      "Đính kèm tài liệu để giữ trọn ngữ cảnh",
      "Context cho trợ lý AI cá nhân hóa",
    ],
  },
  {
    title: "Job Tracking & Evaluation",
    icon: BriefcaseBusiness,
    accent: "bg-dot-orange/15 text-dot-orange",
    text: "Theo dõi cơ hội việc làm tự động và đánh giá mức độ phù hợp dựa trên kỹ năng cùng định hướng nghề nghiệp.",
    points: [
      "Thu thập job data từ email LinkedIn",
      "Chuẩn hóa thông tin để dễ so sánh",
      "Đánh giá theo skills và career preferences",
    ],
  },
  {
    title: "Workflow Automation",
    icon: Workflow,
    accent: "bg-dot-purple/15 text-dot-purple",
    text: "Kết nối n8n và email để dữ liệu tự chảy vào đúng nơi, giúp bạn giảm công việc thủ công.",
    points: [
      "Tự động hóa việc thu thập dữ liệu",
      "Trigger workflow theo sự kiện",
      "Tối ưu công việc hằng ngày",
    ],
  },
];

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/logo.png" alt="Smart Assistant" className="h-9 w-9 object-contain" />
          <span>Smart Assistant</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Đăng nhập</Link>
          <Link to="/register" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90">Bắt đầu</Link>
        </nav>
      </header>

      <section className="relative isolate">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-32 top-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-dot-purple/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 -z-10 h-full opacity-40 [background-image:linear-gradient(hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.35)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        </div>
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-[1.08fr_0.92fr] md:items-center md:gap-16 md:pb-28 md:pt-24 lg:px-8">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"><Sparkles className="h-3.5 w-3.5" aria-hidden />Personal workspace, thoughtfully automated</div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Turn scattered work into <span className="text-primary">clear momentum.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">Một không gian cá nhân để lưu giữ tri thức, khám phá cơ hội nghề nghiệp và tự động hóa những việc lặp lại.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/register" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-pop hover:opacity-90">Tạo workspace miễn phí <ArrowRight className="h-4 w-4" aria-hidden /></Link><a href="#features" className="rounded-md border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-muted">Khám phá tính năng</a></div>
          </div>
          <div className="relative mx-auto w-full max-w-md"><div className="rounded-2xl border border-border bg-card p-4 shadow-pop sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-medium text-muted-foreground">Your personal command center</p><p className="mt-1 font-semibold">Một ngày rõ ràng hơn</p></div><div className="rounded-lg bg-accent p-2 text-primary"><Network className="h-5 w-5" aria-hidden /></div></div><div className="space-y-3"><MiniRow icon={BrainCircuit} title="Knowledge base" detail="Notes · 24 cập nhật" color="text-dot-yellow" /><MiniRow icon={BriefcaseBusiness} title="Career radar" detail="3 cơ hội phù hợp" color="text-dot-orange" /><MiniRow icon={Workflow} title="Automations" detail="n8n · đang hoạt động" color="text-dot-purple" /></div><div className="mt-5 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">AI gợi ý:</span> Gom các ý tưởng liên quan vào một notebook để bạn dễ quay lại.</div></div></div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-wider text-primary">Built around your momentum</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Mọi thứ bạn cần để biến thông tin thành hành động.</h2><p className="mt-4 text-muted-foreground">Tập trung vào điều quan trọng, để hệ thống lo phần còn lại.</p></div><div className="mt-10 grid gap-4 md:grid-cols-3">{FEATURES.map(({ title, icon: Icon, accent, text, points }) => <article key={title} className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-pop sm:p-6"><div className={`mb-6 flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}><Icon className="h-5 w-5" aria-hidden /></div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p><ul className="mt-5 space-y-3">{points.map((point) => <li key={point} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>{point}</span></li>)}</ul></article>)}</div></section>

      <section className="mx-4 mb-16 overflow-hidden rounded-2xl bg-foreground px-5 py-12 text-background sm:mx-6 sm:px-10 md:mb-24 md:py-16 lg:mx-auto lg:max-w-6xl"><div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-sm font-semibold uppercase tracking-wider text-primary">Start with a cleaner system</p><h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Your ideas are valuable. Make them easier to use.</h2></div><Link to="/register" className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">Bắt đầu ngay <ArrowRight className="h-4 w-4" aria-hidden /></Link></div></section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8"><span>© Smart Assistant</span><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" aria-hidden /> Built for focused work</span></footer>
    </main>
  );
}

function MiniRow({ icon: Icon, title, detail, color }: { icon: typeof BrainCircuit; title: string; detail: string; color: string }) { return <div className="flex items-center gap-3 rounded-xl border border-border p-3"><Icon className={`h-5 w-5 ${color}`} aria-hidden /><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>; }
