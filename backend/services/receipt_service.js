import crypto from 'crypto';

class ReceiptService {
  constructor() {
    this.receipts = new Map();
  }

  generatePaymentHash(payer, recipient, token, amount, salt = '') {
    const data = `${payer}:${recipient}:${token}:${amount}:${salt}:${Date.now()}`;
    return '0x' + crypto.createHash('sha256').update(data).digest('hex');
  }

  registerReceipt({ paymentHash, payer, recipient, token, amount, metadata = {} }) {
    if (this.receipts.has(paymentHash)) {
      throw new Error('Payment hash already exists');
    }

    const receipt = {
      paymentHash,
      payer,
      recipient,
      token,
      amount: amount.toString(),
      timestamp: Date.now(),
      metadata,
      disputed: false,
    };

    this.receipts.set(paymentHash, receipt);
    return receipt;
  }

  getReceipt(paymentHash) {
    return this.receipts.get(paymentHash) || null;
  }
}

export const receiptService = new ReceiptService();
