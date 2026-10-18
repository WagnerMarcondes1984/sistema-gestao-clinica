import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function InvoiceModal({
  isOpen,
  onClose,
}: {
  transaction: unknown;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Emissão fiscal indisponível</DialogTitle>
        <DialogDescription>
          O provedor fiscal ainda não foi definido. O sistema não emitiu uma
          nota fiscal para este registro.
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
