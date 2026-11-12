import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { setting } from "@/db/schema";
import { DEFAULT_CANARY_PRICING, parseCanaryPricing } from "@/lib/canary";

export const dynamic = "force-dynamic";

const price = (amount: string, period: "monthly" | "yearly") =>
  /\d/.test(amount) ? `${amount} per user / month, billed ${period === "monthly" ? "monthly" : "annually"}` : amount;

/** A pricing page we control, with a monthly / yearly toggle, watched with the pricing skill. */
export default async function CanaryPricing() {
  const [row] = await db().select().from(setting).where(eq(setting.key, "canary-pricing"));
  const plans = parseCanaryPricing(row?.value || DEFAULT_CANARY_PRICING);
  return (
    <article className="canary-pricing" style={{ background: "#fff", padding: 24, borderRadius: 10 }}>
      <h1>Canary Security pricing</h1>
      <input type="radio" name="billing" id="bill-monthly" defaultChecked />
      <label htmlFor="bill-monthly">Monthly</label>
      <input type="radio" name="billing" id="bill-yearly" />
      <label htmlFor="bill-yearly">Yearly</label>
      <div className="plans">
        {plans.map((p) => (
          <section key={p.name} className="plan">
            <h2>{p.name}</h2>
            <p className="price-monthly">{price(p.monthly, "monthly")}</p>
            <p className="price-yearly">{price(p.yearly, "yearly")}</p>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="muted">This page exists to test the competitor monitor. It is not a real company.</p>
    </article>
  );
}
