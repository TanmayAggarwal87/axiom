import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type { CompiledReport } from "@/lib/report/compiler";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1e293b",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  query: {
    fontSize: 11,
    fontFamily: "Helvetica-Oblique",
    color: "#475569",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#64748b",
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 8,
    textAlign: "justify",
  },
  bulletPoint: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 12,
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    flex: 1,
  },
  subsectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
    marginTop: 6,
    marginBottom: 4,
  },
  table: {
    width: "100%",
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    borderBottomStyle: "solid",
    padding: 5,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    padding: 5,
  },
  tableCellHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#334155",
  },
  tableCell: {
    fontSize: 8,
    color: "#475569",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    borderTopStyle: "solid",
    paddingTop: 8,
  },
});

interface ReportPdfDocumentProps {
  report: CompiledReport;
}

export function ReportPdfDocument({ report }: ReportPdfDocumentProps) {
  return (
    <Document title={report.title} author="Axiom Autonomous Research Orchestrator">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.query}>&ldquo;{report.query}&rdquo;</Text>
          <View style={styles.metaRow}>
            <Text>Generated: {new Date(report.generatedAt).toLocaleString()}</Text>
            <Text>
              Spent: ${report.budgetSummary.spentUsdc.toFixed(4)} USDC / Total: $
              {report.budgetSummary.totalUsdc.toFixed(2)} USDC
            </Text>
          </View>
        </View>

        {/* Report Sections */}
        {report.sections.map((sec) => (
          <View key={sec.id} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.content.split("\n\n").map((para, i) => {
              if (para.startsWith("•") || para.startsWith("⚠")) {
                return (
                  <View key={i} style={styles.bulletPoint}>
                    <Text style={styles.bulletDot}>
                      {para.startsWith("⚠") ? "!" : "•"}
                    </Text>
                    <Text style={styles.bulletText}>
                      {para.replace(/^[•⚠]\s*/, "")}
                    </Text>
                  </View>
                );
              }
              if (para.startsWith("**")) {
                return (
                  <Text key={i} style={styles.subsectionTitle}>
                    {para.replace(/\*\*/g, "")}
                  </Text>
                );
              }
              return (
                <Text key={i} style={styles.paragraph}>
                  {para}
                </Text>
              );
            })}
          </View>
        ))}

        {/* Fact-Check Audit */}
        {report.factCheckAudit && report.factCheckAudit.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Fact-Check Verification Audit</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCellHeader, { width: "50%" }]}>Claim</Text>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Status</Text>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Evidence Count</Text>
              </View>
              {report.factCheckAudit.map((fc, i) => (
                <View key={i} style={styles.tableRow}>
                  <View style={{ width: "50%" }}>
                    <Text style={styles.tableCell}>{fc.claimText}</Text>
                    {fc.correctedText && fc.correctedText !== fc.claimText && (
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Oblique", color: "#10b981", marginTop: 2 }]}>
                        Corrected: {fc.correctedText}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tableCell, { width: "25%", fontFamily: "Helvetica-Bold" }]}>
                    {fc.status.toUpperCase()}
                  </Text>
                  <Text style={[styles.tableCell, { width: "25%" }]}>
                    {fc.evidenceCount} source(s)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Sources & Citations */}
        {report.citations && report.citations.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Sources & Citations</Text>
            {report.citations.map((cit) => (
              <View key={cit.index} style={{ marginBottom: 6, paddingLeft: 4 }}>
                <Text style={{ fontSize: 9 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>[{cit.index}] </Text>
                  <Text style={{ fontFamily: "Helvetica-Bold", color: "#2563eb" }}>{cit.source.title}</Text>
                  <Text style={{ color: "#64748b" }}> ({cit.source.type}{cit.paid ? ", x402 paid" : ""})</Text>
                </Text>
                <Link src={cit.source.url} style={{ fontSize: 8, color: "#3b82f6", marginTop: 1 }}>
                  {cit.source.url}
                </Link>
              </View>
            ))}
          </View>
        )}

        {/* Payment Proof Appendix */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Payment Proof Appendix (x402 Micropayments)</Text>
          {report.payments && report.payments.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Agent / Purpose</Text>
                <Text style={[styles.tableCellHeader, { width: "15%" }]}>Amount</Text>
                <Text style={[styles.tableCellHeader, { width: "20%" }]}>Network</Text>
                <Text style={[styles.tableCellHeader, { width: "40%" }]}>Tx Hash</Text>
              </View>
              {report.payments.map((p) => (
                <View key={p.id} style={styles.tableRow}>
                  <View style={{ width: "25%" }}>
                    <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{p.agent}</Text>
                    <Text style={[styles.tableCell, { fontSize: 7, color: "#64748b" }]}>{p.purpose}</Text>
                  </View>
                  <Text style={[styles.tableCell, { width: "15%", fontFamily: "Helvetica-Bold", color: "#10b981" }]}>
                    ${p.amountUsdc.toFixed(4)} USDC
                  </Text>
                  <Text style={[styles.tableCell, { width: "20%" }]}>{p.network}</Text>
                  <View style={{ width: "40%" }}>
                    <Link src={`https://sepolia.basescan.org/tx/${p.txHash}`} style={{ fontSize: 7, color: "#2563eb" }}>
                      {p.txHash}
                    </Link>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.paragraph, { color: "#64748b", fontFamily: "Helvetica-Oblique" }]}>
              No paid x402 micropayments were executed during this session. All sources were retrieved from open endpoints.
            </Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Axiom — Autonomous AI Research Orchestrator</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
