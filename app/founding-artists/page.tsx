export default function FoundingArtistsPage() {
    return (
      <main className="min-h-screen bg-[#07090f] px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-10 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="inline-flex rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-2 text-sm font-medium text-fuchsia-100">
              Founding Artists
            </div>
  
            <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
              Become one of the first artists shaping SoundioX.
            </h1>
  
            <div className="mt-8 space-y-6 text-base leading-8 text-white/78">
              <p>
                Founding Artists are the earliest creators building the culture of
                SoundioX from the beginning. This status is not only a label — it is
                a visible mark that you were here early and helped shape the first
                wave.
              </p>
  
              <div className="relative my-10 overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-fuchsia-400/0 via-fuchsia-300/80 to-cyan-400/0" />
                <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-cyan-400/0 via-violet-300/70 to-fuchsia-400/0" />
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">
                  Early builders • visible status • long-term value
                </div>
              </div>
  
              <p>
                The first <span className="text-cyan-200">20 Founding Artists</span>{" "}
                are invite-only.
              </p>
  
              <p>
                After that, the next <span className="text-fuchsia-200">30 spots</span>{" "}
                are opened on a first-come basis. After the early phase, new Founding
                badges are awarded monthly to standout Pulse artists who do not yet
                have the badge.
              </p>
  
              <p>
                Founding Artists are meant to be instantly recognizable on the
                platform. Their avatar and profile presence stand out in lists, and
                the badge signals that they are part of the earliest generation of
                creators on SoundioX.
              </p>
  
              <h2 className="pt-4 text-2xl font-semibold text-white">
                Activation rule
              </h2>
  
              <p>
                Founding status must be activated through participation. A Founding
                Artist must publish at least one track within{" "}
                <span className="font-semibold text-cyan-200">90 days</span> of
                receiving the status.
              </p>
  
              <p>
                If no track is published within that time, the Founding status is
                removed and reassigned to the top eligible artist at that moment.
              </p>
  
              <h2 className="pt-4 text-2xl font-semibold text-white">
                Why Founding matters
              </h2>
  
              <p>
                Founding Artists keep their early position in platform history and
                receive the long-term value promised to early builders.
              </p>
  
              <p>
                This is meant to reward the first believers, the first builders, and
                the first artists helping define what SoundioX becomes.
              </p>
  
              <h2 className="pt-4 text-2xl font-semibold text-white">
                Important note
              </h2>
  
              <p>
                Founding artists may keep their early advantages, but they still need
                to connect payout details if they want to receive direct support
                through donations.
              </p>
  
              <p>
                Founding is not passive status. It is meant to stay active, visible,
                and meaningful.
              </p>
            </div>
  
          <div className="mt-12 flex justify-start border-t border-white/10 pt-8">
              <a
                href="/join-wave"
                className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-7 py-3 text-sm font-semibold text-white ring-1 ring-white/10 hover:opacity-95"
              >
                Read Join the Wave
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }
