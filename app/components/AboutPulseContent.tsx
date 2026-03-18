"use client";

export default function AboutPulseContent() {
  return (
    <div className="space-y-10 text-white">
      
      <h1 className="text-4xl font-bold">Monetization & Rewards</h1>

      {/* PULSE REWARD */}
      <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
        <h2 className="text-xl font-bold mb-4">Pulse reward system</h2>

        <p className="text-white/80 mb-4">
          When SoundioX reaches 50,000 users, the Pulse award system activates.
        </p>

        <div className="space-y-2 font-semibold">
          <p>
            The track with the most likes receives{" "}
            <span className="text-cyan-300">€20,000</span>.
          </p>
          <p>
            Second place receives{" "}
            <span className="text-cyan-300">€10,000</span>.
          </p>
          <p>
            Third place receives{" "}
            <span className="text-cyan-300">€5,000</span>.
          </p>
        </div>

        <p className="mt-4 text-white/80">
          After that, the payout line continues deeper into the ranking and grows
          harmoniously as the user base grows.
        </p>

        <p className="mt-2 font-semibold">
          In addition, the top track of every genre receives{" "}
          <span className="text-fuchsia-300">€2,000</span> each month.
        </p>
      </div>

      {/* ACCOUNT TYPES NOTE */}
      <div className="text-white/80">
        <p>
          Likes are designed as real support. All likes from one account must go
          to different tracks.
        </p>
        <p className="mt-2 font-semibold">
          One account cannot spend multiple monthly likes on the same track.
        </p>
      </div>

      {/* MONETIZATION */}
      <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
        <h2 className="text-xl font-bold mb-4">Monetization</h2>

        <p className="text-white/80">
          SoundioX monetizes from day one. Artists can receive direct support
          through donations.
        </p>

        <p className="mt-4 font-semibold">
          The platform split is simple:{" "}
          <span className="text-cyan-300">70%</span> to the artist and{" "}
          <span className="text-cyan-300">30%</span> to the platform.
        </p>

        <p className="mt-2 text-white/80">
          Creator payouts are planned monthly.
        </p>
      </div>

      {/* FAIRNESS */}
      <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
        <h2 className="text-xl font-bold mb-4">
          Fairness and platform integrity
        </h2>

        <p className="text-white/80">
          Any manipulation of likes, streams, rankings, charts, fake accounts, or
          platform behaviour results in removal and may lead to a lifetime ban
          from SoundioX.
        </p>
      </div>
    </div>
  );
}