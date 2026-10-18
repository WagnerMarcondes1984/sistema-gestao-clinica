import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
type Receipt = {
  code: string;
  paidAmount: number;
  refundedAmount: number;
  ledgerVersion: number;
};
export function ReceiptModal({
  transaction,
  isOpen,
  onClose,
}: {
  transaction: Receipt | null;
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
        <DialogTitle>Registro interno</DialogTitle>
        <DialogDescription>
          Não é documento fiscal nem confirmação bancária.
        </DialogDescription>
        {transaction && (
          <>
            <p>{transaction.code}</p>
            <p>
              {transaction.ledgerVersion === 1
                ? "Recebido líquido registrado:"
                : "Legado não conferido:"}{" "}
              {(
                (transaction.paidAmount - transaction.refundedAmount) /
                100
              ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
