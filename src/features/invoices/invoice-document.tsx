import type { InvoiceDocumentParty } from "./document-data";
import {
  createInvoiceDocumentViewModel,
  formatDate,
  formatMoney,
  formatQuantity,
  type InvoiceDocumentData,
} from "./document-data";
import "./invoice-document.css";

export interface InvoiceDocumentProps {
  data: InvoiceDocumentData;
  className?: string;
}

function PartyAddress({ party }: { party: InvoiceDocumentParty }) {
  return (
    <address className="invoice-document__address">
      <strong>{party.name}</strong>
      {party.address.map((line, index) => (
        <span key={`${index}-${line}`}>{line}</span>
      ))}
      {party.email ? (
        <span className="invoice-document__party-contact">{party.email}</span>
      ) : null}
      {party.phone ? (
        <span className="invoice-document__party-contact">{party.phone}</span>
      ) : null}
      {party.taxId ? <span>Tax ID {party.taxId}</span> : null}
      {party.registrationNumber ? (
        <span>Registration {party.registrationNumber}</span>
      ) : null}
    </address>
  );
}

export function InvoiceDocument({ data, className }: InvoiceDocumentProps) {
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
  const classes = ["invoice-document", className].filter(Boolean).join(" ");

  return (
    <article className={classes} aria-label={`${labels.invoice} ${data.number}`}>
      <header className="invoice-document__header">
        <div className="invoice-document__header-title">
          <h1>{title}</h1>
          <p>{data.number}</p>
          {headerStatus ? (
            <div
              className="invoice-document__header-status"
              data-tone={data.status.tone ?? "neutral"}
            >
              {headerStatus}
            </div>
          ) : null}
        </div>
        <dl className="invoice-document__dates">
          {dates.map((date) => (
            <div key={date.key}>
              <dt>{date.label}</dt>
              <dd>{formatDate(date.value, locale)}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="invoice-document__billing" aria-label="Billing parties">
        <div className="invoice-document__party">
          <h2>{labels.billFrom}</h2>
          <PartyAddress party={data.seller} />
        </div>
        <div className="invoice-document__party">
          <h2>{labels.billTo}</h2>
          <PartyAddress party={data.customer} />
        </div>
      </section>

      <section className="invoice-document__items-section" aria-label="Invoice items">
        <table className="invoice-document__items">
          <caption className="invoice-document__sr-only">
            {labels.invoice} {data.number}
          </caption>
          <colgroup>
            <col className="invoice-document__description-column" />
            <col className="invoice-document__quantity-column" />
            <col className="invoice-document__unit-price-column" />
            <col className="invoice-document__amount-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{labels.description}</th>
              <th scope="col">{labels.quantity}</th>
              <th scope="col">{labels.unitPrice}</th>
              <th scope="col">{labels.amount}</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr className="invoice-document__item-row" key={line.id}>
                <td>
                  <span className="invoice-document__line-title">
                    {line.description}
                  </span>
                  {line.details ? (
                    <span className="invoice-document__line-details">
                      {line.details}
                    </span>
                  ) : null}
                </td>
                <td>{formatQuantity(line.quantity, line.unit, locale)}</td>
                <td>{formatMoney(line.unitPrice, data.currency, locale)}</td>
                <td>{formatMoney(line.amount, data.currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="invoice-document__totals">
          {totals.map((total) => (
            <div
              className="invoice-document__total-row"
              data-total={total.key === "total" ? "true" : undefined}
              key={total.key}
            >
              <dt>{total.label}</dt>
              <dd>{formatMoney(total.amount, data.currency, locale)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {data.notes || data.paymentDetails ? (
        <section
          className="invoice-document__supplemental"
          data-layout={data.notes && data.paymentDetails ? "split" : "single"}
          aria-label="Additional invoice information"
        >
          {data.notes ? (
            <div className="invoice-document__supplemental-block">
              <h2>{labels.notes}</h2>
              <p>{data.notes}</p>
            </div>
          ) : null}
          {data.paymentDetails ? (
            <div className="invoice-document__supplemental-block">
              <h2>{
                data.paymentDetails.heading ?? labels.paymentDetails
              }</h2>
              <p>{data.paymentDetails.lines.join("\n")}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="invoice-document__footer">
        <div className="invoice-document__footer-copy">
          <p className="invoice-document__brand">
            {data.footer?.brand ?? data.seller.name}
          </p>
          {footerMessage ? (
            <p className="invoice-document__footer-message">{footerMessage}</p>
          ) : null}
        </div>
        {footerEmail ? (
          <p className="invoice-document__footer-email">{footerEmail}</p>
        ) : null}
      </footer>
    </article>
  );
}

export type { InvoiceDocumentData } from "./document-data";
