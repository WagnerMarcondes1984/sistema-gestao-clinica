export type VerticalCode =
  | 'DENTAL_CLINIC'
  | 'MEDICAL_CLINIC'
  | 'AESTHETIC_CLINIC'
  | 'PHYSIOTHERAPY_CLINIC'
  | 'PSYCHOLOGY_CLINIC'
  | 'ALL';

export type PaymentMethod =
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'BOLETO'
  | 'CASH'
  | 'TRANSFER';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'OVERDUE'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface VerticalPreset {
  code: VerticalCode;
  businessType?: string;
  name: string;
  tagline: string;
  badge: string;
  council: string;
  primaryColor: string;
  accentColor: string;
  lightBg: string;
  darkBg: string;
  borderTone: string;
  glowClass: string;
  badgeClass: string;
  textTone: string;
  cnpj: string;
  municipalReg: string;
  city: string;
  defaultUnit: string;
  defaultOperator: string;
  defaultProfessional: string;
  catalog: Array<{
    name: string;
    category: string;
    defaultPrice: number; // centavos
    type: 'PROCEDURE' | 'SERVICE' | 'PRODUCT';
  }>;
}

export interface Transaction {
  id: number;
  code: string;
  verticalCode: string;
  patientName: string;
  patientDocument: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  professionalName: string;
  unitName?: string | null;
  title: string;
  type: 'RECEITA' | 'DESPESA';
  category: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  subtotal: number;
  discount: number;
  addition: number;
  totalAmount: number;
  paidAmount: number;
  installments: number;
  installmentValue?: number | null;
  dueDate: Date | string;
  paidAt?: Date | string | null;
  pixQrCode?: string | null;
  pixCopiaECola?: string | null;
  pixExpiresAt?: Date | string | null;
  barcode?: string | null;
  digitableLine?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  nsu?: string | null;
  authorizationCode?: string | null;
  cashReceived?: number | null;
  cashChange?: number | null;
  invoiceNumber?: string | null;
  invoiceStatus: 'NOT_ISSUED' | 'ISSUED' | 'CANCELLED' | 'ERROR';
  invoiceKey?: string | null;
  invoiceIssuedAt?: Date | string | null;
  operatorName?: string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  items?: Array<{
    id?: number;
    name: string;
    type: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface AccountPayable {
  id: number;
  code: string;
  verticalCode: string;
  supplierName: string;
  description: string;
  category: string;
  amount: number;
  dueDate: Date | string;
  paidAt?: Date | string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paymentMethod?: string | null;
  beneficiaryDocument?: string | null;
  notes?: string | null;
  createdAt: Date | string;
}

export interface CashSession {
  id: number;
  verticalCode: string;
  sessionNumber: string;
  operatorName: string;
  status: 'OPEN' | 'CLOSED';
  openingBalance: number;
  cashInflow: number;
  cashOutflow: number;
  expectedBalance: number;
  closingBalance?: number | null;
  difference?: number | null;
  openedAt: Date | string;
  closedAt?: Date | string | null;
  closingNotes?: string | null;
}
