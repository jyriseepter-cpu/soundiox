export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 pb-32 text-white">
      <h1 className="text-4xl font-bold mb-3">Privacy Policy</h1>
      <p className="text-white/60 mb-8">Last updated: 4 Mar 2026</p>

      <div className="space-y-6 text-white/80 leading-relaxed">
        <p>
          <strong>SoundioX Labs OÜ</strong> (registry code <strong>17444586</strong>) is the
          data controller.
        </p>

        <h2 className="text-2xl font-semibold text-white">1. What we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account data:</strong> login identifiers provided by Google (e.g. name,
            email, avatar).
          </li>
          <li>
            <strong>Usage data:</strong> likes, playlists, interactions, and basic app events
            needed to run the service.
          </li>
          <li>
            <strong>Content data:</strong> tracks and metadata you upload (title, artist name,
            artwork, audio URL).
          </li>
          <li>
            <strong>Payments:</strong> subscription and donation status via Stripe. We do not
            store full payment card details.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold text-white">2. Why we process data</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>To provide the platform (accounts, playback, likes, playlists).</li>
          <li>To prevent abuse and ensure safety.</li>
          <li>To run subscriptions/donations and provide receipts/status.</li>
          <li>To improve the service (performance and reliability).</li>
        </ul>

        <h2 className="text-2xl font-semibold text-white">3. Legal bases</h2>
        <p>
          We process personal data under GDPR legal bases including <strong>contractual
          necessity</strong>, <strong>legitimate interest</strong>, and where applicable{" "}
          <strong>consent</strong>.
        </p>

        <h2 className="text-2xl font-semibold text-white">4. Sharing</h2>
        <p>We use service providers to operate SoundioX:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Supabase</strong> (database/auth/storage)</li>
          <li><strong>Google</strong> (OAuth login)</li>
          <li><strong>Stripe</strong> (payments)</li>
        </ul>

        <h2 className="text-2xl font-semibold text-white">5. Retention</h2>
        <p>
          We keep data as long as needed to provide the service and comply with legal
          obligations. You can request deletion (see below).
        </p>

        <h2 className="text-2xl font-semibold text-white">6. Your rights</h2>
        <p>
          You may request access, correction, deletion, and portability, and object to
          certain processing as provided by GDPR.
        </p>

        <h2 className="text-2xl font-semibold text-white">7. Deletion requests</h2>
        <p>
          You may request account/data deletion by contacting{" "}
          <strong>legal@soundiox.io</strong>.
        </p>

        <h2 className="text-2xl font-semibold text-white">8. Contact</h2>
        <p>
          Privacy questions: <strong>legal@soundiox.io</strong>
        </p>
      </div>
    </div>
  );
}