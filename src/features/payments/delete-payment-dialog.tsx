"use client";

import { Trash2 } from "@/components/ui/icons";

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

export function DeletePaymentDialog({
  action,
  paymentId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  paymentId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label="Delete payment"
          className="rounded-full text-subtle-foreground hover:text-destructive"
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-[14px]" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[14px]">Delete this payment?</DialogTitle>
          <DialogDescription>
            The invoice balance will be recalculated after this receipt is removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </DialogClose>
          <form action={action}>
            <input name="paymentId" type="hidden" value={paymentId} />
            <Button type="submit" variant="destructive">Delete payment</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
