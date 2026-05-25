import { Injectable } from "@nestjs/common";
import { aiToolInputSchemas, type AiToolName } from "@assistant/shared";
import { NotesService } from "../notes/notes.service";
import { EventsService } from "../schedule/events.service";
import { TasksService } from "../schedule/tasks.service";
import { BudgetsService } from "../expense/budgets.service";
import { ReportsService } from "../expense/reports.service";
import { TransactionsService } from "../expense/transactions.service";

@Injectable()
export class AiToolsService {
  constructor(
    private readonly notes: NotesService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
    private readonly transactions: TransactionsService,
    private readonly budgets: BudgetsService,
    private readonly reports: ReportsService,
  ) {}

  async execute(
    userId: string,
    name: AiToolName,
    rawArgs: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "searchNotes": {
        const args = aiToolInputSchemas.searchNotes.parse(rawArgs);
        return this.notes.list(userId, {
          q: args.query,
          notebookId: args.notebookId,
          tag: args.tags?.[0],
          page: 1,
          limit: 10,
        });
      }
      case "createNote": {
        const args = aiToolInputSchemas.createNote.parse(rawArgs);
        return this.notes.create(userId, {
          title: args.title,
          contentHtml: args.content,
          notebookId: args.notebookId,
          tags: args.tags,
        });
      }
      case "listSchedule": {
        const args = aiToolInputSchemas.listSchedule.parse(rawArgs);
        const [events, tasks] = await Promise.all([
          this.events.list(userId, args),
          this.tasks.list(userId,{}),
        ]);
        return { events, tasks };
      }
      case "createEvent": {
        const args = aiToolInputSchemas.createEvent.parse(rawArgs);
        return this.events.create(userId, {
          title: args.title,
          startAt: args.startAt,
          endAt: args.endAt,
          remindAt: args.reminder ? args.startAt : undefined,
        });
      }
      case "createTask": {
        const args = aiToolInputSchemas.createTask.parse(rawArgs);
        return this.tasks.create(userId, {
          title: args.title,
          priority: args.priority ?? "medium",
          deadline: args.deadline,
        });
      }
      case "queryExpenses": {
        const args = aiToolInputSchemas.queryExpenses.parse(rawArgs);
        return this.transactions.list(userId, {
          from: args.from,
          to: args.to,
          categoryId: args.categoryId,
          walletId: args.walletId,
          page: 1,
          limit: 50,
        });
      }
      case "createTransaction": {
        const args = aiToolInputSchemas.createTransaction.parse(rawArgs);
        return this.transactions.create(userId, {
          kind: args.kind,
          amount: args.amount,
          walletId: args.walletId,
          categoryId: args.categoryId,
          note: args.note,
        });
      }
      case "getBudgetStatus": {
        const args = aiToolInputSchemas.getBudgetStatus.parse(rawArgs);
        return this.budgets.list(userId, args.month);
      }
      case "summarizeNotes": {
        const args = aiToolInputSchemas.summarizeNotes.parse(rawArgs);
        const notes = await Promise.all(
          args.noteIds.map((id) => this.notes.findOne(userId, id)),
        );
        return notes.map((note) => ({
          id: note.id,
          title: note.title,
          contentText: note.contentText.slice(0, 4000),
        }));
      }
      case "getMonthlyInsights": {
        const args = aiToolInputSchemas.getMonthlyInsights.parse(rawArgs);
        const from = `${args.month}-01T00:00:00.000Z`;
        const to = nextMonth(args.month);
        const [byCategory, trend, budgets] = await Promise.all([
          this.reports.expenseByCategory(userId, { from, to }),
          this.reports.trend(userId, { from, to, granularity: "day" }),
          this.budgets.list(userId, args.month),
        ]);
        return { byCategory, trend, budgets };
      }
    }
  }
}

function nextMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value, 1));
  return date.toISOString();
}
