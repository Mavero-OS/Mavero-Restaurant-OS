// Guest-facing Privacy Policy and Terms of Use text (plain JS so docs can be generated from it).
// TEMPLATE: have a lawyer in Bangladesh review and adapt these before launch.

export const LEGAL_UPDATED = '20 November 2026';

export function privacySections(p) {
  const name = p.name || 'Thali';
  const contact = p.supportEmail || p.support || 'the support contact shown in the app';
  return [
    ['Who we are', [
      `${name} is software that restaurants in Bangladesh use for table ordering, takeaway and delivery orders, payments and reviews. When you order at a restaurant using ${name}, that restaurant decides how your order is handled; ${name} processes your information on the restaurant's behalf to run the service.`,
    ]],
    ['What we collect', [
      'Order details: the dishes you choose, notes for the kitchen, your table, the time of your order and its status.',
      'Your name, if you type one, so your table can split the bill and staff can find you.',
      'For takeaway or delivery: your name, mobile number and delivery address.',
      'Payment records: the amount, the method (for example bKash, Nagad, card or cash), the transaction ID and whether it was paid. Card numbers and wallet PINs are entered only on the payment provider\'s page; we never see or store them.',
      'Waiter calls, quiz scores and any review or rating you leave.',
      'A random identifier for your device, created when you open the menu, so the system knows which table and orders are yours. You do not need to create an account.',
    ]],
    ['How we use it', [
      'To send your order to the kitchen, show you its status, let staff bring it to you, and take payment.',
      'To give the restaurant receipts, sales and VAT records, and to handle refunds or disputes.',
      'To keep the service secure and working, and to fix problems.',
      'We do not sell your information and we do not use it for advertising.',
    ]],
    ['Who we share it with', [
      'The restaurant you ordered from and its staff.',
      'Payment providers (such as SSLCommerz and bKash) when you choose to pay online, so they can complete the payment.',
      'Our hosting and database provider, which stores the data on secure servers that may be located outside Bangladesh.',
      'Government authorities, only when the law requires it.',
    ]],
    ['How long we keep it', [
      'Order and payment records are kept as long as the restaurant needs them for its accounts and tax records, which the law may require for several years. Delivery addresses and phone numbers are kept only with the order they belong to.',
    ]],
    ['Your choices and rights', [
      'You can order without giving your name. For delivery we need a phone number and address to reach you.',
      `To see, correct or delete your information, contact the restaurant or ${contact}. We will respond within a reasonable time, subject to records the law requires us to keep.`,
    ]],
    ['Children', ['The service is meant to be used by adults or with an adult present. We do not knowingly collect information from children.']],
    ['Changes', [`We may update this policy. The date at the top shows when it last changed.`]],
  ];
}

export function termsSections(p) {
  const name = p.name || 'Thali';
  const contact = p.supportEmail || p.support || 'the support contact shown in the app';
  return [
    ['About these terms', [
      `These terms apply when you use ${name} to order and pay at a participating restaurant. The restaurant is the seller of the food and drinks; ${name} provides the ordering and payment software.`,
    ]],
    ['Orders', [
      'Menu, prices, availability and preparation times are set by the restaurant and can change. Your order is accepted once the restaurant confirms it or starts preparing it.',
      'Prices include or exclude VAT and service charge as shown on the menu and bill.',
      'Please order only at the table whose QR code you scanned, and only for food you intend to pay for.',
    ]],
    ['Allergies and dietary needs', [
      'Allergen and vegetarian labels are provided by the restaurant as guidance. Kitchens handle many ingredients, so if you have an allergy, speak to the staff before ordering.',
    ]],
    ['Payments', [
      'You can pay by the methods the restaurant offers. Online payments are processed by licensed payment providers under their own terms. Payments made by send-money, bank transfer or cash are confirmed by restaurant staff.',
      'Your bill is complete when the app shows it as paid. Keep your transaction ID until then.',
    ]],
    ['Cancellations and refunds', [
      'Cancellations, replacements and refunds are handled by the restaurant. Ask the staff, or contact the restaurant for takeaway and delivery orders. Approved refunds are returned to the original payment method where possible.',
    ]],
    ['Fair use', [
      'Do not misuse the service: no fake orders, false payment claims, attempts to access other tables or accounts, or interference with the system. We may block access for misuse.',
    ]],
    ['Liability', [
      `${name} is provided as is. To the extent the law allows, ${name} is not liable for the food, service or conduct of the restaurant, or for losses caused by events outside our control such as network or payment-provider outages.`,
    ]],
    ['Law and contact', [
      `These terms are governed by the laws of Bangladesh. Questions or complaints: ${contact}.`,
    ]],
  ];
}

