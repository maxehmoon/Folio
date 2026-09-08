"use client";

import { Send } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function IssueInvoiceDialog({
  action,
  invoiceId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  invoiceId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="rounded-full text-[13px]">
          <Send aria-hidden="true" className="size-[14px]" />
          Issue invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[14px]">Issue this invoice?</DialogTitle>
          <DialogDescription>
            Folio will assign the next invoice number. You can still edit the invoice after issuing it, and previous versions will be kept in edit history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Keep as draft</Button>
          </DialogClose>
          <form action={action}>
            <input name="invoiceId" type="hidden" value={invoiceId} />
            <Button type="submit">Issue invoice</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
