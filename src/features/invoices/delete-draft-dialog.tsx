"use client";

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

export function DeleteDraftDialog({
  action,
  invoiceId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  invoiceId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="rounded-full text-[13px]" variant="destructive">
          Delete draft
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[14px]">Delete this draft?</DialogTitle>
          <DialogDescription>
            The invoice and its line items will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </DialogClose>
          <form action={action}>
            <input name="invoiceId" type="hidden" value={invoiceId} />
            <Button type="submit" variant="destructive">Delete draft</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
