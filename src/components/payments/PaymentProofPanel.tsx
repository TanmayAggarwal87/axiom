"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { PaymentReceipt } from "@/types/shared";
import {
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Coins,
  Link as LinkIcon,
} from "lucide-react";

interface PaymentProofPanelProps {
  payments: PaymentReceipt[];
  totalSpent: number;
}

export function PaymentProofPanel({ payments, totalSpent }: PaymentProofPanelProps) {
  if (payments.length === 0) {
    return (
      <Card className="border-border/20 bg-card/30 backdrop-blur-sm p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <CreditCard className="h-5 w-5" />
          <p className="text-sm">No x402 micropayments were made during this session.</p>
        </div>
      </Card>
    );
  }

  return (
    <Accordion defaultValue={["payments"]}>
      <AccordionItem value="payments" className="border-border/20">
        <AccordionTrigger className="hover:no-underline px-4 py-3 cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-emerald-500/10">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">
                x402 Payment Proofs
              </p>
              <p className="text-xs text-muted-foreground">
                {payments.length} payment{payments.length !== 1 ? "s" : ""} · $
                {totalSpent.toFixed(4)} USDC total · Base Sepolia testnet
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-4">
            {/* Summary Card */}
            <div className="grid grid-cols-3 gap-3">
              <MiniStat
                icon={CreditCard}
                label="Total Payments"
                value={payments.length.toString()}
                color="text-blue-400"
              />
              <MiniStat
                icon={Coins}
                label="Total Spent"
                value={`$${totalSpent.toFixed(4)}`}
                color="text-emerald-400"
              />
              <MiniStat
                icon={LinkIcon}
                label="Network"
                value="Base Sepolia"
                color="text-violet-400"
              />
            </div>

            {/* Payment Table */}
            <Card className="border-border/20 bg-muted/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/20 hover:bg-transparent">
                    <TableHead className="text-xs">Agent</TableHead>
                    <TableHead className="text-xs">Purpose</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Tx Hash</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="border-border/10 hover:bg-muted/20 transition-colors"
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-border/30"
                        >
                          {payment.agent}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {payment.purpose}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs font-mono font-semibold text-emerald-400">
                          ${payment.amountUsdc.toFixed(4)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://sepolia.basescan.org/tx/${payment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer"
                        >
                          {payment.txHash.slice(0, 6)}...{payment.txHash.slice(-4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(payment.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              All transactions are settled via x402 protocol through facilitator at{" "}
              <span className="font-mono">x402.org/facilitator</span> on Base Sepolia (chain
              id: eip155:84532)
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ─── Mini Stat Card ────────────────────────────────────────────────────────────

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border/20 bg-muted/10 p-3 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
