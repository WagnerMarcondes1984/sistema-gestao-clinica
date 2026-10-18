import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

async function seed() {
  const connection = await mysql.createConnection(DATABASE_URL);
  console.log("Connected to database for seeding...");

  // 1. Inserir as 5 verticais clínicas
  const verticals = [
    {
      code: 'DENTAL_CLINIC',
      name: 'Oralis Odontologia Integrada',
      tagline: 'Excelência em reabilitação oral, implantodontia e estética dental',
      primaryColor: '#0D9488', // Teal elegante
      accentColor: '#14B8A6',
      badgeLabel: 'Odontologia Especializada',
      cnpj: '18.420.912/0001-44',
      municipalRegistration: '9.412.081-3',
      city: 'São Paulo - SP',
    },
    {
      code: 'MEDICAL_CLINIC',
      name: 'MedCore Centro Médico & Diagnóstico',
      tagline: 'Cuidado clínico multidisciplinar, exames e medicina preventiva',
      primaryColor: '#1E40AF', // Azul Real / Safira profundo
      accentColor: '#3B82F6',
      badgeLabel: 'Medicina e Especialidades',
      cnpj: '24.118.730/0001-90',
      municipalRegistration: '7.821.554-1',
      city: 'São Paulo - SP',
    },
    {
      code: 'AESTHETIC_CLINIC',
      name: 'Lumina Dermatologia & Estética Avançada',
      tagline: 'Harmonização facial, lasers de última geração e dermatologia clínica',
      primaryColor: '#9D174D', // Magenta / Rose Gold escuro luxuoso
      accentColor: '#BE185D',
      badgeLabel: 'Estética & Harmonização',
      cnpj: '33.902.148/0001-12',
      municipalRegistration: '5.109.873-6',
      city: 'São Paulo - SP',
    },
    {
      code: 'PHYSIOTHERAPY_CLINIC',
      name: 'Kinesys Reabilitação & Performance',
      tagline: 'Fisioterapia traumato-ortopédica, pilates clínico e recuperação motora',
      primaryColor: '#065F46', // Verde Esmeralda nobre
      accentColor: '#059669',
      badgeLabel: 'Fisioterapia & Reabilitação',
      cnpj: '41.229.083/0001-57',
      municipalRegistration: '3.627.189-9',
      city: 'São Paulo - SP',
    },
    {
      code: 'PSYCHOLOGY_CLINIC',
      name: 'MindOS Psicologia & Saúde Mental',
      tagline: 'Cuidado psicológico com presença, segurança e continuidade',
      primaryColor: '#4338CA', // Índigo profundo / Lavanda nobre
      accentColor: '#6366F1',
      badgeLabel: 'MindOS • Psicologia & Saúde Mental',
      cnpj: '50.771.394/0001-83',
      municipalRegistration: '1.983.420-0',
      city: 'São Paulo - SP',
    },
  ];

  for (const v of verticals) {
    await connection.execute(
      `INSERT INTO clinical_verticals (code, name, tagline, primaryColor, accentColor, badgeLabel, cnpj, municipalRegistration, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), tagline=VALUES(tagline), primaryColor=VALUES(primaryColor), accentColor=VALUES(accentColor), badgeLabel=VALUES(badgeLabel)`,
      [v.code, v.name, v.tagline, v.primaryColor, v.accentColor, v.badgeLabel, v.cnpj, v.municipalRegistration, v.city]
    );
  }

  console.log("Verticals seeded successfully.");

  // Limpar transações anteriores para idempotência
  await connection.execute(`DELETE FROM transaction_items WHERE id > 0`);
  await connection.execute(`DELETE FROM transactions WHERE id > 0`);
  await connection.execute(`DELETE FROM accounts_payable WHERE id > 0`);
  await connection.execute(`DELETE FROM cash_sessions WHERE id > 0`);
  await connection.execute(`DELETE FROM financial_audit_logs WHERE id > 0`);

  // 2. Inserir Transações com diversidade de status, métodos e verticais
  const sampleTransactions = [
    // DENTAL_CLINIC
    {
      code: 'COB-2026-1001',
      verticalCode: 'DENTAL_CLINIC',
      patientName: 'Mariana Azevedo Castro',
      patientDocument: '284.910.488-21',
      patientEmail: 'mariana.castro@gmail.com',
      patientPhone: '(11) 98452-1100',
      professionalName: 'Dr. Lucas Silveira (CRO 104.992)',
      unitName: 'Unidade Jardins',
      title: 'Implante Dentário Unitário Titânio + Prótese Cerâmica',
      category: 'Implantodontia',
      paymentMethod: 'PIX',
      status: 'PAID',
      subtotal: 420000, // R$ 4.200,00
      discount: 20000,  // R$ 200,00
      addition: 0,
      totalAmount: 400000, // R$ 4.000,00
      paidAmount: 400000,
      installments: 1,
      dueDate: new Date('2026-09-04T14:30:00Z'),
      paidAt: new Date('2026-09-04T14:32:15Z'),
      pixQrCode: '00020126580014br.gov.bcb.pix0136oralis-financeiro@oralis.com.br52040000530398654064000.005802BR5925Oralis Odontologia Jardins6009SAO PAULO62140510COB1001PIX6304C10A',
      pixCopiaECola: 'oralis-financeiro@oralis.com.br/pix/cob-2026-1001',
      invoiceNumber: 'NFS-2026/00891',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-1001',
      invoiceIssuedAt: new Date('2026-09-04T14:35:00Z'),
      operatorName: 'Camila Rocha (Caixa)',
      items: [
        { name: 'Instalação de Implante Osseointegrado Titânio Neodent', type: 'PROCEDURE', quantity: 1, unitPrice: 280000, subtotal: 280000 },
        { name: 'Coroa Cerâmica Pura Zircônia CAD/CAM', type: 'PROCEDURE', quantity: 1, unitPrice: 140000, subtotal: 140000 },
      ]
    },
    {
      code: 'COB-2026-1002',
      verticalCode: 'DENTAL_CLINIC',
      patientName: 'Roberto Albuquerque Neto',
      patientDocument: '145.829.308-54',
      patientEmail: 'roberto.neto@empresa.com.br',
      patientPhone: '(11) 97103-9921',
      professionalName: 'Dra. Beatriz Fontana (CRO 98.411)',
      unitName: 'Unidade Jardins',
      title: 'Tratamento Ortodôntico Alinhador Invisível (Etapa 1)',
      category: 'Ortodontia',
      paymentMethod: 'CREDIT_CARD',
      status: 'PAID',
      subtotal: 680000, // R$ 6.800,00
      discount: 0,
      addition: 0,
      totalAmount: 680000,
      paidAmount: 680000,
      installments: 10,
      installmentValue: 68000,
      dueDate: new Date('2026-09-05T10:15:00Z'),
      paidAt: new Date('2026-09-05T10:16:42Z'),
      cardBrand: 'Mastercard',
      cardLast4: '8821',
      nsu: '984120841',
      authorizationCode: 'AUT7729',
      invoiceNumber: 'NFS-2026/00892',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-1002',
      invoiceIssuedAt: new Date('2026-09-05T10:20:00Z'),
      operatorName: 'Camila Rocha (Caixa)',
      items: [
        { name: 'Planejamento Digital 3D + Kit Alinhadores Invisíveis', type: 'PROCEDURE', quantity: 1, unitPrice: 680000, subtotal: 680000 }
      ]
    },
    {
      code: 'COB-2026-1003',
      verticalCode: 'DENTAL_CLINIC',
      patientName: 'Fernanda Lins Guimarães',
      patientDocument: '319.482.019-87',
      patientEmail: 'fernanda.lins@uol.com.br',
      patientPhone: '(11) 99128-4433',
      professionalName: 'Dr. Lucas Silveira (CRO 104.992)',
      unitName: 'Unidade Paulista',
      title: 'Profilaxia Completa + Clareamento Dental Consultório',
      category: 'Estética Dental',
      paymentMethod: 'PIX',
      status: 'PENDING',
      subtotal: 95000, // R$ 950,00
      discount: 5000,
      addition: 0,
      totalAmount: 90000,
      paidAmount: 0,
      installments: 1,
      dueDate: new Date('2026-09-06T18:00:00Z'),
      pixQrCode: '00020126580014br.gov.bcb.pix0136oralis-financeiro@oralis.com.br5204000053039865405900.005802BR5925Oralis Odontologia6009SAO PAULO62140510COB1003PIX6304D81B',
      pixCopiaECola: 'oralis-financeiro@oralis.com.br/pix/cob-2026-1003',
      invoiceStatus: 'NOT_ISSUED',
      operatorName: 'Renata Dias',
      items: [
        { name: 'Tartarectomia e Profilaxia com Jato de Bicarbonato', type: 'PROCEDURE', quantity: 1, unitPrice: 35000, subtotal: 35000 },
        { name: 'Clareamento Dental em Consultório Fotoativado', type: 'PROCEDURE', quantity: 1, unitPrice: 60000, subtotal: 60000 },
      ]
    },
    // MEDICAL_CLINIC
    {
      code: 'COB-2026-2001',
      verticalCode: 'MEDICAL_CLINIC',
      patientName: 'Eduardo Peixoto Ramos',
      patientDocument: '098.411.238-19',
      patientEmail: 'eduardo.peixoto@globo.com',
      patientPhone: '(11) 98765-4321',
      professionalName: 'Dr. Rodrigo Mendonça (CRM 142.880)',
      unitName: 'Hospital Day Vila Mariana',
      title: 'Consulta Cardiologia Especializada + Eletrocardiograma',
      category: 'Cardiologia',
      paymentMethod: 'DEBIT_CARD',
      status: 'PAID',
      subtotal: 55000, // R$ 550,00
      discount: 0,
      addition: 0,
      totalAmount: 55000,
      paidAmount: 55000,
      installments: 1,
      dueDate: new Date('2026-09-04T09:00:00Z'),
      paidAt: new Date('2026-09-04T09:22:10Z'),
      cardBrand: 'Visa Débito',
      cardLast4: '4190',
      nsu: '78219412',
      authorizationCode: 'APPR991',
      invoiceNumber: 'NFS-2026/01420',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-2001',
      invoiceIssuedAt: new Date('2026-09-04T09:25:00Z'),
      operatorName: 'Gabriel Siqueira (Recepção)',
      items: [
        { name: 'Consulta Médica Especializada em Cardiologia', type: 'SERVICE', quantity: 1, unitPrice: 45000, subtotal: 45000 },
        { name: 'Eletrocardiograma de Repouso com Laudo Digital', type: 'PROCEDURE', quantity: 1, unitPrice: 10000, subtotal: 10000 }
      ]
    },
    {
      code: 'COB-2026-2002',
      verticalCode: 'MEDICAL_CLINIC',
      patientName: 'Carolina Vianna Meirelles',
      patientDocument: '402.194.887-03',
      patientEmail: 'carolina.vianna@outlook.com',
      patientPhone: '(11) 97654-3210',
      professionalName: 'Dra. Helena Barreto (CRM 159.201)',
      unitName: 'Hospital Day Vila Mariana',
      title: 'Check-up Metabólico & Bioimpedância Médica',
      category: 'Endocrinologia',
      paymentMethod: 'CASH',
      status: 'PAID',
      subtotal: 62000, // R$ 620,00
      discount: 2000,
      addition: 0,
      totalAmount: 60000,
      paidAmount: 60000,
      installments: 1,
      dueDate: new Date('2026-09-05T11:40:00Z'),
      paidAt: new Date('2026-09-05T11:45:00Z'),
      cashReceived: 60000,
      cashChange: 0,
      invoiceNumber: 'NFS-2026/01421',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-2002',
      invoiceIssuedAt: new Date('2026-09-05T11:46:00Z'),
      operatorName: 'Gabriel Siqueira (Recepção)',
      items: [
        { name: 'Consulta Médica Endocrinologia & Metabologia', type: 'SERVICE', quantity: 1, unitPrice: 50000, subtotal: 50000 },
        { name: 'Exame de Bioimpedância Clínica Segmentar InBody', type: 'PROCEDURE', quantity: 1, unitPrice: 12000, subtotal: 12000 }
      ]
    },
    {
      code: 'COB-2026-2003',
      verticalCode: 'MEDICAL_CLINIC',
      patientName: 'Vicente Fontes Moreira',
      patientDocument: '055.918.421-99',
      patientEmail: 'vicente.fontes@tech.com',
      patientPhone: '(11) 99881-2244',
      professionalName: 'Dr. Rodrigo Mendonça (CRM 142.880)',
      unitName: 'Hospital Day Vila Mariana',
      title: 'Procedimento Pequena Cirurgia Dermatológica / Exérese',
      category: 'Cirurgia Ambulatorial',
      paymentMethod: 'BOLETO',
      status: 'OVERDUE',
      subtotal: 120000,
      discount: 0,
      addition: 0,
      totalAmount: 120000,
      paidAmount: 0,
      installments: 1,
      dueDate: new Date('2026-09-01T23:59:59Z'),
      barcode: '2379338128600830130284011000000120000',
      digitableLine: '23793.38128 60083.013028 40110.000001 8 98210000120000',
      invoiceStatus: 'NOT_ISSUED',
      operatorName: 'Gabriel Siqueira',
      items: [
        { name: 'Exérese de Lesão Cutânea com Sutura em Camadas', type: 'PROCEDURE', quantity: 1, unitPrice: 120000, subtotal: 120000 }
      ]
    },
    // AESTHETIC_CLINIC
    {
      code: 'COB-2026-3001',
      verticalCode: 'AESTHETIC_CLINIC',
      patientName: 'Juliana Sampaio Ferraz',
      patientDocument: '276.109.840-77',
      patientEmail: 'juliana.ferraz@advocacia.com',
      patientPhone: '(11) 98112-9988',
      professionalName: 'Dra. Vanessa Aragão (CRM 188.420)',
      unitName: 'Unidade Oscar Freire',
      title: 'Aplicação Toxina Botulínica Facial Completa + Preenchimento Malar',
      category: 'Harmonização Facial',
      paymentMethod: 'CREDIT_CARD',
      status: 'PAID',
      subtotal: 380000,
      discount: 15000,
      addition: 0,
      totalAmount: 365000,
      paidAmount: 365000,
      installments: 6,
      installmentValue: 60833,
      dueDate: new Date('2026-09-03T16:00:00Z'),
      paidAt: new Date('2026-09-03T16:12:00Z'),
      cardBrand: 'Elo Nanquim',
      cardLast4: '9012',
      nsu: '33189210',
      authorizationCode: 'ELO7892',
      invoiceNumber: 'NFS-2026/02100',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-3001',
      invoiceIssuedAt: new Date('2026-09-03T16:15:00Z'),
      operatorName: 'Aline Bittencourt (Concierge)',
      items: [
        { name: 'Toxina Botulínica Botox Allergan 50U Facial Completa', type: 'PROCEDURE', quantity: 1, unitPrice: 180000, subtotal: 180000 },
        { name: 'Ácido Hialurônico Juvederm Voluma 1ml Região Malar', type: 'PROCEDURE', quantity: 1, unitPrice: 200000, subtotal: 200000 }
      ]
    },
    {
      code: 'COB-2026-3002',
      verticalCode: 'AESTHETIC_CLINIC',
      patientName: 'Marcella Brandão Leite',
      patientDocument: '381.940.112-65',
      patientEmail: 'marcella.leite@brandao.com',
      patientPhone: '(11) 99341-7700',
      professionalName: 'Dra. Vanessa Aragão (CRM 188.420)',
      unitName: 'Unidade Oscar Freire',
      title: 'Protocolo Laser Lavieen Rejuvenescimento (Pacote 3 Sessões)',
      category: 'Tecnologias a Laser',
      paymentMethod: 'PIX',
      status: 'REFUNDED',
      subtotal: 270000,
      discount: 20000,
      addition: 0,
      totalAmount: 250000,
      paidAmount: 250000,
      installments: 1,
      dueDate: new Date('2026-09-02T15:00:00Z'),
      paidAt: new Date('2026-09-02T15:02:18Z'),
      pixQrCode: '00020126580014br.gov.bcb.pix0136lumina-pagamentos@lumina.com.br52040000530398654062500.005802BR5925Lumina Estetica Avançada6009SAO PAULO62140510COB3002PIX6304E92C',
      pixCopiaECola: 'lumina-pagamentos@lumina.com.br/pix/cob-2026-3002',
      invoiceNumber: 'NFS-2026/02101',
      invoiceStatus: 'CANCELLED',
      notes: 'Estorno total solicitado pela paciente devido a contraindicação dermatológica recente.',
      operatorName: 'Aline Bittencourt (Concierge)',
      items: [
        { name: 'Sessão Laser Fracionado Lavieen BB Laser', type: 'PROCEDURE', quantity: 3, unitPrice: 90000, subtotal: 270000 }
      ]
    },
    // PHYSIOTHERAPY_CLINIC
    {
      code: 'COB-2026-4001',
      verticalCode: 'PHYSIOTHERAPY_CLINIC',
      patientName: 'Felipe Antunes Prado',
      patientDocument: '194.028.749-30',
      patientEmail: 'felipe.prado@corredores.com.br',
      patientPhone: '(11) 98229-4100',
      professionalName: 'Dr. Thiago Nogueira (CREFITO 214.881)',
      unitName: 'Unidade Ibirapuera',
      title: 'Plano Reabilitação Pós-Operatório LCA Joelho (10 Sessões)',
      category: 'Reabilitação Ortopédica',
      paymentMethod: 'PIX',
      status: 'PAID',
      subtotal: 180000,
      discount: 10000,
      addition: 0,
      totalAmount: 170000,
      paidAmount: 170000,
      installments: 1,
      dueDate: new Date('2026-09-04T08:00:00Z'),
      paidAt: new Date('2026-09-04T08:04:31Z'),
      pixQrCode: '00020126580014br.gov.bcb.pix0136kinesys-finance@kinesys.med.br52040000530398654061700.005802BR5925Kinesys Fisioterapia6009SAO PAULO62140510COB4001PIX6304B77F',
      pixCopiaECola: 'kinesys-finance@kinesys.med.br/pix/cob-2026-4001',
      invoiceNumber: 'NFS-2026/00512',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-4001',
      invoiceIssuedAt: new Date('2026-09-04T08:06:00Z'),
      operatorName: 'Marcos Vinicius (Caixa)',
      items: [
        { name: 'Sessão Fisioterapia Esportiva & Dinamometria Isocinética', type: 'PROCEDURE', quantity: 10, unitPrice: 18000, subtotal: 180000 }
      ]
    },
    {
      code: 'COB-2026-4002',
      verticalCode: 'PHYSIOTHERAPY_CLINIC',
      patientName: 'Beatriz Macedo Silveira',
      patientDocument: '312.894.021-11',
      patientEmail: 'beatriz.macedo@gmail.com',
      patientPhone: '(11) 97711-2299',
      professionalName: 'Dra. Priscila Dantas (CREFITO 198.340)',
      unitName: 'Unidade Ibirapuera',
      title: 'Pilates Clínico Individual - Mensalidade 2x/Semana',
      category: 'Pilates Clínico',
      paymentMethod: 'CREDIT_CARD',
      status: 'PAID',
      subtotal: 98000,
      discount: 0,
      addition: 0,
      totalAmount: 98000,
      paidAmount: 98000,
      installments: 2,
      installmentValue: 49000,
      dueDate: new Date('2026-09-05T09:30:00Z'),
      paidAt: new Date('2026-09-05T09:31:40Z'),
      cardBrand: 'Visa',
      cardLast4: '1094',
      nsu: '9841289',
      authorizationCode: 'OK3918',
      invoiceNumber: 'NFS-2026/00513',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-4002',
      invoiceIssuedAt: new Date('2026-09-05T09:35:00Z'),
      operatorName: 'Marcos Vinicius (Caixa)',
      items: [
        { name: 'Mensalidade Pilates com Fisioterapeuta Especialista', type: 'SERVICE', quantity: 1, unitPrice: 98000, subtotal: 98000 }
      ]
    },
    // PSYCHOLOGY_CLINIC
    {
      code: 'COB-2026-5001',
      verticalCode: 'PSYCHOLOGY_CLINIC',
      patientName: 'Guilherme Toledo Barbosa',
      patientDocument: '298.114.708-42',
      patientEmail: 'guilherme.toledo@psico.com',
      patientPhone: '(11) 98402-1928',
      professionalName: 'Dra. Clarice Vianna (CRP 06/142.990)',
      unitName: 'Espaço Terapêutico Pinheiros',
      title: 'Pacote Mensal Psicoterapia Cognitivo-Comportamental (4 Sessões)',
      category: 'Psicoterapia Adulto',
      paymentMethod: 'PIX',
      status: 'PAID',
      subtotal: 120000,
      discount: 5000,
      addition: 0,
      totalAmount: 115000,
      paidAmount: 115000,
      installments: 1,
      dueDate: new Date('2026-09-04T17:00:00Z'),
      paidAt: new Date('2026-09-04T17:03:12Z'),
      pixQrCode: '00020126580014br.gov.bcb.pix0136serene-financeiro@serene.com.br52040000530398654061150.005802BR5925Serene Psicologia6009SAO PAULO62140510COB5001PIX6304C92A',
      pixCopiaECola: 'serene-financeiro@serene.com.br/pix/cob-2026-5001',
      invoiceNumber: 'NFS-2026/00388',
      invoiceStatus: 'ISSUED',
      invoiceKey: 'NFS-SP-3550308-2026-09-5001',
      invoiceIssuedAt: new Date('2026-09-04T17:05:00Z'),
      operatorName: 'Larissa Alencar (Atendimento)',
      items: [
        { name: 'Sessão de Terapia Cognitivo-Comportamental (TCC)', type: 'SERVICE', quantity: 4, unitPrice: 30000, subtotal: 120000 }
      ]
    },
    {
      code: 'COB-2026-5002',
      verticalCode: 'PSYCHOLOGY_CLINIC',
      patientName: 'Lorena Camargo Fontenele',
      patientDocument: '419.002.839-81',
      patientEmail: 'lorena.fontenele@gmail.com',
      patientPhone: '(11) 99192-3847',
      professionalName: 'Dr. Otávio Ramos (CRP 06/119.400)',
      unitName: 'Espaço Terapêutico Pinheiros',
      title: 'Avaliação Neuropsicológica Completa com Bateria de Testes',
      category: 'Neuropsicologia',
      paymentMethod: 'CREDIT_CARD',
      status: 'PENDING',
      subtotal: 260000,
      discount: 0,
      addition: 0,
      totalAmount: 260000,
      paidAmount: 0,
      installments: 4,
      installmentValue: 65000,
      dueDate: new Date('2026-09-07T12:00:00Z'),
      invoiceStatus: 'NOT_ISSUED',
      operatorName: 'Larissa Alencar (Atendimento)',
      items: [
        { name: 'Bateria Neuropsicológica (6 Encontros + Devolutiva Escrita)', type: 'SERVICE', quantity: 1, unitPrice: 260000, subtotal: 260000 }
      ]
    },
    {
      code: 'COB-2026-5003',
      verticalCode: 'PSYCHOLOGY_CLINIC',
      patientName: 'Thiago Valente Silveira',
      patientDocument: '182.903.482-19',
      patientEmail: 'thiago.valente@uol.com.br',
      patientPhone: '(11) 97721-3940',
      professionalName: 'Dra. Clarice Vianna (CRP 06/142.990)',
      unitName: 'Espaço Terapêutico Pinheiros',
      title: 'Consulta Avulsa Psicoterapia Breve',
      category: 'Psicoterapia',
      paymentMethod: 'CREDIT_CARD',
      status: 'FAILED',
      subtotal: 35000,
      discount: 0,
      addition: 0,
      totalAmount: 35000,
      paidAmount: 0,
      installments: 1,
      dueDate: new Date('2026-09-05T15:00:00Z'),
      notes: 'Transação recusada pela operadora do cartão (Saldo insuficiente ou bloqueio preventivo antifraude).',
      operatorName: 'Larissa Alencar (Atendimento)',
      items: [
        { name: 'Sessão Individual de Psicoterapia Adulto (50 min)', type: 'SERVICE', quantity: 1, unitPrice: 35000, subtotal: 35000 }
      ]
    }
  ];

  for (const t of sampleTransactions) {
    const [res] = await connection.execute(
      `INSERT INTO transactions (
        code, verticalCode, patientName, patientDocument, patientEmail, patientPhone,
        professionalName, unitName, title, type, category, paymentMethod, status,
        subtotal, discount, addition, totalAmount, paidAmount, installments, installmentValue,
        dueDate, paidAt, pixQrCode, pixCopiaECola, barcode, digitableLine, cardBrand, cardLast4,
        nsu, authorizationCode, cashReceived, cashChange, invoiceNumber, invoiceStatus,
        invoiceKey, invoiceIssuedAt, notes, operatorName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.code, t.verticalCode, t.patientName, t.patientDocument, t.patientEmail, t.patientPhone,
        t.professionalName, t.unitName, t.title, 'RECEITA', t.category, t.paymentMethod, t.status,
        t.subtotal, t.discount, t.addition, t.totalAmount, t.paidAmount, t.installments, t.installmentValue || null,
        t.dueDate, t.paidAt || null, t.pixQrCode || null, t.pixCopiaECola || null, t.barcode || null, t.digitableLine || null,
        t.cardBrand || null, t.cardLast4 || null, t.nsu || null, t.authorizationCode || null, t.cashReceived || null,
        t.cashChange || null, t.invoiceNumber || null, t.invoiceStatus || 'NOT_ISSUED', t.invoiceKey || null,
        t.invoiceIssuedAt || null, t.notes || null, t.operatorName || 'Recepção'
      ]
    );

    const transactionId = res.insertId;
    if (t.items && t.items.length > 0) {
      for (const it of t.items) {
        await connection.execute(
          `INSERT INTO transaction_items (transactionId, name, type, quantity, unitPrice, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [transactionId, it.name, it.type, it.quantity, it.unitPrice, it.subtotal]
        );
      }
    }

    // Auditoria
    await connection.execute(
      `INSERT INTO financial_audit_logs (verticalCode, transactionCode, action, operator, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        t.verticalCode,
        t.code,
        t.status === 'PAID' ? 'CONFIRM_PAYMENT' : t.status === 'REFUNDED' ? 'REFUND' : 'CREATE_CHARGE',
        t.operatorName || 'Sistema',
        `Registro financeiro no valor de R$ ${(t.totalAmount / 100).toFixed(2)} via ${t.paymentMethod} (${t.status})`
      ]
    );
  }

  console.log("Transactions seeded successfully.");

  // 3. Inserir Contas a Pagar
  const samplePayables = [
    {
      code: 'PAG-2026-001',
      verticalCode: 'DENTAL_CLINIC',
      supplierName: 'Neodent Implantes & Próteses S/A',
      description: 'Lote de Implantes Cone Morse Titânio e Componentes Protéticos',
      category: 'Insumos Clínicos',
      amount: 450000,
      dueDate: new Date('2026-09-15T00:00:00Z'),
      status: 'PENDING',
      paymentMethod: 'BOLETO'
    },
    {
      code: 'PAG-2026-002',
      verticalCode: 'DENTAL_CLINIC',
      supplierName: 'Dental Cremer Distribuidora Ltda',
      description: 'Resinas compostas estéticas, anestésicos e material descartável',
      category: 'Materiais de Consumo',
      amount: 185000,
      dueDate: new Date('2026-09-08T00:00:00Z'),
      status: 'PAID',
      paidAt: new Date('2026-09-03T11:00:00Z'),
      paymentMethod: 'PIX'
    },
    {
      code: 'PAG-2026-003',
      verticalCode: 'AESTHETIC_CLINIC',
      supplierName: 'Allergan Farmacêutica do Brasil',
      description: 'Aquisição de Toxina Botulínica 50U e 100U + Ácido Hialurônico Juvederm',
      category: 'Farmacêuticos & Toxinas',
      amount: 890000,
      dueDate: new Date('2026-09-18T00:00:00Z'),
      status: 'PENDING',
      paymentMethod: 'BOLETO'
    },
    {
      code: 'PAG-2026-004',
      verticalCode: 'MEDICAL_CLINIC',
      supplierName: 'Laboratório Fleury Diagnósticos',
      description: 'Repasse e processamento de exames laboratoriais especializados',
      category: 'Serviços de Diagnóstico',
      amount: 320000,
      dueDate: new Date('2026-09-10T00:00:00Z'),
      status: 'PENDING',
      paymentMethod: 'TRANSFER'
    },
    {
      code: 'PAG-2026-005',
      verticalCode: 'PHYSIOTHERAPY_CLINIC',
      supplierName: 'MetaLife Equipamentos de Pilates',
      description: 'Manutenção preventiva e troca de molas Reformer e Cadillac',
      category: 'Manutenção de Equipamentos',
      amount: 98000,
      dueDate: new Date('2026-09-02T00:00:00Z'),
      status: 'PAID',
      paidAt: new Date('2026-09-02T16:00:00Z'),
      paymentMethod: 'PIX'
    },
    {
      code: 'PAG-2026-006',
      verticalCode: 'PSYCHOLOGY_CLINIC',
      supplierName: 'Pearson Clinical Assessment Brasil',
      description: 'Protocolos de aplicação testes WISC-IV e Inventário Beck BDI',
      category: 'Testes Psicométricos',
      amount: 145000,
      dueDate: new Date('2026-09-22T00:00:00Z'),
      status: 'PENDING',
      paymentMethod: 'BOLETO'
    }
  ];

  for (const p of samplePayables) {
    await connection.execute(
      `INSERT INTO accounts_payable (code, verticalCode, supplierName, description, category, amount, dueDate, paidAt, status, paymentMethod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.code, p.verticalCode, p.supplierName, p.description, p.category, p.amount, p.dueDate, p.paidAt || null, p.status, p.paymentMethod]
    );
  }
  console.log("Accounts payable seeded.");

  // 4. Inserir Sessões de Caixa
  const sampleSessions = [
    {
      verticalCode: 'DENTAL_CLINIC',
      sessionNumber: 'CX-2026-0905-01',
      operatorName: 'Camila Rocha',
      status: 'OPEN',
      openingBalance: 50000, // R$ 500,00 fundo de caixa
      cashInflow: 60000,     // R$ 600,00 recebido em espécie
      cashOutflow: 0,
      expectedBalance: 110000,
      openedAt: new Date('2026-09-05T07:45:00Z'),
    },
    {
      verticalCode: 'MEDICAL_CLINIC',
      sessionNumber: 'CX-2026-0905-02',
      operatorName: 'Gabriel Siqueira',
      status: 'OPEN',
      openingBalance: 30000,
      cashInflow: 60000,
      cashOutflow: 0,
      expectedBalance: 90000,
      openedAt: new Date('2026-09-05T08:00:00Z'),
    },
    {
      verticalCode: 'AESTHETIC_CLINIC',
      sessionNumber: 'CX-2026-0905-03',
      operatorName: 'Aline Bittencourt',
      status: 'OPEN',
      openingBalance: 100000,
      cashInflow: 0,
      cashOutflow: 0,
      expectedBalance: 100000,
      openedAt: new Date('2026-09-05T08:30:00Z'),
    },
    {
      verticalCode: 'PHYSIOTHERAPY_CLINIC',
      sessionNumber: 'CX-2026-0905-04',
      operatorName: 'Marcos Vinicius',
      status: 'OPEN',
      openingBalance: 40000,
      cashInflow: 0,
      cashOutflow: 0,
      expectedBalance: 40000,
      openedAt: new Date('2026-09-05T07:30:00Z'),
    },
    {
      verticalCode: 'PSYCHOLOGY_CLINIC',
      sessionNumber: 'CX-2026-0905-05',
      operatorName: 'Larissa Alencar',
      status: 'OPEN',
      openingBalance: 30000,
      cashInflow: 0,
      cashOutflow: 0,
      expectedBalance: 30000,
      openedAt: new Date('2026-09-05T08:00:00Z'),
    }
  ];

  for (const s of sampleSessions) {
    await connection.execute(
      `INSERT INTO cash_sessions (verticalCode, sessionNumber, operatorName, status, openingBalance, cashInflow, cashOutflow, expectedBalance, openedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.verticalCode, s.sessionNumber, s.operatorName, s.status, s.openingBalance, s.cashInflow, s.cashOutflow, s.expectedBalance, s.openedAt]
    );
  }
  console.log("Cash sessions seeded.");

  // 8. Seed operacional persistente do MindOS
  await connection.execute('DELETE FROM mindos_access_audits WHERE id > 0');
  await connection.execute('DELETE FROM mindos_clinical_records WHERE id > 0');
  await connection.execute('DELETE FROM mindos_appointments WHERE id > 0');
  await connection.execute('DELETE FROM mindos_patients WHERE id > 0');
  await connection.execute('DELETE FROM mindos_memberships WHERE id > 0');
  await connection.execute('DELETE FROM mindos_cms_versions WHERE id > 0');
  await connection.execute('DELETE FROM mindos_financial_rules WHERE id > 0');
  await connection.execute('DELETE FROM mindos_booking_requests WHERE id > 0');
  await connection.execute('DELETE FROM mindos_institutional_profiles WHERE id > 0');
  await connection.execute('DELETE FROM mindos_service_areas WHERE id > 0');
  await connection.execute('DELETE FROM mindos_portal_documents WHERE id > 0');
  await connection.execute('DELETE FROM mindos_reception_events WHERE id > 0');
  await connection.execute('DELETE FROM mindos_tenants WHERE id > 0');

  const [tenantResult] = await connection.execute(
    `INSERT INTO mindos_tenants (slug, name, legalName, businessType, status, primaryColor, accentColor, siteConfigJson)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mindos-psychology', 'MindOS Psicologia & Saúde Mental', 'MindOS Clínica de Psicologia Ltda.', 'PSYCHOLOGY_CLINIC', 'ACTIVE', '#4338CA', '#6366F1', JSON.stringify({ title: 'MindOS — Psicologia e Saúde Mental', hero: 'Cuidado psicológico com presença, segurança e continuidade', status: 'PUBLISHED' })]
  );
  const tenantId = tenantResult.insertId;

  await connection.execute(
    `INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson, active) VALUES (?, ?, ?, ?, ?)`,
    [tenantId, 1, 'OWNER', JSON.stringify(['ALL']), true]
  );

  const patients = [
    ['Marina S. Andrade', 'Marina', 'marina.andrade@example.com', '(11) 95555-0184', 'ACTIVE', 'WHATSAPP_DISCREET'],
    ['Rafael A. Nogueira', 'Rafael', 'rafael.nogueira@example.com', '(11) 95555-0198', 'ACTIVE', 'EMAIL'],
    ['Luiza C. Mendes', 'Luiza', 'luiza.mendes@example.com', '(11) 95555-0212', 'ACTIVE', 'WHATSAPP_DISCREET'],
    ['Amanda P. Ribeiro', 'Amanda', 'amanda.ribeiro@example.com', '(11) 95555-0260', 'LEAD', 'PHONE'],
  ];
  const patientIds = [];
  for (const patient of patients) {
    const [result] = await connection.execute(
      `INSERT INTO mindos_patients (tenantId, fullName, preferredName, email, phone, administrativeStatus, preferredChannel) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, ...patient]
    );
    patientIds.push(result.insertId);
  }

  const appointments = [
    [patientIds[0], 'Dra. Clarice Vianna', 'Unidade Pinheiros', 'Psicoterapia individual', 'IN_PERSON', 'CONFIRMED', '2026-09-06 14:00:00', '2026-09-06 14:50:00', null, 'Confirmação enviada por canal discreto'],
    [patientIds[1], 'Dr. Felipe Nunes', 'Unidade Pinheiros', 'Acompanhamento psicológico', 'ONLINE', 'WAITING', '2026-09-06 10:30:00', '2026-09-06 11:20:00', null, 'Aguardando confirmação administrativa'],
    [patientIds[2], 'Dra. Clarice Vianna', 'Unidade Pinheiros', 'Psicoterapia de adultos', 'IN_PERSON', 'SCHEDULED', '2026-09-06 16:00:00', '2026-09-06 16:50:00', 'rec-weekly-clarice', 'Série semanal com consentimento registrado'],
    [patientIds[3], 'Dra. Marina Luz', 'Unidade Pinheiros', 'Orientação parental', 'ONLINE', 'SCHEDULED', '2026-09-06 17:30:00', '2026-09-06 18:20:00', null, 'Lead convertido em agendamento'],
  ];
  for (const appointment of appointments) {
    await connection.execute(
      `INSERT INTO mindos_appointments (tenantId, patientId, professionalName, unitName, serviceType, mode, status, startsAt, endsAt, recurrenceId, notesAdmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, ...appointment]
    );
  }

  const cmsContent = { title: 'MindOS — Psicologia e Saúde Mental', hero: 'Cuidado psicológico com presença, segurança e continuidade', sections: ['Hero', 'Sobre', 'Áreas de atendimento', 'Profissionais públicos', 'FAQ', 'Agendamento'], seo: { title: 'MindOS Psicologia | Cuidado psicológico', description: 'Psicologia com segurança, presença e continuidade.' } };
  await connection.execute(
    `INSERT INTO mindos_cms_versions (tenantId, versionNumber, status, contentJson, changeSummary, createdByUserId, approvedByUserId, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, 1, 'PUBLISHED', JSON.stringify(cmsContent), 'Publicação inicial MindOS', 1, 1, new Date('2026-09-01T12:00:00Z')]
  );
  await connection.execute(
    `INSERT INTO mindos_cms_versions (tenantId, versionNumber, status, contentJson, changeSummary, createdByUserId) VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, 2, 'DRAFT', JSON.stringify({ ...cmsContent, hero: 'Cuidado psicológico com presença e continuidade.' }), 'Ajuste de copy em revisão', 1]
  );

  const financialRules = [
    ['SESSION', 'Sessão individual 50 min', 30000, null, 'PER_SESSION'],
    ['PACKAGE', 'Pacote mensal — 4 sessões', 115000, null, 'PER_SESSION'],
    ['PAYOUT', 'Repasse profissional', null, 7000, 'PER_PRODUCTION'],
    ['COMMISSION', 'Comissão de indicação', null, 500, 'PER_RECEIPT'],
  ];
  for (const rule of financialRules) {
    await connection.execute(
      `INSERT INTO mindos_financial_rules (tenantId, ruleType, name, valueInCents, percentageBps, basis, version, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, ...rule, 1, true]
    );
  }
  await connection.execute(
    `INSERT INTO mindos_access_audits (tenantId, actorUserId, subjectType, subjectId, dataLayer, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, 1, 'CMS_VERSION', 1, 'PUBLIC', 'PUBLISH_CMS', 'Publicação inicial do conteúdo institucional']
  );
  await connection.execute(
    `INSERT INTO mindos_institutional_profiles (tenantId, title, metaDescription, city, faqJson, llmsTxt, updatedByUserId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, 'MindOS Psicologia | Cuidado psicológico', 'Psicologia com segurança, presença e continuidade em São Paulo.', 'São Paulo - SP', JSON.stringify([{ question: 'Como agendar?', answer: 'Escolha uma preferência e a equipe confirma o horário.' }]), 'MindOS é uma clínica de psicologia com atendimento responsável e linguagem institucional clara.', 1]
  );
  const serviceAreas = [
    ['Psicoterapia individual', 'Atendimento psicológico individual com presença e continuidade.'],
    ['Orientação parental', 'Acompanhamento administrativo e psicológico para famílias.'],
    ['Avaliação psicológica', 'Processo organizado com informações liberadas por camada.'],
  ];
  for (const [index, [name, description]] of serviceAreas.entries()) {
    await connection.execute(`INSERT INTO mindos_service_areas (tenantId, name, publicDescription, active, sortOrder) VALUES (?, ?, ?, ?, ?)`, [tenantId, name, description, true, index]);
  }
  await connection.execute(`INSERT INTO mindos_portal_documents (tenantId, patientId, title, documentType, status, version) VALUES (?, ?, ?, ?, ?, ?)`, [tenantId, patientIds[0], 'Termo de atendimento', 'CONSENT', 'SIGNED', 1]);
  await connection.execute(`INSERT INTO mindos_portal_documents (tenantId, patientId, title, documentType, status, version) VALUES (?, ?, ?, ?, ?, ?)`, [tenantId, patientIds[0], 'Orientações administrativas', 'GUIDANCE', 'AVAILABLE', 1]);
  await connection.execute(`INSERT INTO mindos_reception_events (tenantId, patientId, eventType, messageTemplate, createdByUserId) VALUES (?, ?, ?, ?, ?)`, [tenantId, patientIds[0], 'CHECK_IN', null, 1]);
  console.log("MindOS operational data seeded.");

  await connection.end();
  console.log("Seed finished successfully!");
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
