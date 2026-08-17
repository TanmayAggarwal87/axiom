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
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1e293b",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    borderBottomStyle: "solid",
    paddingBottom: 10,
  },
  brandBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#059669",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 6,
  },
  queryBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
    marginBottom: 8,
  },
  queryText: {
    fontSize: 10,
    fontFamily: "Helvetica-Oblique",
    color: "#334155",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
    color: "#64748b",
    marginTop: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 6,
  },
  paragraph: {
    marginBottom: 6,
    textAlign: "justify",
    fontSize: 9.5,
  },
  bulletPoint: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 6,
  },
  bulletDot: {
    width: 12,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: "#2563eb",
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
  },
  table: {
    width: "100%",
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
    borderRadius: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    borderBottomStyle: "solid",
    padding: 5,
    minHeight: 18,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    padding: 5,
  },
  tableCellHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0f172a",
  },
  tableCell: {
    fontSize: 8,
    color: "#334155",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    borderTopStyle: "solid",
    paddingTop: 6,
  },
});

interface ReportPdfDocumentProps {
  report: CompiledReport;
}

export function ReportPdfDocument({ report }: ReportPdfDocumentProps) {
  return (
    <Document title={report.title} author="Axiom Autonomous Research Orchestrator">
      <Page size="A4" style={styles.page}>
        {/* Cover / Header Section */}
        <View style={styles.header}>
          <Text style={styles.brandBadge}>Axiom · Autonomous AI Research Report</Text>
          <Text style={styles.title}>{report.title}</Text>
          <View style={styles.queryBox}>
            <Text style={styles.queryText}>Research Question: &ldquo;{report.query}&rdquo;</Text>
          </View>
          <View style={styles.metaRow}>
            <Text>Generated: {new Date(report.generatedAt).toLocaleDateString()} {new Date(report.generatedAt).toLocaleTimeString()}</Text>
            <Text>
              Research Budget Spent: ${report.budgetSummary.spentUsdc.toFixed(4)} / ${report.budgetSummary.totalUsdc.toFixed(2)} USDC
            </Text>
          </View>
        </View>

        {/* Dynamic Report Sections */}
        {report.sections.map((sec) => (
          <View key={sec.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.content.split("\n\n").map((para, i) => {
              if (para.startsWith("•") || para.startsWith("⚠")) {
                const isRisk = para.startsWith("⚠");
                return (
                  <View key={i} style={styles.bulletPoint} wrap={false}>
                    <Text style={[styles.bulletDot, isRisk ? { color: "#d97706" } : {}]}>
                      {isRisk ? "!" : "•"}
                    </Text>
                    <Text style={styles.bulletText}>
                      {para.replace(/^[•⚠]\s*/, "")}
                    </Text>
                  </View>
                );
              }
              if (para.startsWith("**") && para.endsWith("**")) {
                return (
                  <Text key={i} style={[styles.paragraph, { fontFamily: "Helvetica-Bold", color: "#0f172a", marginTop: 4 }]}>
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

        {/* Fact-Check Audit Table */}
        {report.factCheckAudit && report.factCheckAudit.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fact-Checking Verification Audit</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} wrap={false}>
                <Text style={[styles.tableCellHeader, { width: "50%" }]}>Claim Statement</Text>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Verification Status</Text>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Evidence Count</Text>
              </View>
              {report.factCheckAudit.map((fc, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <View style={{ width: "50%" }}>
                    <Text style={styles.tableCell}>{fc.claimText}</Text>
                    {fc.correctedText && fc.correctedText !== fc.claimText && (
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Oblique", color: "#059669", marginTop: 2 }]}>
                        Corrected: {fc.correctedText}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tableCell, { width: "25%", fontFamily: "Helvetica-Bold" }]}>
                    {fc.status.toUpperCase().replace("_", " ")}
                  </Text>
                  <Text style={[styles.tableCell, { width: "25%" }]}>
                    {fc.evidenceCount} source(s)
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* References & Citations */}
        {report.citations && report.citations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>References & Bibliography</Text>
            {report.citations.map((cit) => (
              <View key={cit.index} style={{ marginBottom: 5, paddingLeft: 4 }} wrap={false}>
                <Text style={{ fontSize: 8.5 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>[{cit.index}] </Text>
                  <Text style={{ fontFamily: "Helvetica-Bold", color: "#1e293b" }}>{cit.source.title}</Text>
                  <Text style={{ color: "#64748b" }}> ({cit.source.type}{cit.paid ? ", x402 paid" : ""})</Text>
                </Text>
                {cit.source.url && (
                  <Link src={cit.source.url} style={{ fontSize: 7.5, color: "#2563eb", marginTop: 1 }}>
                    {cit.source.url}
                  </Link>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Appendix: x402 Micropayments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appendix: On-Chain Payment Proof (x402 Base Sepolia)</Text>
          {report.payments && report.payments.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} wrap={false}>
                <Text style={[styles.tableCellHeader, { width: "25%" }]}>Agent / Purpose</Text>
                <Text style={[styles.tableCellHeader, { width: "15%" }]}>Amount</Text>
                <Text style={[styles.tableCellHeader, { width: "20%" }]}>Network</Text>
                <Text style={[styles.tableCellHeader, { width: "40%" }]}>Tx Hash</Text>
              </View>
              {report.payments.map((p) => (
                <View key={p.id} style={styles.tableRow} wrap={false}>
                  <View style={{ width: "25%" }}>
                    <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{p.agent}</Text>
                    <Text style={[styles.tableCell, { fontSize: 7, color: "#64748b" }]}>{p.purpose}</Text>
                  </View>
                  <Text style={[styles.tableCell, { width: "15%", fontFamily: "Helvetica-Bold", color: "#059669" }]}>
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
              No paid x402 micropayments were executed during this session. All sources were retrieved from open access endpoints.
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
