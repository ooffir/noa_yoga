const BASE_URL = "https://restapi.payplus.co.il/api/v1.0";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: JSON.stringify({
      api_key: process.env.PAYPLUS_API_KEY!,
      secret_key: process.env.PAYPLUS_SECRET_KEY!,
    }),
  };
}

interface CreatePaymentLinkParams {
  amount: number;
  description: string;
  customerEmail: string;
  customerName: string;
  moreInfo: string;
  successUrl: string;
  failureUrl: string;
}

interface PayPlusResponse {
  data: {
    payment_page_link: string;
    page_request_uid: string;
  };
  results: { status: string; code: number };
}

export async function createPaymentLink(params: CreatePaymentLinkParams) {
  const res = await fetch(`${BASE_URL}/PaymentPages/generateLink`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      payment_page_uid: process.env.PAYPLUS_PAGE_UID!,
      refURL_success: params.successUrl,
      refURL_failure: params.failureUrl,
      more_info: params.moreInfo,
      amount: params.amount,
      currency_code: "ILS",
      customer: {
        email: params.customerEmail,
        customer_name: params.customerName,
      },
      items: [
        {
          name: params.description,
          quantity: 1,
          price: params.amount,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPlus error: ${res.status} ${text}`);
  }

  const data: PayPlusResponse = await res.json();
  return {
    url: data.data.payment_page_link,
    pageRequestUid: data.data.page_request_uid,
  };
}

export function verifyWebhook(
  body: Record<string, any>
): boolean {
  return body?.secret_key === process.env.PAYPLUS_SECRET_KEY;
}
