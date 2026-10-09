<script lang="ts">
  import Icon from "@iconify/svelte";
  import { SITE, BOOKS } from "$lib/site";

  // EPUB files are produced by scripts/build_epub.py and uploaded to GitHub
  // Releases by .github/workflows/generate-epub.yml. GitHub turns spaces in the
  // file names into dots, so "The World After The Fall - Original [Default].epub"
  // becomes "The.World.After.The.Fall.-.Original.Default.epub".
  const base = `https://github.com/${SITE.repo}/releases/latest/download`;
  const stem = "The.World.After.The.Fall.-";

  const archives = [
    {
      book: BOOKS.original,
      description: "The original translation.",
      coverColor: "from-red-900/40 to-black/60",
    },
    {
      book: BOOKS.revised,
      description: "The revised and edited translation.",
      coverColor: "from-amber-900/40 to-black/60",
    },
  ].map((a) => ({
    ...a,
    standard: `${base}/${stem}.${a.book.label}.Default.epub`,
    legacy: `${base}/${stem}.${a.book.label}.Legacy.epub`,
  }));
</script>

<div class="flex flex-col items-center justify-center min-h-dvh p-4 md:p-8">
  <div class="max-w-4xl w-full">
    <header class="text-center mb-12">
      <h1 class="text-3xl md:text-5xl font-bold mb-3 tracking-tight">
        Offline Archives
      </h1>
      <p class="text-base-content/60 max-w-lg mx-auto">
        Download {SITE.name} as an EPUB for offline reading. Choose the format
        that best suits your device.
      </p>
    </header>

    <div class="grid gap-6">
      {#each archives as item}
        <div
          class="group relative overflow-hidden rounded-2xl border border-white/10 bg-base-200/40 shadow-xl transition-all hover:border-white/20 hover:shadow-2xl hover:bg-base-200/60"
        >
          <div
            class="absolute inset-0 bg-linear-to-br {item.coverColor} opacity-0 group-hover:opacity-10 transition-opacity duration-500"
          ></div>

          <div
            class="relative p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start"
          >
            <div class="flex-1 space-y-3">
              <span
                class="badge badge-primary badge-outline font-mono text-xs font-bold tracking-widest"
                >EPUB</span
              >
              <h2 class="text-2xl font-bold text-white">{item.book.title}</h2>
              <p class="text-base-content/70 leading-relaxed text-sm pt-2">
                {item.description}
              </p>
            </div>

            <div class="w-full md:w-80 flex flex-col gap-3 shrink-0">
              <a
                href={item.standard}
                target="_blank"
                rel="noopener noreferrer"
                class="btn h-auto py-3 px-4 border-none bg-linear-to-r from-primary/90 to-primary text-white hover:brightness-110 shadow-lg shadow-primary/20 flex items-center justify-between group/btn"
              >
                <div class="text-left">
                  <div class="font-bold flex items-center gap-2">
                    Standard Edition
                    <Icon
                      icon="mdi:star-four-points"
                      class="size-3 text-yellow-300"
                    />
                  </div>
                  <div class="text-[10px] opacity-80 font-normal">
                    High-Res Images • Modern Styling
                  </div>
                </div>
                <Icon
                  icon="mdi:download"
                  class="size-6 opacity-70 group-hover/btn:translate-y-1 transition-transform"
                />
              </a>

              <a
                href={item.legacy}
                target="_blank"
                rel="noopener noreferrer"
                class="btn h-auto py-3 px-4 btn-outline border-base-content/20 hover:bg-base-content/5 hover:border-base-content/30 text-base-content flex items-center justify-between group/btn"
              >
                <div class="text-left">
                  <div
                    class="font-bold flex items-center gap-2 text-base-content/90"
                  >
                    Legacy Edition
                    <Icon icon="mdi:e-reader" class="size-4 opacity-50" />
                  </div>
                  <div class="text-[10px] opacity-60 font-normal">
                    B&W Images • EPUB2 • Old Devices
                  </div>
                </div>
                <Icon
                  icon="mdi:download-outline"
                  class="size-6 opacity-40 group-hover/btn:translate-y-1 transition-transform"
                />
              </a>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <footer class="mt-16 text-center space-y-4">
      <p class="text-xs text-base-content/30 max-w-md mx-auto">
        Note: Files are hosted on GitHub. If you experience issues with the
        "Standard" version on older devices (Kindle PPW3 or older), please try
        the "Legacy" version.
      </p>
    </footer>
  </div>
</div>
