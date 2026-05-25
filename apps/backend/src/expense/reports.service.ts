import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  ExpenseByCategoryQuery,
  ExpenseByCategoryResponse,
  ExportQuery,
  ReportGranularity,
  TrendQuery,
  TrendResponse,
} from "@assistant/shared";
import { TransactionEntity } from "./entities/transaction.entity";

interface CategoryAggRow {
  cid: string | null;
  cname: string | null;
  ccolor: string | null;
  total: string | number | null;
}

interface TrendRow {
  bucket: string;
  expense: string | number | null;
  income: string | number | null;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly tx: Repository<TransactionEntity>,
  ) {}

  async expenseByCategory(
    userId: string,
    query: ExpenseByCategoryQuery,
  ): Promise<ExpenseByCategoryResponse> {
    const rows = await this.tx
      .createQueryBuilder("t")
      .leftJoin("categories", "c", "c.id = t.category_id")
      .select("t.category_id", "cid")
      .addSelect("c.name", "cname")
      .addSelect("c.color", "ccolor")
      .addSelect("COALESCE(SUM(t.amount),0)", "total")
      .where("t.user_id = :uid", { uid: userId })
      .andWhere("t.kind = 'expense'")
      .andWhere("t.occurred_at >= :from", { from: new Date(query.from) })
      .andWhere("t.occurred_at < :to", { to: new Date(query.to) })
      .groupBy("t.category_id")
      .addGroupBy("c.name")
      .addGroupBy("c.color")
      .getRawMany<CategoryAggRow>();

    const items = rows
      .map((r) => ({
        categoryId: r.cid,
        categoryName: r.cname ?? "Chưa phân loại",
        color: r.ccolor,
        total: Number(r.total ?? 0),
      }))
      .sort((a, b) => b.total - a.total);
    const total = items.reduce((acc, it) => acc + it.total, 0);
    return { total, items };
  }

  async trend(userId: string, query: TrendQuery): Promise<TrendResponse> {
    const bucketExpr = bucketExpression(query.granularity);
    const rows = await this.tx
      .createQueryBuilder("t")
      .select(`${bucketExpr}`, "bucket")
      .addSelect(
        "COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END),0)",
        "expense",
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END),0)",
        "income",
      )
      .where("t.user_id = :uid", { uid: userId })
      .andWhere("t.kind IN ('expense','income')")
      .andWhere("t.occurred_at >= :from", { from: new Date(query.from) })
      .andWhere("t.occurred_at < :to", { to: new Date(query.to) })
      .groupBy("bucket")
      .orderBy("bucket", "ASC")
      .getRawMany<TrendRow>();

    return {
      buckets: rows.map((r) => ({
        bucket: r.bucket,
        expense: Number(r.expense ?? 0),
        income: Number(r.income ?? 0),
      })),
    };
  }

  async exportCsv(userId: string, query: ExportQuery): Promise<string> {
    const rows = await this.tx
      .createQueryBuilder("t")
      .leftJoin("wallets", "w", "w.id = t.wallet_id")
      .leftJoin("wallets", "w2", "w2.id = t.transfer_to_wallet_id")
      .leftJoin("categories", "c", "c.id = t.category_id")
      .select("t.occurred_at", "occurred_at")
      .addSelect("t.kind", "kind")
      .addSelect("t.amount", "amount")
      .addSelect("w.name", "wallet")
      .addSelect("w2.name", "transfer_to")
      .addSelect("c.name", "category")
      .addSelect("t.note", "note")
      .where("t.user_id = :uid", { uid: userId })
      .andWhere("t.occurred_at >= :from", { from: new Date(query.from) })
      .andWhere("t.occurred_at < :to", { to: new Date(query.to) })
      .orderBy("t.occurred_at", "ASC")
      .getRawMany<{
        occurred_at: Date;
        kind: string;
        amount: string | number;
        wallet: string | null;
        transfer_to: string | null;
        category: string | null;
        note: string | null;
      }>();

    const header = [
      "Ngày",
      "Loại",
      "Số tiền (VND)",
      "Ví",
      "Ví đích",
      "Danh mục",
      "Ghi chú",
    ];
    const lines = [header.map(csvCell).join(",")];
    const kindLabel: Record<string, string> = {
      expense: "Chi",
      income: "Thu",
      transfer: "Chuyển khoản",
    };
    for (const r of rows) {
      lines.push(
        [
          formatVnDate(new Date(r.occurred_at)),
          kindLabel[r.kind] ?? r.kind,
          String(r.amount),
          r.wallet ?? "",
          r.transfer_to ?? "",
          r.category ?? "",
          r.note ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return `﻿${lines.join("\n")}\n`;
  }
}

function bucketExpression(g: ReportGranularity): string {
  if (g === "month") return "DATE_FORMAT(t.occurred_at, '%Y-%m')";
  if (g === "week") return "DATE_FORMAT(t.occurred_at, '%x-W%v')";
  return "DATE_FORMAT(t.occurred_at, '%Y-%m-%d')";
}

function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function formatVnDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
