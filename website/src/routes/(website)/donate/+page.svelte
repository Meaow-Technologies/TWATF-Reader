<script lang="ts">
  import Icon from "@iconify/svelte";
  import { SITE, DONATE } from "$lib/site";

  async function copy(text: string, e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const originalText = target.innerText;
    await navigator.clipboard.writeText(text);
    target.innerText = "Copied to Clipboard!";
    setTimeout(() => (target.innerText = originalText), 1500);
  }
</script>

<div class="flex flex-col items-center justify-center min-h-dvh p-6">
  <div
    class="max-w-3xl w-full bg-base-300/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
  >
    <header class="text-center mb-8 relative z-10">
      <h1 class="text-4xl font-bold text-primary mb-2">
        Support <a href="/" class="hover:text-secondary transition-colors"
          >{SITE.short}</a
        >
      </h1>
      <p class="text-base-content/70 italic text-sm">
        "Every small contribution helps keep the translation going and the site
        online."
      </p>
    </header>

    <div class="space-y-6 relative z-10">
      <section
        class="bg-primary/10 p-6 rounded-xl border border-primary/30 relative overflow-hidden"
      >
        <div class="flex items-center gap-2 mb-3">
          <Icon icon="mdi:heart" class="text-primary size-6" />
          <h2 class="text-xl font-semibold text-primary">Donate</h2>
        </div>
        <p class="text-sm text-base-content/80 mb-5">
          Support the project to help with hosting costs and keep chapters
          coming.
        </p>
        <a
          href={DONATE.link}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary text-primary-content font-bold hover:brightness-110 hover:scale-[1.01] transition-all shadow-lg"
        >
          <Icon icon="mdi:heart" class="size-5" />
          Donate
        </a>
      </section>

      <section
        class="bg-black/20 p-6 rounded-xl border border-white/5 flex flex-col md:flex-row justify-around items-center gap-6 text-center md:text-left"
      >
        <div class="flex flex-col gap-1">
          <p class="text-[10px] uppercase tracking-widest opacity-50">
            Discord
          </p>
          <span class="flex items-center gap-2 text-sm text-primary">
            <Icon icon="mdi:discord" />
            {DONATE.discordHandle}
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <p class="text-[10px] uppercase tracking-widest opacity-50">Email</p>
          <a
            href="mailto:{SITE.email}"
            class="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Icon icon="mdi:email" />
            {SITE.email}
          </a>
        </div>
      </section>

      <section
        class="bg-base-200/50 p-6 rounded-xl border border-white/5 shadow-inner"
      >
        <div class="flex items-center gap-2 mb-4">
          <Icon icon="mdi:currency-btc" class="text-accent size-6" />
          <h2 class="text-xl font-semibold text-accent">Crypto Wallets</h2>
        </div>

        <div class="grid gap-4">
          {#each DONATE.crypto as coin}
            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-widest opacity-60 ml-1">
                {coin.label}
              </p>
              <button
                onclick={(e) => copy(coin.address, e)}
                class="w-full text-left font-mono text-[10px] md:text-xs p-4 bg-black/40 rounded-lg hover:bg-black/60 border border-white/5 hover:border-primary/50 transition-all break-all group"
              >
                {coin.address}
                <span
                  class="block text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >Click to copy address</span
                >
              </button>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <footer class="mt-8 text-center relative z-10">
      <a
        href="/"
        class="btn btn-ghost btn-sm text-base-content/50 hover:text-primary transition-colors"
      >
        <Icon icon="mdi:arrow-left" /> Return to Home
      </a>
    </footer>
  </div>
</div>
