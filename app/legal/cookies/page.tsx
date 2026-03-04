export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 pb-32 text-white">
      <h1 className="text-4xl font-bold mb-3">Cookies</h1>
      <p className="text-white/60 mb-8">Last updated: 4 Mar 2026</p>

      <div className="space-y-8 text-white/80 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p>
            SoundioX uses cookies and similar storage technologies to keep the
            site working, enable login, and improve the experience. Some cookies
            are essential. Others (like analytics) are optional and only used if
            you choose to allow them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Who we are</h2>
          <p>
            SoundioX is operated by <b>SoundioX Labs OÜ</b> (Registry code{" "}
            <b>17444586</b>).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Essential cookies</h2>
          <p>
            These are required for core functionality and security. Without
            these, the platform will not work properly.
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Authentication session (Google login via Supabase)</li>
            <li>Security and fraud prevention</li>
            <li>Basic app preferences needed for correct operation</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Preferences</h2>
          <p>
            We may store lightweight preferences (for example, dismissing a
            banner or saving a choice) using browser storage (localStorage) or
            cookies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Analytics (optional)</h2>
          <p>
            If we add analytics in the future, we will update this page and—when
            required—ask for your consent before enabling non-essential tracking.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Payments (Stripe)</h2>
          <p>
            If you purchase Premium or Artist Pro, payments are processed by
            Stripe. We do not store full payment card details on SoundioX. Stripe
            may set cookies or use similar technologies required to process
            payments securely.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">How to manage cookies</h2>
          <p>
            You can control cookies in your browser settings and delete existing
            cookies at any time. Blocking essential cookies may prevent login
            and core functionality.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Contact</h2>
          <p>
            Questions about cookies or privacy? Contact:{" "}
            <b>legal@soundiox.io</b>
          </p>
        </section>
      </div>
    </div>
  );
}