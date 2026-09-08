import { join } from "node:path";
import type { ReactElement } from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { InvoiceDocumentParty } from "./document-data";
import {
  createInvoiceDocumentViewModel,
  formatDate,
  formatMoney,
  formatQuantity,
  type InvoiceDocumentData,
  type InvoiceDocumentStatusTone,
} from "./document-data";

export interface InvoicePdfDocumentProps {
  data: InvoiceDocumentData;
}

const GEIST_FAMILY = "Geist Sans";
const GEIST_REGULAR_PATH = join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "geist-sans",
  "files",
  "geist-sans-latin-400-normal.woff",
);
const GEIST_MEDIUM_PATH = join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "geist-sans",
  "files",
  "geist-sans-latin-500-normal.woff",
);

if (!Font.getRegisteredFontFamilies().includes(GEIST_FAMILY)) {
  Font.register({
    family: GEIST_FAMILY,
    fonts: [
      { src: GEIST_REGULAR_PATH, fontWeight: 400 },
      { src: GEIST_MEDIUM_PATH, fontWeight: 500 },
    ],
  });
}

const COLOURS = {
  primary: "#292929",
  secondary: "#5D5D5D",
  muted: "#9E9E9E",
  divider: "#E7E7E7",
  paid: "#31A06D",
  warning: "#9B6819",
  danger: "#B64141",
} as const;

// The HTML preview is 700 × 990. Scaling its measurements to A4 points keeps
// both renderers on the same four-column rhythm.
const SCALE = 595.28 / 700;
const INSET = 28 * SCALE;
const FOOTER_HEIGHT = 88 * SCALE;

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    color: COLOURS.primary,
    fontFamily: GEIST_FAMILY,
    fontSize: 14 * SCALE,
    fontWeight: 400,
    lineHeight: 1.45,
    letterSpacing: -0.15 * SCALE,
    paddingTop: INSET,
    paddingBottom: FOOTER_HEIGHT,
  },
  medium: {
    fontWeight: 500,
  },
  header: {
    minHeight: 102 * SCALE,
    marginTop: -INSET,
    paddingTop: 24 * SCALE,
    paddingRight: INSET,
    paddingBottom: 18 * SCALE,
    paddingLeft: INSET,
    flexDirection: "row",
    borderBottomWidth: 1 * SCALE,
    borderBottomColor: COLOURS.divider,
  },
  half: {
    width: "50%",
  },
  headerTitle: {
    width: "50%",
    paddingRight: INSET,
  },
  headerNumber: {
    marginTop: 11 * SCALE,
    color: COLOURS.muted,
  },
  headerStatus: {
    marginTop: 8 * SCALE,
  },
  dates: {
    width: "50%",
    alignItems: "stretch",
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  subsequentDate: {
    marginTop: 10 * SCALE,
  },
  dateLabel: {
    marginRight: 4 * SCALE,
    color: COLOURS.secondary,
    fontWeight: 500,
  },
  muted: {
    color: COLOURS.muted,
  },
  billing: {
    minHeight: 138 * SCALE,
    paddingTop: 18 * SCALE,
    paddingRight: INSET,
    paddingBottom: 20 * SCALE,
    paddingLeft: INSET,
    flexDirection: "row",
  },
  party: {
    width: "50%",
    paddingRight: INSET,
  },
  sectionHeading: {
    marginBottom: 8 * SCALE,
    color: COLOURS.muted,
  },
  partyName: {
    fontWeight: 500,
  },
  partySecondary: {
    color: COLOURS.secondary,
  },
  itemsSection: {
    paddingTop: 0,
    paddingRight: INSET,
    paddingBottom: 18 * SCALE,
    paddingLeft: INSET,
    borderTopWidth: 1 * SCALE,
    borderTopColor: COLOURS.divider,
  },
  tableHeader: {
    flexDirection: "row",
    paddingTop: 18 * SCALE,
    paddingBottom: 10 * SCALE,
    color: COLOURS.muted,
  },
  itemRow: {
    minHeight: 28 * SCALE,
    flexDirection: "row",
    paddingBottom: 14 * SCALE,
  },
  descriptionColumn: {
    width: "46%",
    paddingRight: 18 * SCALE,
  },
  quantityColumn: {
    width: "14%",
    paddingRight: 18 * SCALE,
    textAlign: "right",
  },
  unitPriceColumn: {
    width: "20%",
    paddingRight: 18 * SCALE,
    textAlign: "right",
  },
  amountColumn: {
    width: "20%",
    textAlign: "right",
  },
  lineTitle: {
    fontWeight: 500,
  },
  lineDetails: {
    marginTop: 4 * SCALE,
    color: COLOURS.secondary,
    fontSize: 12 * SCALE,
  },
  totals: {
    width: "54%",
    marginLeft: "46%",
    paddingTop: 14 * SCALE,
    borderTopWidth: 1 * SCALE,
    borderTopColor: COLOURS.divider,
  },
  totalRow: {
    minHeight: 27 * SCALE,
    flexDirection: "row",
  },
  totalLabel: {
    width: "50%",
    color: COLOURS.muted,
  },
  totalAmount: {
    width: "50%",
    textAlign: "right",
  },
  supplemental: {
    paddingTop: 16 * SCALE,
    paddingRight: INSET,
    paddingBottom: 16 * SCALE,
    paddingLeft: INSET,
    flexDirection: "row",
    borderTopWidth: 1 * SCALE,
    borderTopColor: COLOURS.divider,
  },
  supplementalBlock: {
    width: "50%",
    paddingRight: INSET,
  },
  supplementalSingleBlock: {
    width: "100%",
    paddingRight: 0,
  },
  supplementalText: {
    color: COLOURS.secondary,
    fontSize: 12 * SCALE,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: FOOTER_HEIGHT,
    paddingTop: 22 * SCALE,
    paddingRight: INSET,
    paddingBottom: 22 * SCALE,
    paddingLeft: INSET,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1 * SCALE,
    borderTopColor: COLOURS.divider,
    backgroundColor: "#FFFFFF",
  },
  brand: {
    color: COLOURS.primary,
    fontSize: 24 * SCALE,
    fontWeight: 500,
    lineHeight: 1,
  },
  footerCopy: {
    width: "50%",
  },
  footerMessage: {
    marginTop: 7 * SCALE,
    color: COLOURS.muted,
    fontSize: 11 * SCALE,
    lineHeight: 1.3,
  },
  footerEmail: {
    width: "50%",
    color: COLOURS.muted,
    textAlign: "right",
  },
});

