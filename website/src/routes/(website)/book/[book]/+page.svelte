<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import imgOriginal from "$lib/assets/web-cover-original.jpg?enhanced&w=9999";
  import imgRevised from "$lib/assets/web-cover-revised.jpg?enhanced&w=9999";
  import book_meta from "$lib/meta.json";
  import { SITE, BOOKS } from "$lib/site";

  const covers: Record<string, any> = {
    original: imgOriginal,
    revised: imgRevised,
  };
  const accents: Record<string, any> = {
    original: {
      title_accent: "text-primary",
      button_primary: "btn-primary",
      button_secondary: "btn-info",
    },
    revised: {
      title_accent: "text-secondary",
      button_primary: "btn-secondary",
      button_secondary: "btn-accent",
    },
  };
  const synopsis = SITE.description.join("\n\n");

  // --- Reactive Logic ---
  const bookSlug = $derived(page.params.book || "original");
  const book = $derived({
    ...(BOOKS as any)[bookSlug],
    ...accents[bookSlug],
    cover: covers[bookSlug],
    synopsis,
  });

  // Each version has a single translation folder (named in metaTl, e.g. "main").
  const tl = $derived(
    Object.keys((book_meta as any)[bookSlug] || {})[0] ?? "main",
  );
  const chapters = $derived(((book_meta as any)[bookSlug]?.[tl] || []) as any[]);
  const firstSlug = $derived(chapters[0]?.slug ?? 1);

  // State
  let searchQuery = $state("");
  let isReversed = $state(false);
  let continueData = $state<any>(null); // last chapter read, from localStorage

  // Modal reference
  let synopsisModal: HTMLDialogElement;

  const filteredChapters = $derived.by(() => {
    const list = chapters.filter(
      (ch) =>
        ch.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ch.slug.toString().includes(searchQuery),
    );
    return isReversed ? [...list].reverse() : list;
  });

  onMount(() => {
    const stored = localStorage.getItem("lastRead");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Only valid if it matches the version we are viewing
        if (data.book === bookSlug) {
          continueData = data;
        }
      } catch (e) {
        console.error("Failed to parse reading history", e);
      }
    }
  });
</script>

<svelte:head>
  <title>{book.title} - {SITE.name}</title>
  <meta name="description" content={SITE.metaDescription} />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="{book.title} - {SITE.name}" />
  <meta property="og:description" content={SITE.metaDescription} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{book.title} - {SITE.name}" />
  <meta name="twitter:description" content={SITE.metaDescription} />
</svelte:head>

<main class="flex md:flex-row flex-col min-h-screen">
  <aside
    class="md:h-dvh md:w-[35vw] w-screen bg-base-200/50 md:sticky md:top-0 flex flex-col items-center border-b md:border-b-0 md:border-r border-base-300"
  >
    <div class="w-full flex flex-col items-center p-6 md:p-8">
      <div class="relative group mb-6">
        <div
          class="absolute -inset-1 bg-current opacity-10 blur-xl rounded-2xl transition-opacity group-hover:opacity-20"
        ></div>

        <enhanced:img
          src={book.cover}
          alt="{book.title} cover"
          class="relative w-48 md:w-64 rounded-xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>

      <div class="text-center space-y-1">
        <h1
          class="text-2xl md:text-3xl font-black leading-tight {book.title_accent}"
        >
          {book.title}
        </h1>
        <h2 class="text-sm font-bold opacity-70 uppercase tracking-widest">
          By: {book.author}
        </h2>
      </div>
    </div>

    <div class="w-full px-6 flex gap-2 mb-8">
      <a
        href={continueData
          ? `/read/${continueData.book}/${continueData.tl}/${continueData.slug}`
          : `/read/${bookSlug}/${tl}/${firstSlug}`}
        class="btn {book.button_primary} grow shadow-lg font-bold"
        data-sveltekit-preload-data
      >
        {#if continueData}
          <Icon icon="material-symbols:resume" class="size-5" />
          Continue Reading
        {:else}
          <Icon
            icon="material-symbols:menu-book-outline-rounded"
            class="size-5"
          />
          Start Reading
        {/if}
      </a>

      <a
        href="/download"
        class="btn {book.button_secondary} btn-square shadow-lg"
        aria-label="Download"
      >
        <Icon icon="material-symbols:download" class="size-6" />
      </a>
    </div>

    <div class="grow w-full px-6 md:px-8 pb-8 overflow-hidden">
      <div class="hidden md:block h-full">
        <div class="h-full overflow-y-auto pr-2 custom-scrollbar">
          <p
            class="text-sm leading-relaxed text-justify opacity-80 whitespace-pre-line"
          >
            {book.synopsis}
          </p>
        </div>
      </div>

      <button
        class="md:hidden btn btn-ghost btn-sm w-full h-auto py-3 bg-base-300/30"
        onclick={() => synopsisModal.showModal()}
      >
        <p class="line-clamp-2 text-xs italic opacity-70">
          {book.synopsis}
        </p>
      </button>
    </div>
  </aside>

  <dialog bind:this={synopsisModal} class="modal modal-bottom sm:modal-middle">
    <div class="modal-box bg-base-200">
      <form method="dialog">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          >✕</button
        >
      </form>
      <h3 class="text-lg font-bold mb-4">Synopsis</h3>
      <div class="max-h-[60vh] overflow-y-auto">
        <p class="text-sm leading-relaxed whitespace-pre-line opacity-90">
          {book.synopsis}
        </p>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>

  <div class="md:w-[65vw] w-screen min-h-dvh bg-base-100/50 backdrop-blur-sm">
    <div
      class="w-full flex flex-row items-center gap-2 p-4 sticky top-0 backdrop-blur-md z-10 bg-base-100/30 border-b border-white/5"
    >
      <label class="input input-bordered flex items-center gap-2 grow">
        <Icon
          icon="material-symbols:search-rounded"
          class="size-6 opacity-50"
        />
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="Search title or number..."
          class="grow"
        />
      </label>

      <button
        class="btn btn-square btn-bordered btn-soft {book.button_primary}"
        onclick={() => (isReversed = !isReversed)}
        aria-label="Reverse chapter order"
      >
        <Icon
          icon="material-symbols:sort-rounded"
          class="size-6 transition-transform duration-300 {isReversed
            ? 'rotate-180 text-accent'
            : ''}"
        />
      </button>
    </div>

    <div class="w-full grid grid-cols-1 gap-2 p-4">
      {#if filteredChapters.length > 0}
        {#each filteredChapters as ch}
          <a
            href="/read/{bookSlug}/{tl}/{ch.slug}"
            class="btn {book.button_secondary} btn-soft justify-start h-auto py-4 text-left shadow-sm hover:scale-[1.01] transition-transform relative w-full overflow-hidden"
          >
            <div class="flex flex-col w-full min-w-0 pr-12">
              <span class="text-xs opacity-60 font-mono">CHAPTER {ch.slug}</span
              >

              <span
                class="sm:text-xl text-base font-bold truncate w-full block"
              >
                {ch.title}
              </span>

              {#if ch.category}
                <span
                  class="badge badge-sm badge-ghost text-[10px] font-mono uppercase tracking-widest opacity-60 absolute right-2 top-2"
                >
                  {ch.category}
                </span>
              {/if}
            </div>
          </a>
        {/each}
      {:else}
        <div class="flex flex-col items-center justify-center py-20 opacity-30">
          <Icon icon="tabler:ghost" class="size-20" />
          <p class="text-xl font-bold">No chapters found</p>
        </div>
      {/if}
    </div>
  </div>
</main>
