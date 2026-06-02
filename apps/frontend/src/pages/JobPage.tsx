import { Briefcase } from "lucide-react";

export function JobPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dot-orange/10 text-dot-orange">
              <Briefcase className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Jobs
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Quản lý công việc và cơ hội nghề nghiệp. Tính năng đang được phát
            triển.
          </p>
        </header>

        <div className="m-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dot-orange/10 text-dot-orange">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Sắp ra mắt</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Khu vực quản lý Jobs đang được xây dựng. Hãy quay lại sau nhé.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
