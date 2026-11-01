import { describe, expect, it } from "vitest";
import { validatePixCharge, providerPaymentIdSchema } from "./pix-validation";

const payment = { id: "payment-a", amount_cents: 2500, provider_payment_id: "123" };
const charge = { id: 123, external_reference: "payment-a", transaction_amount: 25 };
describe("PIX confirmation", () => {
  it("accepts the confirmed R$25 charge for its original account", () => {
    expect(() => validatePixCharge(charge, payment)).not.toThrow();
  });
  it("rejects a reference belonging to another account", () => {
    expect(() => validatePixCharge({ ...charge, external_reference: "other" }, payment)).toThrow();
  });
  it("rejects an incorrect paid amount", () => {
    expect(() => validatePixCharge({ ...charge, transaction_amount: 24 }, payment)).toThrow();
  });
  it("rejects missing provider amounts", () => {
    expect(() => validatePixCharge({ ...charge, transaction_amount: undefined }, payment)).toThrow();
  });
  it("rejects another provider charge", () => {
    expect(() => validatePixCharge({ ...charge, id: 456 }, payment)).toThrow();
  });
  it("rejects paths injected as provider identifiers", () => {
    expect(providerPaymentIdSchema.safeParse("../search").success).toBe(false);
  });
});