function statusColour(tone: InvoiceDocumentStatusTone | undefined) {
  switch (tone) {
    case "paid":
      return COLOURS.paid;
    case "warning":
      return COLOURS.warning;
    case "danger":
      return COLOURS.danger;
    default:
      return COLOURS.secondary;
  }
}

function PdfParty({ party }: { party: InvoiceDocumentParty }) {
  return (
    <View>
      <Text style={styles.partyName}>{party.name}</Text>
      {party.address.map((line, index) => (
        <Text key={`${index}-${line}`}>{line}</Text>
      ))}
      {party.email ? <Text style={styles.partySecondary}>{party.email}</Text> : null}
      {party.phone ? <Text style={styles.partySecondary}>{party.phone}</Text> : null}
      {party.taxId ? <Text>Tax ID {party.taxId}</Text> : null}
      {party.registrationNumber ? (
        <Text>Registration {party.registrationNumber}</Text>
      ) : null}
    </View>
  );
}

export function InvoicePdfDocument({
  data,
}: InvoicePdfDocumentProps): ReactElement<DocumentProps> {
  const {
    dates,
    footerEmail,
    footerMessage,
    headerStatus,
    labels,
    title,
    totals,
  } =
    createInvoiceDocumentViewModel(data);
  const locale = data.locale;

  return (
    <Document
      author={data.seller.name}
      creator="Folio"
      language={locale ?? "en-US"}
      subject={`${labels.invoice} ${data.number}`}
      title={title}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} wrap={false}>
          <View style={styles.headerTitle}>
            <Text style={styles.medium}>{title}</Text>
            <Text style={styles.headerNumber}>{data.number}</Text>
            {headerStatus ? (
              <Text
                style={[
                  styles.headerStatus,
                  { color: statusColour(data.status.tone) },
                ]}
              >
                {headerStatus}
              </Text>
            ) : null}
          </View>
          <View style={styles.dates}>
            {dates.map((date, index) => (
              <View
                key={date.key}
                style={index === 0 ? styles.dateRow : [styles.dateRow, styles.subsequentDate]}
              >
                <Text style={styles.dateLabel}>{date.label}</Text>
                <Text style={styles.muted}>{formatDate(date.value, locale)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.billing} wrap={false}>
          <View style={styles.party}>
            <Text style={styles.sectionHeading}>{labels.billFrom}</Text>
            <PdfParty party={data.seller} />
          </View>
          <View style={styles.party}>
            <Text style={styles.sectionHeading}>{labels.billTo}</Text>
            <PdfParty party={data.customer} />
          </View>
        </View>

        <View style={styles.itemsSection}>
          <View style={styles.tableHeader} minPresenceAhead={34 * SCALE}>
            <Text style={styles.descriptionColumn}>{labels.description}</Text>
            <Text style={styles.quantityColumn}>{labels.quantity}</Text>
            <Text style={styles.unitPriceColumn}>{labels.unitPrice}</Text>
            <Text style={styles.amountColumn}>{labels.amount}</Text>
          </View>
          {data.lines.map((line) => (
            <View
              style={styles.itemRow}
              minPresenceAhead={20 * SCALE}
              key={line.id}
              wrap={Boolean(line.details)}
            >
              <View style={styles.descriptionColumn}>
                <Text style={styles.lineTitle}>{line.description}</Text>
                {line.details ? (
                  <Text style={styles.lineDetails}>{line.details}</Text>
                ) : null}
              </View>
              <Text style={styles.quantityColumn}>
                {formatQuantity(line.quantity, line.unit, locale)}
              </Text>
              <Text style={styles.unitPriceColumn}>
                {formatMoney(line.unitPrice, data.currency, locale)}
              </Text>
              <Text style={styles.amountColumn}>
                {formatMoney(line.amount, data.currency, locale)}
              </Text>
            </View>
          ))}

          <View style={styles.totals} wrap={false}>
            {totals.map((total) => (
              <View style={styles.totalRow} key={total.key}>
                <Text style={styles.totalLabel}>{total.label}</Text>
                <Text
                  style={
                    total.key === "total"
                      ? [styles.totalAmount, styles.medium]
                      : styles.totalAmount
                  }
                >
                  {formatMoney(total.amount, data.currency, locale)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {data.notes || data.paymentDetails ? (
          <View style={styles.supplemental} wrap={false}>
            {data.notes ? (
              <View
                style={
                  data.paymentDetails
                    ? styles.supplementalBlock
                    : styles.supplementalSingleBlock
                }
              >
                <Text style={styles.sectionHeading}>{labels.notes}</Text>
                <Text style={styles.supplementalText}>{data.notes}</Text>
              </View>
            ) : null}
            {data.paymentDetails ? (
              <View
                style={
                  data.notes
                    ? styles.supplementalBlock
                    : styles.supplementalSingleBlock
                }
              >
                <Text style={styles.sectionHeading}>
                  {data.paymentDetails.heading ?? labels.paymentDetails}
                </Text>
                <Text style={styles.supplementalText}>
                  {data.paymentDetails.lines.join("\n")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <View style={styles.footerCopy}>
            <Text style={styles.brand}>
              {data.footer?.brand ?? data.seller.name}
            </Text>
            {footerMessage ? (
              <Text style={styles.footerMessage}>{footerMessage}</Text>
            ) : null}
          </View>
          {footerEmail ? (
            <Text style={styles.footerEmail}>{footerEmail}</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export type { InvoiceDocumentData } from "./document-data";
